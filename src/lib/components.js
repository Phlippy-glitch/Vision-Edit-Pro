/**
 * Shared page furniture.
 *
 * The trust components here are the ones the editorial spec pinned to verbatim
 * copy, because they are what makes publishing unconfirmed data honest rather
 * than misleading. Change the wording here and you change the site's central
 * claim about itself, so the strings are inline and commented rather than
 * abstracted into a config someone edits without reading.
 */

import { esc, join, formatPhone, telHref, displayHost, displayDate } from './html.js';

/* --- The sitewide disclosure ---------------------------------------------- */

/**
 * Renders above the <h1> on every page. Non-dismissible, in the page's normal
 * type — a statement, not an alarm. `verify.js` fails the build if this string
 * is missing from any page while records remain unconfirmed.
 */
export function disclosure(site) {
  return `<aside class="disclosure" role="note">
      <p><strong>Everything on this site names the source it came from, and nothing on it has been confirmed by us — so call ahead before you drive.</strong></p>
      <p class="disclosure__links"><a href="${site.base}about/how-we-source-this/">How we source this</a> · <a href="${site.base}submit/">Correct something on this page</a></p>
    </aside>`;
}

/* --- Provenance ------------------------------------------------------------ */

/** How a publisher should be described, given how we came by it. */
function publisherPhrase(source, evidence) {
  const name = esc(source.publisher || 'an unnamed source');
  if (evidence === 'aggregator') {
    return source.publisher ? `${name}, a business-listing aggregator` : 'a business-listing aggregator';
  }
  return name;
}

function evidenceSuffix(evidence) {
  // Aggregators get a stronger caveat because they copy one another, which is
  // exactly how a stale address survives across a dozen sites looking corroborated.
  if (evidence === 'aggregator') {
    return 'Aggregators copy each other, so treat this as a lead rather than a fact.';
  }
  return 'We did not open the page.';
}

const FIELD_LABELS = {
  name: 'the name',
  summary: 'the description',
  address: 'the address',
  phone: 'the phone number',
  hours: 'the hours',
  website: 'the website',
  email: 'the email address',
  status: 'whether it is open',
  seasonal: 'the season it operates',
};

function fieldList(covers) {
  const labels = (covers || []).map((c) => FIELD_LABELS[c] || c);
  if (!labels.length) return null;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * Where each fact came from, grouped by source.
 *
 * Grouped rather than pooled into one "Sources" list at the foot: a single list
 * lets a wrong fact hide behind a right source. Never says "verified".
 */
export function sourceBlock(rec) {
  const sources = Array.isArray(rec.sources) ? rec.sources : [];
  if (!sources.length) return '';

  const blocks = sources.map((s) => {
    const fields = fieldList(s.covers);
    const host = displayHost(s.url);
    return `<li class="source">
        <p class="source__line"><em>Where this came from: ${publisherPhrase(s, rec.evidence)}, quoted in a search result. ${evidenceSuffix(rec.evidence)}</em></p>
        ${fields ? `<p class="source__covers">It is our source for ${esc(fields)}.</p>` : ''}
        ${s.url ? `<p class="source__url"><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(host)}</a>${s.retrieved_at ? ` <span class="muted">· looked up ${esc(displayDate(s.retrieved_at) || s.retrieved_at)}</span>` : ''}</p>` : ''}
      </li>`;
  });

  return `<section class="factbox" aria-labelledby="sources-h">
      <h2 id="sources-h">Where this came from</h2>
      <ul class="sources">${blocks.join('\n')}</ul>
    </section>`;
}

/**
 * The corroboration sentence — the one trust signal in this build that varies
 * between records, and the only one worth rendering.
 *
 * Counted per field from `sources[].covers`, because "two sources agree" is
 * decoration while "two sources agree on the address" is information, and the
 * two are often different on the same record. Capped by the record's own
 * `corroborated` count so a cluster of aggregators copying one another can
 * never inflate this past the honest independence assessment made at merge.
 */
export function corroboration(rec) {
  const cap = Number(rec.corroborated) || 1;
  if (cap < 2) return '';

  const counts = new Map();
  for (const s of rec.sources || []) {
    for (const field of s.covers || []) {
      counts.set(field, (counts.get(field) || 0) + 1);
    }
  }

  const notable = ['address', 'phone', 'hours', 'website'];
  const lines = [];
  for (const field of notable) {
    const n = Math.min(counts.get(field) || 0, cap);
    if (n >= 2 && rec[field]) {
      const label = FIELD_LABELS[field] || field;
      lines.push(n === 2
        ? `Two unrelated sources give the same ${label.replace(/^the /, '')}.`
        : `${n} unrelated sources give the same ${label.replace(/^the /, '')}.`);
    }
  }
  if (!lines.length) return '';

  return `<p class="corroboration">${lines.map(esc).join(' ')}</p>`;
}

/** Beside any null field. Keeps the gap visible instead of quietly omitting it. */
export function notConfirmed(site) {
  return `<span class="unknown">Not confirmed — <a href="${site.base}submit/">do you know it?</a></span>`;
}

/** Owner-facing and reader-facing correction paths. */
export function correctionPath(site, { owner = false, slug = null } = {}) {
  const target = slug ? `${site.base}submit/?place=${encodeURIComponent(slug)}` : `${site.base}submit/`;
  return join(
    `<p class="correction">Something here wrong or out of date? <a href="${esc(target)}">Tell us</a> — we publish corrections with the date.</p>`,
    owner ? `<p class="correction correction--owner">Is this your business? <a href="${esc(target)}">Correct it, or ask us to remove it.</a></p>` : null,
  );
}

/* --- Status --------------------------------------------------------------- */

const STATUS_COPY = {
  open: null, // Saying "open" asserts trading we did not check. Render nothing.
  closed: { cls: 'warn', text: 'Reported closed. We have left the page up so the closure is findable.' },
  possibly_closed: { cls: 'warn', text: 'Sources disagree about whether this is still trading. Call before you go.' },
  renovating: { cls: 'warn', text: 'Reported to be closed for renovation.' },
  seasonal: { cls: 'note', text: 'Reported to operate seasonally, so opening depends on the time of year.' },
  disputed: { cls: 'warn', text: 'Sources conflict on the basic details of this entry.' },
  unknown: null, // The default. The sitewide disclosure already covers it.
};

export function statusNote(rec) {
  const copy = STATUS_COPY[rec.status];
  if (!copy) return '';
  return `<p class="callout callout--${copy.cls === 'warn' ? 'warn' : ''} status-note">${esc(copy.text)}</p>`;
}

/**
 * Emergency services carry no phone number by rule, because a wrong number
 * there is a harm rather than a defect. That rule shipped without its other
 * half: the pages rendered "Phone: Not confirmed" and said nothing else, which
 * is worse than useless to someone who arrived in a hurry. The suppression and
 * the substitute belong in the same component so they cannot be separated again.
 */
const EMERGENCY_PATTERN = /\b(police|sheriff|fire\s*(department|district|protection)|ambulance|emergency\s*management|dispatch)\b/i;

export function isEmergencyService(rec) {
  return EMERGENCY_PATTERN.test(rec.name || '')
    || ['PoliceStation', 'FireStation', 'EmergencyService'].includes(rec.schemaType);
}

export function emergencyNote(rec) {
  if (!isEmergencyService(rec)) return '';
  return `<p class="callout callout--warn"><span class="callout__title">In an emergency, call 911</span>We publish no phone number for emergency services, because an unconfirmed number here could cost someone time they do not have. For non-urgent matters, find the current number on the operator's own page rather than ours.</p>`;
}

/**
 * Research notes that qualify how a place may be used — "not publicly
 * playable", "closed for renovation", "not the only location in town". These
 * were being recorded in the data and then dropped by the templates, which
 * silently discarded the most safety-relevant thing a record carried.
 */
export function researchNote(rec) {
  // `notes` is internal free text: research working, build directives, and —
  // critically — the conflicting values that the disputed-field gate exists to
  // withhold. Rendering it verbatim republished both of the hospital's
  // conflicting addresses in a callout box, defeating the single best judgment
  // call in the dataset.
  //
  // So nothing from `notes` is ever rendered. A reader-facing warning has to be
  // written as `caution`, and verify.js holds that field to the same standard
  // as every other published string.
  if (!rec.caution) return '';
  return `<p class="callout"><span class="callout__title">Worth knowing</span>${esc(rec.caution)}</p>`;
}

export function seasonalNote(rec) {
  if (!rec.seasonal) return '';
  const text = typeof rec.seasonal === 'string' ? rec.seasonal : (rec.seasonal.note || rec.seasonal.period);
  if (!text) return '';
  return `<p class="callout status-note"><span class="callout__title">Seasonal</span>${esc(text)}</p>`;
}

/* --- Cards ---------------------------------------------------------------- */

/**
 * Compact form for sibling/related lists.
 *
 * Reprinting each summary on every sibling page put some descriptions on 30
 * pages and left the thin listings ~20% unique. Name and link is all a
 * "see also" needs, and it keeps the unique text on the page that owns it.
 */
export function listingLink(site, rec) {
  return `<li><a href="${site.base}place/${esc(rec.slug)}/">${esc(rec.name)}</a></li>`;
}

export function listingCard(site, rec, { category = null } = {}) {
  const bits = [];
  if (rec.address) bits.push(esc(rec.address));
  else if (rec.proximity === 'grundy_county') bits.push('Grundy County');
  if (rec.phone) bits.push(esc(formatPhone(rec.phone)));

  const flag = rec.status === 'closed' || rec.status === 'possibly_closed'
    ? '<span class="badge badge--unverified">Reported closed</span>'
    : rec.status === 'seasonal' ? '<span class="badge badge--neutral">Seasonal</span>' : '';

  return `<li>
      <article class="card">
        ${category ? `<span class="card__cat">${esc(category)}</span>` : ''}
        <h3 class="card__title"><a href="${site.base}place/${esc(rec.slug)}/">${esc(rec.name)}</a></h3>
        ${rec.summary ? `<p class="card__desc">${esc(rec.summary)}</p>` : ''}
        <p class="card__meta">${bits.map((b) => `<span>${b}</span>`).join('')}${flag}</p>
      </article>
    </li>`;
}

/* --- Chrome --------------------------------------------------------------- */

export function header(site, categories, currentPath) {
  const primary = categories.filter((c) => c.index !== false).slice(0, 6);
  const links = primary.map((c) => {
    const href = `${site.base}${c.slug}/`;
    const current = currentPath === `/${c.slug}/` ? ' aria-current="page"' : '';
    return `<a href="${href}"${current}>${esc(c.name)}</a>`;
  });
  links.push(`<a href="${site.base}guides/"${currentPath === '/guides/' ? ' aria-current="page"' : ''}>Guides</a>`);

  return `<header class="site-header">
    <div class="wrap site-header__inner">
      <a class="brand" href="${site.base}">
        <span class="brand__mark">T</span>
        <span>Trenton Directory</span>
        <span class="brand__state">Missouri</span>
      </a>
      <nav class="nav" aria-label="Main">${links.join('')}</nav>
    </div>
  </header>`;
}

export function footer(site, categories, extras = {}) {
  const cols = [];

  cols.push(`<div>
      <h2>Browse</h2>
      <ul>${categories.slice(0, 6).map((c) => `<li><a href="${site.base}${esc(c.slug)}/">${esc(c.name)}</a></li>`).join('')}
        <li><a href="${site.base}grundy-county/">Grundy County</a></li>
        <li><a href="${site.base}a-z/">Every place, A–Z</a></li>
      </ul>
    </div>`);
  cols.push(`<div>
      <h2>More</h2>
      <ul>${categories.slice(6).map((c) => `<li><a href="${site.base}${esc(c.slug)}/">${esc(c.name)}</a></li>`).join('')}
        <li><a href="${site.base}who-to-call/">Who to call</a></li>
      </ul>
    </div>`);
  cols.push(`<div>
      <h2>Reading</h2>
      <ul>
        <li><a href="${site.base}guides/">Guides</a></li>
        <li><a href="${site.base}how-to/">How to get things done</a></li>
        <li><a href="${site.base}events/">Events</a></li>
        <li><a href="${site.base}changes/">What closed, opened or moved</a></li>
      </ul>
    </div>`);
  cols.push(`<div>
      <h2>About this site</h2>
      <ul>
        <li><a href="${site.base}about/who-publishes-this/">Who publishes this</a></li>
        <li><a href="${site.base}about/how-we-source-this/">How we source this</a></li>
        <li><a href="${site.base}about/open-questions/">What we could not confirm</a></li>
        <li><a href="${site.base}sources/">Every source we used</a></li>
        <li><a href="${site.base}corrections/">Corrections</a></li>
        <li><a href="${site.base}submit/">Add or correct a listing</a></li>
      </ul>
    </div>`);

  // Corrections line: the count when there is one, the neutral promise when
  // there is not — "there are none yet" was the site's weakest first line.
  const correctionsLine = extras.correctionsCount > 0
    ? `${extras.correctionsCount} correction${extras.correctionsCount === 1 ? '' : 's'} published — latest ${esc(extras.correctionsLatest || '')}. <a href="${site.base}corrections/">See them all</a>.`
    : `Corrections are published with dates as they arrive. <a href="${site.base}submit/">Tell us</a> if something here is wrong.`;

  return `<footer class="site-footer">
    <div class="wrap">
      <div class="footer-cols">${cols.join('\n')}</div>
      <div class="colophon">
        <p>A directory of Trenton, Missouri — the county seat of Grundy County, ZIP 64683. Published by ${esc(site.publisherName || site.brand)} — <a href="${site.base}about/who-publishes-this/">who we are</a>.</p>
        <p>Nothing here has been confirmed by us. Every entry names where it came from and when we looked it up, and every one of them can be wrong. <a href="${site.base}about/how-we-source-this/">Read how this was put together</a> before relying on it.</p>
        <p>${correctionsLine}</p>
      </div>
    </div>
  </footer>`;
}

export function breadcrumbs(site, crumbs) {
  if (!crumbs || crumbs.length < 2) return '';
  const items = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    return last
      ? `<li><span aria-current="page">${esc(c.label)}</span></li>`
      : `<li><a href="${site.base}${c.path.replace(/^\//, '')}">${esc(c.label)}</a></li>`;
  });
  return `<nav class="crumbs" aria-label="Breadcrumb"><div class="wrap"><ol>${items.join('')}</ol></div></nav>`;
}
