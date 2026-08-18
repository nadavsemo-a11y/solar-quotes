/**
 * shared/client-location.js — the ONE rule for turning a customer's atomic `city` + `address`
 * into the single line a human reads on the quote.
 *
 *   formatClientLocation({ city, address })     → "City, Street" | "City" | "Street" | ""
 *   formatLegacyPdfLocation({ city, address })  → "Street · City"  (frozen pre-2026-08 PDF layout)
 *
 * WHY THIS MODULE EXISTS
 *   `city` and `address` are two separate FACTS. They are stored separately (portal state, HubSpot,
 *   the public snapshot, the document contract) and they stay separate — a combined string is never
 *   a stored value. But every medium that shows them to a customer has to pick one order and one
 *   separator, and until this module existed each medium picked its own: the web page composed
 *   "City, Street" in two hand-written places while the PDF cover composed "Street · City". Two
 *   renderings of one signed document disagreed, and nothing detected it.
 *
 *   So: composition is a PRESENTATION concern with exactly one implementation, and the document
 *   contract keeps only the atomic fields.
 *
 * EMPTY / PLACEHOLDER HANDLING
 *   The contract substitutes a dash for a field it has no value for. A dash is a table-cell
 *   placeholder, never a piece of an address, so `formatClientLocation` drops it — you get "נהריה",
 *   not "נהריה, —". With neither field you get "" and the caller omits the node entirely.
 *
 * `formatLegacyPdfLocation` is NOT the rule for anything new. It reproduces, byte for byte, the
 * cover line that documents signed before the ordering fix were issued with, so re-rendering one of
 * them cannot silently restyle a legal record. See solar-quote/solar-pdf-map.js.
 *
 * PURITY: no DOM, no I/O, no time/rand. Does not mutate its input.
 *
 * IIFE-wrapped so its top-level names don't collide with sibling modules loaded as plain
 * <script>s in one global scope (the portals load several shared modules together). Without it,
 * `const api` here and `const api` in solar-quote/solar-content-blocks.js are a duplicate lexical
 * declaration: the browser discards THIS ENTIRE SCRIPT before a line of it runs, so
 * globalThis.ClientLocation is never assigned and the quote page throws on render.
 */
(function () {
'use strict';

// Values a field carries when it means "nothing here": the contract's em-dash placeholder and the
// hand-typed variants of it. A dash INSIDE a real address ("הברזל 30-32") is untouched — only a
// field that is nothing but a dash counts as empty.
const PLACEHOLDERS = new Set(['—', '–', '-']);

const SEPARATOR = ', ';
const LEGACY_SEPARATOR = ' · ';

/** One field → its display form, or '' when it holds nothing a customer should read. */
function normalizePart(value) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return PLACEHOLDERS.has(s) ? '' : s;
}

/**
 * The customer-facing location line: city first, then street. Whichever part is missing is simply
 * absent — there is never a leading, trailing or doubled separator.
 */
function formatClientLocation(customer) {
  const c = customer || {};
  return [normalizePart(c.city), normalizePart(c.address)].filter(Boolean).join(SEPARATOR);
}

/**
 * The pre-fix PDF cover line ("Street · City"). Takes the values EXACTLY as the PDF projection
 * produced them — dashes included — because the point is to reproduce a historical render, not to
 * improve it.
 */
function formatLegacyPdfLocation(customer) {
  const c = customer || {};
  return `${c.address == null ? '' : c.address}${LEGACY_SEPARATOR}${c.city == null ? '' : c.city}`;
}

const api = { formatClientLocation, formatLegacyPdfLocation, normalizePart, SEPARATOR, LEGACY_SEPARATOR };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.ClientLocation = api;
})();
