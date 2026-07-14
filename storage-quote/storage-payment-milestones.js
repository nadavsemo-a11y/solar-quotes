/**
 * storage-quote/storage-payment-milestones.js
 * SEMO AGS — Commercial Storage (BESS) quote: PAYMENT-MILESTONE domain layer.
 *
 * THE single authoritative source for the payment schedule ("אבני דרך לתשלום"):
 *   - default milestone definitions (Hebrew names, descriptions, formulas),
 *   - the typed, versioned rule schema,
 *   - normalization (fills the default for legacy states; stabilizes IDs),
 *   - deterministic resolution to whole-shekel amounts,
 *   - structured validation for the authoring UI.
 *
 * PURITY: no DOM, no fetch, no window, no formatting (numbers only). Amounts are integer ILS.
 * FORMATTING lives in storage-document-contract.js; PRESENTATION lives in the renderers. This
 * module owns business rules ONLY — neither presenter may recompute a milestone amount.
 *
 * WHERE IT IS USED
 *   - storage-public.js  → buildStorageSignedSnapshot() pins the RESOLVED schedule the customer signs.
 *   - storage-document-contract.js → formats the snapshot's resolved rows into shared content rows.
 *   - the authoring UI   → live preview + save-time validation of a per-quote (negotiated) schedule.
 *
 * MODEL
 *   state.paymentMilestones (optional) = the editable CONFIG:
 *     { version, milestones: [ { id, name, description, rule } ] }        // array order = display order
 *   Rule types:
 *     { type:'fixed_amount',            amount }                          // ₪ fixed
 *     { type:'cumulative_total_percent',targetPercent }                  // bring cumulative to X% of T
 *     { type:'component_percent_delta', component, fromPercent, toPercent } // (to−from)% of a CapEx component
 *     { type:'residual_to_total' }                                       // balance to exactly 100% of T (last row)
 *   The final residual row guarantees Σ(amounts) === totalProjectCost exactly (rounding is absorbed).
 *
 * Wrapped in an IIFE so top-level names don't collide when the authoring page loads this + the sibling
 * storage-* modules as plain <script>s sharing one global scope (mirrors storage-validate.js).
 */
(function () {
'use strict';

const MILESTONES_SCHEMA_VERSION = 1;

// Safe maximum so the milestones table (rendered as ONE indivisible print block — never split across
// pages) can never grow taller than a single printable page. The default schedule uses 6; the PDF
// section starts on a fresh page, so 12 rows + heading + total + VAT note fit comfortably on A4.
const MAX_MILESTONES = 12;

// CapEx components a `component_percent_delta` rule may reference (keys on state.capex).
const SUPPORTED_COMPONENTS = ['pvCost', 'storageCost', 'balanceOfPlantCost'];
const RULE_TYPES = ['fixed_amount', 'cumulative_total_percent', 'component_percent_delta', 'residual_to_total'];

const r0 = (n) => Math.round(Number(n));
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPct = (v) => isFiniteNum(v) && v >= 0 && v <= 100;
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * buildDefaultSchedule() — THE authoritative default 6-row schedule (owner-specified). This is the
 * ONLY place the default Hebrew wording and the default formulas live.
 */
function buildDefaultSchedule() {
  return {
    version: MILESTONES_SCHEMA_VERSION,
    milestones: [
      { id: 'deposit',          name: 'מקדמה',
        description: 'במעמד הזמנת העבודה וחתימת ההצעה',
        rule: { type: 'fixed_amount', amount: 10000 } },
      { id: 'utility_approval', name: 'קבלת אישור מחברת החשמל',
        description: 'השלמה ל-10% מסכום העסקה',
        rule: { type: 'cumulative_total_percent', targetPercent: 10 } },
      { id: 'design_complete',  name: 'סיום התכנון',
        description: 'השלמה ל-35% מסכום העסקה',
        rule: { type: 'cumulative_total_percent', targetPercent: 35 } },
      { id: 'pv_delivery',      name: 'אספקת הפאנלים',
        description: 'השלמת רכיב תוספת ה-DC מ-35% ל-80%',
        rule: { type: 'component_percent_delta', component: 'pvCost', fromPercent: 35, toPercent: 80 } },
      { id: 'storage_delivery', name: '3 ימי עסקים לפני אספקת מערכת האגירה',
        description: 'השלמת רכיב מערכת האגירה מ-35% ל-80%',
        rule: { type: 'component_percent_delta', component: 'storageCost', fromPercent: 35, toPercent: 80 } },
      { id: 'commissioning',    name: 'הפעלת המערכת',
        description: 'תשלום היתרה והשלמה ל-100% מסכום העסקה',
        rule: { type: 'residual_to_total' } },
    ],
  };
}

/**
 * normalizeSchedule(config) → a well-shaped config. Legacy states with no schedule get the default.
 * IDs are preserved when present (they are stable identifiers, NOT derived from label/index); a
 * missing ID falls back to a deterministic `m{n}` slug and is de-duplicated. Text is trimmed. This
 * does NOT validate business rules — call validateSchedule() for that.
 */
function normalizeSchedule(config) {
  if (!config || !Array.isArray(config.milestones) || config.milestones.length === 0) {
    return buildDefaultSchedule();
  }
  const used = new Set();
  const milestones = config.milestones.map((ms, i) => {
    const src = ms || {};
    let id = nonEmpty(src.id) ? src.id.trim() : `m${i + 1}`;
    while (used.has(id)) id = `${id}_${i + 1}`;
    used.add(id);
    return {
      id,
      name: String(src.name == null ? '' : src.name).trim(),
      description: String(src.description == null ? '' : src.description).trim(),
      rule: normalizeRule(src.rule),
    };
  });
  return { version: MILESTONES_SCHEMA_VERSION, milestones };
}

function normalizeRule(rule) {
  const r = rule || {};
  switch (r.type) {
    case 'fixed_amount':
      return { type: 'fixed_amount', amount: r0(r.amount) };
    case 'cumulative_total_percent':
      return { type: 'cumulative_total_percent', targetPercent: Number(r.targetPercent) };
    case 'component_percent_delta':
      return { type: 'component_percent_delta', component: String(r.component || ''), fromPercent: Number(r.fromPercent), toPercent: Number(r.toPercent) };
    case 'residual_to_total':
      return { type: 'residual_to_total' };
    default:
      return { type: String(r.type || '') }; // preserved so validation can report an unsupported type
  }
}

/**
 * resolveSchedule(config, capex) → { rows, total, sumBeforeResidual, projectTotal }
 * Pure, deterministic. Each row resolves to an integer ILS amount, accumulated left-to-right so
 * cumulative/residual rules see the exact rounded amounts already "paid". Does NOT clamp negatives —
 * validation is responsible for rejecting an invalid schedule (never silently hide it).
 *
 *   rows[i] = { id, name, description, order, ruleType, amount }
 */
function resolveSchedule(config, capex) {
  const cap = capex || {};
  const T = r0(cap.totalProjectCost);
  const component = (name) => r0(cap[name]);

  let paidSoFar = 0;
  let sumBeforeResidual = 0;
  const rows = (config.milestones || []).map((ms, i) => {
    const rule = ms.rule || {};
    let amount;
    switch (rule.type) {
      case 'fixed_amount':
        amount = r0(rule.amount);
        break;
      case 'cumulative_total_percent':
        // Bring the cumulative paid up to targetPercent of the (rounded) total.
        amount = r0((Number(rule.targetPercent) / 100) * T) - paidSoFar;
        break;
      case 'component_percent_delta':
        // (toPercent − fromPercent) percent of the referenced CapEx component.
        amount = r0(((Number(rule.toPercent) - Number(rule.fromPercent)) / 100) * component(rule.component));
        break;
      case 'residual_to_total':
        // Balance to exactly the project total. Absorbs all prior rounding ⇒ Σ === T.
        amount = T - paidSoFar;
        break;
      default:
        amount = NaN;
    }
    if (rule.type !== 'residual_to_total') sumBeforeResidual += (isFiniteNum(amount) ? amount : 0);
    paidSoFar += (isFiniteNum(amount) ? amount : 0);
    return { id: ms.id, name: ms.name, description: ms.description, order: i, ruleType: rule.type, amount };
  });

  const total = rows.reduce((s, r) => s + (isFiniteNum(r.amount) ? r.amount : 0), 0);
  return { rows, total, sumBeforeResidual, projectTotal: T };
}

/**
 * validateSchedule(config, capex) → { ok, errors }
 * errors: [{ code, milestoneId?, message }] — structured so the authoring UI can surface them.
 * Rejects (never silently clamps): negative amounts, out-of-range/non-finite percentages,
 * fromPercent>toPercent, unsupported component, missing/duplicate/misplaced residual, sum-before-
 * residual exceeding T, empty name/description, and a missing/non-positive project total.
 */
function validateSchedule(config, capex) {
  const errors = [];
  const push = (code, message, milestoneId) => errors.push(milestoneId ? { code, milestoneId, message } : { code, message });

  const cap = capex || {};
  const T = r0(cap.totalProjectCost);
  if (!isFiniteNum(T) || T <= 0) {
    push('total_missing', 'capex.totalProjectCost is absent or non-positive — cannot resolve a payment schedule');
    return { ok: false, errors };
  }

  const list = (config && Array.isArray(config.milestones)) ? config.milestones : null;
  if (!list || list.length === 0) {
    push('empty_schedule', 'schedule must contain at least one milestone');
    return { ok: false, errors };
  }
  if (list.length > MAX_MILESTONES) {
    push('too_many', `a payment schedule may have at most ${MAX_MILESTONES} milestones (to stay one unsplittable print block)`);
  }

  // ── structural: ids, text, rule shape ──
  const seen = new Set();
  list.forEach((ms, i) => {
    const src = ms || {};
    const id = nonEmpty(src.id) ? src.id.trim() : null;
    if (!id) push('id_missing', `milestone #${i + 1} is missing a stable id`);
    else if (seen.has(id)) push('id_duplicate', `duplicate milestone id "${id}"`, id);
    else seen.add(id);
    if (!nonEmpty(src.name)) push('name_empty', `milestone "${id || i + 1}" requires a name`, id || undefined);
    if (!nonEmpty(src.description)) push('description_empty', `milestone "${id || i + 1}" requires a description`, id || undefined);

    const rule = src.rule || {};
    if (RULE_TYPES.indexOf(rule.type) === -1) {
      push('rule_type_unsupported', `milestone "${id || i + 1}" has an unsupported rule type "${rule.type}"`, id || undefined);
      return;
    }
    if (rule.type === 'fixed_amount') {
      if (!isFiniteNum(r0(rule.amount)) || r0(rule.amount) < 0) push('amount_invalid', `milestone "${id}" fixed amount must be a non-negative number`, id || undefined);
    } else if (rule.type === 'cumulative_total_percent') {
      if (!isPct(Number(rule.targetPercent))) push('percent_invalid', `milestone "${id}" targetPercent must be within 0–100`, id || undefined);
    } else if (rule.type === 'component_percent_delta') {
      if (SUPPORTED_COMPONENTS.indexOf(rule.component) === -1) push('component_unsupported', `milestone "${id}" references an unsupported component "${rule.component}"`, id || undefined);
      if (!isPct(Number(rule.fromPercent)) || !isPct(Number(rule.toPercent))) push('percent_invalid', `milestone "${id}" from/to percent must be within 0–100`, id || undefined);
      else if (Number(rule.fromPercent) > Number(rule.toPercent)) push('percent_order', `milestone "${id}" fromPercent must be ≤ toPercent`, id || undefined);
    }
  });

  // ── residual row: exactly one, and last ──
  const residualIdx = list.map((m, i) => (m && m.rule && m.rule.type === 'residual_to_total') ? i : -1).filter(i => i >= 0);
  if (residualIdx.length === 0) push('residual_missing', 'schedule must end with exactly one residual_to_total milestone');
  else if (residualIdx.length > 1) push('residual_duplicate', 'schedule must contain only one residual_to_total milestone');
  else if (residualIdx[0] !== list.length - 1) push('residual_not_last', 'the residual_to_total milestone must be the last row');

  // ── resolved-amount checks (only meaningful if the structural checks passed enough to resolve) ──
  if (errors.length === 0) {
    const resolved = resolveSchedule(config, cap);
    resolved.rows.forEach((row) => {
      if (!isFiniteNum(row.amount)) push('amount_nonfinite', `milestone "${row.id}" resolved to a non-finite amount`, row.id);
      else if (row.amount < 0) push('amount_negative', `milestone "${row.id}" resolves to a negative amount (₪${row.amount}) — the schedule over-collects`, row.id);
    });
    if (resolved.sumBeforeResidual > T) push('over_collect', `payments before the balancing row (₪${resolved.sumBeforeResidual}) exceed the project total (₪${T})`);
    if (resolved.total !== T) push('sum_mismatch', `resolved milestones (₪${resolved.total}) do not sum to the project total (₪${T})`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * resolveMilestonesForState(state) → the RESOLVED schedule pinned into the signed snapshot:
 *   { version, schedule, rows, total }
 * Uses the per-quote config when present, else the default (legacy states). Throws loudly on an
 * invalid schedule — the authoring UI blocks invalid saves and the default is always valid for a
 * valid CapEx, so reaching here with an invalid schedule is a genuine data-integrity failure.
 */
function resolveMilestonesForState(state) {
  const s = state || {};
  const config = normalizeSchedule(s.paymentMilestones);
  const v = validateSchedule(config, s.capex);
  if (!v.ok) throw new Error('storage-payment-milestones: invalid schedule — ' + v.errors.map(e => e.message).join('; '));
  const resolved = resolveSchedule(config, s.capex);
  return {
    version: config.version,
    schedule: config.milestones,     // the rules the customer agreed to (audit / re-derivation)
    rows: resolved.rows,             // { id, name, description, order, ruleType, amount }
    total: resolved.total,
  };
}

const api = {
  MILESTONES_SCHEMA_VERSION, MAX_MILESTONES,
  buildDefaultSchedule, normalizeSchedule,
  resolveSchedule, validateSchedule, resolveMilestonesForState,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StoragePaymentMilestones = api;
})();
