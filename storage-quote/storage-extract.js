/**
 * storage-quote/storage-extract.js — enSights "Storage Sizing Tool" XLSX → storage state.
 *
 * AUTHORING-ONLY. Runs in the salesperson's browser (SheetJS) and in Node tests. NEVER shipped
 * to the customer page.
 *
 * RESILIENT BY DESIGN (v2). enSights workbooks evolve: sheets get renamed, labels get reworded,
 * units get appended ("Power Rating (kW)"), punctuation/casing shifts ("Low-Voltage Bonus"),
 * the value column moves, and the project horizon is not fixed at 20 years. So this extractor
 * does NOT hard-code coordinates or exact strings. It resolves every field by FUZZY LABEL
 * MATCHING against an ordered alias list (exact-canonical → alias → token-subset → Jaccard), and
 * detects the horizon dynamically from the "Period" header rows.
 *
 * Flexibility never overrides CORRECTNESS, because this feeds a legally signed quote. Two safety
 * layers guard every fuzzy match:
 *   1. ALGEBRAIC CROSS-CHECKS (assertions): independent identities that must hold —
 *      CapEx components sum to the total; PV cost = kWp × cost/kWp; storage cost = kWh × battery
 *      cost; the two data sheets agree on the horizon and it matches Metrics "Periods analyzed".
 *      A mis-resolved cell breaks an identity and FAILS LOUDLY rather than producing a
 *      plausible-but-wrong quote.
 *   2. CONFIDENCE + AMBIGUITY reporting: a loose match (below alias-exact) raises a warning naming
 *      the label it matched; a required field that resolves nowhere is a hard error. The full
 *      resolution map (field → matched label, sheet, confidence) is returned in the report so the
 *      salesperson/developer can audit how the workbook mapped.
 *
 * Pure core (`extractStorageState`) takes a {sheetName: rows2D} map so it is engine-agnostic and
 * unit-testable. `parseWorkbook` is the thin SheetJS adapter. The 8760-hour timeseries
 * ('Optimal Storage Use') is intentionally NOT read.
 *
 * Wrapped in an IIFE so top-level names don't collide with the sibling storage modules when the
 * authoring page loads them as plain <script>s in one global scope.
 */
(function () {
'use strict';

const EXTRACTOR_VERSION = 'storage-extract@2';
const ROUND_TOL = 2;          // ILS tolerance for CapEx cross-check (workbook rounding)
const MATCH_MIN = 0.6;        // minimum confidence to ACCEPT a fuzzy field/sheet/row resolution
const MATCH_STRONG = 0.85;    // at/above this = confident; below = surfaced as a "verify" warning
const HORIZON_MIN = 5, HORIZON_MAX = 40;

const V = (typeof module !== 'undefined' && module.exports)
  ? require('./storage-validate.js') : globalThis.StorageValidate;
const P = (typeof module !== 'undefined' && module.exports)
  ? require('./storage-public.js') : globalThis.StoragePublic;

// ── number parsing — tolerant of "1,108,600", "₪1,108,600", "517.00 ILS", "100 kWp", "17.2%" ──
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }
  return NaN;
}

// ── label normalization + similarity scoring ──
// Drop parenthetical/bracketed units & notes, lowercase, turn punctuation/hyphens into spaces
// (so "Low-Voltage Bonus", "Free  Cash Flow", "Payback (years)" all canonicalize cleanly). Keeps
// latin + digits + hebrew letters.
const STOP = new Set(['the', 'of', 'a', 'an', 'per', 'as', 'to', 'for', 'during', 'with', 'without', 'and', 'in', 'on']);
function canon(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9֐-׿]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}
function toks(s) { return canon(s).split(' ').filter(t => t && !STOP.has(t)); }
function subset(small, big) { for (const x of small) if (!big.has(x)) return false; return true; }
// 0..1 similarity between a candidate label and one alias.
function simOne(candidate, alias) {
  const cc = canon(candidate), ac = canon(alias);
  if (!cc || !ac) return 0;
  if (cc === ac) return 1;
  const ct = toks(candidate), at = toks(alias);
  if (!ct.length || !at.length) return 0;
  const cs = new Set(ct), as = new Set(at);
  if (subset(as, cs)) return 0.85;   // every alias token appears in the candidate
  if (subset(cs, as)) return 0.75;   // candidate is a subset of the alias
  let inter = 0; for (const x of as) if (cs.has(x)) inter++;
  const j = inter / (cs.size + as.size - inter); // Jaccard
  return j >= 0.5 ? 0.55 + (j - 0.5) * 0.6 : 0;  // only reward substantial overlap
}
// Best similarity of a candidate against an ordered alias list (exact wins, short-circuits).
function sim(candidate, aliases) {
  let best = 0;
  for (const a of aliases) { const s = simOne(candidate, a); if (s > best) best = s; if (best === 1) break; }
  return best;
}

// ── sheet resolution by alias ──
function resolveSheet(sheets, aliases) {
  let bestName = null, bestS = 0;
  for (const n of Object.keys(sheets || {})) { const s = sim(n, aliases); if (s > bestS) { bestS = s; bestName = n; } }
  return { name: bestS >= MATCH_MIN ? bestName : null, score: bestS };
}

// ── key→value rows. Keeps ALL cells to the RIGHT of the label so the resolver can choose the right
//    one (the first NUMERIC cell for a number field, the first non-empty for a string) — this
//    tolerates an inserted unit column ["ILS", 1108600] and a number embedded with its unit
//    ("517.00 ILS"). First occurrence of a label wins. ──
function kvEntries(rows) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r) continue;
    const k = r[0];
    if (typeof k === 'string' && k.trim()) {
      const cells = r.slice(1).filter(c => c != null && c !== '');
      if (cells.length) out.push({ key: k.trim(), cells });
    }
  }
  return out;
}
// Resolve one KV field. Returns { cells, key, score } (key null if nothing clears MATCH_MIN).
function kvFind(entries, aliases) {
  let best = null, bestS = 0;
  for (const e of entries) { const s = sim(e.key, aliases); if (s > bestS) { bestS = s; best = e; } if (bestS === 1) break; }
  return bestS >= MATCH_MIN ? { cells: best.cells, key: best.key, score: bestS } : { cells: [], key: null, score: bestS };
}

// ── block-aware row resolution. Returns { values:number[], label, block, score } or null.
//    When blockAliases are given, the block header is the BEST-scoring matching row (not the first
//    — a section subtitle can weakly match), and the data row is then resolved only AMONG ROWS
//    AFTER it. This makes the repeated "Total"/"Low Voltage Bonus" labels resolve within the
//    intended block (baseline vs optimized). ──
function rowFind(rows, rowAliases, blockAliases) {
  if (!Array.isArray(rows)) return null;
  const scoped = Array.isArray(blockAliases) && blockAliases.length > 0;
  let startIdx = 0, blockLabel = null;
  if (scoped) {
    let bIdx = -1, bS = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const c0 = r[0]; if (typeof c0 !== 'string' || !c0.trim()) continue;
      const s = sim(c0, blockAliases);
      if (s > bS) { bS = s; bIdx = i; }
    }
    if (bIdx < 0 || bS < 0.7) return null;
    startIdx = bIdx + 1; blockLabel = String(rows[bIdx][0]).trim();
  }
  let best = null, bestS = 0, bestLabel = null;
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const c0 = r[0]; if (typeof c0 !== 'string' || !c0.trim()) continue;
    const s = sim(c0, rowAliases);
    if (s > bestS) { bestS = s; best = r; bestLabel = c0.trim(); if (s === 1) break; }
  }
  if (best && bestS >= MATCH_MIN) return { values: best.slice(1).map(num), label: bestLabel, block: blockLabel, score: bestS };
  return null;
}

// Count contiguous year columns on a sheet's "Period" header row = the project horizon N.
function countPeriodYears(rows) {
  if (!Array.isArray(rows)) return 0;
  for (const r of rows) {
    if (r && canon(r[0]) === 'period') {
      let n = 0;
      for (let i = 1; i < r.length; i++) { if (Number.isFinite(num(r[i]))) n++; else break; }
      return n;
    }
  }
  return 0;
}

// ── FIELD SPECS — the single place to extend when enSights changes a label. Order aliases most-
//    specific first. Adding a synonym here is the entire cost of absorbing a future rename. ──
const REQUEST_FIELDS = {
  displayCurrency:    ['display currency', 'currency'],
  useCase:            ['use case', 'program', 'tariff program'],
  pvKw:               ['additional dc capacity', 'additional pv capacity', 'dc capacity added', 'pv capacity added', 'pv capacity', 'additional solar capacity'],
  storageKw:          ['power rating', 'storage power rating', 'bess power rating', 'storage power', 'battery power'],
  acKw:               ['ac capacity', 'ac power rating', 'ac power', 'inverter ac capacity'],
  batteryCost:        ['battery cost', 'storage cost per kwh', 'battery cost per kwh', 'cell cost'],
  pvCostPerKwp:       ['pv cost per kwp', 'pv cost', 'solar cost per kwp', 'pv capex per kwp'],
  balanceOfPlantCost: ['additional capex', 'balance of plant', 'bop cost', 'additional capital expenditure', 'other capex'],
  loanTerm:           ['loan term', 'loan duration', 'loan repayment term', 'loan repayment period', 'debt term'],
};
const METRICS_FIELDS = {
  totalProjectCost:   ['total project cost', 'total capex', 'total investment', 'project cost', 'total capital cost'],
  pvCost:             ['pv system cost', 'pv cost', 'solar system cost', 'solar capex'],
  storageCost:        ['storage system cost', 'battery system cost', 'bess cost', 'storage capex', 'storage cost'],
  npv:                ['project npv', 'net present value', 'npv'],
  irr:                ['project irr', 'internal rate of return', 'irr'],
  paybackYears:       ['payback years', 'payback period', 'simple payback', 'payback'],
  profitabilityIndex: ['profitability index', 'pi'],
  periodsAnalyzed:    ['periods analyzed', 'operating period', 'project lifetime', 'analysis period', 'project horizon'],
};
const ARRAY_SPECS = {
  // [stateField]: { sheet:'rev'|'cf', block:[…]|null, row:[…] }
  revenuesBaseline:   { sheet: 'rev', block: ['baseline revenues without storage', 'baseline revenues', 'baseline'], row: ['total', 'total revenues', 'revenue total'] },
  revenuesOptimized:  { sheet: 'rev', block: ['optimized revenues with storage', 'optimized revenues', 'optimized'], row: ['total', 'total revenues', 'revenue total'] },
  lowVoltageBonus:    { sheet: 'rev', block: ['optimized revenues with storage', 'optimized revenues', 'optimized'], row: ['low voltage bonus', 'lv bonus', '800 hour bonus', 'low voltage program bonus'] },
  operationalProfit:  { sheet: 'cf', block: null, row: ['operational profit', 'operating profit'] },
  cfads:              { sheet: 'cf', block: null, row: ['cfads', 'cash flow available for debt service'] },
  freeCashFlow:       { sheet: 'cf', block: null, row: ['free cash flow', 'fcf'] },
  cumulativeCashFlow: { sheet: 'cf', block: null, row: ['cumulative cash flow', 'cumulative free cash flow', 'cumulative fcf'] },
};
const SHEET_ALIASES = {
  request:  ['request', 'inputs', 'assumptions', 'parameters', 'configuration'],
  metrics:  ['metrics', 'results', 'summary metrics', 'financial metrics', 'kpis'],
  revenues: ['revenues', 'revenue analysis', 'revenue'],
  cashflow: ['cash flow debt service', 'cash flow & debt service', 'cash flow', 'cashflow', 'debt service'],
};

/**
 * extractStorageState({ sheets, workbookHash, extractedAt, customer })
 *   sheets: { sheetName: rows2D } (any enSights export; sheet names resolved by alias)
 * Returns { ok, state, report:{ kpis, assertions, errors, warnings, resolution } }.
 */
function extractStorageState({ sheets, workbookHash, extractedAt, customer }) {
  const errors = [];
  const warnings = [];
  const assertions = [];
  const resolution = []; // diagnostics: field → matched label/sheet/confidence
  const A = (name, cond, detail) => { assertions.push({ name, pass: !!cond, detail: detail || '' }); if (!cond) errors.push(`assertion failed: ${name}${detail ? ' — ' + detail : ''}`); };

  sheets = sheets || {};

  // ── resolve the four sheets we read (by alias, not exact name) ──
  const SH = {};
  for (const key of Object.keys(SHEET_ALIASES)) {
    const r = resolveSheet(sheets, SHEET_ALIASES[key]);
    SH[key] = r.name ? sheets[r.name] : null;
    resolution.push({ kind: 'sheet', field: key, matched: r.name, confidence: +r.score.toFixed(2) });
    A(`sheet "${key}" present`, !!r.name, r.name ? `→ "${r.name}" (${(r.score * 100) | 0}%)` : 'no sheet matched');
  }
  if (errors.length) return { ok: false, state: null, report: { kpis: {}, assertions, errors, warnings, resolution } };

  const reqKV = kvEntries(SH.request);
  const metKV = kvEntries(SH.metrics);

  // KV field resolver: picks the right cell (first numeric for a number field, first non-empty for
  // a string), records diagnostics, and warns on a loose label match.
  function kv(entries, sheetKey, fieldKey, aliases, parse) {
    const r = kvFind(entries, aliases);
    const raw = parse === 'num'
      ? r.cells.find(c => Number.isFinite(num(c)))
      : r.cells.find(c => c != null && c !== '');
    const value = parse === 'num' ? num(raw) : (raw == null ? '' : String(raw).trim());
    resolution.push({ kind: 'kv', field: fieldKey, sheet: sheetKey, matched: r.key, confidence: +r.score.toFixed(2) });
    if (r.key && r.score < MATCH_STRONG) warnings.push(`"${fieldKey}" matched loosely to "${r.key}" (${(r.score * 100) | 0}%) — verify the figure`);
    return value;
  }

  // ── currency (ignore the stale "USD thousands" subtitle enSights sometimes prints) ──
  const currency = String(kv(reqKV, 'request', 'displayCurrency', REQUEST_FIELDS.displayCurrency)).toUpperCase();
  A('currency is ILS', currency === 'ILS', `Display Currency = "${currency || '(none)'}"`);

  // ── 800-hour low-voltage use case (matched flexibly) ──
  const useCaseRaw = kv(reqKV, 'request', 'useCase', REQUEST_FIELDS.useCase);
  const uc = canon(useCaseRaw);
  A('use case is 800-hour low voltage', /800/.test(uc) && /low voltage/.test(uc), `Use Case = "${useCaseRaw}"`);

  // ── project / inputs ──
  const pvKw = kv(reqKV, 'request', 'pvKw', REQUEST_FIELDS.pvKw, 'num');
  const storageKw = kv(reqKV, 'request', 'storageKw', REQUEST_FIELDS.storageKw, 'num');
  const acKw = kv(reqKV, 'request', 'acKw', REQUEST_FIELDS.acKw, 'num'); // AC interconnection capacity (displayed as "הספק AC")
  const batteryCost = kv(reqKV, 'request', 'batteryCost', REQUEST_FIELDS.batteryCost, 'num');
  const pvCostPerKwp = kv(reqKV, 'request', 'pvCostPerKwp', REQUEST_FIELDS.pvCostPerKwp, 'num');
  const balanceOfPlantCost = kv(reqKV, 'request', 'balanceOfPlantCost', REQUEST_FIELDS.balanceOfPlantCost, 'num');
  const workbookLoanRepaymentYears = kv(reqKV, 'request', 'loanTerm', REQUEST_FIELDS.loanTerm, 'num');

  // ── capex (Metrics sheet is authoritative for costs) ──
  const totalProjectCost = kv(metKV, 'metrics', 'totalProjectCost', METRICS_FIELDS.totalProjectCost, 'num');
  const pvCost = kv(metKV, 'metrics', 'pvCost', METRICS_FIELDS.pvCost, 'num');
  const storageCost = kv(metKV, 'metrics', 'storageCost', METRICS_FIELDS.storageCost, 'num');
  const storageKwh = (Number.isFinite(storageCost) && batteryCost > 0) ? Math.round(storageCost / batteryCost) : NaN;

  // ── metrics ──
  const npv = kv(metKV, 'metrics', 'npv', METRICS_FIELDS.npv, 'num');
  let irr = kv(metKV, 'metrics', 'irr', METRICS_FIELDS.irr, 'num');
  // IRR resilience: accept a percent-formatted value ("28.3%" → 28.3) and normalize to a fraction.
  if (Number.isFinite(irr) && irr > 1.5) { warnings.push(`IRR looked like a percent (${irr}) — normalized to a fraction`); irr = irr / 100; }
  const paybackYears = kv(metKV, 'metrics', 'paybackYears', METRICS_FIELDS.paybackYears, 'num');
  const profitabilityIndex = kv(metKV, 'metrics', 'profitabilityIndex', METRICS_FIELDS.profitabilityIndex, 'num');
  const periodsAnalyzed = kv(metKV, 'metrics', 'periodsAnalyzed', METRICS_FIELDS.periodsAnalyzed, 'num');

  // ── project horizon (dynamic; both data sheets must agree, cross-checked vs Metrics) ──
  const horizonRev = countPeriodYears(SH.revenues);
  const horizonCf = countPeriodYears(SH.cashflow);
  const horizon = horizonRev || horizonCf;

  // ── horizon-length arrays (block-aware, fuzzy row/block labels) ──
  const arrOut = {};
  for (const field of Object.keys(ARRAY_SPECS)) {
    const spec = ARRAY_SPECS[field];
    const rows = spec.sheet === 'rev' ? SH.revenues : SH.cashflow;
    const found = rowFind(rows, spec.row, spec.block);
    resolution.push({ kind: 'array', field, sheet: spec.sheet, matched: found ? found.label : null, block: found ? found.block : null, confidence: found ? +found.score.toFixed(2) : 0 });
    if (found && found.score < MATCH_STRONG) warnings.push(`array "${field}" matched loosely to "${found.label}" (${(found.score * 100) | 0}%) — verify`);
    arrOut[field] = found ? found.values.slice(0, horizon) : null;
  }
  const { revenuesBaseline: revBaseline, revenuesOptimized: revOptimized, lowVoltageBonus: lvBonus,
    operationalProfit, cfads, freeCashFlow, cumulativeCashFlow } = arrOut;

  // ── assertions: structure + ALGEBRAIC GUARDRAILS (these catch any mis-resolved cell) ──
  A('Total Project Cost present', Number.isFinite(totalProjectCost) && totalProjectCost > 0, String(totalProjectCost));
  // PV cost identity (skip the product when there is no PV expansion: pvKw 0 ⇒ pvCost ≈ 0).
  A('PV cost = additional kWp × cost/kWp',
    pvKw === 0 ? Math.abs(pvCost || 0) < 1 : Math.abs(pvKw * pvCostPerKwp - pvCost) < 1,
    `${pvKw}×${pvCostPerKwp} vs ${pvCost}`);
  A('storage cost = kWh × battery cost', Math.abs(storageKwh * batteryCost - storageCost) < batteryCost, `${storageKwh}×${batteryCost} vs ${storageCost}`);
  A('capex components sum to total', Math.abs(pvCost + storageCost + balanceOfPlantCost - totalProjectCost) <= ROUND_TOL, `${pvCost}+${storageCost}+${balanceOfPlantCost} vs ${totalProjectCost}`);
  A('project horizon detected', horizon >= HORIZON_MIN && horizon <= HORIZON_MAX, `Revenues=${horizonRev}, CashFlow=${horizonCf}`);
  A('Revenues and Cash Flow horizons agree', horizonRev > 0 && horizonRev === horizonCf, `${horizonRev} vs ${horizonCf}`);
  if (Number.isFinite(periodsAnalyzed))
    A('horizon matches Metrics "Periods analyzed"', periodsAnalyzed === horizon, `${periodsAnalyzed} vs ${horizon}`);
  for (const [nm, ar] of [['revBaseline', revBaseline], ['revOptimized', revOptimized], ['lvBonus', lvBonus], ['operationalProfit', operationalProfit], ['cfads', cfads], ['freeCashFlow', freeCashFlow], ['cumulativeCashFlow', cumulativeCashFlow]]) {
    A(`${nm} is ${horizon} finite values`, Array.isArray(ar) && ar.length === horizon && ar.every(Number.isFinite));
  }
  A('Low Voltage Bonus year1 > 0', Array.isArray(lvBonus) && lvBonus[0] > 0, lvBonus ? String(lvBonus[0]) : 'missing');
  for (const [nm, v] of [['npv', npv], ['irr', irr], ['paybackYears', paybackYears], ['pvKw', pvKw], ['storageKw', storageKw]]) {
    A(`${nm} is a valid number`, Number.isFinite(v), String(v));
  }

  // ── financing defaults (canonical, signed; the customer widget is illustrative only) ──
  // Default term = ceil(paybackYears) + 1 (a one-year buffer over the investment payback, rounded
  // up to whole years). Default LTV/interest are product constants. workbookLoanRepaymentYears is
  // still captured from the workbook (reference only; no longer drives the term).
  A('workbook loan repayment duration present', Number.isFinite(workbookLoanRepaymentYears) && workbookLoanRepaymentYears > 0, String(workbookLoanRepaymentYears));
  const defaultLtvPct = V.DEFAULT_LTV_PCT;
  const defaultInterestPct = V.DEFAULT_INTEREST_PCT;
  const defaultTermYears = Number.isFinite(paybackYears) ? V.expectedDefaultTermYears(paybackYears) : NaN;
  A('default financing term is a whole number', Number.isInteger(defaultTermYears), String(defaultTermYears));

  if (errors.length) {
    return { ok: false, state: null, report: { kpis: {
      totalProjectCost, irr, irrPct: Number.isFinite(irr) ? +(irr * 100).toFixed(1) : null,
      paybackYears, storageKwh, pvKw, storageKw, horizonYears: horizon,
      cumLast: Array.isArray(cumulativeCashFlow) ? cumulativeCashFlow[cumulativeCashFlow.length - 1] : NaN,
      workbookLoanRepaymentYears, defaultTermYears, defaultLtvPct, defaultInterestPct,
    }, assertions, errors, warnings, resolution } };
  }

  const fin = P.computeFinancing({ totalProjectCost, cfadsByYear: cfads, ltvPct: defaultLtvPct, annualInterestPct: defaultInterestPct, termYears: defaultTermYears });

  const state = {
    type: 'storage', quoteSchemaVersion: V.STORAGE_QUOTE_SCHEMA_VERSION,
    customer: Object.assign({ name: '', phone: '', address: '', city: '', date: '', note: '' }, customer || {}),
    source: {
      tool: 'enSights Storage Sizing Tool', workbookHash: workbookHash || '',
      extractorVersion: EXTRACTOR_VERSION, extractedAt: extractedAt || '',
      validationSummary: `${assertions.filter(a => a.pass).length}/${assertions.length} assertions passed`,
    },
    project: { pvKw, storageKw, storageKwh, acKw: Number.isFinite(acKw) ? acKw : null, currency: 'ILS' },
    capex: { totalProjectCost, pvCost, storageCost, balanceOfPlantCost, otherVisibleItems: [] },
    metrics: { npv, irr, paybackYears, profitabilityIndex: Number.isFinite(profitabilityIndex) ? profitabilityIndex : null },
    arrays20y: { revenuesBaseline: revBaseline, revenuesOptimized: revOptimized, lowVoltageBonus: lvBonus, operationalProfit, cfads, freeCashFlow, cumulativeCashFlow },
    financing: {
      defaultLtvPct, defaultInterestPct, defaultTermYears, workbookLoanRepaymentYears,
      assumptionsSource: 'enSights workbook',
      loanAmount: fin.loanAmount, equityAmount: fin.equityAmount, annualDebtPayment: fin.annualDebtPayment,
      dscrByYear: fin.dscrByYear, minDscr: fin.minDscr, equityPaybackYears: fin.equityPaybackYears,
    },
  };

  // Final structural validation (defense in depth). Customer name is NOT required here — it is
  // filled in the client-details form and applied just before save (the Worker enforces it then).
  const vr = V.validateStorageState(state, { requireCustomer: false });
  vr.errors.forEach(e => errors.push(e));
  vr.warnings.forEach(w => warnings.push(w));

  const kpis = {
    totalProjectCost, irr, irrPct: Number.isFinite(irr) ? +(irr * 100).toFixed(1) : null,
    paybackYears, npv, storageKwh, pvKw, storageKw,
    revBaselineY1: revBaseline && revBaseline[0], revOptimizedY1: revOptimized && revOptimized[0],
    lvBonusY1: lvBonus && lvBonus[0], horizonYears: horizon,
    cumLast: cumulativeCashFlow && cumulativeCashFlow[cumulativeCashFlow.length - 1],
    workbookLoanRepaymentYears, defaultTermYears, defaultLtvPct, defaultInterestPct,
  };
  return { ok: errors.length === 0, state: errors.length === 0 ? state : null, report: { kpis, assertions, errors, warnings, resolution } };
}

// ── SheetJS adapter ──
function parseWorkbook(XLSX, data /* ArrayBuffer|Buffer */) {
  const wb = XLSX.read(data, { type: typeof Buffer !== 'undefined' && data instanceof Buffer ? 'buffer' : 'array' });
  const sheets = {};
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
  }
  return sheets;
}

const api = {
  EXTRACTOR_VERSION, extractStorageState, parseWorkbook,
  // matching primitives (exported for tests / reuse)
  num, canon, sim, resolveSheet, kvEntries, kvFind, rowFind, countPeriodYears,
  REQUEST_FIELDS, METRICS_FIELDS, ARRAY_SPECS, SHEET_ALIASES,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StorageExtract = api;
})();
