/**
 * storage-quote/storage-extract.js — enSights "Storage Sizing Tool" XLSX → storage state.
 *
 * AUTHORING-ONLY. Runs in the salesperson's browser (SheetJS) and in Node tests. NEVER shipped
 * to the customer page. Faithful port of the Python extraction spec
 * (CLAUDE_CODE_PROMPT_storage_quote_pipeline.md): label-scanning (not fixed coordinates),
 * block-aware row lookup (the "Total"/"Low Voltage Bonus" labels repeat across the baseline and
 * optimized blocks), assertions that FAIL LOUDLY, and ILS enforcement (the "USD thousands"
 * subtitle is a stale enSights string and is ignored).
 *
 * Pure core (`extractStorageState`) takes a {sheetName: rows2D} map so it is engine-agnostic and
 * unit-testable. `parseWorkbook` is the thin SheetJS adapter. The 8760-hour timeseries
 * ('Optimal Storage Use') is intentionally NOT read.
 */
// Wrapped in an IIFE so top-level names (api, ROUND_TOL, V, P, num, …) don't collide with the
// sibling storage modules when the authoring page loads them as plain <script>s in one scope.
(function () {
'use strict';

const EXTRACTOR_VERSION = 'storage-extract@1';
const ROUND_TOL = 2;

const V = (typeof module !== 'undefined' && module.exports)
  ? require('./storage-validate.js') : globalThis.StorageValidate;
const P = (typeof module !== 'undefined' && module.exports)
  ? require('./storage-public.js') : globalThis.StoragePublic;

// ── small parsers ──
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }
  return NaN;
}
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

// Two-column key→value scan (Request / Metrics). First occurrence wins; labels trimmed.
function scanKV(rows) {
  const map = {};
  for (const r of rows) {
    if (!r) continue;
    const k = r[0];
    if (typeof k === 'string' && k.trim() && r[1] != null) {
      const key = k.trim();
      if (!(key in map)) map[key] = r[1];
    }
  }
  return map;
}
function kvGet(map, label) {
  const want = norm(label);
  for (const k of Object.keys(map)) if (norm(k) === want) return map[k];
  return undefined;
}

// Find a labeled data row that lives UNDER a given block header (block-aware; handles the
// repeated "Total" / "Low Voltage Bonus" labels). Returns the 20 data columns (B..U).
function rowInBlock(rows, blockLabel, rowLabel) {
  const wantBlock = norm(blockLabel), wantRow = norm(rowLabel);
  let inBlock = blockLabel == null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const c0 = norm(r[0]);
    if (!inBlock) { if (c0 === wantBlock) inBlock = true; continue; }
    if (c0 === wantRow) return r.slice(1, 21).map(num);
    // stop if we hit the NEXT block header (a non-empty label with an empty value col after data)
  }
  return null;
}
function arr20(rows, blockLabel, rowLabel) {
  const a = rowInBlock(rows, blockLabel, rowLabel);
  if (!a) return null;
  const out = a.slice(0, 20);
  while (out.length < 20) out.push(NaN);
  return out;
}

/**
 * extractStorageState({ sheets, workbookHash, extractedAt, customer })
 *   sheets: { 'Request':rows2D, 'Metrics':rows2D, 'Revenues':rows2D, 'Cash Flow & Debt Service':rows2D }
 * Returns { ok, state, report:{ kpis, assertions, errors, warnings } }.
 */
function extractStorageState({ sheets, workbookHash, extractedAt, customer }) {
  const errors = [];
  const warnings = [];
  const assertions = [];
  const A = (name, cond, detail) => { assertions.push({ name, pass: !!cond, detail: detail || '' }); if (!cond) errors.push(`assertion failed: ${name}${detail ? ' — ' + detail : ''}`); };

  const need = ['Request', 'Metrics', 'Revenues', 'Cash Flow & Debt Service'];
  for (const n of need) if (!sheets[n]) errors.push(`missing sheet: ${n}`);
  if (errors.length) return { ok: false, state: null, report: { kpis: {}, assertions, errors, warnings } };

  const req = scanKV(sheets['Request']);
  const met = scanKV(sheets['Metrics']);

  // ── currency (ignore stale "USD thousands" subtitle) ──
  const currency = String(kvGet(req, 'Display Currency') || '').trim().toUpperCase();
  A('currency is ILS', currency === 'ILS', `Display Currency = "${currency || '(none)'}"`);

  // ── 800-hour use case ──
  const useCase = String(kvGet(req, 'Use Case') || '').toLowerCase();
  A('use case is 800-hour low voltage', useCase.endsWith('800hours_low_voltage'), `Use Case = "${useCase}"`);

  // ── project ──
  const pvKw = num(kvGet(req, 'Additional DC Capacity'));
  const storageKw = num(kvGet(req, 'Power Rating'));
  const batteryCost = num(kvGet(req, 'Battery Cost'));
  const pvCostPerKwp = num(kvGet(req, 'PV Cost per kWp'));

  // ── capex (Metrics is authoritative for costs) ──
  const totalProjectCost = num(kvGet(met, 'Total Project Cost'));
  const pvCost = num(kvGet(met, 'PV System Cost'));
  const storageCost = num(kvGet(met, 'Storage System Cost'));
  const balanceOfPlantCost = num(kvGet(req, 'Additional CapEx'));
  const storageKwh = (Number.isFinite(storageCost) && batteryCost > 0) ? Math.round(storageCost / batteryCost) : NaN;

  // ── metrics ──
  const npv = num(kvGet(met, 'Project NPV'));
  const irr = num(kvGet(met, 'Project IRR'));
  const paybackYears = num(kvGet(met, 'Payback (years)'));
  const profitabilityIndex = num(kvGet(met, 'Profitability Index'));

  // ── 20-year arrays (block-aware) ──
  const revBaseline = arr20(sheets['Revenues'], 'Baseline Revenues (Without Storage)', 'Total');
  const revOptimized = arr20(sheets['Revenues'], 'Optimized Revenues (With Storage)', 'Total');
  const lvBonus = arr20(sheets['Revenues'], 'Optimized Revenues (With Storage)', 'Low Voltage Bonus');
  const cf = sheets['Cash Flow & Debt Service'];
  const operationalProfit = arr20(cf, null, 'Operational Profit');
  const cfads = arr20(cf, null, 'CFADS');
  const freeCashFlow = arr20(cf, null, 'Free Cash Flow');
  const cumulativeCashFlow = arr20(cf, null, 'Cumulative Cash Flow');

  // ── assertions (mirror the spec) ──
  A('Total Project Cost present', Number.isFinite(totalProjectCost) && totalProjectCost > 0, String(totalProjectCost));
  A('PV cost = additional kWp × cost/kWp', Math.abs(pvKw * pvCostPerKwp - pvCost) < 1, `${pvKw}×${pvCostPerKwp} vs ${pvCost}`);
  A('storage cost = kWh × battery cost', Math.abs(storageKwh * batteryCost - storageCost) < batteryCost, `${storageKwh}×${batteryCost} vs ${storageCost}`);
  A('capex components sum to total', Math.abs(pvCost + storageCost + balanceOfPlantCost - totalProjectCost) <= ROUND_TOL, `${pvCost}+${storageCost}+${balanceOfPlantCost} vs ${totalProjectCost}`);
  for (const [nm, ar] of [['revBaseline', revBaseline], ['revOptimized', revOptimized], ['lvBonus', lvBonus], ['operationalProfit', operationalProfit], ['cfads', cfads], ['freeCashFlow', freeCashFlow], ['cumulativeCashFlow', cumulativeCashFlow]]) {
    A(`${nm} is 20 finite values`, Array.isArray(ar) && ar.length === 20 && ar.every(Number.isFinite));
  }
  A('Low Voltage Bonus year1 > 0', Array.isArray(lvBonus) && lvBonus[0] > 0, lvBonus ? String(lvBonus[0]) : 'missing');
  for (const [nm, v] of [['npv', npv], ['irr', irr], ['paybackYears', paybackYears], ['pvKw', pvKw], ['storageKw', storageKw]]) {
    A(`${nm} is a valid number`, Number.isFinite(v), String(v));
  }

  // ── financing (canonical illustrative scenario; slider is illustrative only) ──
  const interestRate = num(kvGet(req, 'Interest Rate'));
  const termYears = Math.round(num(kvGet(req, 'Loan Term')));
  const canonicalLtv = 0.8;

  if (errors.length) {
    return { ok: false, state: null, report: { kpis: { totalProjectCost, irr, paybackYears, storageKwh }, assertions, errors, warnings } };
  }

  const fin = P.computeFinancing(totalProjectCost, cfads, canonicalLtv, interestRate, termYears);

  const state = {
    type: 'storage', quoteSchemaVersion: V.STORAGE_QUOTE_SCHEMA_VERSION,
    customer: Object.assign({ name: '', phone: '', address: '', city: '', date: '', note: '' }, customer || {}),
    source: {
      tool: 'enSights Storage Sizing Tool', workbookHash: workbookHash || '',
      extractorVersion: EXTRACTOR_VERSION, extractedAt: extractedAt || '',
      validationSummary: `${assertions.filter(a => a.pass).length}/${assertions.length} assertions passed`,
    },
    project: { pvKw, storageKw, storageKwh, currency: 'ILS' },
    capex: { totalProjectCost, pvCost, storageCost, balanceOfPlantCost, otherVisibleItems: [] },
    metrics: { npv, irr, paybackYears, profitabilityIndex: Number.isFinite(profitabilityIndex) ? profitabilityIndex : null },
    arrays20y: { revenuesBaseline: revBaseline, revenuesOptimized: revOptimized, lowVoltageBonus: lvBonus, operationalProfit, cfads, freeCashFlow, cumulativeCashFlow },
    financing: { canonicalLtv, interestRate, termYears, annualDebtPayment: fin.annualDebtPayment, dscrByYear: fin.dscrByYear, minDscr: fin.minDscr, equityPayback: fin.equityPayback },
  };

  // Final structural validation (defense in depth).
  const vr = V.validateStorageState(state);
  vr.errors.forEach(e => errors.push(e));
  vr.warnings.forEach(w => warnings.push(w));

  const kpis = {
    totalProjectCost, irr, irrPct: Number.isFinite(irr) ? +(irr * 100).toFixed(1) : null,
    paybackYears, npv, storageKwh, pvKw, storageKw,
    revBaselineY1: revBaseline && revBaseline[0], revOptimizedY1: revOptimized && revOptimized[0],
    lvBonusY1: lvBonus && lvBonus[0], cum20: cumulativeCashFlow && cumulativeCashFlow[19],
  };
  return { ok: errors.length === 0, state: errors.length === 0 ? state : null, report: { kpis, assertions, errors, warnings } };
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

const api = { EXTRACTOR_VERSION, extractStorageState, parseWorkbook, num, scanKV, kvGet, arr20 };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StorageExtract = api;
})();
