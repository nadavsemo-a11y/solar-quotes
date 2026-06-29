/**
 * storage-quote/storage-public.js
 * SEMO AGS — Commercial Storage quote: PUBLIC SIGNED SNAPSHOT + audit + financing math.
 *
 * Pure (no DOM/fetch/window). Mirrors the role of quote-public.js for solar, but the
 * storage quote is data-driven so there is no engine: the snapshot is a deterministic
 * projection of the already-extracted state.
 *
 * The customer-facing financing widget (LTV / interest / term) is ILLUSTRATIVE ONLY. The
 * legally signed offer pins the canonical DEFAULTS (financing.defaultLtvPct / defaultInterestPct
 * / defaultTermYears) and their derived DSCR/payment — widget edits never change what is
 * hashed/signed. computeFinancing() below is the SINGLE source of the financing math; its source
 * string (COMPUTE_FINANCING_SRC) is injected into the client widget so both run identical code.
 */

// Wrapped in an IIFE so top-level names (V, round, api, …) don't collide with the sibling
// storage modules when the authoring page loads them as plain <script>s in one global scope.
(function () {
'use strict';

const V = (typeof module !== 'undefined' && module.exports)
  ? require('./storage-validate.js')
  : (typeof globalThis !== 'undefined' ? globalThis.StorageValidate : undefined);

const round = n => Math.round(n);
const round2 = n => Math.round(n * 100) / 100;

/**
 * computeFinancing({ totalProjectCost, cfadsByYear, ltvPct, annualInterestPct, termYears })
 * THE single financing-math implementation. Percentages in (LTV 0–100, interest 0–30); the
 * function clamps/validates and forces a positive-integer term. Pure annuity:
 *   loan = cost·ltv ; equity = cost-loan
 *   payment = loan·r / (1-(1+r)^-n)   (r=0 → loan/n)
 *   dscrByYear[i] = cfads[i]/payment ; minDscr = min ; equityPaybackYears = equity/(cfads[0]-payment)
 *
 * SELF-CONTAINED (only Math, no external helpers) ON PURPOSE: its `.toString()` is injected
 * verbatim into the customer widget (COMPUTE_FINANCING_SRC below), so server and browser run the
 * EXACT same code — no duplicated/forkable formula.
 */
function computeFinancing(args) {
  var P = Math.max(0, Number(args.totalProjectCost) || 0);
  var cf = Array.isArray(args.cfadsByYear) ? args.cfadsByYear : [];
  var ltv = Math.min(100, Math.max(0, Number(args.ltvPct) || 0)) / 100;
  var r = Math.min(30, Math.max(0, Number(args.annualInterestPct) || 0)) / 100;
  var n = Math.max(1, Math.round(Number(args.termYears) || 1));
  var loan = P * ltv;
  var equity = P - loan;
  var payment = r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : loan / n;
  var t = Math.min(n, cf.length);
  var dscr = [];
  for (var i = 0; i < t; i++) dscr.push(payment > 0 ? Math.round((cf[i] / payment) * 100) / 100 : 0);
  var minDscr = dscr.length ? Math.min.apply(null, dscr) : 0;
  var firstNet = (cf.length ? cf[0] : 0) - payment;
  var equityPaybackYears = firstNet > 0 ? Math.round((equity / firstNet) * 100) / 100 : null;
  return {
    loanAmount: Math.round(loan),
    equityAmount: Math.round(equity),
    annualDebtPayment: Math.round(payment),
    dscrByYear: dscr,
    minDscr: Math.round(minDscr * 100) / 100,
    equityPaybackYears: equityPaybackYears,
  };
}
// Injected verbatim into the customer widget so the browser runs the identical formula.
const COMPUTE_FINANCING_SRC = computeFinancing.toString();

/**
 * recomputeCanonicalFinancing(state) — the CANONICAL (signed) financing scenario, computed
 * deterministically from the product DEFAULTS stored in state.financing (LTV 80% / interest
 * 4.5% / term = ceil(workbook loan years + 1)). Returns the full financing object (defaults +
 * computed). The customer widget may simulate other inputs, but THIS is what is hashed/signed.
 */
function recomputeCanonicalFinancing(state) {
  const cap = state.capex || {};
  const a = state.arrays20y || {};
  const f = state.financing || {};
  const fin = computeFinancing({
    totalProjectCost: cap.totalProjectCost,
    cfadsByYear: a.cfads || [],
    ltvPct: f.defaultLtvPct,
    annualInterestPct: f.defaultInterestPct,
    termYears: f.defaultTermYears,
  });
  return {
    defaultLtvPct: f.defaultLtvPct,
    defaultInterestPct: f.defaultInterestPct,
    defaultTermYears: f.defaultTermYears,
    workbookLoanRepaymentYears: f.workbookLoanRepaymentYears,
    assumptionsSource: f.assumptionsSource,
    loanAmount: fin.loanAmount,
    equityAmount: fin.equityAmount,
    annualDebtPayment: fin.annualDebtPayment,
    dscrByYear: fin.dscrByYear,
    minDscr: fin.minDscr,
    equityPaybackYears: fin.equityPaybackYears,
  };
}

/**
 * buildStorageSignedSnapshot(state) — the deterministic CUSTOMER-FACING document the
 * signer agrees to. Display/legal values ONLY. No raw workbook, no 8760 data, no
 * transient simulator state, no non-deterministic formatting. This is what gets hashed
 * into publicSnapshotHash and frozen at sign time. Takes NO knobs (storage is static).
 */
function buildStorageSignedSnapshot(state /* , knobs ignored */) {
  const s = state || {};
  const c = s.customer || {};
  const p = s.project || {};
  const cap = s.capex || {};
  const m = s.metrics || {};
  const a = s.arrays20y || {};
  const fin = recomputeCanonicalFinancing(s);

  return {
    snapshotType: 'storage',
    snapshotVersion: (V && V.STORAGE_SNAPSHOT_VERSION) || 1,
    quoteSchemaVersion: (V && V.STORAGE_QUOTE_SCHEMA_VERSION) || 1,
    customer: {
      name: c.name || '', phone: c.phone || '', address: c.address || '',
      city: c.city || '', date: c.date || '', note: c.note || '',
    },
    project: {
      pvKw: p.pvKw, storageKw: p.storageKw, storageKwh: p.storageKwh, currency: 'ILS',
    },
    capex: {
      totalProjectCost: round(cap.totalProjectCost),
      pvCost: round(cap.pvCost), storageCost: round(cap.storageCost),
      balanceOfPlantCost: round(cap.balanceOfPlantCost),
      otherVisibleItems: (Array.isArray(cap.otherVisibleItems) ? cap.otherVisibleItems : [])
        .map(it => ({ label: String(it.label || ''), amount: round(it.amount || 0) })),
    },
    metrics: {
      npv: round(m.npv),
      irr: Math.round(m.irr * 10000) / 10000, // canonical fraction, 4dp (0.172)
      irrPct: round2(m.irr * 100),            // display percent (17.2)
      paybackYears: round2(m.paybackYears),
      profitabilityIndex: m.profitabilityIndex != null ? round2(m.profitabilityIndex) : null,
    },
    arrays20y: {
      revenuesBaseline: a.revenuesBaseline.map(round),
      revenuesOptimized: a.revenuesOptimized.map(round),
      lowVoltageBonus: a.lowVoltageBonus.map(round),
      operationalProfit: a.operationalProfit.map(round),
      cfads: a.cfads.map(round),
      freeCashFlow: a.freeCashFlow.map(round),
      cumulativeCashFlow: a.cumulativeCashFlow.map(round),
    },
    financing: fin, // canonical default assumptions (the customer simulator does NOT affect this)
    source: {
      tool: (s.source && s.source.tool) || '',
      workbookHash: (s.source && s.source.workbookHash) || '',
      extractorVersion: (s.source && s.source.extractorVersion) || '',
      validationSummary: (s.source && s.source.validationSummary) || '',
    },
  };
}

/**
 * buildStorageInternalAudit(state) — internal evidence stored server-side alongside the
 * public snapshot. For storage this is simply the full extracted state (it already
 * contains no hidden margin/engine output — price = totalProjectCost). Kept separate to
 * mirror the solar contract shape consumed by the signing handler.
 */
function buildStorageInternalAudit(state) {
  return { calc: state || {}, knobs: {} };
}

/**
 * canonicalStorageKnobs(state) — storage has no customer knobs; the binding string is a
 * constant per snapshot version so the signing-token knobs binding stays stable.
 */
function canonicalStorageKnobs(/* state */) {
  return JSON.stringify({ storage: (V && V.STORAGE_SNAPSHOT_VERSION) || 1 });
}

/**
 * buildStorageHubspotSyncPayload(state, ctx) — the generation-time HubSpot sync payload for a
 * storage quote. Pure + browser-safe (the storage portal calls this directly; the adapter
 * delegates here so there is ONE source). Storage wording only — no solar "DC power".
 * ctx = { quoteId, quoteUrl }.
 */
function buildStorageHubspotSyncPayload(state, ctx) {
  const s = state || {}; const c = s.customer || {}; const p = s.project || {}; const cap = s.capex || {};
  const x = ctx || {};
  const quoteUrl = x.quoteUrl || (x.quoteId ? `https://s-a.gs/q/${x.quoteId}` : '');
  const fmtILS = (n) => '₪' + round(n).toLocaleString('he-IL');
  const metricLabel = 'קיבולת אגירה';
  const metricValue = p.storageKwh ? `${round(p.storageKwh)} קוט"ש` : (cap.totalProjectCost ? fmtILS(cap.totalProjectCost) : '');
  const name = c.name || '';
  const noteBody = `הצעת מחיר — מערכת אגירה מסחרית — ${name}<br>${metricLabel}: ${metricValue}<br>עלות פרויקט: ${fmtILS(cap.totalProjectCost)}<br>לינק: <a href="${quoteUrl}" target="_blank">${quoteUrl}</a>`;
  return {
    quoteType: 'storage', quoteId: x.quoteId || '', quoteUrl,
    customer: { name, phone: c.phone || '', email: c.email || '', address: c.address || '', city: c.city || '' },
    headlineMetricLabel: metricLabel, headlineMetricValue: metricValue,
    noteBody, taskTitle: `מעקב הצעת אגירה — ${name}`, taskBody: noteBody,
  };
}

const api = {
  computeFinancing, COMPUTE_FINANCING_SRC, recomputeCanonicalFinancing,
  buildStorageSignedSnapshot, buildStorageInternalAudit, canonicalStorageKnobs,
  buildStorageHubspotSyncPayload,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StoragePublic = api;
})();
