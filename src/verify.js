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

  // --- forbidden keys -----------------------------------------------------
  const bad = deepFindKey(rec, FORBIDDEN_KEYS, id);
  for (const hit of bad) fail('forbidden-key', `${hit} — ratings and review counts are never published`);
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

    // Structured data must parse. A malformed graph is worse than none.
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        JSON.parse(m[1]);
      } catch (e) {
        fail('jsonld-invalid', `${rel}: ${e.message}`);
      }
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
