/**
 * storage-quote/storage-public.js
 * SEMO AGS — Commercial Storage quote: PUBLIC SIGNED SNAPSHOT + audit + financing math.
 *
 * Pure (no DOM/fetch/window). Mirrors the role of quote-public.js for solar, but the
 * storage quote is data-driven so there is no engine: the snapshot is a deterministic
 * projection of the already-extracted state.
 *
 * The customer-facing LTV/DSCR slider is ILLUSTRATIVE ONLY. The legally signed offer
 * pins financing.canonicalLtv (and its derived DSCR/payment) — slider movement never
 * changes what is hashed/signed. computeFinancing() below is the SINGLE source of the
 * financing math, used by the server for the canonical scenario and re-implemented
 * verbatim (same formula) by the client widget for live illustration.
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
 * computeFinancing(capexTotal, cfads[], ltv, interestRate, termYears)
 * Illustrative debt scenario over the workbook's own rate/term. Pure arithmetic.
 *   loan = capex*ltv ; equity = capex-loan
 *   annual annuity payment = loan*r / (1-(1+r)^-n)   (r=0 → loan/n)
 *   dscrByYear[i] = cfads[i] / payment  (over the loan term)
 *   minDscr = min over loan term ; equityPayback = equity / (cfads[0]-payment)
 * Returns a deterministic object (rounded) so server + client agree exactly.
 */
function computeFinancing(capexTotal, cfads, ltv, interestRate, termYears) {
  const n = termYears;
  const r = interestRate;
  const loan = capexTotal * ltv;
  const equity = capexTotal - loan;
  const payment = r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : (n > 0 ? loan / n : 0);
  const term = Math.max(0, Math.min(n, Array.isArray(cfads) ? cfads.length : 0));
  const dscrByYear = [];
  for (let i = 0; i < term; i++) dscrByYear.push(payment > 0 ? round2(cfads[i] / payment) : 0);
  const minDscr = dscrByYear.length ? Math.min(...dscrByYear) : 0;
  const firstYearNet = (cfads && cfads.length ? cfads[0] : 0) - payment;
  const equityPayback = firstYearNet > 0 ? round2(equity / firstYearNet) : null;
  return {
    ltv: round2(ltv),
    loan: round(loan),
    equity: round(equity),
    annualDebtPayment: round(payment),
    dscrByYear,
    minDscr: round2(minDscr),
    equityPayback,
  };
}

/**
 * recomputeCanonicalFinancing(state) — derive the canonical financing block from the
 * extracted state deterministically. Used at extraction time to fill state.financing and
 * (defensively) at snapshot time so the signed financing is always self-consistent.
 */
function recomputeCanonicalFinancing(state) {
  const cap = state.capex || {};
  const a = state.arrays20y || {};
  const f = state.financing || {};
  const fin = computeFinancing(cap.totalProjectCost, a.cfads || [], f.canonicalLtv, f.interestRate, f.termYears);
  return {
    canonicalLtv: fin.ltv,
    interestRate: f.interestRate,
    termYears: f.termYears,
    loan: fin.loan,
    equity: fin.equity,
    annualDebtPayment: fin.annualDebtPayment,
    dscrByYear: fin.dscrByYear,
    minDscr: fin.minDscr,
    equityPayback: fin.equityPayback,
  };
}

/**
 * buildStorageSignedSnapshot(state) — the deterministic CUSTOMER-FACING document the
 * signer agrees to. Display/legal values ONLY. No raw workbook, no 8760 data, no
 * transient slider state, no non-deterministic formatting. This is what gets hashed
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
    financing: fin, // canonical, illustrative-scenario assumptions (slider does NOT affect this)
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

const api = {
  computeFinancing, recomputeCanonicalFinancing,
  buildStorageSignedSnapshot, buildStorageInternalAudit, canonicalStorageKnobs,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StoragePublic = api;
})();
