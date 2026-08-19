/**
 * shared/chart-catalog.js — the CANONICAL chart identity table for the storage (BESS) quote.
 *
 * Every chart in the customer document is addressed by a STABLE SEMANTIC ID. Nothing in the
 * pipeline may identify a chart by its position in a list.
 *
 * Why this file exists: the previous design mapped Hebrew captions onto enSights chart images
 * POSITIONALLY (`META[i]`). enSights emits 6, 7 or 8 chart images depending on which optimizer
 * sweeps ran, so the captions silently shifted on 23% of real workbooks — a customer could read
 * "cycles per day" under a chart of PV capacity. Identity is now semantic and the caption travels
 * with the id, so a missing or extra chart can never move another chart's label.
 *
 * Pure: no DOM, no Node APIs. Shared by the authoring portal, the Worker renderer and the tests.
 */
'use strict';

/* Wrapped in an IIFE so top-level names (api, esc, num, …) don't collide with the sibling modules
 * when the authoring page loads them as plain <script>s in one global scope. A duplicate top-level
 * `const` between two classic scripts is a SyntaxError that silently discards the whole file — that
 * took quote authoring down once already. */
(function () {

/**
 * Canonical document order. The customer document renders exactly these ids, in this order,
 * skipping any the workbook could not supply.
 *
 * source:
 *   'svg'      — redrawn by shared/semo-chart-svg.js from canonical series we extracted.
 *   'ensights' — the optimizer's own raster, retained verbatim. Used ONLY where the underlying
 *                data is not exported by enSights and therefore cannot be honestly redrawn.
 */
const CHART_CATALOG = [
  {
    id: 'daily_energy_flow',
    source: 'svg',
    title: 'תפעול יומי טיפוסי',
    caption: 'לאורך יממה: טעינה מהשמש בשעות הצהריים, ופריקה ומכירה לרשת בשעות השיא בערב.',
  },
  {
    id: 'state_of_charge',
    source: 'svg',
    title: 'מצב הטעינה של הסוללה (SoC)',
    caption: 'אחוז האנרגיה האגורה בסוללה בכל שעה לאורך אותה יממה.',
  },
  {
    id: 'irr_storage_capacity',
    source: 'ensights',
    title: 'תשואה מול גודל הסוללה',
    caption: 'כיצד ה-IRR משתנה עם קיבולת האגירה — עם סימון הקיבולת שנבחרה כאופטימלית לפרויקט. גרף זה מוצג כפי שהופק במחשבון enSights.',
  },
  {
    id: 'irr_additional_pv',
    source: 'ensights',
    title: 'תשואה מול תוספת PV',
    caption: 'כיצד ה-IRR משתנה עם הספק ה-PV הנוסף — עם סימון ההספק שנבחר כאופטימלי. גרף זה מוצג כפי שהופק במחשבון enSights.',
  },
  {
    id: 'cycles_per_day',
    source: 'svg',
    title: 'מחזורי טעינה ליום',
    caption: 'מספר המחזורים בכל יום לאורך השנה — אנרגיה שנפרקה חלקי הקיבולת הנקובה.',
  },
  {
    id: 'max_charge_discharge',
    source: 'svg',
    title: 'הספק טעינה/פריקה מרבי ליום',
    caption: 'ההספק הגבוה ביותר שנרשם בכל יום — טעינה (מתחת לקו) מול פריקה (מעל הקו).',
  },
  {
    id: 'revenue_comparison',
    source: 'svg',
    title: 'הכנסות — היום מול אחרי האגירה',
    caption: 'ההכנסה השנתית הצפויה עם מערכת האגירה, מול ההכנסה במצב הקיים.',
  },
  {
    id: 'annual_cash_flow',
    source: 'svg',
    title: 'תזרים מזומנים שנתי',
    caption: 'ההשקעה הראשונית מול התזרים החופשי בכל שנה לאורך חיי הפרויקט.',
  },
  {
    id: 'cumulative_cash_flow',
    source: 'svg',
    title: 'תזרים מצטבר והחזר השקעה',
    caption: 'התזרים המצטבר: שלילי עד נקודת ההחזר ומשם עולה — עיקר הרווח נצבר לאורך חיי המערכת.',
  },
];

const CHART_IDS = CHART_CATALOG.map(c => c.id);
const CHART_BY_ID = CHART_CATALOG.reduce((m, c) => { m[c.id] = c; return m; }, Object.create(null));

/** The two ids whose source data enSights does not export; only these retain a raster. */
const ENSIGHTS_RASTER_IDS = CHART_CATALOG.filter(c => c.source === 'ensights').map(c => c.id);
/** The ids we redraw deterministically from extracted series. */
const SVG_CHART_IDS = CHART_CATALOG.filter(c => c.source === 'svg').map(c => c.id);

function isChartId(id) { return Object.prototype.hasOwnProperty.call(CHART_BY_ID, id); }
function chartMeta(id) { return CHART_BY_ID[id] || null; }
/** Sort any artifact list into canonical document order; unknown ids are dropped by the caller. */
function orderIndex(id) { const i = CHART_IDS.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; }

const api = {
  CHART_CATALOG, CHART_IDS, CHART_BY_ID,
  ENSIGHTS_RASTER_IDS, SVG_CHART_IDS,
  isChartId, chartMeta, orderIndex,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.ChartCatalog = api;
})();
