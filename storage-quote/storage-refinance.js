/**
 * storage-quote/storage-refinance.js
 * SEMO AGS — "מחזור הלוואה + הקטנת קרן" calculator: the PURE domain layer.
 *
 * THE PROBLEM THIS MODELS
 * The bank finances a storage upgrade by REFINANCING everything at once: it takes the customer's
 * remaining balance on the ORIGINAL PV loan, adds the cost of the additional PV + the battery, and
 * re-amortises the whole thing over a fresh, long term (e.g. 16 years). A long term means a large
 * total interest bill, which can eat most of what the storage earns. The customer's counter-move is
 * to throw the project's own annual surplus (and/or an external annual bonus) at the principal every
 * year. This module quantifies that: with-prepayment vs without, side by side.
 *
 * WHERE THE NUMBERS COME FROM (read this before touching any income field)
 * The enSights "Cash Flow & Debt Service" sheet is **INCREMENTAL** — its "Additional Revenues" row is
 * `Optimized − Baseline`, so its CFADS does NOT contain the EXISTING PV's income. That is fine for
 * enSights (it prices the upgrade in isolation) but WRONG here, because the bank is refinancing the
 * old system's loan too — so the old system's income must service that debt. Hence:
 *
 *     incomeExisting[y]   = Revenues sheet → "Baseline Revenues (Without Storage)" → Total
 *     incomeAdditional[y] = cash-flow "Revenue subtotal"  (= Optimized − Baseline)
 *     full income[y]      = incomeExisting[y] + incomeAdditional[y]  (≡ Optimized Revenues Total)
 *     opex[y]             = cash-flow "Expenses subtotal"
 *
 * `lvBonus[y]` (Low-Voltage / 800-hour bonus) is a SUBSET of incomeAdditional and is carried for
 * display only — never added to a total, or it double-counts.
 *
 * PURE: no DOM, no fetch, no window. `computeRefiPlan` is deliberately SELF-CONTAINED (only Math and
 * its own inner helpers) because its `.toString()` is injected verbatim into the customer page as
 * COMPUTE_REFI_SRC — the same "no duplicated/forkable formula" discipline as
 * storage-public.computeFinancing. Do not make it reference anything outside itself.
 */
'use strict';

// IIFE-wrapped: the authoring portal loads this as a classic <script> next to its siblings, and a
// duplicate top-level `const` between two classic scripts silently discards a whole file.
(function () {

const REFI_VERSION = 'storage-refinance@1';

/**
 * computeRefiPlan(cfg) — THE single implementation of the refinance + prepayment math.
 *
 * Amortisation is a monthly Spitzer annuity (Israeli bank practice) run 12 periods per displayed
 * year; a prepayment lands at YEAR END, after that year's twelve payments. Two prepayment modes:
 *   'shorten' (default) — payment stays fixed, the loan simply ends sooner   → maximum interest saved
 *   'reduce'            — the term stays, the monthly payment is recomputed  → maximum monthly relief
 *
 * Returns { plan, baseline, saved, inputs } where `plan` honours the prepayments and `baseline` is
 * the identical loan with none, so every "how much did this save me" figure is a difference between
 * two runs of the SAME code rather than a second formula.
 *
 * SELF-CONTAINED ON PURPOSE — see the file header.
 */
function computeRefiPlan(cfg) {
  cfg = cfg || {};
  var H = Math.max(1, Math.min(40, Math.round(Number(cfg.horizonYears) || 20)));
  var PPY = 12;
  var startYear = Math.round(Number(cfg.startYear) || new Date().getFullYear());

  function series(a, n) {
    var out = [], i, v;
    for (i = 0; i < n; i++) { v = Number((a || [])[i]); out.push(isFinite(v) ? v : 0); }
    return out;
  }
  var incExist = series(cfg.incomeExisting, H);
  var incAdd   = series(cfg.incomeAdditional, H);
  var bonus    = series(cfg.lvBonus, H);
  var opex     = series(cfg.opex, H);

  var newCost   = Math.max(0, Number(cfg.newProjectCost) || 0);
  var oldLoan   = Math.max(0, Number(cfg.existingLoanBalance) || 0);
  var extraFin  = Math.max(0, Number(cfg.extraFinanced) || 0);
  var equity    = Math.max(0, Number(cfg.equityDownPayment) || 0);
  var principal0 = Math.max(0, newCost + oldLoan + extraFin - equity);

  var rateAnnual = Math.min(40, Math.max(0, Number(cfg.annualInterestPct) || 0)) / 100;
  var r = rateAnnual / PPY;
  var term  = Math.max(1, Math.min(40, Math.round(Number(cfg.termYears) || 1)));
  var grace = Math.max(0, Math.min(term * PPY - 1, Math.round(Number(cfg.graceMonths) || 0)));

  var feePct   = Math.min(10, Math.max(0, Number(cfg.prepayFeePct) || 0)) / 100;
  var share    = Math.min(100, Math.max(0, cfg.surplusSharePct == null ? 100 : Number(cfg.surplusSharePct))) / 100;
  var useSurp  = cfg.usesSurplus !== false;
  var extraDep = Math.max(0, Number(cfg.extraAnnualDeposit) || 0);
  var oneTime  = cfg.oneTimeDeposits || {};
  var mode     = cfg.prepayMode === 'reduce' ? 'reduce' : 'shorten';
  var EPS = 0.005;

  function annuity(bal, months) {
    if (months <= 0) return bal;
    return r > 0 ? (bal * r) / (1 - Math.pow(1 + r, -months)) : bal / months;
  }

  function run(withPrepay) {
    var bal = principal0;
    var totalMonths = term * PPY;
    var payment = annuity(bal, Math.max(1, totalMonths - grace));
    var firstPayment = grace > 0 ? bal * r : payment;
    var m = 0, cumNet = 0, cumExternal = 0, payoffYear = null;
    var rows = [];
    var T = {
      incomeExisting: 0, incomeAdditional: 0, income: 0, lvBonus: 0, opex: 0,
      interest: 0, principalScheduled: 0, debtService: 0,
      prepaySurplus: 0, prepayExternal: 0, prepayTotal: 0, fees: 0,
      netCash: 0,
    };

    for (var y = 0; y < H; y++) {
      var yInterest = 0, yPrincipal = 0, k;
      for (k = 0; k < PPY; k++) {
        if (bal > EPS) {
          var interest = bal * r;
          var pay = m < grace ? interest : payment;
          if (pay > bal + interest) pay = bal + interest;
          var princ = pay - interest;
          if (princ < 0) princ = 0;
          if (princ > bal) princ = bal;
          bal -= princ;
          yInterest += interest;
          yPrincipal += princ;
        }
        m++;
      }

      var income = incExist[y] + incAdd[y];
      var debtService = yInterest + yPrincipal;
      var netBefore = income - opex[y] - debtService;

      var fromSurplus = 0, external = 0, fee = 0, prepay = 0;
      if (withPrepay && bal > EPS) {
        fromSurplus = (useSurp && netBefore > 0) ? netBefore * share : 0;
        external = extraDep + (Number(oneTime[String(y + 1)]) || 0);
        if (!isFinite(external) || external < 0) external = 0;
        // Never pay more principal than is outstanding; the early-repayment fee rides on top of the
        // principal actually retired, so the cash ceiling is balance × (1 + fee).
        var want = fromSurplus + external;
        var ceiling = bal * (1 + feePct);
        if (want > ceiling) {
          var over = want - ceiling;
          // Trim the customer's own out-of-pocket money first — there is no point injecting more
          // than the loan can absorb — and only then the project's surplus.
          var cutExt = Math.min(external, over);
          external -= cutExt; over -= cutExt;
          fromSurplus = Math.max(0, fromSurplus - over);
          want = fromSurplus + external;
        }
        prepay = want / (1 + feePct);
        fee = want - prepay;
        bal -= prepay;
        if (mode === 'reduce' && bal > EPS) {
          payment = annuity(bal, Math.max(1, totalMonths - m));
        }
      }

      if (bal <= EPS) { bal = 0; if (payoffYear === null && principal0 > 0) payoffYear = startYear + y; }

      // The project's own cash: the external deposit is the customer's pocket money, not project
      // income, so it never lifts this line — it only shows up as principal retired sooner.
      var netAfter = netBefore - fromSurplus - fee;
      cumNet += netAfter;
      cumExternal += external;

      T.incomeExisting += incExist[y]; T.incomeAdditional += incAdd[y]; T.income += income;
      T.lvBonus += bonus[y]; T.opex += opex[y];
      T.interest += yInterest; T.principalScheduled += yPrincipal; T.debtService += debtService;
      T.prepaySurplus += fromSurplus; T.prepayExternal += external;
      T.prepayTotal += prepay; T.fees += fee; T.netCash += netAfter;

      rows.push({
        year: startYear + y, n: y + 1,
        incomeExisting: incExist[y], incomeAdditional: incAdd[y], lvBonus: bonus[y], income: income,
        opex: opex[y], interest: yInterest, principal: yPrincipal, debtService: debtService,
        netBefore: netBefore,
        prepaySurplus: fromSurplus, prepayExternal: external, prepayFee: fee,
        prepayTotal: prepay, netAfter: netAfter, cumNet: cumNet, balance: bal,
      });
    }

    T.principalRepaid = T.principalScheduled + T.prepayTotal;
    T.financingCost = T.interest + T.fees;
    T.totalOutflow = T.opex + T.debtService + T.prepayTotal + T.fees;
    T.externalInjected = cumExternal;
    T.remainingBalance = bal;
    // What the horizon is actually worth once the outstanding debt is settled.
    T.netWorth = T.netCash - bal;

    return {
      rows: rows, totals: T, payoffYear: payoffYear, remainingBalance: bal,
      monthlyPayment: payment, firstMonthlyPayment: firstPayment,
    };
  }

  var plan = run(true);
  var baseline = run(false);

  return {
    plan: plan, baseline: baseline,
    saved: {
      interest: baseline.totals.interest - plan.totals.interest,
      fees: plan.totals.fees,
      netInterest: (baseline.totals.interest - plan.totals.interest) - plan.totals.fees,
      years: (baseline.payoffYear !== null && plan.payoffYear !== null)
        ? baseline.payoffYear - plan.payoffYear : null,
      remainingBalance: baseline.remainingBalance - plan.remainingBalance,
    },
    inputs: {
      horizonYears: H, startYear: startYear, loanPrincipal: principal0,
      newProjectCost: newCost, existingLoanBalance: oldLoan, extraFinanced: extraFin,
      equityDownPayment: equity, annualInterestPct: rateAnnual * 100, termYears: term,
      graceMonths: grace, prepayMode: mode, prepayFeePct: feePct * 100,
      usesSurplus: useSurp, surplusSharePct: share * 100, extraAnnualDeposit: extraDep,
      // A term that runs past the workbook's projection has no modelled income behind its later
      // years; the page shows this as a caveat rather than inventing revenue.
      termBeyondHorizon: term > H,
    },
  };
}

// Injected verbatim into the customer page so the browser runs the identical formula.
const COMPUTE_REFI_SRC = computeRefiPlan.toString();

/**
 * buildRefiSeed(state) — project an extracted storage state (storage-extract.js output) onto the
 * calculator's config. This is the ONLY place that knows the enSights incremental-vs-total
 * convention; everything downstream just reads the four series.
 *
 * `existingLoanBalance` cannot come from the workbook — enSights knows nothing about the customer's
 * original PV loan — so it seeds to 0 and is an explicit input on both the authoring form and the
 * customer page.
 */
function buildRefiSeed(state, opts) {
  opts = opts || {};
  const s = state || {};
  const a = s.arrays20y || {};
  const cap = s.capex || {};
  const c = s.customer || {};
  const p = s.project || {};

  const baseline = Array.isArray(a.revenuesBaseline) ? a.revenuesBaseline.slice() : [];
  const optimized = Array.isArray(a.revenuesOptimized) ? a.revenuesOptimized.slice() : [];
  const opProfit = Array.isArray(a.operationalProfit) ? a.operationalProfit.slice() : [];
  const lv = Array.isArray(a.lowVoltageBonus) ? a.lowVoltageBonus.slice() : [];
  const H = Math.max(baseline.length, optimized.length, opProfit.length) || 20;

  const incomeAdditional = [], opexSeries = [], incomeExisting = [], lvBonus = [];
  for (let i = 0; i < H; i++) {
    const base = Number(baseline[i]) || 0;
    const opt = Number(optimized[i]) || 0;
    const add = opt - base;                       // ≡ the cash-flow sheet's "Revenue subtotal"
    const profit = Number(opProfit[i]);
    // opex is recovered as (additional revenue − incremental operational profit), which is exactly
    // the workbook's "Expenses subtotal" without having to resolve that row a second time.
    const ox = isFinite(profit) ? Math.max(0, add - profit) : 0;
    incomeExisting.push(base);
    incomeAdditional.push(add);
    opexSeries.push(ox);
    lvBonus.push(Number(lv[i]) || 0);
  }

  const fin = s.financing || {};
  return {
    v: 1,
    version: REFI_VERSION,
    customerName: c.name || '',
    systemLabel: [p.pvKw ? `${Math.round(p.pvKw)} kWp PV נוסף` : '', p.storageKwh ? `${Math.round(p.storageKwh)} kWh אגירה` : '']
      .filter(Boolean).join(' · '),
    horizonYears: H,
    startYear: opts.startYear || new Date().getFullYear() + 1,
    incomeExisting, incomeAdditional, lvBonus, opex: opexSeries,
    newProjectCost: Math.round(Number(cap.totalProjectCost) || 0),
    existingLoanBalance: 0,
    extraFinanced: 0,
    equityDownPayment: 0,
    annualInterestPct: Number.isFinite(fin.defaultInterestPct) ? fin.defaultInterestPct : 5.5,
    termYears: 16,
    graceMonths: 0,
    usesSurplus: true,
    surplusSharePct: 100,
    extraAnnualDeposit: 0,
    oneTimeDeposits: {},
    prepayMode: 'shorten',
    prepayFeePct: 0,
    sourceWorkbookHash: s.workbookHash || '',
  };
}

const NUM_FIELDS = [
  'horizonYears', 'startYear', 'newProjectCost', 'existingLoanBalance', 'extraFinanced',
  'equityDownPayment', 'annualInterestPct', 'termYears', 'graceMonths', 'surplusSharePct',
  'extraAnnualDeposit', 'prepayFeePct',
];
const SERIES_FIELDS = ['incomeExisting', 'incomeAdditional', 'lvBonus', 'opex'];

/**
 * normalizeRefiConfig(cfg) — coerce an untrusted config (portal form, KV record, URL) into the
 * exact shape computeRefiPlan expects, clamping every number and truncating every series to the
 * horizon. Returns a NEW object; never mutates the input.
 */
function normalizeRefiConfig(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const H = Math.max(1, Math.min(40, Math.round(Number(c.horizonYears) || 20)));
  const out = {
    v: 1,
    version: REFI_VERSION,
    customerName: String(c.customerName || '').slice(0, 120),
    systemLabel: String(c.systemLabel || '').slice(0, 160),
    horizonYears: H,
    startYear: Math.min(2100, Math.max(2000, Math.round(Number(c.startYear) || new Date().getFullYear() + 1))),
    usesSurplus: c.usesSurplus !== false,
    prepayMode: c.prepayMode === 'reduce' ? 'reduce' : 'shorten',
    oneTimeDeposits: {},
    sourceWorkbookHash: String(c.sourceWorkbookHash || '').slice(0, 80),
  };
  for (const f of SERIES_FIELDS) {
    const src = Array.isArray(c[f]) ? c[f] : [];
    const arr = [];
    for (let i = 0; i < H; i++) { const v = Number(src[i]); arr.push(isFinite(v) ? Math.round(v * 100) / 100 : 0); }
    out[f] = arr;
  }
  for (const f of NUM_FIELDS) {
    if (f === 'horizonYears' || f === 'startYear') continue;
    const v = Number(c[f]);
    out[f] = isFinite(v) ? Math.round(v * 100) / 100 : 0;
  }
  if (!isFinite(Number(c.annualInterestPct))) out.annualInterestPct = 5.5;
  if (!(out.termYears >= 1)) out.termYears = 16;
  if (!isFinite(Number(c.surplusSharePct))) out.surplusSharePct = 100;
  const ot = c.oneTimeDeposits && typeof c.oneTimeDeposits === 'object' ? c.oneTimeDeposits : {};
  for (const k of Object.keys(ot)) {
    const yr = Math.round(Number(k));
    const amt = Number(ot[k]);
    if (yr >= 1 && yr <= H && isFinite(amt) && amt > 0) out.oneTimeDeposits[String(yr)] = Math.round(amt);
  }
  return out;
}

/**
 * validateRefiConfig(cfg) — structural gate for the save route. Errors block persisting; warnings
 * are shown to the operator but never block (a 0-balance old loan is a legitimate case: a customer
 * who owns the existing system outright).
 */
function validateRefiConfig(cfg) {
  const errors = [], warnings = [];
  const c = cfg || {};
  if (!c || typeof c !== 'object') return { ok: false, errors: ['config is not an object'], warnings };
  const H = Number(c.horizonYears);
  if (!(H >= 1 && H <= 40)) errors.push('horizonYears must be 1–40');
  for (const f of SERIES_FIELDS) {
    if (!Array.isArray(c[f])) { errors.push(`${f} must be an array`); continue; }
    if (c[f].length !== H) errors.push(`${f} length ${c[f].length} ≠ horizonYears ${H}`);
    if (c[f].some(v => !isFinite(Number(v)))) errors.push(`${f} contains a non-finite value`);
  }
  const principal = (Number(c.newProjectCost) || 0) + (Number(c.existingLoanBalance) || 0)
    + (Number(c.extraFinanced) || 0) - (Number(c.equityDownPayment) || 0);
  if (!(principal > 0)) errors.push('the financed principal must be positive');
  if (!(Number(c.termYears) >= 1 && Number(c.termYears) <= 40)) errors.push('termYears must be 1–40');
  if (!(Number(c.annualInterestPct) >= 0 && Number(c.annualInterestPct) <= 40)) errors.push('annualInterestPct must be 0–40');
  if (!(Number(c.existingLoanBalance) > 0)) warnings.push('לא הוזנה יתרת הלוואה על המערכת הקיימת — המחזור מחושב על עלות השדרוג בלבד');
  if (Number(c.termYears) > H) warnings.push('תקופת ההלוואה ארוכה מטווח התחזית של הסימולציה — לשנים שמעבר לטווח אין הכנסה ממודלת');
  const income = Array.isArray(c.incomeExisting) ? c.incomeExisting : [];
  if (income.length && !income.some(v => Number(v) > 0)) warnings.push('הכנסות המערכת הקיימת הן אפס — ודאו שזה נכון');
  return { ok: errors.length === 0, errors, warnings };
}

const api = {
  REFI_VERSION, computeRefiPlan, COMPUTE_REFI_SRC,
  buildRefiSeed, normalizeRefiConfig, validateRefiConfig,
  NUM_FIELDS, SERIES_FIELDS,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StorageRefinance = api;

})();
