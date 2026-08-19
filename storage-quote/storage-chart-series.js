/**
 * storage-quote/storage-chart-series.js — derive the CANONICAL chart series from an enSights
 * workbook. AUTHORING-ONLY (browser + Node tests); never bundled into the Worker.
 *
 * The hourly "Optimal Storage Use" sheet holds ~8,760 rows. None of it is stored on the quote:
 * this module reduces it to the ~1,200 numbers the charts actually need — one representative day
 * at hourly resolution, plus one aggregate per calendar day — which is roughly two orders of
 * magnitude smaller than the chart rasters it replaces.
 *
 * SIGN CONVENTION (verified against the SoC column of a real workbook, not assumed):
 *   Storage (kWh) is written from the SYSTEM's perspective —
 *     NEGATIVE = the battery is CHARGING  (SoC rises)
 *     POSITIVE = the battery is DISCHARGING (SoC falls)
 *   Confirmed on 2024-08-08: hours 08:00–14:00 carry negative Storage while SoC climbs 0→100%,
 *   and the charge energy times sqrt(round-trip efficiency) equals the nameplate capacity exactly.
 *   Every derived series below preserves this convention.
 *
 * THE REPRESENTATIVE DAY IS NOT CHOSEN BY US. enSights prints the day it charted on the Summary
 * sheet ("ENERGY FLOW ANALYSIS ON HISTORICAL DATA - 2024-08-08"); we read that date and chart the
 * same one. If the workbook does not state it, the daily charts are omitted rather than drawn for
 * an arbitrary day that would not match the optimizer's own figure.
 */
'use strict';

/* Wrapped in an IIFE so top-level names (api, esc, num, …) don't collide with the sibling modules
 * when the authoring page loads them as plain <script>s in one global scope. A duplicate top-level
 * `const` between two classic scripts is a SyntaxError that silently discards the whole file — that
 * took quote authoring down once already. */
(function () {

const CHART_SERIES_VERSION = 1;

/** Number coercion tolerant of "1,234" / "517.00 ILS" / numeric cells. */
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') { const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
  return NaN;
}
const canon = (s) => String(s == null ? '' : s).toLowerCase().trim();

/** Resolve a sheet by fuzzy name. Kept local so this module has no cross-dependency. */
function findSheet(sheets, re) {
  for (const n of Object.keys(sheets || {})) if (re.test(n)) return sheets[n];
  return null;
}

/**
 * Split a timestamp cell into { day: 'YYYY-MM-DD', hour: 0-23 }.
 * SheetJS returns either an ISO-ish string or a Date depending on the cell format, so both are
 * handled. UTC getters are used for Date cells so the result never depends on the host timezone.
 */
function splitTimestamp(v) {
  if (v instanceof Date && !isNaN(v)) {
    const p = (x) => String(x).padStart(2, '0');
    return { day: `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`, hour: v.getUTCHours() };
  }
  const s = String(v == null ? '' : v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2})/);
  if (m) return { day: `${m[1]}-${m[2]}-${m[3]}`, hour: parseInt(m[4], 10) };
  const d = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (d) return { day: `${d[1]}-${d[2]}-${d[3]}`, hour: 0 };
  return null;
}

/** The date enSights charted, read off the Summary sheet. Null when the workbook does not say. */
function findRepresentativeDay(sheets) {
  const summary = findSheet(sheets, /summary/i);
  if (!Array.isArray(summary)) return null;
  for (const row of summary) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      if (!/energy flow/i.test(cell)) continue;
      const m = cell.match(/(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
  }
  return null;
}

/** Locate the hourly sheet's header row and the columns we read. */
function hourlyColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const h = r.map(canon);
    const col = (needle) => h.findIndex(x => x.indexOf(needle) === 0);
    const storage = col('storage');
    if (storage < 0) continue;
    const idx = {
      header: i,
      timestamp: col('timestamp'),
      solar: col('solar production'),
      storage,
      soc: col('state of charge'),
      gridImport: col('grid import'),
      gridExport: col('grid export'),
    };
    if (idx.timestamp >= 0 && idx.gridImport >= 0) return idx;
  }
  return null;
}

/**
 * buildChartSeries({ sheets, storageKwh }) → { ok, series, warnings }
 *
 * `series` (all numbers rounded for compact, stable storage):
 *   representativeDay                       the day enSights charted
 *   hours[24]                               0..23
 *   solarKwh, storageKwh, socPct,
 *   gridImportKwh, gridExportKwh            hourly, for that day
 *   dailyCycles, dailyMaxChargeKw,
 *   dailyMaxDischargeKw                     one value per calendar day, in date order
 */
function buildChartSeries({ sheets, storageKwh }) {
  const warnings = [];
  const rows = findSheet(sheets || {}, /optimal storage use|hourly system operation|storage use|dispatch/i);
  if (!Array.isArray(rows) || !rows.length) {
    return { ok: false, series: null, warnings: ['hourly sheet not found — the daily charts are omitted'] };
  }
  const idx = hourlyColumns(rows);
  if (!idx) return { ok: false, series: null, warnings: ['hourly sheet has no recognisable header — the daily charts are omitted'] };

  const repDay = findRepresentativeDay(sheets);
  if (!repDay) warnings.push('the workbook does not state which day it charted — the hourly charts are omitted');

  // Single pass: collect the representative day at hourly resolution and fold every other row
  // into its calendar-day aggregate. Insertion order over a chronological sheet is date order.
  const dayAgg = new Map();
  const hourly = new Array(24).fill(null);
  const cap = Number(storageKwh);

  for (let i = idx.header + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const ts = splitTimestamp(r[idx.timestamp]);
    if (!ts) continue;
    const st = num(r[idx.storage]);
    if (!Number.isFinite(st)) continue;

    let agg = dayAgg.get(ts.day);
    if (!agg) { agg = { discharged: 0, maxCharge: 0, maxDischarge: 0 }; dayAgg.set(ts.day, agg); }
    if (st > 0) { agg.discharged += st; if (st > agg.maxDischarge) agg.maxDischarge = st; }
    else if (st < 0) { const c = -st; if (c > agg.maxCharge) agg.maxCharge = c; }

    if (repDay && ts.day === repDay && ts.hour >= 0 && ts.hour < 24) {
      hourly[ts.hour] = {
        solar: num(r[idx.solar]) || 0,
        storage: st,
        soc: idx.soc >= 0 ? (num(r[idx.soc]) || 0) : 0,
        gridImport: num(r[idx.gridImport]) || 0,
        gridExport: idx.gridExport >= 0 ? (num(r[idx.gridExport]) || 0) : 0,
      };
    }
  }

  const days = Array.from(dayAgg.values());
  if (!days.length) return { ok: false, series: null, warnings: warnings.concat('hourly sheet held no usable rows') };

  const r1 = (v) => Math.round(v * 10) / 10;
  const r3 = (v) => Math.round(v * 1000) / 1000;

  // SoC is stored as a percentage. Some workbooks write a 0–1 fraction instead; normalise once so
  // the chart's fixed 0–100 axis is always right.
  const socRaw = hourly.map(h => (h ? h.soc : 0));
  const socMax = socRaw.reduce((a, b) => Math.max(a, b), 0);
  const socScale = (socMax > 0 && socMax <= 1.5) ? 100 : 1;
  if (socScale === 100) warnings.push('State of Charge was a 0–1 fraction — normalised to percent');

  const haveHourly = !!repDay && hourly.every(h => h !== null);
  if (repDay && !haveHourly) warnings.push(`the hourly sheet has no complete 24-hour set for ${repDay} — the hourly charts are omitted`);

  const series = {
    version: CHART_SERIES_VERSION,
    representativeDay: haveHourly ? repDay : null,
    hours: haveHourly ? Array.from({ length: 24 }, (_, i) => i) : null,
    solarKwh: haveHourly ? hourly.map(h => r1(h.solar)) : null,
    storageKwh: haveHourly ? hourly.map(h => r1(h.storage)) : null,
    socPct: haveHourly ? hourly.map(h => r1(h.soc * socScale)) : null,
    gridImportKwh: haveHourly ? hourly.map(h => r1(h.gridImport)) : null,
    gridExportKwh: haveHourly ? hourly.map(h => r1(h.gridExport)) : null,
    days: days.length,
    // Cycles = energy discharged that day / nameplate capacity. Needs a real capacity; without one
    // the ratio would be meaningless, so the series is withheld rather than guessed.
    dailyCycles: (Number.isFinite(cap) && cap > 0) ? days.map(d => r3(d.discharged / cap)) : null,
    dailyMaxChargeKw: days.map(d => r1(d.maxCharge)),
    dailyMaxDischargeKw: days.map(d => r1(d.maxDischarge)),
  };
  if (!series.dailyCycles) warnings.push('storage capacity unknown — the cycles-per-day chart is omitted');

  return { ok: true, series, warnings };
}

const api = { buildChartSeries, findRepresentativeDay, splitTimestamp, hourlyColumns, CHART_SERIES_VERSION };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StorageChartSeries = api;
})();
