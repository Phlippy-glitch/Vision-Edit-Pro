/**
 * Technical SEO layer.
 *
 * Everything a crawler reads is assembled here rather than sprinkled through
 * templates, so there is exactly one place to audit: one canonical per page,
 * one title, one description, and structured data that matches what is actually
 * rendered on the page.
 */

import { esc, jsonScript, oneline, truncate } from './html.js';

/** Absolute URL for a site-root-relative path. */
export function absolute(site, path) {
  const base = site.url.replace(/\/+$/, '');
  if (!path || path === '/') return `${base}/`;
  return `${base}/${String(path).replace(/^\/+/, '')}`;
}

/**
 * Title rule: the page's own words first, brand last, and never let the whole
 * thing run past ~60 characters where Google starts rewriting it for us.
 * The home page owns the bare brand title.
 */
export function buildTitle(pageTitle, site, { isHome = false } = {}) {
  if (isHome) return site.titleHome;
  const head = oneline(pageTitle);
  const suffix = ` | ${site.brandShort}`;

  // The brand is the expendable part, not the geography.
  //
  // Budgeting the suffix first and truncating the title to fit was cutting
  // ", Trenton MO" off 46 of 139 titles — removing the single token the whole
  // site competes on, and collapsing two different pages onto identical
  // titles. So: append the brand only when it fits, and when the title does
  // not already carry the town's name. A title that says "Trenton" twice
  // wastes the same budget it was trying to protect.
  const mentionsTown = /trenton/i.test(head);
  if (mentionsTown || head.length + suffix.length > 62) {
    return head.length > 62 ? truncate(head, 62) : head;
  }
  return `${head}${suffix}`;
}

/**
 * Meta descriptions are a click-through lever, not a ranking factor. Keep them
 * inside the ~155 char snippet window and make sure they never come out empty —
 * an empty description is worse than a plain one.
 */
export function buildDescription(text, fallback) {
  const clean = oneline(text) || oneline(fallback);
  return truncate(clean, 155);
}

/**
 * Assemble the full <head>. `jsonld` is an array of objects; they are emitted as
 * separate script blocks so one malformed graph cannot invalidate the others.
 */
export function head({
  site,
  title,
  description,
  path,
  isHome = false,
  robots = null,
  jsonld = [],
  ogType = 'website',
  modified = null,
  published = null,
}) {
  const canonical = absolute(site, path);
  const fullTitle = buildTitle(title, site, { isHome });
  const desc = buildDescription(description, site.descriptionFallback);
  const ogImage = absolute(site, site.ogImage);

  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    robots ? `<meta name="robots" content="${esc(robots)}">` : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">',

    // Open Graph — controls how the URL renders when someone shares it, which
    // in a town this size is how a real share of the traffic will arrive.
    `<meta property="og:site_name" content="${esc(site.brand)}">`,
    `<meta property="og:type" content="${esc(ogType)}">`,
    `<meta property="og:title" content="${esc(fullTitle)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(ogImage)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:type" content="image/png">',
    `<meta property="og:image:alt" content="${esc(site.ogImageAlt)}">`,
    '<meta property="og:locale" content="en_US">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(fullTitle)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(ogImage)}">`,

    published ? `<meta property="article:published_time" content="${esc(published)}">` : null,
    modified ? `<meta property="article:modified_time" content="${esc(modified)}">` : null,

    // Geo meta is legacy, but local aggregators and some regional search tools
    // still read it and it costs three lines.
    `<meta name="geo.region" content="US-MO">`,
    `<meta name="geo.placename" content="${esc(site.place.name)}">`,
    `<meta name="geo.position" content="${site.place.lat};${site.place.lon}">`,
    `<meta name="ICBM" content="${site.place.lat}, ${site.place.lon}">`,

    '<meta name="theme-color" content="#1c5a7a" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#14161a" media="(prefers-color-scheme: dark)">',
    '<meta name="format-detection" content="telephone=no">',

    `<link rel="stylesheet" href="${esc(site.base)}assets/styles.css">`,
    `<link rel="icon" href="${esc(site.base)}assets/favicon.svg" type="image/svg+xml">`,
    `<link rel="sitemap" type="application/xml" href="${esc(site.base)}sitemap.xml">`,
  ];

  for (const block of jsonld.filter(Boolean)) {
    lines.push(`<script type="application/ld+json">${jsonScript(block)}</script>`);
  }

  return lines.filter(Boolean).join('\n    ');
}

/* --- Structured data ------------------------------------------------------ */

/**
 * The site-level graph, emitted once on the home page. WebSite + the publishing
 * Organization, wired together by @id so search engines read them as one entity
 * rather than three unrelated blobs.
 */
export function siteGraph(site) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${site.url}/#website`,
        url: `${site.url}/`,
        name: site.brand,
        description: site.descriptionFallback,
        inLanguage: 'en-US',
        publisher: { '@id': `${site.url}/#publisher` },
      },
      {
        '@type': 'Organization',
        '@id': `${site.url}/#publisher`,
        name: site.brand,
        url: `${site.url}/`,
        areaServed: {
          '@type': 'City',
          name: site.place.name,
          address: {
            '@type': 'PostalAddress',
            addressLocality: site.place.name,
            addressRegion: 'MO',
            postalCode: site.place.zip,
            addressCountry: 'US',
          },
        },
      },
      {
        '@type': 'Place',
        '@id': `${site.url}/#place`,
        name: `${site.place.name}, Missouri`,
        geo: {
          '@type': 'GeoCoordinates',
          latitude: site.place.lat,
          longitude: site.place.lon,
        },
        address: {
          '@type': 'PostalAddress',
          addressLocality: site.place.name,
          addressRegion: 'MO',
          postalCode: site.place.zip,
          addressCountry: 'US',
        },
      },
    ],
  };
}

/** BreadcrumbList matching the visible breadcrumb trail, one for one. */
export function breadcrumbGraph(site, crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: absolute(site, c.path),
    })),
  };
}

/**
 * ItemList for category indexes. Tells search engines the page is a curated set
 * and gives it a shot at a list-style result rather than a bare blue link.
 */
export function itemListGraph(site, name, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: absolute(site, it.path),
    })),
  };
}

/**
 * A listing's own entity graph.
 *
 * The provenance rules from the content brief are enforced here: a property is
 * only ever emitted when we actually hold the data. Structured data that
 * asserts a phone number or an address we never verified is exactly the kind of
 * fabrication this project refuses to ship, and it is also what gets a site
 * hit with a structured-data manual action.
 */
export function listingGraph(site, listing, category) {
  const node = {
    '@context': 'https://schema.org',
    '@type': listing.schemaType || 'LocalBusiness',
    '@id': `${absolute(site, listing.path)}#entity`,
    name: listing.name,
    url: absolute(site, listing.path),
    description: oneline(listing.summary),
  };

  // Locality only — deliberately, and this is the narrowest part of the build.
  //
  // Structured data is a machine-readable assertion of fact, and it travels
  // without the "nothing here is confirmed" notice that every rendered page
  // carries. Whatever we put here can be lifted into a knowledge panel and
  // becomes very hard to correct afterwards. So we emit only what cannot be
  // wrong given the record exists at all: that it is in Trenton, Missouri.
  //
  // streetAddress, telephone, openingHours and geo are all omitted on purpose.
  // Those are exactly the properties that propagate, and exactly the ones our
  // sources are least reliable about. Locality also does the one job we most
  // need from structured data here: distinguishing this town from the Trentons
  // in New Jersey, Michigan and Georgia.
  node.address = {
    '@type': 'PostalAddress',
    addressRegion: 'MO',
    addressCountry: 'US',
  };
  // Only claim a locality we can stand behind. A record flagged as sitting in
  // the wider county — Crowder State Park, the Barton Farm campus — is not in
  // Trenton, and defaulting it to the site's own town would assert exactly the
  // error the data went out of its way to record.
  if (listing.proximity === 'grundy_county') {
    node.address.addressRegion = 'MO';
    node.containedInPlace = { '@type': 'AdministrativeArea', name: 'Grundy County, Missouri' };
  } else if (listing.city) {
    node.address.addressLocality = listing.city;
    if (listing.city === site.place.name && listing.zip) node.address.postalCode = listing.zip;
  }

  if (category) {
    // Categories are addressed by slug; `path` is only set on page records.
    // Falling through to absolute(site, undefined) silently pointed every
    // listing's isPartOf at the home page.
    const categoryPath = category.path || `/${category.slug}/`;
    node.isPartOf = { '@type': 'CollectionPage', name: category.name, url: absolute(site, categoryPath) };
  }

  // The operator's own site. This asserts identity, not facts — the objection
  // that sinks telephone and streetAddress does not apply, and it is the
  // strongest signal available that this page describes the same entity as
  // that domain rather than competing with it.
  if (listing.website && !(listing.disputed || []).includes('website')) node.sameAs = [listing.website];
  node.containedInPlace = { '@id': `${site.url}/#place` };

  return node;
}

/** FAQPage graph. Only ever emitted when the Q&A is also visible on the page. */
export function faqGraph(faqs) {
  if (!faqs || !faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: oneline(f.a) },
    })),
  };
}

/** Article graph for guides. */
export function articleGraph(site, article) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: oneline(article.summary),
    url: absolute(site, article.path),
    datePublished: article.published,
    dateModified: article.updated || article.published,
    inLanguage: 'en-US',
    isAccessibleForFree: true,
    // Named inline rather than by @id: the publisher node only exists in the
    // home page's graph, so a bare reference from an article page dangles.
    publisher: { '@type': 'Organization', '@id': `${site.url}/#publisher`, name: site.brand, url: `${site.url}/` },
    author: { '@type': 'Organization', '@id': `${site.url}/#publisher`, name: site.brand, url: `${site.url}/` },
    about: { '@type': 'Place', name: `${site.place.name}, Missouri` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(site, article.path) },
  };
}

/** Event graph — dates only when we hold a verified date. */
export function eventGraph(site, event) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    description: oneline(event.summary),
    url: absolute(site, event.path),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.venue || `${site.place.name}, Missouri`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: site.place.name,
        addressRegion: 'MO',
        addressCountry: 'US',
      },
    },
  };
  if (event.startDate) node.startDate = event.startDate;
  if (event.endDate) node.endDate = event.endDate;
  return node;
}

/* --- Crawl files ---------------------------------------------------------- */

export function sitemapXml(site, pages) {
  const entries = pages
    .filter((p) => !p.noindex)
    .map((p) => [
      '  <url>',
      `    <loc>${esc(absolute(site, p.path))}</loc>`,
      p.lastmod ? `    <lastmod>${esc(p.lastmod)}</lastmod>` : null,
      `    <changefreq>${esc(p.changefreq || 'monthly')}</changefreq>`,
      `    <priority>${(p.priority ?? 0.5).toFixed(1)}</priority>`,
      '  </url>',
    ].filter(Boolean).join('\n'))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

export function robotsTxt(site) {
  return `# ${site.brand}
User-agent: *
Allow: /

# Nothing here is behind a login and nothing is paginated into infinity —
# the whole site is meant to be crawled.

Sitemap: ${site.url}/sitemap.xml
`;
}
