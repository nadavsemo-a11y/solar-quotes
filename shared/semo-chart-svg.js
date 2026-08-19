/**
 * shared/semo-chart-svg.js — deterministic, self-contained SVG chart renderer for the storage quote.
 *
 * ONE renderer, ONE artifact. The string this module returns is persisted with the quote and is the
 * SAME string the web page shows and the PDF embeds. Neither presenter redraws anything: renderer
 * drift (Canvas vs Chart.js, devicePixelRatio, font metrics, browser version) cannot desynchronise
 * two documents that share one serialized artifact.
 *
 * DETERMINISM RULES — every one of these is enforced by tests:
 *   • no Date, no Math.random, no counters, no environment lookups;
 *   • element ids are derived from the chart id, never generated;
 *   • no toLocaleString (locale-dependent) — digits are grouped by a pure helper;
 *   • all coordinates are rounded to 2 decimals before serialization;
 *   • fixed viewBox and layout constants, so output depends only on the input data;
 *   • no external references: no <image href="http…">, no CSS @import, no webfont fetch, no script.
 * Same input → byte-identical output, in the browser, in the Worker and in Node.
 *
 * PURE: no DOM, no Node APIs. The string is assembled directly.
 *
 * Visual language matches the SEMO A.G.S PDF: ink/mint palette, hairline grid, 2px strokes.
 */
'use strict';

/* Wrapped in an IIFE so top-level names (api, esc, num, …) don't collide with the sibling modules
 * when the authoring page loads them as plain <script>s in one global scope. A duplicate top-level
 * `const` between two classic scripts is a SyntaxError that silently discards the whole file — that
 * took quote authoring down once already. */
(function () {

// ── palette + layout (the PDF's established language) ──
const INK = '#0A0A0A';
const MINT = '#9CF5C4';
const MINT_LINE = '#5FE0A0';
const MINT_DARK = '#1FA46B';
const GRID = '#E7E7E7';
const MUTED = '#8A8A8A';
const FONT = "Heebo, 'Segoe UI', Arial, sans-serif";

const W = 680, H = 260;                       // fixed viewBox for every chart
const PAD = { l: 56, r: 16, t: 16, b: 30 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

// ── primitives ────────────────────────────────────────────────────────────────────────────────

/** Round to 2dp and drop a trailing ".00" — stable across engines (no locale, no float drift). */
function n2(v) {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}
/** Pure thousands grouping. Never toLocaleString — that varies by ICU build. */
function group(v) {
  const neg = v < 0;
  const s = String(Math.round(Math.abs(Number(v) || 0)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return (neg ? '−' : '') + out;   // U+2212 minus, matching the document's typography
}
/** Compact shekel label for an axis tick: ₪1.5M / ₪344k / ₪0. */
function ils(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return '₪' + (v < 0 ? '−' : '') + n2(Math.abs(v) / 1e6) + 'M';
  if (a >= 1e3) return '₪' + (v < 0 ? '−' : '') + String(Math.round(Math.abs(v) / 1e3)) + 'k';
  return '₪' + group(v);
}
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

/** Linear scale factory. */
function scale(d0, d1, r0, r1) {
  const span = (d1 - d0) || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}
/**
 * Domain with headroom, but never past zero on a side the data never reaches: an all-positive
 * series gets a floor of exactly 0, so an area fill lands on the axis instead of on an invented
 * negative baseline.
 */
function domain(values, { padPct = 0.08 } = {}) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 1];
  const min = Math.min.apply(null, finite), max = Math.max.apply(null, finite);
  let lo = Math.min(min, 0), hi = Math.max(max, 0);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * padPct;
  return [min >= 0 ? 0 : lo - pad, max <= 0 ? 0 : hi + pad];
}

function frame() {
  return `<rect x="${PAD.l}" y="${PAD.t}" width="${PLOT_W}" height="${PLOT_H}" fill="none" stroke="${GRID}" stroke-width="1"/>`;
}
/** Horizontal grid lines + left-hand value labels. `fmt` renders each tick value. */
function yAxis(y, ticks, fmt) {
  return ticks.map(t => {
    const py = n2(y(t));
    return `<line x1="${PAD.l}" y1="${py}" x2="${W - PAD.r}" y2="${py}" stroke="${GRID}" stroke-width="1"/>`
      + `<text x="${PAD.l - 7}" y="${n2(y(t) + 3.5)}" text-anchor="end" font-family="${FONT}" font-size="10" fill="${MUTED}">${esc(fmt(t))}</text>`;
  }).join('');
}
/** Bottom-axis tick labels at explicit data positions. */
function xLabels(x, ticks, fmt) {
  return ticks.map(t =>
    `<text x="${n2(x(t))}" y="${H - PAD.b + 16}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${MUTED}">${esc(fmt(t))}</text>`
  ).join('');
}
function zeroLine(y0) {
  return `<line x1="${PAD.l}" y1="${n2(y0)}" x2="${W - PAD.r}" y2="${n2(y0)}" stroke="${INK}" stroke-width="1.2"/>`;
}
/** Evenly spaced ticks across a domain, always including the ends. */
function ticksOf([lo, hi], count) {
  const out = [];
  for (let i = 0; i <= count; i++) out.push(lo + ((hi - lo) * i) / count);
  return out;
}
/** Polyline path from (x,y) data pairs. */
function linePath(xs, ys, x, y) {
  let d = '';
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(ys[i])) continue;
    d += (d ? 'L' : 'M') + n2(x(xs[i])) + ' ' + n2(y(ys[i]));
  }
  return d;
}
/** Closed area between a series and a baseline value. */
function areaPath(xs, ys, x, y, base) {
  const d = linePath(xs, ys, x, y);
  if (!d) return '';
  return d + `L${n2(x(xs[xs.length - 1]))} ${n2(y(base))}L${n2(x(xs[0]))} ${n2(y(base))}Z`;
}
/** Closed band between two series (upper drawn forward, lower drawn back). */
function bandPath(xs, upper, lower, x, y) {
  let d = linePath(xs, upper, x, y);
  if (!d) return '';
  for (let i = xs.length - 1; i >= 0; i--) {
    if (!Number.isFinite(lower[i])) continue;
    d += 'L' + n2(x(xs[i])) + ' ' + n2(y(lower[i]));
  }
  return d + 'Z';
}
/** Signed bars around a zero line. `pos`/`neg` are fill colours. */
function bars(xs, ys, x, y, y0, bw, pos, neg) {
  return xs.map((xv, i) => {
    const v = ys[i];
    if (!Number.isFinite(v) || v === 0) return '';
    const py = y(v), top = Math.min(py, y0), h = Math.abs(py - y0);
    if (h < 0.05) return '';
    return `<rect x="${n2(x(xv) - bw / 2)}" y="${n2(top)}" width="${n2(bw)}" height="${n2(h)}" fill="${v < 0 ? neg : pos}" stroke="${INK}" stroke-width="0.6"/>`;
  }).join('');
}
/** Unit caption, sitting ABOVE the tick column and right-aligned with it — clear of both the top
 *  gridline label and the legend. */
function unitLabel(text) {
  return `<text x="${PAD.l - 7}" y="${PAD.t - 5}" text-anchor="end" font-family="${FONT}" font-size="9" fill="${MUTED}" direction="rtl">${esc(text)}</text>`;
}
/**
 * Legend laid out RIGHT-TO-LEFT from the plot's top-right corner, which is the reading order of the
 * Hebrew labels. Each entry is `[swatch][label]` with the label anchored at its END, because an
 * RTL run anchored at "start" grows leftwards and would sit on top of its own swatch.
 * The advance uses a per-character width estimate; it only spaces entries, so a small error
 * cannot overlap them and cannot make the output non-deterministic.
 */
function legend(items) {
  let cursor = W - PAD.r - 6;
  const parts = [];
  for (const it of items) {
    const swatchX = cursor - 9;
    const textEnd = swatchX - 5;
    const textW = it.label.length * 7.2;
    parts.push(
      `<rect x="${n2(swatchX)}" y="${PAD.t + 3}" width="9" height="9" fill="${it.fill}" stroke="${INK}" stroke-width="0.7"/>` +
      `<text x="${n2(textEnd)}" y="${PAD.t + 11.5}" text-anchor="end" font-family="${FONT}" font-size="9.5" fill="${INK}" direction="rtl">${esc(it.label)}</text>`
    );
    cursor = textEnd - textW - 12;
  }
  return parts.join('');
}

/**
 * Wrap chart body in a deterministic, self-contained <svg>.
 * `id` seeds every internal element id, so two charts on one page never collide and no id is generated.
 */
function svgDoc(id, title, desc, body) {
  // direction="ltr" on the root is REQUIRED, not cosmetic: these artifacts are embedded in an
  // RTL document (the PDF body sets direction:rtl), and without it the bidi algorithm reorders
  // every mixed number label — "₪632k" prints as "632k₪" and "−124" as "124−". Hebrew runs inside
  // are still laid out right-to-left by bidi; only the labels that must stay Hebrew-first carry an
  // explicit direction="rtl" of their own.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `direction="ltr" aria-labelledby="${esc(id)}-t ${esc(id)}-d" preserveAspectRatio="xMidYMid meet">` +
    `<title id="${esc(id)}-t">${esc(title)}</title>` +
    `<desc id="${esc(id)}-d">${esc(desc)}</desc>` +
    `<rect width="${W}" height="${H}" fill="#FFFFFF"/>` +
    body +
    `</svg>`;
}

// ── the charts ────────────────────────────────────────────────────────────────────────────────
// Each takes already-canonical data and returns a complete SVG string. No chart fetches, derives
// or approximates anything: what it is given is what it draws.

/**
 * Daily energy flow. Storage sign convention is the WORKBOOK's, verified against the SoC column:
 * NEGATIVE = charging (energy into the battery), POSITIVE = discharging. Bars keep that convention
 * so charging reads below the zero line, exactly as enSights presents it.
 */
function dailyEnergyFlow(d) {
  const hours = d.hours, y0v = 0;
  const all = d.storageKwh.concat(d.solarKwh, d.gridExportKwh);
  const dom = domain(all);
  const x = scale(-0.5, 23.5, PAD.l, W - PAD.r);
  const y = scale(dom[0], dom[1], H - PAD.b, PAD.t);
  const bw = (PLOT_W / 24) * 0.68;
  return svgDoc('daily-energy-flow', 'תפעול יומי טיפוסי', 'זרימת אנרגיה שעתית ביום מדגמי: ייצור סולארי, טעינה ופריקה של הסוללה, והזרמה לרשת.',
    frame() +
    yAxis(y, ticksOf(dom, 4), v => group(v)) +
    bars(hours, d.storageKwh, x, y, y(y0v), bw, MINT, INK) +
    `<path d="${linePath(hours, d.solarKwh, x, y)}" fill="none" stroke="${MINT_DARK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="${linePath(hours, d.gridExportKwh, x, y)}" fill="none" stroke="${MUTED}" stroke-width="1.6" stroke-dasharray="5 4"/>` +
    zeroLine(y(y0v)) +
    xLabels(x, [0, 6, 12, 18, 23], v => String(v) + ':00') +
    unitLabel('קוט"ש') +
    legend([{ label: 'פריקה', fill: MINT }, { label: 'טעינה', fill: INK }, { label: 'ייצור סולארי', fill: MINT_DARK }])
  );
}

/** State of charge across the same representative day, 0–100%. */
function stateOfCharge(d) {
  const hours = d.hours;
  const x = scale(0, 23, PAD.l, W - PAD.r);
  const y = scale(0, 105, H - PAD.b, PAD.t);
  return svgDoc('state-of-charge', 'מצב הטעינה של הסוללה', 'אחוז האנרגיה האגורה בסוללה בכל שעה לאורך היממה.',
    frame() +
    yAxis(y, [0, 25, 50, 75, 100], v => String(Math.round(v)) + '%') +
    `<path d="${areaPath(hours, d.socPct, x, y, 0)}" fill="${MINT}" fill-opacity="0.55"/>` +
    `<path d="${linePath(hours, d.socPct, x, y)}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    xLabels(x, [0, 6, 12, 18, 23], v => String(v) + ':00') +
    unitLabel('SoC')
  );
}

/** Cycles per day across the year. */
function cyclesPerDay(d) {
  const xs = d.dailyCycles.map((_, i) => i);
  const dom = domain(d.dailyCycles, { padPct: 0.12 });
  const x = scale(0, Math.max(1, xs.length - 1), PAD.l, W - PAD.r);
  const y = scale(0, dom[1], H - PAD.b, PAD.t);
  return svgDoc('cycles-per-day', 'מחזורי טעינה ליום', 'מספר מחזורי הפריקה בכל יום לאורך השנה, ביחס לקיבולת הנקובה.',
    frame() +
    yAxis(y, ticksOf([0, dom[1]], 4), v => n2(Math.round(v * 100) / 100)) +
    `<path d="${areaPath(xs, d.dailyCycles, x, y, 0)}" fill="${MINT}" fill-opacity="0.5"/>` +
    `<path d="${linePath(xs, d.dailyCycles, x, y)}" fill="none" stroke="${INK}" stroke-width="1.2"/>` +
    xLabels(x, monthTicks(xs.length), i => monthLabel(i, xs.length)) +
    unitLabel('מחזורים')
  );
}

/** Daily charge/discharge power extremes. Charge is drawn negative, matching the workbook. */
function maxChargeDischarge(d) {
  const xs = d.dailyMaxDischargeKw.map((_, i) => i);
  const chargeNeg = d.dailyMaxChargeKw.map(v => -v);
  const dom = domain(d.dailyMaxDischargeKw.concat(chargeNeg), { padPct: 0.1 });
  const x = scale(0, Math.max(1, xs.length - 1), PAD.l, W - PAD.r);
  const y = scale(dom[0], dom[1], H - PAD.b, PAD.t);
  return svgDoc('max-charge-discharge', 'הספק טעינה/פריקה מרבי ליום', 'ההספק המרבי שנרשם בכל יום — פריקה מעל הקו, טעינה מתחתיו.',
    frame() +
    yAxis(y, ticksOf(dom, 4), v => group(v)) +
    // Discharge is filled; charge is a line only. Across ~365 noisy daily points a second filled
    // band reads as a solid slab and hides its own shape.
    `<path d="${areaPath(xs, d.dailyMaxDischargeKw, x, y, 0)}" fill="${MINT}" fill-opacity="0.55"/>` +
    `<path d="${linePath(xs, d.dailyMaxDischargeKw, x, y)}" fill="none" stroke="${MINT_DARK}" stroke-width="1.2"/>` +
    `<path d="${linePath(xs, chargeNeg, x, y)}" fill="none" stroke="${INK}" stroke-width="1.2"/>` +
    zeroLine(y(0)) +
    xLabels(x, monthTicks(xs.length), i => monthLabel(i, xs.length)) +
    unitLabel('ק"ו') +
    legend([{ label: 'פריקה', fill: MINT }, { label: 'טעינה', fill: INK }])
  );
}

/** Revenue with storage vs the site's current revenue, by project year. */
function revenueComparison(d) {
  const xs = d.years.map((_, i) => i);
  const dom = domain(d.revOptimized.concat(d.revBaseline));
  const x = scale(0, Math.max(1, xs.length - 1), PAD.l, W - PAD.r);
  const y = scale(dom[0], dom[1], H - PAD.b, PAD.t);
  return svgDoc('revenue-comparison', 'הכנסות — היום מול אחרי האגירה', 'השוואת ההכנסה השנתית עם מערכת האגירה מול המצב הקיים.',
    frame() +
    yAxis(y, ticksOf(dom, 4), ils) +
    // Shade the GAP between the two lines — the revenue the storage adds — rather than the whole
    // area under the upper line, which would bury the baseline it is meant to be compared against.
    `<path d="${bandPath(xs, d.revOptimized, d.revBaseline, x, y)}" fill="${MINT}" fill-opacity="0.5"/>` +
    `<path d="${linePath(xs, d.revOptimized, x, y)}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="${linePath(xs, d.revBaseline, x, y)}" fill="none" stroke="${MUTED}" stroke-width="1.8" stroke-dasharray="5 4"/>` +
    xLabels(x, yearTicks(xs.length), i => String(d.years[i])) +
    unitLabel('₪/שנה') +
    legend([{ label: 'עם אגירה', fill: MINT }, { label: 'היום', fill: MUTED }])
  );
}

/**
 * Annual cash flow: the initial investment as year 0, then the workbook's REAL free-cash-flow
 * series. Nothing is smoothed or annuitised — `fcf` is the extracted array, value for value.
 */
function annualCashFlow(d) {
  const vals = [-d.capex].concat(d.fcf);
  const xs = vals.map((_, i) => i);
  const dom = domain(vals);
  const x = scale(-0.6, vals.length - 0.4, PAD.l, W - PAD.r);
  const y = scale(dom[0], dom[1], H - PAD.b, PAD.t);
  const bw = (PLOT_W / vals.length) * 0.66;
  return svgDoc('annual-cash-flow', 'תזרים מזומנים שנתי', 'ההשקעה הראשונית מול התזרים החופשי בכל שנת פעילות.',
    frame() +
    yAxis(y, ticksOf(dom, 4), ils) +
    bars(xs, vals, x, y, y(0), bw, MINT, INK) +
    zeroLine(y(0)) +
    xLabels(x, yearTicks(vals.length), i => (i === 0 ? '0' : String(d.years[i - 1]))) +
    unitLabel('₪')
  );
}

/**
 * Cumulative cash flow including the investment, plus the payback marker.
 * cumulative[i] is the workbook's operating cumulative; subtracting capex is exact arithmetic on
 * real values, not a model — the zero crossing therefore lands on the workbook's own payback.
 */
function cumulativeCashFlow(d) {
  const vals = [-d.capex].concat(d.cumulative.map(v => v - d.capex));
  const xs = vals.map((_, i) => i);
  const dom = domain(vals);
  const x = scale(0, vals.length - 1, PAD.l, W - PAD.r);
  const y = scale(dom[0], dom[1], H - PAD.b, PAD.t);
  const pay = Number(d.paybackYears);
  let marker = '';
  if (Number.isFinite(pay) && pay > 0 && pay <= vals.length - 1) {
    const px = x(pay);
    marker =
      `<line x1="${n2(px)}" y1="${PAD.t}" x2="${n2(px)}" y2="${H - PAD.b}" stroke="${MINT_DARK}" stroke-width="1.4" stroke-dasharray="4 3"/>` +
      `<text x="${n2(px)}" y="${PAD.t + 11}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${MINT_DARK}" direction="rtl">${esc('החזר ' + n2(Math.round(pay * 10) / 10) + ' שנים')}</text>`;
  }
  // No area fill here: the series crosses zero, and a polygon closed on the zero line would
  // self-intersect and shade the wrong side. The line plus the payback marker carry the story.
  return svgDoc('cumulative-cash-flow', 'תזרים מצטבר והחזר השקעה', 'התזרים המצטבר כולל ההשקעה הראשונית, עם סימון נקודת ההחזר.',
    frame() +
    yAxis(y, ticksOf(dom, 4), ils) +
    `<path d="${linePath(xs, vals, x, y)}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
    zeroLine(y(0)) +
    marker +
    xLabels(x, yearTicks(vals.length), i => (i === 0 ? '0' : String(d.years[i - 1]))) +
    unitLabel('₪ מצטבר')
  );
}

// ── shared tick helpers ──
/** ~6 evenly spaced day indices across a year-length series. */
function monthTicks(len) {
  if (len <= 1) return [0];
  const out = [];
  for (let i = 0; i < 6; i++) out.push(Math.round((len - 1) * (i / 5)));
  return out;
}
/** Day index → calendar month number, monotonically increasing across the tick set. */
function monthLabel(i, len) {
  if (len <= 1) return '1';
  return String(Math.min(12, Math.floor((i / len) * 12) + 1));
}
/** At most 6 year ticks, always including the first and last. */
function yearTicks(len) {
  if (len <= 6) { const a = []; for (let i = 0; i < len; i++) a.push(i); return a; }
  const out = [];
  for (let i = 0; i < 6; i++) out.push(Math.round((len - 1) * (i / 5)));
  return out;
}

const RENDERERS = {
  daily_energy_flow: dailyEnergyFlow,
  state_of_charge: stateOfCharge,
  cycles_per_day: cyclesPerDay,
  max_charge_discharge: maxChargeDischarge,
  revenue_comparison: revenueComparison,
  annual_cash_flow: annualCashFlow,
  cumulative_cash_flow: cumulativeCashFlow,
};

/** Renderer identity persisted with every artifact; bump on any visual/serialization change. */
const CHART_RENDERER_VERSION = 'semo-chart-svg@1';

/**
 * renderChartSvg(chartId, data) → SVG string.
 * Throws for an unknown id or missing data rather than emitting an empty or misleading chart.
 */
function renderChartSvg(chartId, data) {
  const fn = RENDERERS[chartId];
  if (!fn) throw new Error(`renderChartSvg: no renderer for chart id "${chartId}"`);
  if (!data || typeof data !== 'object') throw new Error(`renderChartSvg: ${chartId} needs data`);
  return fn(data);
}
function canRender(chartId) { return Object.prototype.hasOwnProperty.call(RENDERERS, chartId); }

const api = { renderChartSvg, canRender, CHART_RENDERER_VERSION, RENDERERS, group, ils, W, H };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.SemoChartSvg = api;
})();
