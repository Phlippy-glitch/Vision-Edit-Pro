/**
 * A deliberately small Markdown subset renderer, plus YAML front-matter.
 *
 * The guides use headings, paragraphs, lists, links, bold, and blockquotes and
 * nothing else, so a dependency would buy us a parser for syntax we never
 * write. Anything unrecognised is emitted as escaped text rather than guessed
 * at — the failure mode is a visible literal, never mangled output.
 */

import { esc } from './html.js';

/* --- Front matter --------------------------------------------------------- */

/**
 * Parse the leading `---` block. Supports the shapes the guides actually use:
 * scalars, `["a", "b"]` inline arrays, `- item` lists, and lists of objects
 * with `key: value` pairs (used by `sources` and `faq`).
 */
export function frontMatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data = {};
  const lines = match[1].split(/\r?\n/);
  let key = null;
  let list = null;

  const scalar = (v) => {
    const t = v.trim();
    if (!t) return '';
    if (/^".*"$/.test(t) || /^'.*'$/.test(t)) return t.slice(1, -1);
    if (/^\[.*\]$/.test(t)) {
      const inner = t.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((s) => scalar(s));
    }
    if (t === 'true') return true;
    if (t === 'false') return false;
    return t;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;

    const top = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (top && !/^\s/.test(line)) {
      key = top[1];
      const value = top[2];
      if (value.trim() === '') {
        list = [];
        data[key] = list;
      } else {
        data[key] = scalar(value);
        list = null;
      }
      continue;
    }

    // `  - item` or `  - key: value` (start of an object in a list)
    const item = /^\s*-\s*(.*)$/.exec(line);
    if (item && list) {
      const rest = item[1];
      const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(rest);
      if (pair) list.push({ [pair[1]]: scalar(pair[2]) });
      else list.push(scalar(rest));
      continue;
    }

    // `    key: value` continuing the last object in a list
    const nested = /^\s+([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (nested && list && list.length && typeof list[list.length - 1] === 'object') {
      list[list.length - 1][nested[1]] = scalar(nested[2]);
    }
  }

  return { data, body: match[2] };
}

/* --- Inline ---------------------------------------------------------------- */

/**
 * Site base path for root-relative links written in Markdown.
 *
 * Guides write `/place/x/` because that is the site-absolute URL. When the site
 * is served from a subpath the href has to carry it, or every editorial link
 * lands off the deployment root. Held in module state so guide authors never
 * have to think about the deployment shape.
 */
let linkBase = '/';
export function setLinkBase(base) {
  linkBase = base || '/';
}

function withBase(href) {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  if (linkBase === '/' || href.startsWith(linkBase)) return href;
  return `${linkBase.replace(/\/$/, '')}${href}`;
}

function inline(text) {
  let out = esc(text);

  // Inline code first, so its contents are not treated as markup. The escaped
  // backtick pairs are matched on already-escaped text, which is safe because
  // esc() never introduces a backtick.
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

  // [label](href) — only http(s), mailto, tel, and site-relative targets. An
  // unrecognised scheme renders as plain text rather than becoming a link.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    const safe = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href);
    if (!safe) return whole;
    // Outbound links here are editorial citations, not user-submitted content.
    // `nofollow ugc` would misdescribe them, and these publishers — the county,
    // the college, the state parks agency — are precisely the sites this
    // directory wants to be seen citing rather than competing with.
    const external = /^https?:\/\//i.test(href);
    const attrs = external ? ' rel="noopener" target="_blank"' : '';
    return `<a href="${external ? href : withBase(href)}"${attrs}>${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  return out;
}

/* --- Block ---------------------------------------------------------------- */

export function markdown(src) {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(' ').trim())}</p>`);
    buf.length = 0;
  };
  const para = [];

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      flushParagraph(para);
      i++;
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(para);
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(---|\*\*\*)\s*$/.test(line)) {
      flushParagraph(para);
      out.push('<hr>');
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph(para);
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${markdown(quote.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph(para);
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push(`<ul>\n${items.map((t) => `  <li>${inline(t)}</li>`).join('\n')}\n</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph(para);
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      out.push(`<ol>\n${items.map((t) => `  <li>${inline(t)}</li>`).join('\n')}\n</ol>`);
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushParagraph(para);

  return out.join('\n');
}

/** Plain text of a markdown string — used for descriptions and word counts. */
export function markdownToText(src) {
  return String(src)
    .replace(/^---[\s\S]*?---/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
