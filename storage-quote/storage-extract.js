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
const KWP_TOL = 0.5;          // kWp tolerance — the Summary sheet prints whole kWp, the cost line is exact
const KWH_TOL = 1;            // kWh tolerance for the Summary-vs-cost storage capacity cross-check
const KPI_BAND_SCAN_ROWS = 40, KPI_BAND_LOOKAHEAD = 3; // Summary KPI band search window

const V = (typeof module !== 'undefined' && module.exports)
  ? require('./storage-validate.js') : globalThis.StorageValidate;
const P = (typeof module !== 'undefined' && module.exports)
  ? require('./storage-public.js') : globalThis.StoragePublic;
// Canonical chart series (compact hourly/daily reduction of the 8,760-row dispatch sheet).
const CS = (typeof module !== 'undefined' && module.exports)
  ? require('./storage-chart-series.js') : globalThis.StorageChartSeries;

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
// `deny` (optional) is a list of canonical labels this field must never resolve to; candidates
// matching one exactly are skipped before scoring, so a denied label cannot outrank a real one.
function kvFind(entries, aliases, deny) {
  const denied = deny && deny.length ? new Set(deny.map(canon)) : null;
  let best = null, bestS = 0;
  for (const e of entries) {
    if (denied && denied.has(canon(e.key))) continue;
    const s = sim(e.key, aliases); if (s > bestS) { bestS = s; best = e; } if (bestS === 1) break;
  }
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

// ── Summary-sheet KPI band reader. The Summary sheet lays its headline figures out as a LABEL row
//    ("ADDITIONAL PV", "BATTERY CAPACITY") with the value in the cell DIRECTLY BELOW, in the same
//    column — not as key→value rows, so kvEntries cannot see them. This is the ONLY place the
//    workbook prints the sizes the optimizer actually chose (see the auto-optimize note in
//    extractStorageState), so it has to be read.
//    Returns { value, raw, label, row, col } — value NaN when the KPI is absent or "N/A".
function readKpiBand(rows, aliases, unitRe) {
  const empty = { value: NaN, raw: null, label: null, row: -1, col: -1 };
  if (!Array.isArray(rows)) return empty;
  const scan = Math.min(rows.length, KPI_BAND_SCAN_ROWS);
  for (let i = 0; i < scan; i++) {
    const r = rows[i]; if (!Array.isArray(r)) continue;
    for (let c = 0; c < r.length; c++) {
      if (typeof r[c] !== 'string' || !r[c].trim()) continue;
      if (sim(r[c], aliases) < MATCH_STRONG) continue;
      // The value sits in one of the next few rows (a spacer row is possible).
      for (let k = 1; k <= KPI_BAND_LOOKAHEAD && i + k < rows.length; k++) {
        const rv = rows[i + k]; if (!Array.isArray(rv)) continue;
        const cell = rv[c];
        if (cell == null || cell === '') continue;
        const raw = String(cell).replace(/\s+/g, ' ').trim();
        // Unit guard: older workbooks print BATTERY CAPACITY as "54 kW, 4 hours" (power, not
        // energy). Without this the reader would silently return kW where kWh is expected.
        const value = (unitRe && !unitRe.test(raw)) ? NaN : num(raw);
        return { value, raw, label: r[c].trim(), row: i, col: c };
      }
    }
  }
  return empty;
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

// Aggregate the ~8,760-hour "Optimal Storage Use" sheet into YEAR-1 grid totals WITHOUT storing any
// raw hourly data. Columns are found by header ("Grid Import", "Grid Export", "Import Rate"), so a
// column reorder is tolerated. Returns null when the sheet / required columns are absent.
function computeGridAggregates(rows) {
  if (!Array.isArray(rows)) return null;
  let hdr = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; if (!Array.isArray(r)) continue;
    if (r.some(c => canon(c).indexOf('grid import') === 0)) { hdr = i; break; }
  }
  if (hdr < 0) return null;
  const head = rows[hdr].map(canon);
  const colOf = (needle) => head.findIndex(h => h.indexOf(needle) === 0);
  const ci = colOf('grid import'), ce = colOf('grid export'), cr = colOf('import rate');
  if (ci < 0 || ce < 0) return null;
  let imp = 0, exp = 0, cost = 0, hours = 0;
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i]; if (!Array.isArray(r)) continue;
    const gi = num(r[ci]); if (!Number.isFinite(gi)) continue;
    const ge = num(r[ce]); const ir = cr >= 0 ? num(r[cr]) : NaN;
    imp += gi; exp += Number.isFinite(ge) ? ge : 0; cost += gi * (Number.isFinite(ir) ? ir : 0); hours++;
  }
  return hours ? { gridImportKwh: imp, gridExportKwh: exp, gridPurchaseCostY1: cost, hours } : null;
}

// ── FIELD SPECS — the single place to extend when enSights changes a label. Order aliases most-
//    specific first. Adding a synonym here is the entire cost of absorbing a future rename. ──
const REQUEST_FIELDS = {
  displayCurrency:    ['display currency', 'currency'],
  useCase:            ['use case', 'program', 'tariff program'],
  // PV capacity comes in TWO distinct flavours and they must never be confused (see the
  // auto-optimize note in extractStorageState): what the deal BUYS vs what already stands on site.
  additionalPvKw:     ['additional dc capacity', 'additional pv capacity', 'dc capacity added', 'pv capacity added', 'additional solar capacity'],
  existingPvKw:       ['dc capacity', 'pv capacity', 'existing dc capacity', 'existing pv capacity'],
  storageKw:          ['power rating', 'storage power rating', 'bess power rating', 'storage power', 'battery power'],
  storageDurationH:   ['duration', 'storage duration', 'discharge duration'],
  acKw:               ['ac capacity', 'ac power rating', 'ac power', 'inverter ac capacity'],
  batteryCost:        ['battery cost', 'storage cost per kwh', 'battery cost per kwh', 'cell cost'],
  pvCostPerKwp:       ['pv cost per kwp', 'pv cost', 'solar cost per kwp', 'pv capex per kwp'],
  balanceOfPlantCost: ['additional capex', 'balance of plant', 'bop cost', 'additional capital expenditure', 'other capex'],
  loanTerm:           ['loan term', 'loan duration', 'loan repayment term', 'loan repayment period', 'debt term'],
  // ── optional enrichment fields (owner-selected; absent → simply not displayed) ──
  cabinetKwh:         ['cabinet capacity', 'nameplate capacity', 'rated capacity', 'battery capacity'],
  couplingType:       ['coupling type', 'coupling'],
  gridConnectionKw:   ['grid connection limit', 'grid connection', 'interconnection limit', 'grid limit'],
  annualSunHours:     ['annual sun hours', 'sun hours', 'solar hours', 'peak sun hours'],
  feedInTariff:       ['feed-in tariff', 'feed in tariff', 'fit', 'export tariff'],
  roundTripEff:       ['round-trip efficiency', 'round trip efficiency', 'rte'],
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
// DENY LIST — labels a field must NEVER resolve to, matched on exact canonical equality. Fuzzy
// matching alone cannot separate these: "Max Additional DC Capacity" (the optimizer's SEARCH
// CEILING, not its answer) scores 0.85 against the additionalPvKw aliases and would win outright,
// and "DC Capacity" (the EXISTING array) scores 0.75 and wins whenever no additional row exists.
// Both are plausible-looking wrong numbers, which is exactly what this extractor must not emit.
const FIELD_DENY = {
  additionalPvKw: ['dc capacity', 'ac capacity', 'max additional dc capacity', 'maximum additional dc capacity', 'max additional pv capacity'],
  existingPvKw:   ['additional dc capacity', 'max additional dc capacity', 'maximum additional dc capacity', 'additional ac capacity', 'cabinet capacity'],
};
// Summary-sheet KPI band: the ONLY place the optimizer's chosen sizes are printed.
// unit — a regex the raw cell must match, guarding against a same-labelled cell in other units.
const SUMMARY_KPIS = {
  additionalPvKw:  { aliases: ['additional pv', 'additional solar', 'additional pv capacity', 'additional dc capacity'], unit: /kwp/i },
  storageKwh:      { aliases: ['battery capacity', 'storage capacity', 'battery energy capacity'], unit: /kwh/i },
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
// Resolved when present, never asserted — pre-2026 workbooks ship without it and must keep working.
const OPTIONAL_SHEET_ALIASES = {
  summary: ['summary', 'project summary', 'executive summary', 'overview'],
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

  // Optional sheets: resolved when present, never asserted (older workbooks lack them).
  for (const key of Object.keys(OPTIONAL_SHEET_ALIASES)) {
    const r = resolveSheet(sheets, OPTIONAL_SHEET_ALIASES[key]);
    SH[key] = r.name ? sheets[r.name] : null;
    resolution.push({ kind: 'sheet', field: key, matched: r.name, confidence: +r.score.toFixed(2), optional: true });
  }

  const reqKV = kvEntries(SH.request);
  const metKV = kvEntries(SH.metrics);

  // KV field resolver: picks the right cell (first numeric for a number field, first non-empty for
  // a string), records diagnostics, and warns on a loose label match.
  // kvInfo also reports WHICH label matched (null = the workbook has no such row) — callers that
  // must distinguish "absent" from "present but unparsable" use it.
  function kvInfo(entries, sheetKey, fieldKey, aliases, parse) {
    const r = kvFind(entries, aliases, FIELD_DENY[fieldKey]);
    const raw = parse === 'num'
      ? r.cells.find(c => Number.isFinite(num(c)))
      : r.cells.find(c => c != null && c !== '');
    const value = parse === 'num' ? num(raw) : (raw == null ? '' : String(raw).trim());
    resolution.push({ kind: 'kv', field: fieldKey, sheet: sheetKey, matched: r.key, confidence: +r.score.toFixed(2) });
    if (r.key && r.score < MATCH_STRONG) warnings.push(`"${fieldKey}" matched loosely to "${r.key}" (${(r.score * 100) | 0}%) — verify the figure`);
    return { value, key: r.key, score: r.score };
  }
  function kv(entries, sheetKey, fieldKey, aliases, parse) {
    return kvInfo(entries, sheetKey, fieldKey, aliases, parse).value;
  }
  // Summary KPI band resolver, with the same diagnostics as kv().
  function summaryKpi(fieldKey) {
    const spec = SUMMARY_KPIS[fieldKey];
    const r = readKpiBand(SH.summary, spec.aliases, spec.unit);
    resolution.push({ kind: 'kpi', field: fieldKey, sheet: 'summary', matched: r.label, raw: r.raw, confidence: r.label ? 1 : 0 });
    return r;
  }

  // ── currency (ignore the stale "USD thousands" subtitle enSights sometimes prints) ──
  const currency = String(kv(reqKV, 'request', 'displayCurrency', REQUEST_FIELDS.displayCurrency)).toUpperCase();
  A('currency is ILS', currency === 'ILS', `Display Currency = "${currency || '(none)'}"`);

  // ── 800-hour low-voltage use case (matched flexibly) ──
  const useCaseRaw = kv(reqKV, 'request', 'useCase', REQUEST_FIELDS.useCase);
  const uc = canon(useCaseRaw);
  A('use case is 800-hour low voltage', /800/.test(uc) && /low voltage/.test(uc), `Use Case = "${useCaseRaw}"`);

  // ── project / inputs ──
  // AUTO-OPTIMIZE. When the workbook runs with "Auto-optimize Solar/Storage = Yes", the Request
  // sheet holds only the SEED the operator typed — enSights omits the "Additional DC Capacity" row
  // entirely (or prints "Max Additional DC Capacity", the optimizer's search ceiling) and leaves
  // "Power Rating"/"Cabinet Capacity" describing ONE cabinet. The sizes the optimizer actually
  // chose are printed on the Summary sheet KPI band and nowhere else. So Request is the seed,
  // Summary is the answer, and Metrics (cost ÷ rate) is the independent arbiter between them.
  const requestPowerRatingKw = kv(reqKV, 'request', 'storageKw', REQUEST_FIELDS.storageKw, 'num');
  const storageDurationH = kv(reqKV, 'request', 'storageDurationH', REQUEST_FIELDS.storageDurationH, 'num');
  const acKw = kv(reqKV, 'request', 'acKw', REQUEST_FIELDS.acKw, 'num'); // AC interconnection capacity (displayed as "הספק AC")
  const batteryCost = kv(reqKV, 'request', 'batteryCost', REQUEST_FIELDS.batteryCost, 'num');
  const pvCostPerKwp = kv(reqKV, 'request', 'pvCostPerKwp', REQUEST_FIELDS.pvCostPerKwp, 'num');
  const balanceOfPlantCost = kv(reqKV, 'request', 'balanceOfPlantCost', REQUEST_FIELDS.balanceOfPlantCost, 'num');
  const workbookLoanRepaymentYears = kv(reqKV, 'request', 'loanTerm', REQUEST_FIELDS.loanTerm, 'num');

  // ── optional enrichment inputs (owner-selected extras; null when absent) ──
  const cabinetKwh = kv(reqKV, 'request', 'cabinetKwh', REQUEST_FIELDS.cabinetKwh, 'num');
  const couplingType = kv(reqKV, 'request', 'couplingType', REQUEST_FIELDS.couplingType); // string ("AC"/"DC")
  const gridConnectionKw = kv(reqKV, 'request', 'gridConnectionKw', REQUEST_FIELDS.gridConnectionKw, 'num');
  const annualSunHours = kv(reqKV, 'request', 'annualSunHours', REQUEST_FIELDS.annualSunHours, 'num');
  const feedInTariff = kv(reqKV, 'request', 'feedInTariff', REQUEST_FIELDS.feedInTariff, 'num');
  const roundTripEff = kv(reqKV, 'request', 'roundTripEff', REQUEST_FIELDS.roundTripEff, 'num');
  // "Annual Degradation Rate" appears twice (PV ~0.2% and battery ~2%); take the larger (battery) —
  // it dominates the storage asset story and matches the owner's expectation.
  const degradationPct = (function () {
    const ds = reqKV.filter(e => sim(e.key, ['annual degradation rate', 'degradation rate', 'degradation']) >= 0.85)
      .map(e => num(e.cells.find(c => Number.isFinite(num(c))))).filter(Number.isFinite);
    return ds.length ? Math.max.apply(null, ds) : NaN;
  })();

  // ── capex (Metrics sheet is authoritative for costs) ──
  const totalProjectCost = kv(metKV, 'metrics', 'totalProjectCost', METRICS_FIELDS.totalProjectCost, 'num');
  const storageCost = kv(metKV, 'metrics', 'storageCost', METRICS_FIELDS.storageCost, 'num');
  // STORAGE-ONLY RETROFIT: when no PV is added to the deal, enSights prints NO PV cost line under
  // "Project Costs" (the Request sheet still reports the site's EXISTING DC capacity and a PV
  // cost/kWp rate — neither is purchased here). Only then is the component derived as the CapEx
  // residual; the guardrail assertion below still has to hold, so a genuinely mis-resolved PV row
  // cannot hide behind the residual.
  const pvCostInfo = kvInfo(metKV, 'metrics', 'pvCost', METRICS_FIELDS.pvCost, 'num');
  const pvCostDerived = !pvCostInfo.key;
  const pvCostResidual = totalProjectCost - storageCost - balanceOfPlantCost;
  const pvCost = !pvCostDerived ? pvCostInfo.value
    : (Math.abs(pvCostResidual) <= ROUND_TOL ? 0 : pvCostResidual);
  if (pvCostDerived) {
    warnings.push(`no PV cost line in Metrics — derived from the CapEx residual (₪${Math.round(pvCost)}); treated as a storage-only project when 0`);
  }
  const storageKwh = (Number.isFinite(storageCost) && batteryCost > 0) ? Math.round(storageCost / batteryCost) : NaN;
  const hasPvPurchase = Number.isFinite(pvCost) && pvCost > ROUND_TOL;
  const summaryStorageKpi = summaryKpi('storageKwh');

  // ── PV capacity (resolved AFTER capex — which flavour is wanted depends on whether PV is bought)
  //    • PV is bought  → the ADDITIONAL kWp: Summary KPI first, Request "Additional DC Capacity"
  //      as the fallback. Cross-checked below against pvCost ÷ pvCostPerKwp.
  //    • storage-only  → the site's EXISTING array, which the document labels as such
  //      ("מערכת סולארית קיימת"). Nothing is purchased, so there is no cost identity to check.
  const summaryPvKpi = summaryKpi('additionalPvKw');
  const requestAdditionalPvKw = kv(reqKV, 'request', 'additionalPvKw', REQUEST_FIELDS.additionalPvKw, 'num');
  const additionalPvKw = Number.isFinite(summaryPvKpi.value) ? summaryPvKpi.value : requestAdditionalPvKw;
  if (Number.isFinite(summaryPvKpi.value) && Number.isFinite(requestAdditionalPvKw)
      && Math.abs(summaryPvKpi.value - requestAdditionalPvKw) > KWP_TOL) {
    warnings.push(`Summary reports ${summaryPvKpi.value} kWp additional PV but Request says ${requestAdditionalPvKw} kWp — using the Summary figure (the optimizer's result)`);
  }
  const existingPvKw = kv(reqKV, 'request', 'existingPvKw', REQUEST_FIELDS.existingPvKw, 'num');
  const pvKw = hasPvPurchase ? additionalPvKw
    : (Number.isFinite(existingPvKw) ? existingPvKw : additionalPvKw);

  // ── storage power. "Power Rating" is per-CABINET whenever the optimizer sized the bank, so it is
  //    only trustworthy once scaled by the cabinet count. Preference order:
  //      1. cabinets × Power Rating  — keeps the manufacturer's nameplate exact
  //      2. capacity ÷ duration      — when the bank is not a whole number of catalogued cabinets
  //      3. Power Rating as-is       — nothing else resolved; the assertion below is then skipped
  const cabinetCount = (Number.isFinite(cabinetKwh) && cabinetKwh > 0 && Number.isFinite(storageKwh))
    ? storageKwh / cabinetKwh : NaN;
  const wholeCabinets = Number.isFinite(cabinetCount) && Math.abs(cabinetCount - Math.round(cabinetCount)) < 0.02
    ? Math.round(cabinetCount) : NaN;
  const durationKw = (Number.isFinite(storageKwh) && storageDurationH > 0) ? storageKwh / storageDurationH : NaN;
  const storageKw = (Number.isFinite(wholeCabinets) && wholeCabinets > 0 && Number.isFinite(requestPowerRatingKw))
    ? requestPowerRatingKw * wholeCabinets
    // The duration quotient carries the workbook's rounding (943 kWh / 6.5 h = 145.08 kW); when it
    // lands on the Request's nameplate the bank was never scaled, so keep the clean nameplate.
    : (Number.isFinite(durationKw)
        ? (Number.isFinite(requestPowerRatingKw) && Math.abs(durationKw - requestPowerRatingKw) <= Math.max(1, durationKw * 0.05)
            ? requestPowerRatingKw : Math.round(durationKw * 10) / 10)
        : requestPowerRatingKw);
  if (Number.isFinite(storageKw) && Number.isFinite(requestPowerRatingKw) && storageKw !== requestPowerRatingKw) {
    warnings.push(`storage power scaled from the Request seed ${requestPowerRatingKw} kW to ${Math.round(storageKw)} kW for the ${storageKwh} kWh bank the workbook actually prices`);
  }

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

  // ── normalized peak-discharge (kWh/kW) — proves the 800h threshold ──
  const ndRow = rowFind(SH.revenues, ['normalized discharged energy', 'discharged energy', 'normalized discharge'], null);
  const normalizedDischargeKwhPerKw = (ndRow && Number.isFinite(ndRow.values[0])) ? ndRow.values[0] : NaN;

  // ── grid analysis (optional): split year-1 energy-sale revenue into solar-origin vs re-sold grid
  //    power, and surface the grid purchase cost. Aggregated from the hourly sheet; only a handful
  //    of scalars are stored (never the raw 8760 series). Absent/zero-export → left null (all-solar).
  const totalEnergySaleY1 = (Array.isArray(revOptimized) && Array.isArray(lvBonus)) ? (revOptimized[0] - lvBonus[0]) : NaN;
  const eta = (Number.isFinite(roundTripEff) && roundTripEff > 0 && roundTripEff <= 1) ? roundTripEff : 0.9;
  const optSheetName = resolveSheet(sheets, ['optimal storage use', 'hourly system operation', 'storage use', 'dispatch']).name;
  const agg = optSheetName ? computeGridAggregates(sheets[optSheetName]) : null;
  let gridAnalysis = null;
  if (agg && agg.gridExportKwh > 0 && Number.isFinite(totalEnergySaleY1) && totalEnergySaleY1 > 0) {
    const effectiveSaleRate = totalEnergySaleY1 / agg.gridExportKwh;
    const gridOriginExportKwh = agg.gridImportKwh * eta;
    const gridResaleRevenueY1 = Math.max(0, gridOriginExportKwh * effectiveSaleRate);
    const solarRevenueY1 = Math.max(0, totalEnergySaleY1 - gridResaleRevenueY1);
    gridAnalysis = {
      gridImportKwh: Math.round(agg.gridImportKwh),
      gridExportKwh: Math.round(agg.gridExportKwh),
      gridPurchaseCostY1: Math.round(agg.gridPurchaseCostY1),
      effectiveSaleRate: Math.round(effectiveSaleRate * 1000) / 1000,
      eta,
      totalEnergySaleY1: Math.round(totalEnergySaleY1),
      solarRevenueY1: Math.round(solarRevenueY1),
      gridResaleRevenueY1: Math.round(gridResaleRevenueY1),
      gridArbitrageNetY1: Math.round(gridResaleRevenueY1 - agg.gridPurchaseCostY1),
    };
  }

  // ── assertions: structure + ALGEBRAIC GUARDRAILS (these catch any mis-resolved cell) ──
  A('Total Project Cost present', Number.isFinite(totalProjectCost) && totalProjectCost > 0, String(totalProjectCost));
  // PV capacity identity — the guardrail that separates the deal's ADDITIONAL kWp from the site's
  // existing array or the optimizer's search ceiling. Two independent sources must agree: the
  // stated capacity (Summary KPI / Request) and the one implied by the Metrics cost line ÷ rate.
  // Compared in kWp rather than shekels because the workbook prints whole kWp while the cost line
  // is exact (51 kWp displayed for a 51.2 kWp array) — the tolerance absorbs that display rounding
  // and nothing more, so a 300-vs-375 mix-up still fails loudly.
  // Skipped for a storage-only retrofit (pvCost 0): nothing is bought, so there is no identity.
  const pvKwFromCost = (hasPvPurchase && pvCostPerKwp > 0) ? pvCost / pvCostPerKwp : NaN;
  A('additional kWp agrees with the PV cost line',
    !hasPvPurchase ? true
      : (Number.isFinite(pvKwFromCost) && Number.isFinite(additionalPvKw)
         && Math.abs(pvKwFromCost - additionalPvKw) <= Math.max(KWP_TOL, pvKwFromCost * 0.01)),
    `${additionalPvKw} kWp stated vs ${Number.isFinite(pvKwFromCost) ? Math.round(pvKwFromCost * 100) / 100 : NaN} kWp implied by ${pvCost}/${pvCostPerKwp}`);
  // Guardrail for the derived (residual) PV cost: a negative residual means a mis-resolved cost
  // cell, which the capex-sum identity below can no longer catch. A positive residual is a real PV
  // line under a different label and is validated by the kWp identity above.
  if (pvCostDerived) {
    A('derived PV cost is non-negative', pvCost >= 0, `residual ${pvCostResidual}`);
  }
  A('storage cost = kWh × battery cost', Math.abs(storageKwh * batteryCost - storageCost) < batteryCost, `${storageKwh}×${batteryCost} vs ${storageCost}`);
  // Independent confirmation of the cost-derived capacity against the figure the Summary prints.
  if (Number.isFinite(summaryStorageKpi.value)) {
    A('storage capacity matches the Summary sheet',
      Math.abs(summaryStorageKpi.value - storageKwh) <= Math.max(KWH_TOL, summaryStorageKpi.value * 0.01),
      `Summary ${summaryStorageKpi.value} kWh vs ${storageKwh} kWh from ${storageCost}/${batteryCost}`);
  }
  // Storage power vs capacity. Catches a per-cabinet Power Rating left paired with a multi-cabinet
  // bank (e.g. 130 kW against 1,305 kWh — a ten-hour battery that does not exist).
  if (storageDurationH > 0 && Number.isFinite(storageKwh)) {
    const expectedKw = storageKwh / storageDurationH;
    A('storage power is consistent with capacity and duration',
      Number.isFinite(storageKw) && Math.abs(storageKw - expectedKw) <= Math.max(1, expectedKw * 0.05),
      `${storageKw} kW vs ${Math.round(expectedKw * 10) / 10} kW (${storageKwh} kWh / ${storageDurationH}h)`);
  }
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
    project: {
      pvKw, storageKw, storageKwh, acKw: Number.isFinite(acKw) ? acKw : null, currency: 'ILS',
      // optional enrichment fields (owner-selected; null when the workbook lacks them)
      cabinetKwh: Number.isFinite(cabinetKwh) ? cabinetKwh : null,
      couplingType: couplingType || null,
      gridConnectionKw: Number.isFinite(gridConnectionKw) ? gridConnectionKw : null,
      annualSunHours: Number.isFinite(annualSunHours) ? annualSunHours : null,
      degradationPct: Number.isFinite(degradationPct) ? degradationPct : null,
      feedInTariff: Number.isFinite(feedInTariff) ? feedInTariff : null,
      normalizedDischargeKwhPerKw: Number.isFinite(normalizedDischargeKwhPerKw) ? normalizedDischargeKwhPerKw : null,
    },
    // Compact canonical chart series. The dispatch sheet itself is never stored — only one
    // representative day at hourly resolution plus one aggregate per calendar day, which is what
    // the charts are drawn from. Null when the workbook cannot supply it; the affected charts are
    // then simply absent rather than drawn from substitute data.
    chartSeries: (function () {
      try {
        const cs = CS.buildChartSeries({ sheets, storageKwh });
        (cs.warnings || []).forEach(w => warnings.push(w));
        return cs.ok ? cs.series : null;
      } catch (e) {
        warnings.push(`chart series derivation failed (${e.message}) — the daily charts are omitted`);
        return null;
      }
    })(),
    capex: { totalProjectCost, pvCost, storageCost, balanceOfPlantCost, otherVisibleItems: [] },
    metrics: { npv, irr, paybackYears, profitabilityIndex: Number.isFinite(profitabilityIndex) ? profitabilityIndex : null },
    arrays20y: { revenuesBaseline: revBaseline, revenuesOptimized: revOptimized, lowVoltageBonus: lvBonus, operationalProfit, cfads, freeCashFlow, cumulativeCashFlow },
    gridAnalysis, // null unless the hourly sheet yielded a solar-vs-grid split
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
  num, canon, sim, resolveSheet, kvEntries, kvFind, rowFind, readKpiBand, countPeriodYears,
  REQUEST_FIELDS, METRICS_FIELDS, ARRAY_SPECS, SHEET_ALIASES, OPTIONAL_SHEET_ALIASES,
  SUMMARY_KPIS, FIELD_DENY,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StorageExtract = api;
})();
