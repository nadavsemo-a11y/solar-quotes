/**
 * storage-quote/storage-bop-breakdown.js
 * SEMO AGS — Commercial Storage (BESS) quote: ADDITIONAL-COST BREAKDOWN domain layer.
 *
 * THE single authority for the optional itemisation of `capex.balanceOfPlantCost` — the one
 * additional-cost line the customer sees today as "עבודות מערכת ותשתית (BOP)". The owner may
 * replace that single line with any number of named, individually priced items.
 *
 * THIS IS A PRESENTATION BREAKDOWN OF AN EXISTING PRICE, NOT A PRICING ENGINE.
 *   - the items must partition the workbook's BOP amount EXACTLY;
 *   - nothing here ever changes `capex.balanceOfPlantCost`, the project total, VAT, the cash
 *     flow, IRR, financing or the payment milestones — those keep reading the scalar;
 *   - there are no formulas, no residual row, no automatic balancing and no rounding. A
 *     configuration that does not add up is REJECTED, never repaired.
 *
 * PURITY: no DOM, no fetch, no window, no formatting, no randomness, no catalog lookup.
 * Amounts are integer ILS. FORMATTING lives in storage-document-contract.js; PRESENTATION in the
 * renderers; AUTHORING in storage-bop-editor.js.
 *
 * MODEL
 *   state.bopBreakdown (optional) = the editable CONFIG, and also exactly what is signed:
 *     { version: 1, items: [ { id, name, amount } ] }        // array order = display order
 *   ABSENT means the existing single-line behaviour, byte-for-byte. There is no "empty" or
 *   "disabled" representation: disabling itemisation deletes the key.
 *
 *   `id` is a STABLE row identity minted once at creation. It survives label edits, reordering,
 *   save and reload, and it is what the document contract's content id `cost.bop.<id>` is built
 *   from. It is never derived from the label, a slug or a position.
 *
 * PRESET NAMES are code-owned and name-only (no prices, no engineering scope). Selecting one
 * COPIES its text into the quote; a later edit to this list cannot change a saved quote. Adding a
 * reusable preset is a code deployment — a one-off name is just a custom row.
 *
 * Wrapped in an IIFE so top-level names don't collide when the authoring page loads this and the
 * sibling storage-* modules as plain <script>s sharing one global scope (mirrors storage-validate.js).
 */
(function () {
'use strict';

const BOP_BREAKDOWN_VERSION = 1;

/**
 * Reusable item names, owner-provided. NAMES ONLY — deliberately no amounts: every price is
 * quote-specific and must come out of the workbook's own BOP figure.
 */
const PRESET_NAMES = ['הכנת קרקע', 'היתר בנייה'];

// Bounds. Grounded in what the document can actually carry, not in the milestone table's 12-row
// print cap (that table is ONE unsplittable print block; the CapEx table is not — it paginates).
// 40 rows is far past any real quote while keeping the stored state small (≈40×120B).
const MAX_ITEMS = 40;
const MAX_NAME_LEN = 80;

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ITEM_KEYS = ['id', 'name', 'amount'];
const ROOT_KEYS = ['version', 'items'];

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
/** A whole, exactly representable shekel amount. Rejects 1e21, NaN, Infinity and 3500.5 alike. */
const isSafeInt = (v) => typeof v === 'number' && Number.isSafeInteger(v);
const unknownKeys = (obj, allowed) => Object.keys(obj).filter(k => allowed.indexOf(k) === -1);

/** True when this state asks for itemisation at all. Absence is the legacy path. */
function hasBreakdown(state) {
  return !!state && state.bopBreakdown != null;
}

/**
 * bopTarget(capex) → { ok, target?, code? }
 * The amount the items must partition: the RAW `capex.balanceOfPlantCost`, never the snapshot's
 * rounded copy. Redefining the target as the rounded value would let a ₪35,000.40 workbook be
 * "exactly" partitioned into ₪35,000 of items — a document whose own rows contradict its total.
 */
function bopTarget(capex) {
  const raw = (capex || {}).balanceOfPlantCost;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return { ok: false, code: 'target_invalid' };
  if (!Number.isSafeInteger(raw)) return { ok: false, code: 'target_fractional', target: raw };
  if (raw === 0) return { ok: false, code: 'target_zero', target: 0 };
  return { ok: true, target: raw };
}

/**
 * validateBreakdown(raw, capex) → { ok, errors: [{ code, itemId?, message, ...meta }] }
 *
 * Runs on the RAW submitted payload, BEFORE anything can round, default or discard it. Structured
 * so the authoring UI can render its own Hebrew wording per code (the messages here are English,
 * like the rest of the codebase, and are what the Worker returns in `details`).
 *
 * Deliberately strict: blank names, non-integer or non-positive amounts, a blank UI field arriving
 * as null, unknown versions, unknown/extra keys, duplicate or malformed ids, overflow and any sum
 * that is not EXACTLY the target are all errors. Nothing is clamped or repaired.
 */
function validateBreakdown(raw, capex) {
  const errors = [];
  const push = (code, message, extra) => errors.push(Object.assign({ code, message }, extra || {}));

  if (!isPlainObject(raw)) {
    push('malformed', 'bopBreakdown must be an object');
    return { ok: false, errors };
  }
  const extraRoot = unknownKeys(raw, ROOT_KEYS);
  if (extraRoot.length) push('unknown_key', `bopBreakdown has unsupported key(s): ${extraRoot.join(', ')}`);

  if (raw.version !== BOP_BREAKDOWN_VERSION) {
    push('version_unsupported', `bopBreakdown.version must be ${BOP_BREAKDOWN_VERSION} (got ${JSON.stringify(raw.version)})`);
    return { ok: false, errors };   // an unknown version says nothing about the rest of the shape
  }

  if (!Array.isArray(raw.items)) {
    push('malformed', 'bopBreakdown.items must be an array');
    return { ok: false, errors };
  }
  if (raw.items.length === 0) {
    // There is no "empty itemisation". Disabling is deleting the key — an explicit user action —
    // so an empty list is a half-finished configuration and must not silently become legacy mode.
    push('items_empty', 'bopBreakdown.items must contain at least one item (remove the whole bopBreakdown to go back to a single line)');
  }
  if (raw.items.length > MAX_ITEMS) {
    push('too_many', `bopBreakdown.items may contain at most ${MAX_ITEMS} items`);
  }

  const seen = new Set();
  let sum = 0;
  let sumUsable = true;
  raw.items.forEach((item, i) => {
    const at = `bopBreakdown.items[${i}]`;
    if (!isPlainObject(item)) { push('malformed', `${at} must be an object`); sumUsable = false; return; }

    const extra = unknownKeys(item, ITEM_KEYS);
    if (extra.length) push('unknown_key', `${at} has unsupported key(s): ${extra.join(', ')}`);

    const id = item.id;
    if (!isStr(id) || !ID_RE.test(id)) {
      push('id_invalid', `${at}.id must be 1–40 characters of A–Z a–z 0–9 _ -`);
    } else if (seen.has(id)) {
      push('id_duplicate', `duplicate item id "${id}"`, { itemId: id });
    } else {
      seen.add(id);
    }

    const idFor = isStr(id) ? id : undefined;
    if (!isStr(item.name) || item.name.trim().length === 0) {
      push('name_empty', `${at}.name must be a non-empty string`, { itemId: idFor });
    } else if (item.name.length > MAX_NAME_LEN) {
      push('name_too_long', `${at}.name must be at most ${MAX_NAME_LEN} characters`, { itemId: idFor });
    } else if (item.name !== item.name.trim()) {
      // The stored name IS the customer-facing label; trimming it here would be a silent repair.
      push('name_untrimmed', `${at}.name must not have leading or trailing whitespace`, { itemId: idFor });
    }

    if (!isSafeInt(item.amount)) {
      push('amount_invalid', `${at}.amount must be a whole number of shekels`, { itemId: idFor });
      sumUsable = false;
    } else if (item.amount <= 0) {
      push('amount_not_positive', `${at}.amount must be greater than 0`, { itemId: idFor });
      sumUsable = false;
    } else {
      sum += item.amount;
    }
  });

  const t = bopTarget(capex);
  if (!t.ok) {
    if (t.code === 'target_zero') {
      push('target_zero', 'capex.balanceOfPlantCost is 0 — there is no additional cost to itemise');
    } else if (t.code === 'target_fractional') {
      push('target_fractional', `capex.balanceOfPlantCost (${t.target}) is not a whole number of shekels and cannot be partitioned exactly`, { target: t.target });
    } else {
      push('target_invalid', 'capex.balanceOfPlantCost is absent or not a finite non-negative number');
    }
    return { ok: errors.length === 0, errors };
  }

  if (sumUsable && raw.items.length > 0) {
    if (!Number.isSafeInteger(sum)) {
      push('sum_overflow', 'the item amounts sum beyond the safe integer range');
    } else if (sum !== t.target) {
      push('sum_mismatch',
        `items sum to ${sum} but capex.balanceOfPlantCost is ${t.target} (difference ${sum - t.target})`,
        { sum: sum, target: t.target, delta: sum - t.target });
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * resolveBreakdown(raw) → { version, items: [{ id, name, amount }] }
 * The deterministic projection carried into the signed snapshot: self-contained (names and amounts
 * are COPIED, never referenced back to the preset list), order-preserving, and with no key beyond
 * the three. Caller MUST have validated first — this does not re-check and does not repair.
 */
function resolveBreakdown(raw) {
  return {
    version: BOP_BREAKDOWN_VERSION,
    items: raw.items.map(it => ({ id: it.id, name: it.name, amount: it.amount })),
  };
}

/**
 * resolveBreakdownForState(state) → the resolved breakdown, or null when the state has none.
 * Throws loudly on an invalid configuration: the authoring UI and the Worker both block invalid
 * saves, so reaching here with a broken breakdown is a genuine data-integrity failure and must
 * never be papered over by falling back to the single aggregate line.
 */
function resolveBreakdownForState(state) {
  const s = state || {};
  if (!hasBreakdown(s)) return null;
  const v = validateBreakdown(s.bopBreakdown, s.capex);
  if (!v.ok) throw new Error('storage-bop-breakdown: invalid breakdown — ' + v.errors.map(e => e.message).join('; '));
  return resolveBreakdown(s.bopBreakdown);
}

/**
 * newItemId(existingIds) → a fresh, stable id that does not collide with the ones given.
 * Deterministic (a counter, never randomness) so the same editing sequence always mints the same
 * ids and two runs of the same authoring session produce the same document.
 */
function newItemId(existingIds) {
  const used = new Set(Array.isArray(existingIds) ? existingIds : []);
  let i = 1, id;
  do { id = 'bop_' + i++; } while (used.has(id));
  return id;
}

const api = {
  BOP_BREAKDOWN_VERSION, PRESET_NAMES, MAX_ITEMS, MAX_NAME_LEN,
  hasBreakdown, bopTarget, validateBreakdown, resolveBreakdown, resolveBreakdownForState, newItemId,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StorageBopBreakdown = api;
})();
