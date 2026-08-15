# Deployment

## Step one: get a domain. This is not optional.

The site currently builds for `https://phlippy-glitch.github.io/Vision-Edit-Pro`.
That address is the single largest limit on everything this project is trying to
do, for reasons that are worth stating plainly:

- **Nobody local will link to it.** A directory of Trenton, Missouri served from
  a path named after a photo-editing application, on a stranger's `github.io`
  account, does not read as a civic resource. The library, the county, the
  Chamber and the school district are exactly the links this site needs, and
  none of them will point at that URL.
- **`robots.txt` is inert.** Crawlers only ever read `robots.txt` at the host
  root. Ours deploys to `/Vision-Edit-Pro/robots.txt`, which nothing fetches, so
  the `Sitemap:` directive in it reaches no one. Submit the sitemap manually in
  Search Console until this is fixed.
- **No authority accrues to you.** `github.io` is on the Public Suffix List.
  Whatever the site earns is not portable and not yours.
- **It cannot be said out loud.** Nobody types it from memory, so branded search
  — the cheapest traffic a local site gets — stays at zero permanently.

Everything else in this document assumes you have fixed this.

### Fixing it

Two settings in `data/site.json`:

```json
{
  "url": "https://example.com",
  "base": "/"
}
```

Or, without editing tracked data, at build time:

```bash
SITE_URL="https://example.com" SITE_BASE="/" npm run build
```

The build is host-agnostic — every internal link, canonical, `@id` and sitemap
entry is derived from those two values, and `npm run verify -- --output` fails
if any link drops the base path. Nothing else needs to change.

## Building

```bash
npm run build     # writes dist/
npm run verify    # data gates only
npm run serve     # preview dist/ at http://localhost:4173
```

Before publishing anything:

```bash
npm run build && node src/verify.js --output
```

That runs every gate, including the ones against rendered HTML. It exits
non-zero on failure and is the only sign-off that matters.

## Hosting

`dist/` is plain static files. Any host works. There are no redirects, no server
config and no build step beyond Node.

- **GitHub Pages** — publish `dist/`. `.nojekyll` is written automatically so
  Pages does not run Jekyll over the output or strip underscore directories.
- **Netlify / Cloudflare Pages / S3** — build command `npm run build`, publish
  directory `dist`.

Point the custom domain at the host and set `url`/`base` to match. If you serve
from the host root, `base` is `/` and `robots.txt` starts working.

## After the first deploy

In rough order of value:

1. **Verify the domain in Google Search Console and Bing Webmaster Tools**, and
   submit `sitemap.xml` directly. Do this even after `robots.txt` works.
2. **Set a contact route.** `contactEmail` or `submitFormUrl` in
   `data/site.json`. Until one is set, `/submit/` honestly tells readers there
   is no form and that filing a GitHub issue is an unreasonable thing to ask of
   a business owner. That page is the project's actual verification strategy —
   an owner correcting their own listing beats any research pass — so this is
   the highest-value setting in the file.
3. **Re-run the research with the egress restriction lifted.** Every record on
   this site is `confirmation: "unconfirmed"` because no first-party page could
   be opened from the build environment. On a network that can reach
   `trentonmo.com`, `grundycountymo.com`, `trentonmochamber.com`,
   `visittrentonmo.com`, `ncmissouri.edu`, `trentonr9.k12.mo.us` and
   `mostateparks.com`, most of the dataset upgrades in a single pass. The
   sitewide disclosure is designed to lift record by record as that happens —
   see `docs/DECISIONS.md`.

## What the gates will stop you doing

`src/verify.js` fails the build on, among others: publishing a contact field no
source covers, publishing a value sources conflict on, any rating or review
count, a phone number on an emergency service, an internal link that resolves to
nothing, two pages sharing a title, structured data that contradicts the page it
sits on, and any page missing the sourcing disclosure.

These encode decisions made by the content teams and the review board. If one
blocks you, the intended fix is the data, not the gate.
