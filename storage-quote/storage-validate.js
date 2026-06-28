/**
 * storage-quote/storage-validate.js
 * SEMO AGS — Commercial Storage (BESS) quote: CANONICAL STATE SHAPE + VALIDATION.
 *
 * This file is the single source of truth for the shape of a `type:"storage"` saved
 * quote. It is pure (no DOM, no fetch, no window) so it runs identically in:
 *   - the browser authoring page (after Excel extraction, before save),
 *   - the Cloudflare Worker (defensive re-validation on render / sign),
 *   - Node tests.
 *
 * The storage quote is DATA-DRIVEN: every number originates from the enSights
 * "Storage Sizing Tool" workbook (extracted once at authoring time by
 * storage-extract.js). There is NO pricing engine. Validation therefore only checks
 * shape + internal consistency of the already-computed figures.
 *
 * Customer-visible price = capex.totalProjectCost (a product decision — no margin field).
 *
 * Wrapped in an IIFE so its top-level names don't collide in the browser (the authoring page
 * loads this + storage-public + storage-extract as plain <script>s sharing one global scope).
 */

(function () {
'use strict';

const STORAGE_QUOTE_SCHEMA_VERSION = 1;
const STORAGE_SNAPSHOT_VERSION = 1;
const YEARS = 20; // enSights operating period (year arrays length)
const ROUND_TOL = 2; // ILS tolerance for CapEx cross-check (rounding in the workbook)

// Canonical financing-simulation DEFAULTS (product constants). The customer can deviate from
// these in the illustrative widget, but the signed snapshot pins exactly these defaults.
// defaultTermYears is per-quote: ceil(workbookLoanRepaymentYears + 1).
const DEFAULT_LTV_PCT = 80;
const DEFAULT_INTEREST_PCT = 4.5;
const expectedDefaultTermYears = (workbookYears) => Math.ceil(workbookYears + 1);

const ARRAY_FIELDS = [
  'revenuesBaseline', 'revenuesOptimized', 'lowVoltageBonus',
  'operationalProfit', 'cfads', 'freeCashFlow', 'cumulativeCashFlow',
];

function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function isNonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function is20(v) { return Array.isArray(v) && v.length === YEARS && v.every(isFiniteNum); }

/**
 * validateStorageState(state) → { ok:boolean, errors:string[], warnings:string[] }
 * Fails LOUDLY: any structural or consistency problem is an error (blocks save/sign).
 * Warnings do not block but are surfaced to the salesperson.
 */
function validateStorageState(state) {
  const errors = [];
  const warnings = [];
  const s = state || {};

  if (s.type !== 'storage') errors.push('type must be "storage"');
  if (s.quoteSchemaVersion !== STORAGE_QUOTE_SCHEMA_VERSION)
    errors.push(`quoteSchemaVersion must be ${STORAGE_QUOTE_SCHEMA_VERSION}`);

  // ── customer ──
  const c = s.customer || {};
  if (!isNonEmptyStr(c.name)) errors.push('customer.name required');
  // phone/address/city/date/note are optional but must be strings if present
  for (const k of ['phone', 'address', 'city', 'date', 'note']) {
    if (c[k] != null && typeof c[k] !== 'string') errors.push(`customer.${k} must be a string`);
  }

  // ── source (provenance) ──
  const src = s.source || {};
  if (!isNonEmptyStr(src.tool)) errors.push('source.tool required');
  if (!isNonEmptyStr(src.workbookHash)) errors.push('source.workbookHash required');
  if (!isNonEmptyStr(src.extractorVersion)) errors.push('source.extractorVersion required');

  // ── project ──
  const p = s.project || {};
  if (p.currency !== 'ILS') errors.push('project.currency must be "ILS" (stale "USD" labels are ignored by the extractor)');
  for (const k of ['pvKw', 'storageKw', 'storageKwh']) {
    if (!isFiniteNum(p[k]) || p[k] < 0) errors.push(`project.${k} must be a finite non-negative number`);
  }

  // ── capex ──
  const cap = s.capex || {};
  for (const k of ['totalProjectCost', 'pvCost', 'storageCost', 'balanceOfPlantCost']) {
    if (!isFiniteNum(cap[k]) || cap[k] < 0) errors.push(`capex.${k} must be a finite non-negative number`);
  }
  if (isFiniteNum(cap.totalProjectCost)) {
    if (cap.totalProjectCost <= 0) errors.push('capex.totalProjectCost must be > 0');
    // Cross-check: components reconstruct the total within rounding tolerance.
    const visible = (Array.isArray(cap.otherVisibleItems) ? cap.otherVisibleItems : [])
      .reduce((sum, it) => sum + (isFiniteNum(it && it.amount) ? it.amount : 0), 0);
    const parts = (cap.pvCost || 0) + (cap.storageCost || 0) + (cap.balanceOfPlantCost || 0) + visible;
    if (Math.abs(parts - cap.totalProjectCost) > ROUND_TOL) {
      errors.push(`capex components (${Math.round(parts)}) do not sum to totalProjectCost (${Math.round(cap.totalProjectCost)}) within ±${ROUND_TOL}`);
    }
  }

  // ── metrics ──
  const m = s.metrics || {};
  if (!isFiniteNum(m.npv)) errors.push('metrics.npv must be a finite number');
  if (!isFiniteNum(m.irr)) errors.push('metrics.irr must be a finite number (fraction, e.g. 0.172)');
  else if (m.irr > 2) warnings.push('metrics.irr looks like a percent, expected a fraction (0.172 = 17.2%)');
  if (!isFiniteNum(m.paybackYears) || m.paybackYears <= 0) errors.push('metrics.paybackYears must be a positive number');
  if (m.profitabilityIndex != null && !isFiniteNum(m.profitabilityIndex)) errors.push('metrics.profitabilityIndex must be a finite number');

  // ── 20-year arrays ──
  const a = s.arrays20y || {};
  for (const f of ARRAY_FIELDS) {
    if (!is20(a[f])) errors.push(`arrays20y.${f} must be exactly ${YEARS} finite numbers`);
  }
  // Low-Voltage Bonus is the heart of the 800-hour program — year 1 must be > 0.
  if (is20(a.lowVoltageBonus) && !(a.lowVoltageBonus[0] > 0)) {
    errors.push('arrays20y.lowVoltageBonus[year1] must be > 0 (this is the 800-hour Low-Voltage Bonus; zero means the file is not an 800-hour case)');
  }
  // Optimized revenue must beat baseline in year 1 (sanity of the storage value prop).
  if (is20(a.revenuesOptimized) && is20(a.revenuesBaseline) && !(a.revenuesOptimized[0] > a.revenuesBaseline[0])) {
    warnings.push('arrays20y.revenuesOptimized[year1] is not greater than baseline — unusual for a storage project');
  }

  // ── financing (canonical defaults + computed; the widget is illustrative only) ──
  const f = s.financing || {};
  // canonical product defaults (pinned by the signed snapshot)
  if (f.defaultLtvPct !== DEFAULT_LTV_PCT) errors.push(`financing.defaultLtvPct must be ${DEFAULT_LTV_PCT}`);
  if (f.defaultInterestPct !== DEFAULT_INTEREST_PCT) errors.push(`financing.defaultInterestPct must be ${DEFAULT_INTEREST_PCT}`);
  if (!isFiniteNum(f.workbookLoanRepaymentYears) || f.workbookLoanRepaymentYears <= 0)
    errors.push('financing.workbookLoanRepaymentYears must be a positive number (loan repayment duration from the workbook)');
  if (!Number.isInteger(f.defaultTermYears) || f.defaultTermYears <= 0)
    errors.push('financing.defaultTermYears must be a positive integer');
  else if (isFiniteNum(f.workbookLoanRepaymentYears) && f.defaultTermYears !== expectedDefaultTermYears(f.workbookLoanRepaymentYears))
    errors.push(`financing.defaultTermYears must equal ceil(workbookLoanRepaymentYears + 1) = ${expectedDefaultTermYears(f.workbookLoanRepaymentYears)}`);
  if (!isNonEmptyStr(f.assumptionsSource)) errors.push('financing.assumptionsSource required');
  // canonical computed results (at the defaults)
  if (!isFiniteNum(f.loanAmount) || f.loanAmount < 0) errors.push('financing.loanAmount must be a finite non-negative number');
  if (!isFiniteNum(f.equityAmount) || f.equityAmount < 0) errors.push('financing.equityAmount must be a finite non-negative number');
  if (!isFiniteNum(f.annualDebtPayment) || f.annualDebtPayment < 0) errors.push('financing.annualDebtPayment must be a finite non-negative number');
  if (!(Array.isArray(f.dscrByYear) && f.dscrByYear.length > 0 && f.dscrByYear.length <= YEARS && f.dscrByYear.every(isFiniteNum)))
    errors.push(`financing.dscrByYear must be 1..${YEARS} finite numbers`);
  if (!isFiniteNum(f.minDscr)) errors.push('financing.minDscr must be a finite number');
  if (f.equityPaybackYears != null && !isFiniteNum(f.equityPaybackYears)) errors.push('financing.equityPaybackYears must be a finite number or null');

  // ── forbid raw timeseries leaking into the saved state ──
  if (a.hourly || a.timeseries || s.hourly || s.timeseries8760)
    errors.push('8760-hour timeseries must NOT be stored in the quote state');

  return { ok: errors.length === 0, errors, warnings };
}

/** Convenience: throws on invalid (used where a hard guarantee is wanted). */
function assertStorageState(state) {
  const r = validateStorageState(state);
  if (!r.ok) throw new Error('Invalid storage quote state: ' + r.errors.join('; '));
  return r;
}

const api = {
  STORAGE_QUOTE_SCHEMA_VERSION, STORAGE_SNAPSHOT_VERSION, YEARS, ARRAY_FIELDS,
  DEFAULT_LTV_PCT, DEFAULT_INTEREST_PCT, expectedDefaultTermYears,
  validateStorageState, assertStorageState,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StorageValidate = api;
})();
