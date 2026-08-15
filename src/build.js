/**
 * Static site generator for the Trenton, Missouri directory.
 *
 * Reads the merged data, renders plain HTML, writes dist/. There is no
 * incremental mode and no cache: the whole site is ~140 small pages and a full
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
  faqGraph, articleGraph, eventGraph, sitemapXml, robotsTxt,
} from './lib/seo.js';
import { markdown, frontMatter, markdownToText } from './lib/markdown.js';
import {
  disclosure, sourceBlock, corroboration, notConfirmed, correctionPath,
  statusNote, seasonalNote, listingCard, header, footer, breadcrumbs,
} from './lib/components.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const site = readJson('data/site.json');
const { listings } = readJson('data/listings.json');
const { events } = readJson('data/events.json');
const { categories } = readJson('data/categories.json');

// Allow a deploy to override the host/base without editing tracked data.
if (process.env.SITE_URL) site.url = process.env.SITE_URL;
if (process.env.SITE_BASE) site.base = process.env.SITE_BASE;

const bySlug = new Map(listings.map((l) => [l.slug, l]));
const pages = [];
const TODAY = new Date().toISOString().slice(0, 10);

/* -------------------------------------------------------------------------- */
/* Indexing policy                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A listing page is held back from the index when it carries no contact detail
 * of any kind and only one source. Such a page is a name and a sentence — real,
 * but with nothing on it a searcher could act on. It stays fully linked from its
 * hubs so it is reachable and can accumulate signal, and it flips to indexed the
 * moment any contact field or a second source arrives.
 */
function listingIsThin(rec) {
  const hasContact = Boolean(rec.address || rec.phone || rec.website);
  const corroborated = (Number(rec.corroborated) || 1) > 1;
  return !hasContact && !corroborated;
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

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
    ${footer(site, categories)}
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

function renderListing(rec) {
  const cats = categories.filter((c) => (rec.categories || []).includes(c.slug));
  const primary = cats[0] || null;
  const pagePath = `/place/${rec.slug}/`;
  const noindex = listingIsThin(rec);

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

  const related = listings
    .filter((l) => l.slug !== rec.slug && (l.categories || []).some((c) => (rec.categories || []).includes(c)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 6);

  const body = `      <div class="wrap">
        ${disclosure(site)}
        <div class="listing-layout">
          <div>
            <h1>${esc(rec.name)}</h1>
            ${rec.summary ? `<p class="lede">${esc(rec.summary)}</p>` : `<p class="lede muted">No source told us what this is, so we have not written a description.</p>`}
            ${statusNote(rec)}
            ${seasonalNote(rec)}
            ${disputedNote}
            ${corroboration(rec)}
            ${cats.length ? `<p class="row">${cats.map((c) => `<a class="badge badge--accent" href="${site.base}${esc(c.slug)}/">${esc(c.name)}</a>`).join(' ')}</p>` : ''}
            ${correctionPath(site, { owner: true, slug: rec.slug })}
            ${related.length ? `
            <h2>Also in ${esc(primary ? primary.name.toLowerCase() : 'this category')}</h2>
            <ul class="grid">${related.map((r) => listingCard(site, r)).join('\n')}</ul>` : ''}
          </div>
          <aside class="listing-aside">
            <section class="factbox">
              <h2>Contact</h2>
              <dl class="facts">${facts}</dl>
              <p class="source-note">Blank fields are blank because no source we found supports them. We have not filled them in.</p>
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
  // entity graph entirely for records our sources say may not be trading.
  const emitEntity = !['closed', 'possibly_closed', 'disputed'].includes(rec.status);
  const graphs = [
    breadcrumbGraph(site, crumbs),
    emitEntity ? listingGraph(site, { ...rec, path: pagePath }, primary) : null,
  ];

  write(pagePath, layout({
    path: pagePath,
    title: `${rec.name}, Trenton MO`,
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
  // URL of its own — the mechanism that keeps trades and local news reachable
  // without shipping four-item pages.
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
      itemListGraph(site, cat.name, members.map((m) => ({ name: m.name, path: `/place/${m.slug}/` }))),
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
        ${ev.recurrence ? `<p class="callout"><span class="callout__title">When it runs</span>${esc(ev.recurrence)}${ev.startDate ? '' : ' We have no confirmed date for the next one.'}</p>` : ''}
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
    jsonld: [breadcrumbGraph(site, crumbs), eventGraph(site, { ...ev, path: pagePath })],
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
          <ul class="sources">${(doc.sources || []).map((s) => `<li class="source"><p class="source__url"><a href="${esc(s.url)}" rel="nofollow ugc noopener" target="_blank">${esc(s.publisher || displayHost(s.url))}</a></p></li>`).join('')}</ul>
          <p class="source-note">Quoted from search results. We did not open these pages.</p>
        </section>` : '';

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <h1>${esc(doc.h1 || doc.title)}</h1>
        ${doc.summary ? `<p class="lede">${esc(doc.summary)}</p>` : ''}
        <div class="prose">
${markdown(doc.body)}
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
/* Generated trust pages                                                      */
/* -------------------------------------------------------------------------- */

/** Every publisher we drew on, with how many records each supports. */
function renderSources() {
  const pagePath = '/sources/';
  const crumbs = [{ label: 'Home', path: '/' }, { label: 'Sources', path: pagePath }];

  const tally = new Map();
  for (const rec of [...listings, ...events]) {
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
        <p class="lede">${rows.length} publishers support the ${listings.length + events.length} records on this site. None of these pages was opened by us — each was quoted in a search result. This list exists so you can judge the sourcing without clicking through ${listings.length} pages.</p>
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
  const corrections = fs.existsSync(path.join(ROOT, 'data/corrections.json'))
    ? readJson('data/corrections.json').corrections || []
    : [];

  const body = `      <div class="wrap wrap--narrow">
        ${disclosure(site)}
        <h1>Corrections</h1>
        <p class="lede">When someone tells us we got something wrong, we fix it and record it here with the date. We do not say who told us.</p>
        ${corrections.length ? `<ul class="linklist">${corrections.map((c) => `<li><a href="${site.base}place/${esc(c.slug)}/"><span>${esc(c.what)}</span><span class="aside">${esc(displayDate(c.date) || c.date)}</span></a></li>`).join('')}</ul>` : `
        <p>There are none yet. This site has just been published and nobody has told us about a mistake so far.</p>
        <p>That is not a claim of accuracy — nothing here has been confirmed, so the true number of errors is certainly higher than zero. It only means no one has reported one.</p>`}
        ${correctionPath(site)}
      </div>`;

  write(pagePath, layout({
    path: pagePath, title: 'Corrections', description: 'Every correction made to this Trenton, Missouri directory, with the date it was made.', body, crumbs,
    jsonld: [breadcrumbGraph(site, crumbs)],
  }), { changefreq: 'weekly', priority: 0.4, lastmod: TODAY });
}

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

function renderHome(guides) {
  const indexed = categories.filter((c) => c.index !== false);
  const counts = new Map(categories.map((c) => [c.slug, listings.filter((l) => (l.categories || []).includes(c.slug)).length]));

  const tiles = categories.map((c) => `<li class="tile">
        <span class="tile__name"><a href="${site.base}${esc(c.slug)}/">${esc(c.name)}</a></span>
        <span class="tile__n">${counts.get(c.slug)} ${counts.get(c.slug) === 1 ? 'entry' : 'entries'}</span>
      </li>`).join('\n');

  const featured = guides.slice(0, 6);

  const body = `      <section class="hero">
        <div class="wrap">
          ${disclosure(site)}
          <h1>Trenton, Missouri — what is here and who to ask</h1>
          <p class="hero__lede">A directory of the businesses, public offices and places we could find evidence of in Trenton and Grundy County. Every entry names the source it came from, and says plainly what we could not confirm.</p>
          <div class="hero__meta">
            <span><strong>${listings.length}</strong> entries</span>
            <span><strong>${categories.length}</strong> categories</span>
            <span>County seat of <strong>Grundy County</strong></span>
            <span>ZIP <strong>64683</strong></span>
          </div>
        </div>
      </section>

      <div class="wrap">
        <section class="section">
          <h2>Browse the directory</h2>
          <ul class="grid">${tiles}</ul>
        </section>

        <section class="section">
          <h2>Getting things done</h2>
          <p class="muted">Guides written from public sources, for people who live here and people deciding whether to.</p>
          <ul class="grid grid--wide">${featured.map((d) => `<li>
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
        <p><a href="${site.base}">Start from the directory home page</a>, or <a href="${site.base}about/open-questions/">see what we could not confirm</a>.</p>
      </div>`,
  });
  fs.writeFileSync(path.join(DIST, '404.html'), html);
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

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

renderSources();
renderOpenQuestions();
renderCorrections();
renderHome(guides);
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
// GitHub Pages otherwise strips directories beginning with an underscore and
// runs Jekyll over the output; this opts out.
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

const indexed = pages.filter((p) => !p.noindex).length;
console.log(`✓ built ${pages.length} pages (${indexed} indexed, ${pages.length - indexed} noindex)`);
console.log(`  ${listings.length} listings · ${categories.length} categories · ${events.length} events · ${guides.length} guides · ${howtos.length} how-tos`);
