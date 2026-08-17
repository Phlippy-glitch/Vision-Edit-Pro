/**
 * Build gates.
 *
 * These are the content teams' consensus rules made mechanical. The editors'
 * position was that a rule enforced only in a style guide is a rule that ships
 * broken eventually, so every integrity rule that *can* be executed is executed
 * here and fails the build.
 *
 *   node src/verify.js          → data gates only
 *   node src/verify.js --output → data gates + gates against rendered HTML
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { frontMatter } from './lib/markdown.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const failures = [];
const warnings = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const warn = (rule, detail) => warnings.push({ rule, detail });

/* -------------------------------------------------------------------------- */
/* Rules that encode specific findings from the research rounds.               */
/* Each one exists because an agent caught it in real data.                    */
/* -------------------------------------------------------------------------- */

/** Entities ruled unpublishable. Slug fragments, matched loosely. */
const CUT_LIST = [
  ['memorial-park', 'existence never confirmed'],
  ['trenton-lake', 'reads as private; failure mode is trespass advice'],
  ['plaza-hotel', 'is apartments, not lodging'],
  ['gladys-grimes-park', 'invented — no source in any deliverable'],
  ['trenton-hardware', 'invented — no source in any deliverable'],
  ['dinos-diner', 'invented — no source in any deliverable'],
  ['dino-s-diner', 'invented — no source in any deliverable'],
];

/** Domains that would silently import a different town's data. */
const WRONG_TOWN_DOMAINS = [
  ['trentonlib.org', 'library in a different Trenton; correct domain is grundycountylibrary.org'],
];

/** Records that must never carry a phone number, however well sourced. */
const EMERGENCY_PATTERN = /\b(police|sheriff|fire\s*(department|district|protection)|ambulance|911|emergency\s*management|dispatch)\b/i;

/** Fields whose truth we cannot assert without a source that explicitly covers them. */
const COVERED_FIELDS = ['phone', 'address', 'hours', 'website', 'email'];

/** Fields a reader acts on physically — being wrong here costs them a trip. */
const ACTIONABLE_FIELDS = ['address', 'phone', 'hours'];

/** Keys that must never appear anywhere in the data. */
const FORBIDDEN_KEYS = ['rating', 'aggregateRating', 'ratingValue', 'reviewCount', 'reviews', 'stars'];

const VALID_STATUS = ['open', 'closed', 'possibly_closed', 'seasonal', 'renovating', 'disputed', 'unknown'];
const VALID_EVIDENCE = ['first_party_page', 'first_party_snippet', 'reputable_third_party', 'aggregator'];
const VALID_CONFIRMATION = ['unconfirmed', 'confirmed_remote', 'confirmed_human'];

/* -------------------------------------------------------------------------- */
/* Data gates                                                                  */
/* -------------------------------------------------------------------------- */

function deepFindKey(obj, keys, trailPrefix = '') {
  const hits = [];
  const walk = (node, trail) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${trail}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (keys.includes(k)) hits.push(`${trail}.${k}`);
      walk(v, `${trail}.${k}`);
    }
  };
  walk(obj, trailPrefix);
  return hits;
}

function checkRecord(rec, kind) {
  const id = `${kind}:${rec.slug || rec.name || '(unnamed)'}`;

  // --- identity -----------------------------------------------------------
  if (!rec.slug) fail('slug-required', `${id} has no slug`);
  if (!rec.name) fail('name-required', `${id} has no name`);

  // --- the cut list -------------------------------------------------------
  for (const [frag, why] of CUT_LIST) {
    if ((rec.slug || '').includes(frag)) fail('cut-list', `${id} was ruled unpublishable: ${why}`);
  }

  // --- provenance ---------------------------------------------------------
  const sources = Array.isArray(rec.sources) ? rec.sources : [];
  if (!sources.length) fail('source-required', `${id} has no sources — no source, no listing`);

  for (const s of sources) {
    if (!s.url) fail('source-url-required', `${id} has a source with no url`);
    for (const [domain, why] of WRONG_TOWN_DOMAINS) {
      if ((s.url || '').includes(domain)) fail('wrong-town', `${id} cites ${domain} — ${why}`);
    }
  }

  // The covers gate. This is the rule that stops a plausible-looking phone
  // number from reaching a page: a field is publishable only if some source
  // explicitly claims to support it.
  const covered = new Set(sources.flatMap((s) => (Array.isArray(s.covers) ? s.covers : [])));
  for (const field of COVERED_FIELDS) {
    if (rec[field] !== null && rec[field] !== undefined && rec[field] !== '' && !covered.has(field)) {
      fail('uncovered-field', `${id} publishes "${field}" but no source covers it`);
    }
  }

  // --- evidence model -----------------------------------------------------
  if (!VALID_EVIDENCE.includes(rec.evidence)) {
    fail('evidence-enum', `${id} has evidence="${rec.evidence}"`);
  }
  if (rec.evidence === 'first_party_page') {
    // No agent could open a first-party page in this environment. If this ever
    // fires, either the network policy changed or a record is overclaiming.
    fail('evidence-overclaim', `${id} claims first_party_page, but no page was opened in this build`);
  }
  if (!VALID_CONFIRMATION.includes(rec.confirmation)) {
    fail('confirmation-enum', `${id} has confirmation="${rec.confirmation}"`);
  }
  if (rec.confirmation !== 'unconfirmed') {
    fail('confirmation-ceiling', `${id} claims "${rec.confirmation}" — the ceiling for this build is "unconfirmed"`);
  }
  if (!rec.last_verified_at) {
    fail('last-verified-required', `${id} has no last_verified_at`);
  }

  // --- operating status ---------------------------------------------------
  if (!VALID_STATUS.includes(rec.status)) {
    fail('status-enum', `${id} has status="${rec.status}"`);
  }

  // --- locality -----------------------------------------------------------
  // Trenton MI / NJ / GA contamination was the dominant research failure mode.
  if (rec.state && rec.state !== 'MO') {
    fail('wrong-state', `${id} has state="${rec.state}" — this directory is Trenton, Missouri`);
  }
  if (rec.zip && rec.zip !== '64683') {
    warn('unexpected-zip', `${id} has zip="${rec.zip}" (expected 64683)`);
  }
  if (rec.phone && !/^\(?660\)?[\s.-]?/.test(String(rec.phone))) {
    warn('unexpected-area-code', `${id} has a phone outside area code 660: ${rec.phone}`);
  }

  // --- emergency services -------------------------------------------------
  if (EMERGENCY_PATTERN.test(rec.name || '') && rec.phone) {
    fail('emergency-phone', `${id} carries a phone number — emergency contacts must never publish one`);
  }

  // --- disputed fields ----------------------------------------------------
  // If sources conflict on a field, what we do about it depends on what being
  // wrong costs the reader. A wrong address sends someone across town to a
  // locked door; a wrong website costs one click and is self-correcting on
  // arrival. So conflicts on actionable fields are suppressed outright, and
  // conflicts on the rest are published with the disagreement disclosed.
  // (`name` is never suppressible — a listing has to be called something.)
  for (const field of Array.isArray(rec.disputed) ? rec.disputed : []) {
    const published = rec[field] !== null && rec[field] !== undefined && rec[field] !== '';
    if (!published) continue;
    if (ACTIONABLE_FIELDS.includes(field)) {
      fail('disputed-field', `${id} publishes "${field}", which sources conflict on — acting on it costs a trip`);
    } else {
      warn('disputed-disclosed', `${id} publishes a disputed "${field}"; the page must disclose the conflict`);
    }
  }

  // Named explicitly because it was an explicit ruling: the hospital has two
  // candidate addresses and publishes neither. Kept alongside the general rule
  // so removing the record's `disputed` entry cannot silently unblock it.
  if (rec.slug === 'wright-memorial-hospital' && rec.address) {
    fail('disputed-address', `${id} publishes an address, but two conflicting addresses exist`);
  }

  // --- reader-facing caution ----------------------------------------------
  // A caution is published prose and gets the same scrutiny as any other
  // published field. It exists because rendering raw research `notes` leaked
  // suppressed addresses and phone numbers into the page, so this field must
  // never carry either, nor a directive written for the build team.
  if (rec.caution) {
    if (/\b\d{2,5}\s+(N|S|E|W|North|South|East|West)?\s*[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Hwy|Highway|Ct|Court|Ln|Lane)\b/.test(rec.caution)) {
      fail('caution-leaks-address', `${id} has a caution containing a street address`);
    }
    if (/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{4}\b/.test(rec.caution)) {
      fail('caution-leaks-phone', `${id} has a caution containing a phone number`);
    }
    if (/\b(the (record|data) model|the build|must tolerate|do not (ship|render)|TODO|the template)\b/i.test(rec.caution)) {
      fail('caution-is-a-directive', `${id} has a caution written for the build team, not a reader`);
    }
  }

  // --- forbidden keys -----------------------------------------------------
  const bad = deepFindKey(rec, FORBIDDEN_KEYS, id);
  for (const hit of bad) fail('forbidden-key', `${hit} — ratings and review counts are never published`);
}

/**
 * v2 data gates: the changes feed, the unlisted state, and editorial
 * front matter. Each exists because the page it guards is generated — a
 * malformed entry would render wrong rather than fail loudly.
 */
function v2DataGates() {
  // --- data/changes.json ---------------------------------------------------
  const changesPath = path.join(ROOT, 'data/changes.json');
  const { listings } = read('data/listings.json');
  const slugs = new Set((listings || []).map((l) => l.slug));

  if (fs.existsSync(changesPath)) {
    let changes;
    try {
      changes = JSON.parse(fs.readFileSync(changesPath, 'utf8')).changes || [];
    } catch (e) {
      fail('changes-unreadable', e.message);
      changes = [];
    }
    for (const c of changes) {
      const id = `change:${c.id || c.headline || '(unnamed)'}`;
      if (!c.headline || !c.detail) fail('change-incomplete', `${id} lacks headline or detail`);
      const sources = Array.isArray(c.sources) ? c.sources : [];
      if (!sources.some((s) => s.url && s.publisher)) {
        fail('change-unsourced', `${id} has no source with url and publisher — a change entry is a factual claim`);
      }
      if (c.listingSlug && !slugs.has(c.listingSlug)) {
        fail('change-bad-slug', `${id} references listing "${c.listingSlug}", which does not exist`);
      }
      if (c.kind === 'opened' && !c.listingSlug) {
        fail('change-opened-unanchored', `${id} claims an opening but references no record — no-new-entities applies to changes too`);
      }
      if (c.whenPrecision === 'unknown' && c.when) {
        fail('change-date-overclaim', `${id} has whenPrecision "unknown" but carries a date`);
      }
    }
  }

  // --- unlisted records ----------------------------------------------------
  for (const rec of listings || []) {
    if (rec.unlisted && !rec.notes) {
      fail('unlisted-unexplained', `listing:${rec.slug} is unlisted with no notes — the reason must be recorded`);
    }
  }

  // --- editorial front matter ----------------------------------------------
  // Every guide and how-to must name what it specifically could not confirm.
  // Citations in editorial sources must be deep pages, not bare origins — a
  // bare root is a gesture at authority, not a source for a claim.
  for (const dir of ['content/guides', 'content/how-to']) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full).filter((n) => n.endsWith('.md'))) {
      const { data } = frontMatter(fs.readFileSync(path.join(full, f), 'utf8'));
      const id = `${dir}/${f}`;
      if (!Array.isArray(data.unconfirmed) || !data.unconfirmed.filter(Boolean).length) {
        fail('scope-note-missing', `${id} has no non-empty "unconfirmed" front-matter list`);
      }
      for (const s of data.sources || []) {
        if (s && s.url && /^https?:\/\/[^/]+\/?$/i.test(s.url)) {
          fail('bare-root-citation', `${id} cites ${s.url} — a bare origin supports nothing; cite the page or drop the citation`);
        }
      }
    }
  }
}

function dataGates() {
  const { listings } = read('data/listings.json');
  const { events } = read('data/events.json');

  if (!Array.isArray(listings)) fail('shape', 'data/listings.json has no "listings" array');
  if (!Array.isArray(events)) fail('shape', 'data/events.json has no "events" array');

  const seen = new Map();
  for (const rec of listings || []) {
    checkRecord(rec, 'listing');
    if (rec.slug) {
      if (seen.has(rec.slug)) fail('duplicate-slug', `"${rec.slug}" appears more than once`);
      seen.set(rec.slug, rec);
    }
  }
  for (const rec of events || []) checkRecord(rec, 'event');

  return { listings: listings || [], events: events || [] };
}

/* -------------------------------------------------------------------------- */
/* Output gates                                                                */
/* -------------------------------------------------------------------------- */

function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** Strip tags and script/style bodies so lint runs on what a reader actually sees. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

function outputGates() {
  const lint = read('data/lint.json');
  const files = walkHtml(path.join(ROOT, 'dist'));
  if (!files.length) {
    fail('no-output', 'dist/ contains no HTML — run the build first');
    return;
  }

  const canonicals = new Map();
  const internalLinks = [];

  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    const text = visibleText(html);

    // Banned-phrase lint — the anti-slop standard, executed.
    for (const rule of lint.banned) {
      let re;
      try {
        re = new RegExp(rule.pattern, 'i');
      } catch {
        fail('lint-pattern', `invalid regex in lint.json: ${rule.pattern}`);
        continue;
      }
      const hit = re.exec(text);
      if (hit) {
        const detail = `${rel}: "${hit[0]}" — ${rule.why}`;
        if (rule.tier === 'fail') fail('banned-phrase', detail);
        else warn('banned-phrase', detail);
      }
    }

    // One canonical per page, and no two pages claiming the same one.
    const canon = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
    if (canon.length === 0) fail('canonical-missing', rel);
    if (canon.length > 1) fail('canonical-duplicate', `${rel} declares ${canon.length} canonicals`);
    if (canon[0]) {
      if (canonicals.has(canon[0])) {
        fail('canonical-collision', `${rel} and ${canonicals.get(canon[0])} both claim ${canon[0]}`);
      }
      canonicals.set(canon[0], rel);
    }

    // Exactly one H1, and a title and description that will survive the SERP.
    const h1s = [...html.matchAll(/<h1[\s>]/g)].length;
    if (h1s !== 1) fail('h1-count', `${rel} has ${h1s} <h1> elements`);

    const title = /<title>([^<]*)<\/title>/.exec(html);
    if (!title || !title[1].trim()) fail('title-missing', rel);
    else if (title[1].length > 65) warn('title-long', `${rel} title is ${title[1].length} chars`);

    const desc = /<meta name="description" content="([^"]*)"/.exec(html);
    if (!desc || !desc[1].trim()) fail('description-missing', rel);
    else if (desc[1].length > 160) warn('description-long', `${rel} description is ${desc[1].length} chars`);

    // The sitewide disclosure is non-negotiable: it is the single thing that
    // makes publishing unconfirmed data honest rather than misleading.
    if (!/nothing on it has been confirmed by us/i.test(text)) {
      fail('disclosure-missing', `${rel} does not carry the sitewide sourcing disclosure`);
    }

    // Structured data must parse, and must not contradict the page.
    //
    // Parsing alone was not enough: a graph asserted addressLocality "Trenton"
    // on pages whose visible text said the place was outside the city limits.
    // Structured data that disagrees with the rendered page is the textbook
    // condition for a manual action, so the two are compared here.
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let graph;
      try {
        graph = JSON.parse(m[1]);
      } catch (e) {
        fail('jsonld-invalid', `${rel}: ${e.message}`);
        continue;
      }

      // The contradiction is specifically claiming Trenton on a page that says
      // the place is not in Trenton. Naming a different locality is the fix,
      // not the fault.
      const locality = graph?.address?.addressLocality;
      if (/^trenton$/i.test(locality || '') && /outside trenton city limits|not in trenton/i.test(text)) {
        fail('jsonld-contradiction', `${rel} renders "not in Trenton" but its graph claims addressLocality "${locality}"`);
      }

      if (graph['@type'] === 'Event' && !graph.startDate) {
        fail('jsonld-event-nodate', `${rel} emits an Event with no startDate, which is invalid`);
      }

      for (const key of ['telephone', 'openingHours', 'geo']) {
        if (graph[key]) {
          fail('jsonld-overreach', `${rel} emits "${key}", which travels without the page's caveat`);
        }
      }
      if (graph?.address?.streetAddress) {
        fail('jsonld-overreach', `${rel} emits a streetAddress in structured data`);
      }

      // isBasedOn is a CreativeWork property: it belongs to the page about the
      // entity, never to the entity itself.
      if (graph.isBasedOn && !['Article', 'WebPage'].includes(graph['@type'])) {
        fail('jsonld-isbasedon-type', `${rel} puts isBasedOn on a ${graph['@type']} node`);
      }

      // The machine-layer caveat must not drift. These are the exact ratified
      // templates; anything else means the caveat was edited or dropped.
      if (graph.disambiguatingDescription) {
        const ok = /^Compiled from named public sources and not independently confirmed\. This (is the .+ in Trenton, Grundy County, Missouri 64683 — not a namesake in another Trenton\.|is the .+ in Grundy County, Missouri, near Trenton — not a namesake elsewhere\.|is the .+ based in .+, Missouri, serving Trenton and Grundy County\.|event is held in Trenton, Grundy County, Missouri\.)$/.test(graph.disambiguatingDescription);
        if (!ok) fail('jsonld-caveat-drift', `${rel} emits a disambiguatingDescription that matches no ratified template`);
      }
    }

    // Every internal link must resolve to something the build actually wrote.
    // 240 editorial links once shipped without the site's base path, pointing
    // off the deployment root — invisible in review, fatal in production.
    for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const href = m[1];
      if (href.startsWith('//')) continue;
      internalLinks.push({ from: rel, href });
    }

    // Emergency-service pages must tell the reader what to do instead. The
    // rule that suppresses their phone numbers once shipped without its
    // other half, leaving the pages saying nothing at all.
    // Scoped to listing pages: an index that merely mentions the police
    // department is not the page someone lands on in an emergency.
    if (/\/place\//.test(rel) && /\b(police department|fire department|sheriff'?s? office)\b/i.test(text) && !/call 911/i.test(text)) {
      fail('emergency-no-911', `${rel} is an emergency-service listing but never says to call 911`);
    }

    // The printable sheet exists to be stuck on a fridge; it must lead with 911.
    if (/who-to-call\/index\.html$/.test(rel) && !/call 911/i.test(text)) {
      fail('emergency-no-911', `${rel} is the who-to-call sheet and never says to call 911`);
    }

    // Editorial pages must carry their page-scoped unconfirmed block, and it
    // must sit at the top — directly after the disclosure, before the H1.
    if (/dist\/(guides|how-to)\/[^/]+\/index\.html$/.test(rel) && !/dist\/(guides|how-to)\/index\.html$/.test(rel)) {
      const isStub = /http-equiv="refresh"/.test(html);
      if (!isStub) {
        const scopeIdx = html.indexOf('class="scope-note"');
        const h1Idx = html.indexOf('<h1');
        if (scopeIdx === -1) {
          fail('scope-note-missing', `${rel} renders no "what this page could not confirm" block`);
        } else if (h1Idx !== -1 && scopeIdx > h1Idx) {
          fail('scope-note-misplaced', `${rel} renders the scope note below the H1 — it belongs directly under the disclosure`);
        }
      }
    }
  }

  // Resolve collected links against what was written to disk.
  const base = (read('data/site.json').base || '/').replace(/\/$/, '');
  for (const { from, href } of internalLinks) {
    if (base && !href.startsWith(`${base}/`)) {
      fail('link-missing-base', `${from} links to ${href}, which drops the site base path "${base}/"`);
      continue;
    }
    const rest = base ? href.slice(base.length) : href;
    const target = path.join(ROOT, 'dist', rest);
    const ok = fs.existsSync(target)
      || fs.existsSync(path.join(target, 'index.html'))
      || fs.existsSync(`${target}.html`);
    if (!ok) fail('link-broken', `${from} links to ${href}, which was never built`);
  }

  // Two pages with the same title compete with each other in the SERP.
  // Redirect stubs are exempt — their titles intentionally match their targets.
  const titles = new Map();
  const stubPaths = [];
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    if (/http-equiv="refresh"/.test(html) && /content="noindex"/.test(html)) {
      stubPaths.push(`/${path.relative(path.join(ROOT, 'dist'), path.dirname(file)).replace(/\\/g, '/')}/`);
      continue;
    }
    const t = /<title>([^<]*)<\/title>/.exec(html);
    if (!t) continue;
    if (titles.has(t[1])) {
      fail('duplicate-title', `${rel} and ${titles.get(t[1])} share the title "${t[1]}"`);
    }
    titles.set(t[1], rel);
  }

  // Stubs exist for external bookmarks only. Internal links must point at the
  // target — an indexed page linking a stub means a link rewrite was missed —
  // and a stub whose target does not resolve strands the visitor twice.
  for (const stubPath of stubPaths) {
    const stubFile = path.join(ROOT, 'dist', stubPath.replace(/^\//, ''), 'index.html');
    const stubHtml = fs.readFileSync(stubFile, 'utf8');
    const target = /url=([^">]+)"/.exec(stubHtml)?.[1];
    if (target) {
      const targetPath = target.replace(/^https?:\/\/[^/]+/, '');
      const targetFile = path.join(ROOT, 'dist', targetPath.replace(/^\//, '').replace(new RegExp(`^${base.replace(/^\//, '')}/`), ''), 'index.html');
      if (!fs.existsSync(targetFile)) {
        fail('stub-dangling', `${stubPath} redirects to ${target}, which was never built`);
      }
    }
    const stubHref = `href="${base}${stubPath}"`;
    for (const file of files) {
      const html = fs.readFileSync(file, 'utf8');
      if (/http-equiv="refresh"/.test(html)) continue;
      if (/noindex/.test(html)) continue;
      if (html.includes(stubHref)) {
        fail('link-to-stub', `${path.relative(ROOT, file)} links to the moved page ${stubPath} — rewrite the link to its target`);
      }
    }
  }

  // The home finder's inline payload must not quietly bloat the one page that
  // has to stay light.
  const homeFile = path.join(ROOT, 'dist/index.html');
  if (fs.existsSync(homeFile)) {
    const homeHtml = fs.readFileSync(homeFile, 'utf8');
    const m = /<ul class="register" id="home-list"[\s\S]*?<\/ul>/.exec(homeHtml);
    if (m) {
      const kb = Buffer.byteLength(m[0], 'utf8') / 1024;
      if (kb > 12) fail('finder-payload', `home finder payload is ${kb.toFixed(1)} KB (budget 12)`);
      else if (kb > 10) warn('finder-payload', `home finder payload is ${kb.toFixed(1)} KB (warn at 10, budget 12)`);
    }
  }

  // Unlisted records must be held without a page: no /place/ page, no sitemap
  // entry, no appearance anywhere except the open-questions register.
  const { listings: allRecs } = read('data/listings.json');
  const sitemap = fs.existsSync(path.join(ROOT, 'dist/sitemap.xml'))
    ? fs.readFileSync(path.join(ROOT, 'dist/sitemap.xml'), 'utf8') : '';
  for (const rec of (allRecs || []).filter((r) => r.unlisted)) {
    if (fs.existsSync(path.join(ROOT, 'dist/place', rec.slug, 'index.html'))) {
      fail('unlisted-has-page', `listing:${rec.slug} is unlisted but a page was built for it`);
    }
    if (sitemap.includes(`/place/${rec.slug}/`)) {
      fail('unlisted-in-sitemap', `listing:${rec.slug} is unlisted but appears in the sitemap`);
    }
    const oq = path.join(ROOT, 'dist/about/open-questions/index.html');
    if (fs.existsSync(oq) && !fs.readFileSync(oq, 'utf8').includes(rec.name)) {
      fail('unlisted-invisible', `listing:${rec.slug} is unlisted and absent from open-questions — held records must stay visible there`);
    }
  }

  return files.length;
}

/* -------------------------------------------------------------------------- */

const checkOutput = process.argv.includes('--output');

let count = 0;
try {
  const data = dataGates();
  count = data.listings.length + data.events.length;
  v2DataGates();
} catch (e) {
  fail('data-unreadable', e.message);
}
let pageCount = 0;
if (checkOutput && !failures.length) pageCount = outputGates() || 0;
else if (checkOutput) outputGates();

for (const w of warnings) console.warn(`  warn  [${w.rule}] ${w.detail}`);

if (failures.length) {
  console.error(`\n✗ ${failures.length} build gate failure${failures.length === 1 ? '' : 's'}:\n`);
  for (const f of failures) console.error(`  FAIL  [${f.rule}] ${f.detail}`);
  console.error('\nThese gates encode the content teams\' consensus rules. Fix the data, not the gate.\n');
  process.exit(1);
}

console.log(`✓ all gates passed — ${count} records${checkOutput ? `, ${pageCount} pages` : ''}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
