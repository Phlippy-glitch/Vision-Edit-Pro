# Decisions

Why this site is built the way it is. Most of these were argued over and several
were reversed, so the reasoning is recorded rather than the conclusion alone —
if you are about to "fix" something here, read the entry first.

---

## 1. Nothing on this site has been confirmed, and it says so

No first-party page could be opened while this was built. The build environment's
egress proxy returned `403` for `trentonmo.com`, `grundycountymo.com` and every
other town domain. Every one of the 97 records came from search-result snippets:
real URLs, real publishers, but a summary of a page rather than the page.

Every record therefore carries `confirmation: "unconfirmed"`, and a
non-dismissible disclosure appears above the `<h1>` on all 139 pages.

The decision to publish anyway rests on a distinction that took a while to
reach: **publishing unverified data is not a lie; publishing it *as* verified
is.** Only the second is forbidden. The corollary is the whole growth strategy —
a business owner correcting their own listing beats any research pass we could
run, so publishing is itself the verification mechanism.

The disclosure is designed to lift **record by record** as facts get confirmed,
never as a launch formality quietly deleted later.

## 2. The evidence model

Two orthogonal axes, and no third:

- `evidence`: `first_party_page` | `first_party_snippet` | `reputable_third_party` | `aggregator`
- `confirmation`: `unconfirmed` | `confirmed_remote` | `confirmed_human`

A `verified` boolean and a `confidence` score were both proposed and both
deleted. `verified` could not express "a first-party page said it, but nobody
opened it", which is the actual state of every record here. `confidence` was cut
because three overlapping trust scales is how a downgrade quietly gets
re-smuggled in.

`status` is separate from both, because **operating state and evidence state are
orthogonal** — and it defaults to `unknown`, never `open`. Defaulting to open
asserts trading nobody checked, and 7+ records are known closed or doubtful.

## 3. What the build refuses to publish

Enforced in `src/verify.js`, not in a style guide. A rule that lives only in
prose ships broken eventually.

- A contact field no `sources[].covers` entry supports.
- A value sources conflict on, **where being wrong costs a trip**. Conflicts on
  `address`, `phone` and `hours` are suppressed outright; conflicts on `name`
  and `website` publish with the disagreement disclosed, because a wrong link
  costs one click and self-corrects on arrival.
- Any rating, review count or star.
- **Any phone number on an emergency service.** A wrong number there is not a
  defect, it is a harm. Those pages say "call 911" instead, and a gate fails the
  build if one does not.
- Wright Memorial Hospital's address — two conflicting candidates exist, so we
  publish neither.
- Anything traceable to Trenton NJ, MI or GA. Wrong-town contamination was the
  single most common research failure.
- Names of people holding public office. Offices age well; named individuals do
  not.

### `notes` is never rendered

Research `notes` carry working, build directives, and the conflicting values the
disputed-field gate exists to withhold. An early version rendered them as a
reader callout and immediately republished both of the hospital's suppressed
addresses — undoing the best judgment call in the dataset.

Reader-facing warnings must be written as `caution`, which is gated against
containing an address, a phone number, or a directive aimed at the build team.

## 4. Structured data is deliberately narrow

`listingGraph()` emits `name`, `url`, `@id`, `description`, `sameAs`, and a
locality. It omits `streetAddress`, `telephone`, `openingHours` and `geo`.

Structured data travels **without** the "nothing here is confirmed" notice every
rendered page carries, and what lands in a knowledge panel is very hard to
correct afterwards. So the graph carries only what cannot be wrong given the
record exists at all. Locality also does the job the site most needs from
structured data: separating this Trenton from the other three.

`sameAs` was cut and then restored. It asserts *identity*, not a fact — the
objection that sinks `telephone` does not apply to it, and it is the strongest
available signal that this page describes the same entity as that domain rather
than competing with it. Gated on `disputed`.

No entity graph at all is emitted for records that are closed, possibly closed,
disputed, emergency services, or `noindex`.

A one-line bug here survived two reviews: an unconditional trailing
`containedInPlace` overwrote the Grundy County node, so Crowder State Park's
graph still claimed containment in Trenton while its page said "outside Trenton
city limits". Structured data contradicting the rendered page is the textbook
manual-action condition, and a gate now checks for exactly that.

## 5. Indexation

- **Listings** are held back from the index only when a record has no contact
  detail **and** no corroboration **and** a summary under 120 characters —
  a page that cannot answer any query. 16 of 92. They stay fully linked so they
  accumulate signal and flip to indexed as soon as any of the three changes.
- The earlier rule keyed on contact fields alone, which suppressed pages that
  said something useful. The test is whether the page **answers something**, not
  whether it has a phone number.
- **Thin hubs** auto-demote to `noindex` rather than failing the build. Erroring
  on thin categories creates pressure to pad them, which is the opposite of the
  point.

## 6. Taxonomy

- Listings live at a flat `/place/{slug}/`, independent of category. Entities
  belong to several categories, and nesting forces either duplicate URLs or lost
  membership — with no clean redirects available on static hosting. Two
  architects reached this independently.
- **A category is justified by verified members, not by what a town "should"
  have.** Home & trades, farm & ag and personal care produced zero sourced
  businesses and ship as nothing rather than as empty headings.
- A guide earns its own URL only if its entity set is not already a hub's or a
  listing's. That test killed three proposed guides.

## 7. Things deliberately not built

- **`/map/`** — 49 of 92 records have no sourced address.
- **Inter-town "nearby" pages** — no distance could be sourced.
- **Six restaurants and two funeral homes.** This is the site's biggest coverage
  gap and it is left open on purpose. One had been *invented* by an agent with
  no source; others came only from a scraped name-list, which supports a name
  and not a page. The review board voted to ship the gap rather than bend the
  no-new-entities rule. The correct fix is a second research pass through the
  normal path, seeded with the first-party operator domains that were found.
- **A submission form.** There is no backend. `/submit/` says so and concedes
  that asking a business owner to file a GitHub issue is unreasonable. Setting
  `contactEmail` or `submitFormUrl` in `data/site.json` switches the page.

## 8. Known limits, honestly

- **The domain.** See `docs/DEPLOYMENT.md`. On a `github.io` subpath,
  `robots.txt` is never fetched by crawlers — submit the sitemap manually until
  a real domain exists. This is the largest single constraint on the project.
- **No named author or organisation.** E-E-A-T wants one and we will not invent
  a person. Whoever deploys this should put their name to it.
- **Hours are present on roughly 12% of records.** That is the weakest part of
  the dataset.
- Everything on `/about/open-questions/` — generated from the same data as the
  listings, so the published list of what we do not know cannot drift from what
  we published.
