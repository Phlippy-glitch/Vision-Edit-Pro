# Trenton, Missouri Directory

A local directory for Trenton, Missouri — the county seat of Grundy County.
Businesses, public offices, parks and events, with the source shown next to the
facts it supports.

**139 static pages. No dependencies. No runtime JavaScript for content.**

```bash
npm run build     # generate dist/
npm run serve     # preview at http://localhost:4173
npm run verify    # data gates
node src/verify.js --output   # data gates + gates against rendered HTML
```

## The thing to understand first

**Nothing on this site has been confirmed.** It was built in an environment
whose network could not reach `trentonmo.com`, `grundycountymo.com` or any other
first-party source, so all 97 records come from search-result snippets — real
publishers and real URLs, but a summary of a page rather than the page.

The site does not hide this. Every page carries the same line above its heading:

> **Everything on this site names the source it came from, and nothing on it has
> been confirmed by us — so call ahead before you drive.**

Publishing unverified data is not a lie. Publishing it *as* verified is. The
whole design follows from that distinction, and it is why blank fields stay
blank, why conflicting addresses are suppressed rather than resolved, and why
`/about/open-questions/` is generated from the same data as the listings.

Read [`docs/DECISIONS.md`](docs/DECISIONS.md) before changing anything.

## Before you deploy

1. **Get a domain.** `docs/DEPLOYMENT.md` explains why this is not optional and
   why `robots.txt` does not work until you do. It is two settings.
2. **Set a contact route.** `contactEmail` or `submitFormUrl` in
   `data/site.json`. Owner corrections are the site's actual verification
   strategy, so this is the highest-value line in the file.

## Layout

```
data/              listings, events, categories, lint rules, site config
content/
  guides/          12 editorial guides
  how-to/          10 civic how-tos
  pages/           how-we-source-this, submit
src/
  build.js         the generator
  verify.js        build gates — the consensus rules, made mechanical
  lib/             html, seo, markdown, components, png
assets/            one stylesheet, one progressive-enhancement script
docs/              DECISIONS.md, DEPLOYMENT.md
```

## The gates

`src/verify.js` fails the build rather than trusting anyone to remember. Among
others: no contact field without a source that covers it; no value sources
conflict on where being wrong costs a trip; no ratings anywhere; **no phone
number on an emergency service**; no internal link that resolves to nothing; no
two pages sharing a title; no structured data contradicting the page it sits on;
no page missing the sourcing disclosure.

Each of those exists because the problem was found in real data. If a gate
blocks you, the intended fix is the data, not the gate.

## Adding a listing

Add to `data/listings.json` with at least one source, and a `covers` array
naming exactly which fields that source supports:

```json
{
  "slug": "example-hardware",
  "name": "Example Hardware",
  "categories": ["shopping"],
  "summary": "One or two sentences you can defend from the source.",
  "address": null,
  "phone": null,
  "status": "unknown",
  "evidence": "first_party_snippet",
  "confirmation": "unconfirmed",
  "corroborated": 1,
  "disputed": [],
  "sources": [
    { "url": "https://…", "publisher": "…", "covers": ["name", "summary"], "retrieved_at": "2026-08-15" }
  ],
  "last_verified_at": "2026-08-15"
}
```

A field not listed in some source's `covers` must be `null`. The build will stop
you otherwise — which is the point.
