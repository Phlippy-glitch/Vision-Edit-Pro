/**
 * Tiny HTML helpers. No template engine — the whole point of this build is that
 * the output is plain, inspectable HTML with nothing between us and the markup.
 */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for interpolation into HTML text or a quoted attribute. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Escape for embedding inside a <script> block. Beyond normal JSON encoding we
 * have to neutralise `</script`, `<!--`, and U+2028/9, any of which can break
 * out of or corrupt the script element.
 */
export function jsonScript(data) {
  return JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Join template fragments, dropping null/undefined/false so conditionals read cleanly. */
export function join(...parts) {
  return parts.flat(Infinity).filter((p) => p !== null && p !== undefined && p !== false && p !== '').join('\n');
}

/** URL-safe slug from a display name. */
export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Format a US phone number for display, but only if it is a clean 10-digit
 * number. Anything unexpected is returned untouched rather than mangled — we
 * never reshape data we do not fully understand.
 */
export function formatPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(phone);
}

/** `tel:` href — digits only, keeps the link reliable on mobile. */
export function telHref(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `tel:+${digits}`;
  return null;
}

/** Hostname only, for showing an external link without a wall of URL. */
export function displayHost(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** ISO date (YYYY-MM-DD) → "March 4, 2026" */
export function displayDate(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** Collapse whitespace — used to keep meta descriptions on one line. */
export function oneline(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Trim to a length without cutting a word in half. Used for meta descriptions,
 * where an abrupt truncation looks broken in the SERP.
 */
export function truncate(text, max) {
  const clean = oneline(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`;
}
