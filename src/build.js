/**
 * Static site generator for the Trenton, Missouri directory — v2.
 *
 * Reads the merged data, renders plain HTML, writes dist/. There is no
 * incremental mode and no cache: the whole site is ~150 small pages and a full
 * rebuild is faster than reasoning about staleness.
 *
 * Page-level decisions that carry editorial weight are commented where they
 * happen, because most of them are consensus rulings rather than preferences.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { esc, join, slugify, formatPhone, telHref, displayHost, displayDate, truncate, oneline } from './lib/html.js';
import {
  head, absolute, siteGraph, breadcrumbGraph, itemListGraph, listingGraph,
  faqGraph, articleGraph, eventGraph, webPageGraph, sitemapXml, robotsTxt,
} from './lib/seo.js';
import { markdown, frontMatter, markdownToText, setLinkBase } from './lib/markdown.js';
import { canvas, drawText, encodePng } from './lib/png.js';
import {
  disclosure, sourceBlock, corroboration, notConfirmed, correctionPath,
  statusNote, seasonalNote, listingCard, listingLink, header, footer, breadcrumbs,
  emergencyNote, researchNote, isEmergencyService,
} from './lib/components.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const readJsonIf = (p, fallback) => (fs.existsSync(path.join(ROOT, p)) ? readJson(p) : fallback);

const site = readJson('data/site.json');
const { listings: allListings } = readJson('data/listings.json');
const { events } = readJson('data/events.json');
const { categories } = readJson('data/categories.json');
const changes = readJsonIf('data/changes.json', { changes: [] }).changes || [];
const corrections = readJsonIf('data/corrections.json', { corrections: [] }).corrections || [];

// Allow a deploy to override the host/base without editing tracked data.
if (process.env.SITE_URL) site.url = process.env.SITE_URL;
if (process.env.SITE_BASE) site.base = process.env.SITE_BASE;

/**
 * `unlisted` records are real and sourced but get no page — the record state
 * for a place with negative reader value (the first user is a municipal works
 * yard). They surface only on /about/open-questions/, which is the honest
 * place for a record we hold but will not promote.
 */
const listings = allListings.filter((l) => !l.unlisted);
const unlisted = allListings.filter((l) => l.unlisted);

const bySlug = new Map(listings.map((l) => [l.slug, l]));
const pages = [];
const TODAY = new Date().toISOString().slice(0, 10);

/** Old URLs that moved. Stubs render for external traffic; internal links must
 *  point at the target (verify.js fails an indexed page linking a stub). */
const STUBS = [
  { from: '/guides/day-trips/', to: '/guides/things-to-do-in-trenton-mo/', label: 'Things to do in Trenton, Missouri' },
  { from: '/guides/local-news/', to: '/how-to/find-local-news/', label: 'How to find local news in Trenton' },
];

/* -------------------------------------------------------------------------- */
/* Indexing policy                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A listing page is indexable unless it has nothing a searcher could act on:
 * no contact detail, no corroboration, and no substantive summary. A record
 * may also opt out via `index: false` (chain stores whose pages lose to the
 * chain's own locator). Non-indexable pages stay linked so they accumulate
 * signal, and flip the moment any of the three conditions changes.
 */
function listingIndexable(rec) {
  if (rec.index === false) return false;
  const hasContact = Boolean(rec.address || rec.phone || rec.website);
  const corroborated = (Number(rec.corroborated) || 1) > 1;
  const hasSubstance = oneline(rec.summary || '').length >= 120;
  return hasContact || corroborated || hasSubstance;
}

/**
 * Where a record actually is. Not every listing is in Trenton: one operates
 * from Chillicothe, several sit in the wider county. Defaulting them all to
 * "Trenton, MO" would assert the error the data deliberately recorded.
 */
function localityLabel(rec) {
  if (rec.city && rec.city !== site.place.name) return `${rec.city}, MO`;
  if (rec.proximity === 'grundy_county') return 'Grundy County, MO';
  return `${site.place.name}, MO`;
}

function localitySubline(rec) {
  if (rec.city && rec.city !== site.place.name) return `${rec.city}, Missouri — not in Trenton`;
  if (rec.proximity === 'grundy_county') return 'Grundy County, Missouri — outside Trenton city limits';
  return `Trenton, Missouri ${rec.zip || site.place.zip} · ${site.place.county}`;
}

function inGrundyCounty(rec) {
  return rec.proximity === 'grundy_county' || /\bGrundy\b/i.test(rec.name || '');
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

const footerExtras = {
  correctionsCount: corrections.length,
  correctionsLatest: corrections.length ? displayDate(corrections[0].date) || corrections[0].date : null,
};

function layout({ path: pagePath, title, description, body, crumbs = [], jsonld = [], noindex = false, ogType = 'website', published = null, modified = null }) {
  const headHtml = head({
    site,
    title,
    description,
    path: pagePath,
    isHome: pagePath === '/',
    robots: noindex ? 'noindex, follow' : null,
    jsonld,
    ogType,
    published,
    modified,
  });

  return `<!doctype html>
<html lang="en-US">
  <head>
    ${headHtml}
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    ${header(site, categories, pagePath)}
    ${breadcrumbs(site, crumbs)}
    <main id="main">
${body}
    </main>
    ${footer(site, categories, footerExtras)}
    <script src="${site.base}assets/finder.js" defer></script>
  </body>
</html>
`;
}

function write(pagePath, html, meta = {}) {
  const clean = pagePath === '/' ? 'index.html' : `${pagePath.replace(/^\/|\/$/g, '')}/index.html`;
  const full = path.join(DIST, clean);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html);
  pages.push({ path: pagePath, ...meta });
}

/* -------------------------------------------------------------------------- */
/* Listing detail                                                             */
/* -------------------------------------------------------------------------- */

function factRow(label, value, { href = null, raw = false } = {}) {
  const inner = value
    ? (href ? `<a href="${esc(href)}">${raw ? value : esc(value)}</a>` : (raw ? value : esc(value)))
    : notConfirmed(site);
  return `<div><dt>${esc(label)}</dt><dd>${inner}</dd></div>`;
}

/**
 * Name what is actually missing instead of repeating one template sentence on
 * 92 pages. "No source we found gives hours or a phone number for this one"
 * carries information; the old boilerplate carried a template fingerprint.
 */
function emptyStateNote(rec) {
  const labels = [];
  if (!rec.address && rec.proximity !== 'grundy_county') labels.push('a street address');
  if (!rec.phone) labels.push('a phone number');
  if (!rec.hours) labels.push('hours');
  if (!rec.website) labels.push('a website');
  if (!labels.length) {
    return 'Every field above is supported by a named source. None has been confirmed by us.';
  }
  const listed = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
  return `No source we found gives ${listed} for this one. We leave gaps open rather than fill them.`;
}

function renderListing(rec) {
  const cats = categories.filter((c) => (rec.categories || []).includes(c.slug));
  const primary = cats[0] || null;
  const pagePath = `/place/${rec.slug}/`;
  const noindex = !listingIndexable(rec);

  const crumbs = [
    { label: 'Home', path: '/' },
    ...(primary ? [{ label: primary.name, path: `/${primary.slug}/` }] : []),
    { label: rec.name, path: pagePath },
  ];

  // Contact facts. Every value here has already passed the sources[].covers
  // gate in verify.js, so anything null is null because nothing supports it.
  const facts = join(
    factRow('Address', rec.address || (rec.proximity === 'grundy_county' ? 'Grundy County, Missouri' : null)),
    factRow('Phone', rec.phone ? formatPhone(rec.phone) : null,
      rec.phone && telHref(rec.phone) ? { href: telHref(rec.phone) } : {}),
    factRow('Website', rec.website ? displayHost(rec.website) : null, rec.website ? { href: rec.website } : {}),
    factRow('Hours', rec.hours),
  );

  const disputedNote = (rec.disputed || []).length
    ? `<p class="callout callout--warn"><span class="callout__title">Our sources disagree</span>They give different values for ${esc((rec.disputed || []).join(', '))}. Rather than pick one, we publish neither${(rec.disputed || []).includes('name') ? ' as settled' : ''}.</p>`
    : '';

  const countyChip = inGrundyCounty(rec)
    ? `<p class="county-chip"><a class="badge badge--neutral" href="${site.base}grundy-county/">In Grundy County</a></p>`
    : '';

  const related = listings
    .filter((l) => l.slug !== rec.slug && (l.categories || []).some((c) => (rec.categories || []).includes(c)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 6);

  const body = `      <div class="wrap">
        ${disclosure(site)}
        <div class="listing-layout">
          <div>
            <h1>${esc(rec.name)}</h1>
            <p class="place-locality">${esc(localitySubline(rec))}</p>
            ${countyChip}
            ${rec.summary ? `<p class="lede">${esc(rec.summary)}</p>` : `<p class="lede muted">No source told us what this is, so we have not written a description.</p>`}
            ${emergencyNote(rec)}
            ${researchNote(rec)}
            ${statusNote(rec)}
            ${seasonalNote(rec)}
            ${disputedNote}
            ${corroboration(rec)}
            ${cats.length ? `<p class="row">${cats.map((c) => `<a class="badge badge--accent" href="${site.base}${esc(c.slug)}/">${esc(c.name)}</a>`).join(' ')}</p>` : ''}
            ${correctionPath(site, { owner: true, slug: rec.slug })}
            ${related.length ? `
            <h2>Also in ${esc(primary ? primary.name.toLowerCase() : 'this category')}</h2>
            <ul class="linklist">${related.map((r) => listingLink(site, r)).join('\n')}</ul>` : ''}
          </div>
          <aside class="listing-aside">
            <section class="factbox">
              <h2>Contact</h2>
              <dl class="facts">${facts}</dl>
              <p class="source-note">${esc(emptyStateNote(rec))}</p>
            </section>
            ${sourceBlock(rec)}
          </aside>
        </div>
      </div>`;

  const description = rec.summary
    ? truncate(rec.summary, 150)
    : `${rec.name} in Trenton, Missouri — what our sources say, and what we could not confirm.`;

  // Structured data is deliberately narrow. See docs/DECISIONS.md: we emit only
  // properties that cannot be wrong given the record exists, and we skip the
  // entity graph entirely for records our sources say may not be trading,
  // emergency services, and pages we are not asking to be indexed. When the
  // entity is emitted, a WebPage sibling carries the page's provenance —
  // isBasedOn belongs to the page about the business, not the business.
  const emitEntity = !['closed', 'possibly_closed', 'disputed'].includes(rec.status)
    && !isEmergencyService(rec)
    && !noindex;
  const graphs = [
    breadcrumbGraph(site, crumbs),
    emitEntity ? listingGraph(site, { ...rec, path: pagePath }, primary) : null,
    emitEntity ? webPageGraph(site, pagePath, rec.sources, rec.last_verified_at) : null,
  ];

  write(pagePath, layout({
    path: pagePath,
    title: `${rec.name}, ${localityLabel(rec)}`,
    description,
    body,
    crumbs,
    jsonld: graphs,
    noindex,
    ogType: 'profile',
  }), { noindex, changefreq: 'monthly', priority: noindex ? 0.2 : 0.6, lastmod: rec.last_verified_at || TODAY });
}

/* -------------------------------------------------------------------------- */
/* Category hub                                                               */
/* -------------------------------------------------------------------------- */

function renderCategory(cat) {
  const pagePath = `/${cat.slug}/`;
  const members = listings
    .filter((l) => (l.categories || []).includes(cat.slug))
    .sort((a, b) => a.name.localeCompare(b.name)); // alphabetical, as promised on /about/how-we-source-this/

  const crumbs = [{ label: 'Home', path: '/' }, { label: cat.name, path: pagePath }];

  // Sections let a sparse subtopic live inside a hub instead of earning a thin
  // URL of its own.
  const sectioned = new Set();
  const sections = (cat.sections || []).map((sec) => {
    const secMembers = (sec.slugs || []).map((s) => bySlug.get(s)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    secMembers.forEach((m) => sectioned.add(m.slug));
    if (!secMembers.length) return '';
    return `<section class="section--tight" id="${esc(slugify(sec.heading))}">
          <h2>${esc(sec.heading)}</h2>
          ${sec.note ? `<p class="muted">${esc(sec.note)}</p>` : ''}
          <ul class="grid">${secMembers.map((m) => listingCard(site, m)).join('\n')}</ul>
        </section>`;
  }).filter(Boolean);

  const rest = members.filter((m) => !sectioned.has(m.slug));

  const body = `      <div class="wrap">
        ${disclosure(site)}
        <div class="page-head">
          <span class="page-head__count">${members.length} ${members.length === 1 ? 'entry' : 'entries'}</span>
          <h1>${esc(cat.h1 || cat.name)}</h1>
          ${cat.intro ? `<div class="page-head__lede prose">${markdown(cat.intro)}</div>` : ''}
        </div>

        <form class="finder" data-finder="cat-list" hidden>
          <label class="visually-hidden" for="cat-finder">Filter this list</label>
          <input class="finder__input" id="cat-finder" type="search" placeholder="Filter these ${members.length} entries by name or keyword" autocomplete="off">
          <p class="finder__status" role="status"></p>
        </form>

        ${rest.length ? `<ul class="grid" id="cat-list">${rest.map((m) => listingCard(site, m)).join('\n')}</ul>` : ''}
        ${sections.join('\n')}

        ${correctionPath(site)}
        <p class="muted"><a href="${site.base}submit/">Know something that belongs here?</a> Nothing on this page can be bought, and entries are listed alphabetically.</p>
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: cat.title || cat.name,
    description: cat.description,
    body,
    crumbs,
    noindex: cat.index === false,
    jsonld: [
      breadcrumbGraph(site, crumbs),
      itemListGraph(site, cat.name, members.filter(listingIndexable).map((m) => ({ name: m.name, path: `/place/${m.slug}/` }))),
    ],
  }), { noindex: cat.index === false, changefreq: 'weekly', priority: 0.8, lastmod: TODAY });
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

function renderEvent(ev) {
  const pagePath = `/events/${ev.slug}/`;
  const crumbs = [
    { label: 'Home', path: '/' },
    { label: 'Events', path: '/events/' },
    { label: ev.name, path: pagePath },
  ];

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <h1>${esc(ev.name)}</h1>
        ${ev.summary ? `<p class="lede">${esc(ev.summary)}</p>` : ''}
        ${ev.recurrence ? `<p class="callout"><span class="callout__title">When it runs</span>${esc(ev.recurrence)}${ev.startDate ? '' : '. Our sources give no specific dates, and where they gave conflicting ones we print none.'}</p>` : ''}
        ${ev.startDate ? `<p class="callout"><span class="callout__title">Dates our sources give</span>${esc(displayDate(ev.startDate))}${ev.endDate && ev.endDate !== ev.startDate ? ` to ${esc(displayDate(ev.endDate))}` : ''}. Check with the organizer before planning around this — the pattern above outlasts any single year's dates.</p>` : ''}
        ${researchNote(ev)}
        ${statusNote(ev)}
        ${corroboration(ev)}
        ${correctionPath(site, { slug: ev.slug })}
        ${sourceBlock(ev)}
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: `${ev.name}, Trenton MO`,
    description: ev.summary ? truncate(ev.summary, 150) : `${ev.name} in Trenton, Missouri.`,
    body,
    crumbs,
    // schema.org Event requires startDate; events holding only a recurrence
    // pattern emit breadcrumbs and nothing else.
    jsonld: [
      breadcrumbGraph(site, crumbs),
      ev.startDate ? eventGraph(site, { ...ev, path: pagePath }) : null,
      ev.startDate ? webPageGraph(site, pagePath, ev.sources, ev.last_verified_at) : null,
    ],
    ogType: 'article',
  }), { changefreq: 'monthly', priority: 0.6, lastmod: ev.last_verified_at || TODAY });
}

function renderEventsIndex() {
  const pagePath = '/events/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'Events', path: pagePath }];
  const sorted = [...events].sort((a, b) => a.name.localeCompare(b.name));

  const body = `      <div class="wrap">
        ${disclosure(site)}
        <div class="page-head">
          <span class="page-head__count">${sorted.length} recurring ${sorted.length === 1 ? 'event' : 'events'}</span>
          <h1>Annual events in Trenton, Missouri</h1>
          <p class="page-head__lede">These are the events our sources describe as recurring. We hold a pattern for most of them — the month, or the season — rather than a confirmed date, so treat the timing as the question to ask rather than the answer.</p>
        </div>
        <ul class="grid">${sorted.map((ev) => `<li>
          <article class="card">
            <h3 class="card__title"><a href="${site.base}events/${esc(ev.slug)}/">${esc(ev.name)}</a></h3>
            ${ev.summary ? `<p class="card__desc">${esc(ev.summary)}</p>` : ''}
            <p class="card__meta">${ev.recurrence ? `<span>${esc(ev.recurrence)}</span>` : '<span>Timing not confirmed</span>'}</p>
          </article></li>`).join('\n')}</ul>
        ${correctionPath(site)}
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: 'Annual Events in Trenton, MO',
    description: 'Recurring annual events in Trenton, Missouri, with the source for each and an honest note on what we know about timing.',
    body,
    crumbs,
    jsonld: [
      breadcrumbGraph(site, crumbs),
      itemListGraph(site, 'Annual events in Trenton, Missouri', sorted.map((e) => ({ name: e.name, path: `/events/${e.slug}/` }))),
    ],
  }), { changefreq: 'weekly', priority: 0.7, lastmod: TODAY });
}

/* -------------------------------------------------------------------------- */
/* Markdown-driven pages: guides, how-tos, chrome                             */
/* -------------------------------------------------------------------------- */

function loadMarkdownDir(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, body } = frontMatter(fs.readFileSync(path.join(full, f), 'utf8'));
      return { ...data, body, file: f, slug: data.slug || f.replace(/\.md$/, '') };
    });
}

/**
 * The routes by which someone can actually reach us. Generated from config so
 * the page never promises a channel that does not exist.
 */
function contactRoutes() {
  const parts = [];
  if (site.submitFormUrl) {
    parts.push(`- **[Use the submission form](${site.submitFormUrl}).** It takes a minute and needs no account.`);
  }
  if (site.contactEmail) {
    parts.push(`- **Email us at [${site.contactEmail}](mailto:${site.contactEmail}?subject=Trenton%20directory%20correction).** Tell us the listing name and what is wrong. If you own the business, say so — an owner's correction outranks every source we have.`);
  }
  if (!site.submitFormUrl && !site.contactEmail) {
    parts.push(
      'Being straight with you about the mechanism, since this page would otherwise promise more than it can do: **there is no submission form and no contact address set up yet.** This site is a set of static pages with no form handler behind it, and we would rather say that than point you at something that quietly goes nowhere.',
      '',
      `The one route that does work today is the public issue tracker for the code that builds this site: [file a correction](${site.repoIssuesUrl}). It is dated and public. It is also, frankly, a developer's tool — if you run a business and that is not a reasonable thing to ask of you, you are right, and this section will be replaced with an email address and a form as soon as there is someone to receive them.`,
    );
  } else {
    parts.push(`- Prefer a paper trail in public? The issue tracker for the code behind this site also works: [file a correction](${site.repoIssuesUrl}).`);
  }
  return parts.join('\n');
}

/**
 * The page-scoped unconfirmed block. The sitewide banner states the site's
 * ceiling; this block states this page's specifics — because on a how-to, the
 * advice is the site's own work and calling it unconfirmed would be false.
 */
function scopeNote(doc) {
  const unconfirmed = (doc.unconfirmed || []).filter(Boolean);
  if (!unconfirmed.length) return '';
  const own = (doc.own || []).filter(Boolean);
  return `<aside class="scope-note"><p><strong>On this page, unconfirmed means:</strong> ${unconfirmed.map((u) => esc(u)).join(' ')}${own.length ? ` ${own.map((o) => esc(o)).join(' ')}` : ''}</p></aside>`;
}

function renderArticle(doc, { section, sectionLabel }) {
  const pagePath = section ? `/${section}/${doc.slug}/` : `/${doc.slug}/`;
  const crumbs = [
    { label: 'Home', path: '/' },
    ...(section ? [{ label: sectionLabel, path: `/${section}/` }] : []),
    { label: doc.title || doc.h1, path: pagePath },
  ];

  const placeLinks = (doc.places || [])
    .map((s) => bySlug.get(s))
    .filter(Boolean);

  const faqs = (doc.faq || []).filter((f) => f && f.q && f.a);
  const faqHtml = faqs.length ? `
        <section class="section" aria-labelledby="faq-h">
          <h2 id="faq-h">Questions people ask</h2>
          ${faqs.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}
        </section>` : '';

  const sourcesHtml = (doc.sources || []).length ? `
        <section class="factbox section">
          <h2>Where this came from</h2>
          <ul class="sources">${(doc.sources || []).map((s) => `<li class="source"><p class="source__url"><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.publisher || displayHost(s.url))}</a></p></li>`).join('')}</ul>
          <p class="source-note">Quoted from search results. We did not open these pages.</p>
        </section>` : '';

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        ${scopeNote(doc)}
        <h1>${esc(doc.h1 || doc.title)}</h1>
        ${doc.summary ? `<p class="lede">${esc(doc.summary)}</p>` : ''}
        <div class="prose">
${markdown(doc.body.replace('{{CONTACT_ROUTES}}', contactRoutes()))}
        </div>
        ${placeLinks.length ? `
        <section class="section">
          <h2>Places mentioned</h2>
          <ul class="grid">${placeLinks.map((p) => listingCard(site, p)).join('\n')}</ul>
        </section>` : ''}
        ${faqHtml}
        ${sourcesHtml}
        ${correctionPath(site)}
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: doc.title || doc.h1,
    description: doc.description,
    body,
    crumbs,
    ogType: 'article',
    published: doc.published,
    modified: doc.updated || doc.published,
    jsonld: [
      breadcrumbGraph(site, crumbs),
      articleGraph(site, { ...doc, path: pagePath }),
      faqGraph(faqs),
    ],
  }), { changefreq: 'monthly', priority: 0.7, lastmod: doc.updated || doc.published || TODAY });

  return pagePath;
}

function renderCollectionIndex({ section, label, h1, intro, docs, description }) {
  const pagePath = `/${section}/`;
  const crumbs = [{ label: 'Home', path: '/' }, { label, path: pagePath }];
  const sorted = [...docs].sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  const body = `      <div class="wrap">
        ${disclosure(site)}
        <div class="page-head">
          <h1>${esc(h1)}</h1>
          <p class="page-head__lede">${esc(intro)}</p>
        </div>
        <ul class="grid grid--wide">${sorted.map((d) => `<li>
          <article class="card">
            <h3 class="card__title"><a href="${site.base}${section}/${esc(d.slug)}/">${esc(d.title)}</a></h3>
            ${d.summary ? `<p class="card__desc">${esc(d.summary)}</p>` : ''}
          </article></li>`).join('\n')}</ul>
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: label,
    description,
    body,
    crumbs,
    jsonld: [
      breadcrumbGraph(site, crumbs),
      itemListGraph(site, label, sorted.map((d) => ({ name: d.title, path: `/${section}/${d.slug}/` }))),
    ],
  }), { changefreq: 'weekly', priority: 0.7, lastmod: TODAY });
}

/* -------------------------------------------------------------------------- */
/* v2 pages                                                                   */
/* -------------------------------------------------------------------------- */

/** The phone book page: every listing, one line, letter anchors. */
function renderAZ() {
  const pagePath = '/a-z/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'A to Z', path: pagePath }];
  const sorted = [...listings].sort((a, b) => a.name.localeCompare(b.name));

  const groups = new Map();
  for (const rec of sorted) {
    const letter = /^[a-z]/i.test(rec.name) ? rec.name[0].toUpperCase() : '#';
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(rec);
  }

  const sections = [...groups.entries()].map(([letter, recs]) => `
        <h2 class="letter-head" id="${esc(letter === '#' ? 'num' : letter.toLowerCase())}">${esc(letter)}</h2>
        <ul class="register">${recs.map((r) => {
    const cat = categories.find((c) => (r.categories || []).includes(c.slug));
    const phone = r.phone && !(r.disputed || []).includes('phone') ? formatPhone(r.phone) : null;
    return `<li>
          <span class="register__name"><a href="${site.base}place/${esc(r.slug)}/">${esc(r.name)}</a></span>
          ${cat ? `<span class="register__meta">${esc(cat.name)}</span>` : ''}
          ${phone ? `<span class="register__phone">${esc(phone)}</span>` : ''}
        </li>`;
  }).join('\n')}</ul>`).join('\n');

  const letters = [...groups.keys()].map((l) => `<a href="#${esc(l === '#' ? 'num' : l.toLowerCase())}">${esc(l)}</a>`).join(' ');

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <div class="page-head">
          <span class="page-head__count">${sorted.length} entries</span>
          <h1>Every place in this directory, A to Z</h1>
          <p class="page-head__lede">One line per place: name, category, and a phone number where a source supports one. This is the whole directory on one page.</p>
        </div>
        <p class="row">${letters}</p>
        ${sections}
        ${correctionPath(site)}
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: 'All Places in Trenton, MO, A–Z',
    description: `Every one of the ${sorted.length} places in this Trenton, Missouri directory on a single page, with phone numbers where a source supports them.`,
    body,
    crumbs,
    jsonld: [
      breadcrumbGraph(site, crumbs),
      itemListGraph(site, 'Every place in this directory', sorted.filter(listingIndexable).map((r) => ({ name: r.name, path: `/place/${r.slug}/` }))),
    ],
  }), { changefreq: 'weekly', priority: 0.7, lastmod: TODAY });
}

/** The printable sheet. Curated allowlist, never a dump; the dump is /a-z/. */
function renderWhoToCall() {
  const pagePath = '/who-to-call/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'Who to call', path: pagePath }];

  const GROUPS = [
    { heading: 'City', slugs: ['city-of-trenton', 'trenton-city-hall', 'trenton-municipal-utilities', 'trenton-parks-and-recreation-department'] },
    { heading: 'County', slugs: ['grundy-county-clerk', 'grundy-county-collector-treasurer', 'grundy-county-assessor', 'grundy-county-circuit-clerk-and-recorder', 'grundy-county-health-department'] },
    { heading: 'Everyday', slugs: ['grundy-county-jewett-norris-library', 'trenton-post-office', 'trenton-r-ix-school-district', 'grundy-county-senior-center', 'green-hills-community-action-agency', 'rapid-removal-disposal'] },
  ];

  const groupHtml = GROUPS.map(({ heading, slugs }) => {
    const rows = slugs.map((s) => bySlug.get(s)).filter(Boolean).map((r) => {
      const phoneOk = r.phone && !(r.disputed || []).includes('phone');
      const role = truncate(r.summary || '', 60);
      if (phoneOk) {
        return `<li>
          <span class="register__name"><a href="${site.base}place/${esc(r.slug)}/">${esc(r.name)}</a></span>
          <span class="register__meta">${esc(role)}</span>
          <span class="register__phone"><a href="${esc(telHref(r.phone) || '#')}">${esc(formatPhone(r.phone))}</a></span>
        </li>`;
      }
      // A gap on this sheet is information — never silently dropped.
      const fallback = r.website ? esc(displayHost(r.website)) : `see <a href="${site.base}place/${esc(r.slug)}/">their page</a>`;
      return `<li>
          <span class="register__name"><a href="${site.base}place/${esc(r.slug)}/">${esc(r.name)}</a></span>
          <span class="register__meta">no confirmed number — ${fallback}</span>
        </li>`;
    });
    if (!rows.length) return '';
    return `<h2>${esc(heading)}</h2>\n<ul class="register">${rows.join('\n')}</ul>`;
  }).filter(Boolean).join('\n');

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <h1>Who to call in Trenton, MO</h1>
        <p class="lede">The numbers people actually need, on one page you can print and stick to the fridge. Each one comes from a named public source and none has been confirmed by us.</p>
        <button class="print-btn btn" data-print-btn hidden type="button">Print this page</button>

        <h2>Emergencies</h2>
        <p class="callout callout--warn"><span class="callout__title">Call 911.</span> We publish no phone numbers for police, fire, or the sheriff, because a wrong number there is a harm — 911 is always right.</p>

        ${groupHtml}

        <p class="print-stamp">Nothing on this sheet has been confirmed by us — numbers came from named public sources on ${esc(displayDate(TODAY) || TODAY)}. Current version: ${esc(site.url)}/who-to-call/</p>
        ${correctionPath(site)}
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: 'Who to Call in Trenton, MO — One Printable Page',
    description: 'City hall, utilities, county offices, the library and the school district on one printable page — every number sourced, none confirmed, emergencies always 911.',
    body,
    crumbs,
    jsonld: [breadcrumbGraph(site, crumbs)],
  }), { changefreq: 'monthly', priority: 0.7, lastmod: TODAY });
}

/** What's open, what closed, what moved — generated from the same data as the listings. */
function renderChanges() {
  const pagePath = '/changes/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'What changed', path: pagePath }];

  const closed = listings.filter((l) => l.status === 'closed');
  const seasonal = listings.filter((l) => l.status === 'seasonal');
  const disputedRecs = listings.filter((l) => (l.disputed || []).length);

  const changeEntry = (c) => {
    const kindClass = c.kind === 'closed' ? 'change--closed' : c.kind === 'opened' ? 'change--opened' : '';
    const when = c.whenPrecision === 'unknown' ? null : c.when;
    const source = (c.sources || [])[0];
    return `<div class="change ${kindClass}">
        <p class="change__head">${esc(c.headline)}</p>
        <p>${esc(c.detail)}</p>
        <p class="change__meta">${when ? `${esc(when)} · ` : ''}${source ? `per ${esc(source.publisher)}` : ''}${c.listingSlug && bySlug.get(c.listingSlug) ? ` · <a href="${site.base}place/${esc(c.listingSlug)}/">the listing</a>` : ''}</p>
      </div>`;
  };

  const closedChanges = changes.filter((c) => c.kind === 'closed');
  const otherChanges = changes.filter((c) => c.kind !== 'closed');

  const disputedByField = disputedRecs.map((r) => `<li>
      <span class="register__name"><a href="${site.base}place/${esc(r.slug)}/">${esc(r.name)}</a></span>
      <span class="register__meta">sources conflict on ${esc((r.disputed || []).join(', '))}; we publish neither value</span>
    </li>`).join('\n');

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <div class="page-head">
          <h1>What's open, what closed, and what moved in Trenton, MO</h1>
          <p class="page-head__lede">The changes our sources report, plus every record where sources conflict or a place runs seasonally. Kept honest by construction: most of this page is generated from the listings themselves.</p>
        </div>

        <h2>Closed</h2>
        ${closedChanges.map(changeEntry).join('\n')}
        ${closed.filter((r) => !changes.some((c) => c.listingSlug === r.slug)).map((r) => `<div class="change change--closed">
          <p class="change__head">${esc(r.name)} is reported closed</p>
          <p class="change__meta"><a href="${site.base}place/${esc(r.slug)}/">the listing</a></p>
        </div>`).join('\n')}

        <h2>Changed or moved</h2>
        ${otherChanges.length ? otherChanges.map(changeEntry).join('\n') : '<p class="muted">Nothing recorded yet.</p>'}

        <h2>We're not sure</h2>
        <p>Where two sources give different values for something you would act on, we publish neither and say so.</p>
        <ul class="register">${disputedByField}</ul>

        <h2>Seasonal</h2>
        <ul class="register">${seasonal.map((r) => `<li>
          <span class="register__name"><a href="${site.base}place/${esc(r.slug)}/">${esc(r.name)}</a></span>
          <span class="register__meta">${esc(typeof r.seasonal === 'string' ? r.seasonal : (r.seasonal && (r.seasonal.note || r.seasonal.period)) || 'operates seasonally')}</span>
        </li>`).join('\n')}</ul>

        ${correctionPath(site)}
        <p class="muted">Generated ${esc(displayDate(TODAY) || TODAY)}. This page is generated from the same data as the listings, so it cannot say something the listings don't.</p>
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: 'What Closed, Opened or Moved in Trenton, MO',
    description: 'Closures, changes, seasonal operations and open disputes in Trenton, Missouri — generated from the directory data, with the source named for each.',
    body,
    crumbs,
    jsonld: [breadcrumbGraph(site, crumbs)],
  }), { changefreq: 'weekly', priority: 0.8, lastmod: TODAY });
}

/** The county hub. Membership is computed, never hand-listed. */
function renderGrundyCounty() {
  const pagePath = '/grundy-county/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'Grundy County', path: pagePath }];

  const members = listings.filter(inGrundyCounty).sort((a, b) => a.name.localeCompare(b.name));
  const offices = members.filter((m) => (m.categories || []).includes('government'));
  const outside = members.filter((m) => m.proximity === 'grundy_county');
  const services = members.filter((m) => !offices.includes(m) && !outside.includes(m));

  const registerList = (recs) => `<ul class="register">${recs.map((r) => `<li>
      <span class="register__name"><a href="${site.base}place/${esc(r.slug)}/">${esc(r.name)}</a></span>
      ${r.summary ? `<span class="register__meta">${esc(truncate(r.summary, 90))}</span>` : ''}
    </li>`).join('\n')}</ul>`;

  const taskTable = [
    ['Pay a water or electric bill', 'City — Trenton Municipal Utilities', `${site.base}how-to/pay-your-utility-bill/`],
    ['Pay property taxes', 'County — Collector-Treasurer', `${site.base}how-to/pay-your-property-taxes/`],
    ['Register to vote', 'County — County Clerk', `${site.base}how-to/register-to-vote/`],
    ['Get a building permit', 'City — City Hall', `${site.base}how-to/get-a-building-permit/`],
    ['Trash and recycling', 'City contract', `${site.base}how-to/trash-and-recycling/`],
    ['License a vehicle', 'State of Missouri', `${site.base}how-to/license-your-vehicle/`],
  ].map(([task, who, href]) => `<tr><td><a href="${href}">${esc(task)}</a></td><td>${esc(who)}</td></tr>`).join('\n');

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <div class="page-head">
          <span class="page-head__count">${members.length} entries</span>
          <h1>Grundy County, Missouri — the county government, and what sits outside Trenton city limits</h1>
          <p class="page-head__lede">Trenton is the seat of Grundy County, and most county offices sit in the courthouse — their listings below carry what our sources give. The most common point of confusion here is which government handles what, so start with the table if that is your question.</p>
        </div>

        <h2>City or county?</h2>
        <div class="table-scroll">
          <table>
            <thead><tr><th>The task</th><th>Whose job it is</th></tr></thead>
            <tbody>${taskTable}</tbody>
          </table>
        </div>

        <h2>County offices</h2>
        ${registerList(offices)}

        <h2>Outside Trenton city limits</h2>
        <p>In the county, not the town — the distinction their own pages make, so we make it too.</p>
        ${registerList(outside)}

        <h2>County-wide services</h2>
        ${registerList(services)}

        ${correctionPath(site)}
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: 'Grundy County, MO — Courthouse, Offices & Places',
    description: 'Grundy County, Missouri: county offices, the courthouse, and the places that sit outside Trenton city limits — plus which government handles which task.',
    body,
    crumbs,
    jsonld: [
      breadcrumbGraph(site, crumbs),
      itemListGraph(site, 'Grundy County, Missouri', members.filter(listingIndexable).map((m) => ({ name: m.name, path: `/place/${m.slug}/` }))),
    ],
  }), { changefreq: 'weekly', priority: 0.8, lastmod: TODAY });
}

/** Old URLs that moved: canonical + meta refresh + a visible link. Not in the sitemap. */
function renderStubs() {
  for (const stub of STUBS) {
    const target = absolute(site, stub.to);
    const html = `<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(stub.label)}</title>
    <link rel="canonical" href="${esc(target)}">
    <meta name="robots" content="noindex">
    <meta http-equiv="refresh" content="0; url=${esc(target)}">
  </head>
  <body>
    <p>This page moved to <a href="${esc(target)}">${esc(stub.label)}</a>.</p>
  </body>
</html>
`;
    const clean = `${stub.from.replace(/^\/|\/$/g, '')}/index.html`;
    const full = path.join(DIST, clean);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, html);
    // Deliberately NOT pushed to `pages` — stubs stay out of the sitemap.
  }
}

/* -------------------------------------------------------------------------- */
/* Generated trust pages                                                      */
/* -------------------------------------------------------------------------- */

/** Every publisher we drew on, with how many records each supports. */
function renderSources() {
  const pagePath = '/sources/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'Sources', path: pagePath }];

  const tally = new Map();
  for (const rec of [...allListings, ...events]) {
    for (const s of rec.sources || []) {
      const host = displayHost(s.url) || s.publisher || 'unknown';
      const entry = tally.get(host) || { host, publisher: s.publisher, count: 0, url: s.url };
      entry.count++;
      if (!entry.publisher && s.publisher) entry.publisher = s.publisher;
      tally.set(host, entry);
    }
  }
  const rows = [...tally.values()].sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <h1>Every source this directory draws on</h1>
        <p class="lede">${rows.length} publishers support the ${allListings.length + events.length} records on this site. None of these pages was opened by us — each was quoted in a search result. This list exists so you can judge the sourcing without clicking through ${listings.length} pages.</p>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Publisher</th><th>Records</th></tr></thead>
            <tbody>${rows.map((r) => `<tr><td>${esc(r.publisher || r.host)} <span class="muted">${esc(r.host)}</span></td><td>${r.count}</td></tr>`).join('\n')}</tbody>
          </table>
        </div>
      </div>`;

  write(pagePath, layout({
    path: pagePath, title: 'Our Sources', description: `The ${rows.length} publishers behind every record in this Trenton, Missouri directory, with how many records each one supports.`, body, crumbs,
    jsonld: [breadcrumbGraph(site, crumbs)],
  }), { changefreq: 'monthly', priority: 0.4, lastmod: TODAY });
}

/** The live list of what we could not confirm, generated from the data. */
function renderOpenQuestions() {
  const pagePath = '/about/open-questions/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'Open questions', path: pagePath }];

  const disputed = listings.filter((l) => (l.disputed || []).length);
  const noContact = listings.filter((l) => !l.address && !l.phone && !l.website);
  const uncertainStatus = listings.filter((l) => ['closed', 'possibly_closed', 'renovating', 'disputed'].includes(l.status));

  const list = (recs, render) => `<ul class="linklist">${recs
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => `<li><a href="${site.base}place/${esc(r.slug)}/"><span>${esc(r.name)}</span><span class="aside">${esc(render(r))}</span></a></li>`)
    .join('\n')}</ul>`;

  const unlistedHtml = unlisted.length ? `
        <h2>Held without a page (${unlisted.length})</h2>
        <p>Real, sourced records we deliberately publish no page for — usually because the only thing a page could do is send someone to a place they should not go. They stay in the data and on this list.</p>
        <ul class="linklist">${unlisted.map((r) => `<li><span>${esc(r.name)}</span></li>`).join('\n')}</ul>` : '';

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <h1>What we could not confirm</h1>
        <p class="lede">This page is generated from the same data as the rest of the site, so it cannot drift from it. It is the list of things we know we do not know.</p>

        <h2>Sources disagree (${disputed.length})</h2>
        <p>For these, two publishers gave different values. Where the field is one a reader acts on — an address, a phone number, opening hours — we publish neither value.</p>
        ${disputed.length ? list(disputed, (r) => (r.disputed || []).join(', ')) : '<p class="muted">None.</p>'}

        <h2>No contact detail at all (${noContact.length})</h2>
        <p>We have a name and a source, and nothing you could act on. These pages are not in search results, but they are linked from their categories.</p>
        ${noContact.length ? list(noContact, () => 'name only') : '<p class="muted">None.</p>'}

        <h2>May not be trading (${uncertainStatus.length})</h2>
        <p>Kept deliberately. A page saying a business closed is more useful than a missing page, and it is how someone confirms what they suspected.</p>
        ${uncertainStatus.length ? list(uncertainStatus, (r) => r.status.replace(/_/g, ' ')) : '<p class="muted">None.</p>'}
        ${unlistedHtml}

        ${correctionPath(site)}
      </div>`;

  write(pagePath, layout({
    path: pagePath,
    title: 'What We Could Not Confirm',
    description: 'A generated, live list of every gap, conflict and doubt in this Trenton, Missouri directory.',
    body, crumbs, jsonld: [breadcrumbGraph(site, crumbs)],
  }), { changefreq: 'weekly', priority: 0.5, lastmod: TODAY });
}

function renderCorrections() {
  const pagePath = '/corrections/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'Corrections', path: pagePath }];

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <h1>Corrections</h1>
        <p class="lede">When someone tells us we got something wrong, we fix it and record it here with the date. We do not say who told us.</p>
        ${corrections.length ? `<ul class="linklist">${corrections.map((c) => `<li><a href="${site.base}place/${esc(c.slug)}/"><span>${esc(c.what)}</span><span class="aside">${esc(displayDate(c.date) || c.date)}</span></a></li>`).join('')}</ul>` : `
        <p>Corrections are published here with dates as they arrive. None has arrived yet — which is not a claim of accuracy: nothing here has been confirmed, so the true number of errors is certainly higher than zero. It only means no one has reported one so far.</p>`}
        ${correctionPath(site)}
        <p class="muted">Looking for what changed in town rather than on this site? That is <a href="${site.base}changes/">its own page</a>.</p>
      </div>`;

  write(pagePath, layout({
    path: pagePath, title: 'Corrections', description: 'Every correction made to this Trenton, Missouri directory, with the date it was made.', body, crumbs,
    jsonld: [breadcrumbGraph(site, crumbs)],
  }), { changefreq: 'weekly', priority: 0.4, lastmod: TODAY });
}

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * v2 home: a lookup-and-task surface, not a brochure. Search traffic never
 * lands here — residents do, with one question: a number, a procedure, or
 * what changed. The category grid is how editors think, so it moved down.
 */
function renderHome(guides, howtos) {
  const counts = new Map(categories.map((c) => [c.slug, listings.filter((l) => (l.categories || []).includes(c.slug)).length]));

  // The finder's payload: a server-rendered register of every listing, hidden
  // until JS confirms and a query exists. With JS off, the visible A–Z link
  // carries the load. verify.js budgets this block so the home stays light.
  // Name and link only — the category meta pushed the payload past its
  // budget, and a person typing a name into a finder already knows what kind
  // of place they are looking for.
  const finderRows = [...listings].sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => `<li><a href="${site.base}place/${esc(r.slug)}/">${esc(r.name)}</a></li>`)
    .join('');

  const taskList = [...howtos]
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    .map((d) => `<li><a href="${site.base}how-to/${esc(d.slug)}/">${esc(d.h1 || d.title)}</a></li>`)
    .join('\n');

  const recentChanges = changes.slice(0, 3).map((c) => `<li>
      <span class="register__name">${esc(c.headline)}</span>
      <span class="register__meta">${c.whenPrecision === 'unknown' ? '' : esc(c.when || '')}${(c.sources || [])[0] ? ` · per ${esc(c.sources[0].publisher)}` : ''}</span>
    </li>`).join('\n');

  const tiles = [
    ...categories.map((c) => `<li class="tile">
        <span class="tile__name"><a href="${site.base}${esc(c.slug)}/">${esc(c.name)}</a></span>
        <span class="tile__n">${counts.get(c.slug)} ${counts.get(c.slug) === 1 ? 'entry' : 'entries'}</span>
      </li>`),
    `<li class="tile">
        <span class="tile__name"><a href="${site.base}grundy-county/">Grundy County</a></span>
        <span class="tile__n">the county government</span>
      </li>`,
  ].join('\n');

  const guidePicks = ['things-to-do-in-trenton-mo', 'is-trenton-a-good-place-to-live', 'health-care', 'schools']
    .map((slug) => guides.find((g) => g.slug === slug))
    .filter(Boolean);

  const body = `      <section class="hero">
        <div class="wrap">
          ${disclosure(site)}
          <h1>Trenton, Missouri — look it up, get it done</h1>
          <p class="hero__lede">A sourced directory of every business, office and place we could find evidence of in Trenton and Grundy County — and the steps for getting things done here. Every entry names its source; nothing is confirmed; call ahead before you drive.</p>
          <div class="hero__meta">
            <span><strong>${listings.length}</strong> entries</span>
            <span>County seat of <strong>Grundy County</strong></span>
            <span>ZIP <strong>64683</strong></span>
          </div>

          <form class="finder" data-finder="home-list" data-finder-lazy hidden>
            <label class="visually-hidden" for="home-finder">Find a place</label>
            <input class="finder__input" id="home-finder" type="search" placeholder="Find a place — name, or what it does" autocomplete="off">
            <p class="finder__status" role="status"></p>
          </form>
          <ul class="register" id="home-list" hidden>${finderRows}</ul>
          <p><a href="${site.base}a-z/">Browse every place, A to Z</a></p>
        </div>
      </section>

      <div class="wrap">
        <section class="section">
          <h2>Get something done</h2>
          <ul class="linklist linklist--cols">
${taskList}
          </ul>
        </section>

        <section class="section">
          <h2>What's changed in town</h2>
          ${recentChanges ? `<ul class="register">${recentChanges}</ul>` : ''}
          <p><a href="${site.base}changes/">Everything that closed, opened or moved →</a></p>
        </section>

        <section class="section">
          <h2>Who to call</h2>
          <p>The numbers people actually need, on <a href="${site.base}who-to-call/">one printable page</a>. In an emergency, call 911.</p>
        </section>

        <section class="section">
          <h2>Browse the directory</h2>
          <ul class="grid">${tiles}</ul>
        </section>

        <section class="section">
          <h2>Reading</h2>
          <ul class="grid grid--wide">${guidePicks.map((d) => `<li>
            <article class="card">
              <h3 class="card__title"><a href="${site.base}guides/${esc(d.slug)}/">${esc(d.title)}</a></h3>
              ${d.summary ? `<p class="card__desc">${esc(d.summary)}</p>` : ''}
            </article></li>`).join('\n')}</ul>
          <p><a class="btn btn--ghost" href="${site.base}guides/">All guides</a></p>
        </section>

        <section class="section">
          <h2>How this was built</h2>
          <p>This directory was assembled from public sources that we could name but could not open — our network could not reach them, so everything here came through search results quoting those pages second-hand. Nobody has called these businesses. Nobody has been to Trenton.</p>
          <p>We think that is still worth publishing, as long as we never pretend otherwise. Every record shows its publisher, blank fields stay blank instead of being guessed at, and <a href="${site.base}about/open-questions/">the list of everything we could not confirm</a> is generated from the same data as the listings, so it cannot quietly fall out of date.</p>
          <p><a class="btn" href="${site.base}about/how-we-source-this/">Read the full method</a></p>
        </section>
      </div>`;

  write('/', layout({
    path: '/',
    title: site.titleHome,
    description: site.descriptionFallback,
    body,
    jsonld: [siteGraph(site)],
  }), { changefreq: 'weekly', priority: 1.0, lastmod: TODAY });
}

/** The Open Graph share card in the county-record language: paper, rules, ink. */
function buildOgImage() {
  const INK = [22, 25, 29];
  const PAPER = [251, 250, 247];
  const BLUE = [28, 90, 122];
  const GREY = [98, 106, 117];
  const GOLD = [138, 100, 20];

  const cv = canvas(1200, 630, PAPER);
  // Double rule top and bottom — the register's frame.
  cv.rect(60, 48, 1080, 3, INK);
  cv.rect(60, 57, 1080, 1, INK);
  cv.rect(60, 572, 1080, 1, INK);
  cv.rect(60, 579, 1080, 3, INK);

  drawText(cv, 'TRENTON, MISSOURI', 80, 150, 9, INK);
  drawText(cv, 'DIRECTORY OF GRUNDY COUNTY', 80, 260, 5, BLUE);

  cv.rect(80, 350, 160, 5, GOLD);

  drawText(cv, 'EVERY ENTRY NAMES THE SOURCE', 80, 410, 3, GREY);
  drawText(cv, 'IT CAME FROM. NOTHING ON IT', 80, 460, 3, GREY);
  drawText(cv, 'HAS BEEN CONFIRMED BY US.', 80, 510, 3, GREY);

  return encodePng(cv.width, cv.height, cv.data);
}

function render404() {
  const html = layout({
    path: '/404',
    title: 'Page not found',
    description: 'That page does not exist on this Trenton, Missouri directory.',
    noindex: true,
    body: `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <h1>That page is not here</h1>
        <p class="lede">The link may be old, or we may have removed a listing after finding out it was wrong.</p>
        <p><a href="${site.base}">Start from the directory home page</a>, or <a href="${site.base}a-z/">browse every place A to Z</a>.</p>
      </div>`,
  });
  fs.writeFileSync(path.join(DIST, '404.html'), html);
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// Guides write site-absolute links like /place/x/; teach the renderer where
// the site actually lives so they survive a subpath deployment.
setLinkBase(site.base);

const guides = loadMarkdownDir('content/guides');
const howtos = loadMarkdownDir('content/how-to');
const chrome = loadMarkdownDir('content/pages');

for (const rec of listings) renderListing(rec);
for (const cat of categories) renderCategory(cat);
for (const ev of events) renderEvent(ev);
renderEventsIndex();

for (const doc of guides) renderArticle(doc, { section: 'guides', sectionLabel: 'Guides' });
if (guides.length) {
  renderCollectionIndex({
    section: 'guides', label: 'Guides', h1: 'Guides to Trenton, Missouri',
    intro: 'Written from public sources, with the source named. Where we could not confirm something, these say so rather than filling the gap.',
    description: 'Guides to living in, moving to and visiting Trenton, Missouri — sourced, and honest about what is unconfirmed.',
    docs: guides,
  });
}

for (const doc of howtos) renderArticle(doc, { section: 'how-to', sectionLabel: 'How to' });
if (howtos.length) {
  renderCollectionIndex({
    section: 'how-to', label: 'How to', h1: 'How to get things done in Trenton',
    intro: 'Practical steps for the things people actually need to do — paying a bill, registering to vote, licensing a vehicle. Where a fee or an office hour is unconfirmed, we say so instead of guessing.',
    description: 'Step-by-step civic how-tos for Trenton, Missouri: utilities, voting, vehicle licensing, permits and waste collection.',
    docs: howtos,
  });
}

for (const doc of chrome) renderArticle(doc, { section: null, sectionLabel: null });

renderAZ();
renderWhoToCall();
renderChanges();
renderGrundyCounty();
renderStubs();
renderSources();
renderOpenQuestions();
renderCorrections();
renderHome(guides, howtos);
render404();

// Crawl files
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemapXml(site, pages));
fs.writeFileSync(path.join(DIST, 'robots.txt'), robotsTxt(site));

// Static assets
const assetsOut = path.join(DIST, 'assets');
fs.mkdirSync(assetsOut, { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) {
  fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(assetsOut, f));
}

// The share card, as a real raster file — SVG og:images are rejected by every
// social platform, and a shared link is a primary channel in a town this size.
fs.writeFileSync(path.join(assetsOut, 'og.png'), buildOgImage());
// GitHub Pages otherwise strips underscore directories and runs Jekyll.
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

const indexed = pages.filter((p) => !p.noindex).length;
console.log(`✓ built ${pages.length} pages (${indexed} indexed, ${pages.length - indexed} noindex, ${STUBS.length} stubs, ${unlisted.length} unlisted)`);
console.log(`  ${listings.length} listings · ${categories.length} categories · ${events.length} events · ${guides.length} guides · ${howtos.length} how-tos · ${changes.length} change entries`);
