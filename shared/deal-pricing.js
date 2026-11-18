/**
 * shared/deal-pricing.js
 * SEMO AGS — THE single definition of a negotiated ("closed") deal on a solar quote.
 *
 * NO DOM, NO window, NO fetch. Pure data in → data out. Loaded by the Worker, the portal and Node.
 *
 * WHAT A DEAL IS
 *   The seller closes a price with the customer for the system as quoted ("50,000 ₪ + VAT for these
 *   20 kWp"), and possibly gives some upgrades for free. Everything else keeps the normal rules:
 *   every kWp added or removed in the final design is priced at the quote's own price per kWp
 *   (`ppkw`), and the other upgrades keep their own prices.
 *
 *   That is expressed as ONE fixed number, the DEAL DISCOUNT:
 *       discount   = listBase(at the quoted kWp) − agreedBase
 *       base price = listBase(at ANY kWp)        − discount
 *   so 20 kWp → 54,000 − 4,000 = 50,000, and 22 kWp → 59,400 − 4,000 = 55,400 (= 50,000 + 2 × 2,700).
 *   The discount is fixed in shekels, so the marginal price of a kWp stays `ppkw` in every direction.
 *
 *   A free ("gift") upgrade is an ordinary line sold at ₪0 — the zero-price path that already exists
 *   end to end — plus its list value, kept here only so the customer can SEE what it is worth.
 *   Gifts never enter any total.
 *
 * STORED SHAPE (quote state `deal`, canonicalized by the Worker on save):
 *   { version: 'deal/v1', agreedBase, refKW, listBase, discount, gifts: { [upgradeId]: listValue } }
 *   A quote without `deal` (every quote saved before this module) behaves exactly as before, and
 *   every consumer adds deal fields to its output ONLY when a discount or a gift exists, so the
 *   documents and hashes of all existing quotes stay byte-identical.
 */
// Wrapped in a function scope: the portal loads this as a classic <script>, where a top-level
// `const api` collides with other shared scripts ("Identifier 'api' has already been declared").
(function () {
'use strict';

const DEAL_VERSION = 'deal/v1';
const MAX_GIFT_VALUE = 1000000;

class DealError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, msg) => { throw new DealError(code, msg); };

const finite = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The list price of the base system, exactly as QuoteEngine.calcPrice computes it. */
function listBaseFor({ dcKW, ppkw, acKW, meterPanelPrice }) {
  const kw = finite(dcKW) || 0;
  const unit = finite(ppkw) || 0;
  const meter = (finite(acKW) || 0) > 15 ? (finite(meterPanelPrice) || 0) : 0;
  return Math.round(kw * unit + meter);
}

/**
 * normalizeDeal(raw, ctx) → canonical deal object, or null when there is no deal.
 *   raw: { agreedBase?, gifts? } as proposed by the portal (any other field is ignored and recomputed)
 *   ctx: { dcKW, ppkw, acKW, meterPanelPrice, fixedUpgradeAmounts: { [id]: amount } }
 *        fixedUpgradeAmounts — the SAVED amounts of the quote's fixed-price upgrade lines. A gift is
 *        accepted only for a line that exists there with amount 0.
 * Throws DealError (code) for a deal that cannot be honoured; never silently drops a price.
 */
function normalizeDeal(raw, ctx = {}) {
  if (raw == null || typeof raw !== 'object') return null;
  const listBase = listBaseFor(ctx);

  let agreedBase = finite(raw.agreedBase);
  let discount = 0;
  if (agreedBase != null) {
    agreedBase = Math.round(agreedBase);
    if (agreedBase <= 0) fail('deal_agreed_base_invalid', 'agreed base price must be positive');
    if (listBase <= 0) fail('deal_list_base_missing', 'the quote has no list base price to discount');
    if (agreedBase > listBase) fail('deal_agreed_above_list', `agreed base ${agreedBase} is above the list base ${listBase}`);
    discount = listBase - agreedBase;
  }

  const gifts = {};
  const amounts = ctx.fixedUpgradeAmounts || {};
  if (raw.gifts && typeof raw.gifts === 'object') {
    for (const [id, v] of Object.entries(raw.gifts)) {
      const value = finite(v);
      if (value == null || value <= 0) continue;          // an unticked or empty gift is no gift
      if (value > MAX_GIFT_VALUE) fail('deal_gift_value_invalid', `gift ${id}: value out of range`);
      if (!Object.prototype.hasOwnProperty.call(amounts, id)) fail('deal_gift_unknown', `gift ${id}: not a fixed-price upgrade of this quote`);
      if (amounts[id] !== 0) fail('deal_gift_not_free', `gift ${id}: the line must be sold at ₪0`);
      gifts[id] = Math.round(value);
    }
  }

  if (discount === 0 && Object.keys(gifts).length === 0) return null;
  return {
    version: DEAL_VERSION,
    agreedBase: agreedBase != null ? agreedBase : listBase,
    refKW: finite(ctx.dcKW) || 0,
    listBase,
    discount,
    gifts,
  };
}

/** The fixed deal discount (₪, before VAT) a saved state carries. 0 when there is none. */
function discountOf(state) {
  const d = state && state.deal;
  const n = d && finite(d.discount);
  return n != null && n > 0 ? Math.round(n) : 0;
}

/** The list value of a gift line, or 0. */
function giftValueOf(state, upgradeId) {
  const g = state && state.deal && state.deal.gifts;
  const n = g && finite(g[upgradeId]);
  return n != null && n > 0 ? Math.round(n) : 0;
}

/** Customer-facing note for a gift line. */
function giftNote(value) {
  return `שווי ₪${Math.round(value).toLocaleString('he-IL')} — ללא תשלום במסגרת העסקה`;
}

/** The base price at another capacity (final design): list at that kWp minus the fixed discount. */
function basePriceAt({ dcKW, ppkw, discount }) {
  const list = Math.round((finite(dcKW) || 0) * (finite(ppkw) || 0));
  return Math.max(0, list - (finite(discount) || 0));
}

const DEAL_DISCOUNT_LABEL = 'הנחת עסקה';
/** The content id of the discount row in the document manifest, the web page and the PDF. */
const DEAL_DISCOUNT_ID = 'cost.deal-discount';
/** The discount as printed: a true minus sign, with the shekel sign on the web and without it in the
 *  PDF's price table (whose column header carries it). */
function discountText(n, { currency = true } = {}) {
  return '−' + (currency ? '₪' : '') + Math.round(Number(n) || 0).toLocaleString('he-IL');
}

const api = {
  DEAL_VERSION, DEAL_DISCOUNT_LABEL, DEAL_DISCOUNT_ID, DealError, discountText,
  listBaseFor, normalizeDeal, discountOf, giftValueOf, giftNote, basePriceAt,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.DealPricing = api;
})();
