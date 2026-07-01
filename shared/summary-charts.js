/**
 * shared/summary-charts.js — the "Graphical Analysis" section: the charts the enSights Summary sheet
 * embeds as PNG images, re-shown in the customer document with a Hebrew caption each.
 *
 * This module is PURE (no DOM / no browser APIs): it owns the chart META (titles + captions, in
 * Summary-sheet order) + the render + CSS, so it is safe to bundle into the Cloudflare Worker and to
 * unit-test in Node. The browser-only extraction/compression (reading the PNGs out of the xlsx zip
 * and shrinking them for mobile) lives in storage-quote/summary-charts-browser.js.
 *
 * The charts are stored on the quote state as `state.summaryCharts = [{ dataUri, title, caption }]`
 * (compressed data-URIs), so they travel into the frozen signed HTML and stay self-contained.
 * Responsive by construction: every image is width:100%/height:auto → fits mobile and desktop.
 */
'use strict';

// Titles + captions in the order enSights lays the charts out on the Summary sheet. The browser
// extractor maps the Nth chart image to META[N]; extra images fall back to a generic caption.
const SUMMARY_CHART_META = [
  { title: 'תפעול יומי טיפוסי', caption: 'לאורך יממה: טעינה מהרשת בשעות הזול (לילה), טעינה מהשמש בצהריים, ומכירה/הזרמה לרשת בשעות השיא בערב.' },
  { title: 'מצב הטעינה של הסוללה (SoC)', caption: 'כמות האנרגיה האגורה בסוללה בכל שעה, לצד עוצמת הטעינה והפריקה לאורך היממה.' },
  { title: 'תשואה מול גודל הסוללה', caption: 'כיצד ה-IRR משתנה עם קיבולת האגירה — עם סימון הקיבולת שנבחרה כאופטימלית לפרויקט.' },
  { title: 'מחזורי טעינה ליום', caption: 'תדירות הטעינה/פריקה לאורך השנה — הרבה מתחת לגבול היצרן, לאריכות חיי הסוללה.' },
  { title: 'הספק טעינה/פריקה לאורך השנה', caption: 'דפוס העבודה השנתי של הסוללה — טעינה (ערכים שליליים) מול פריקה (ערכים חיוביים).' },
  { title: 'תזרים מזומנים שנתי', caption: 'ההשקעה הראשונית מול ההכנסות השנתיות נטו לאורך חיי הפרויקט, וקו התזרים החופשי.' },
  { title: 'תזרים מצטבר והחזר השקעה', caption: 'התזרים המצטבר: שלילי עד נקודת ההחזר ומשם עולה — עיקר הרווח נצבר לאורך חיי המערכת.' },
];

const SUMMARY_CHARTS_CSS = `
.sc-sec .sc-fig{margin:0 0 20px;border:1.5px solid var(--ink-200);border-radius:var(--radius);overflow:hidden;background:#fff}
.sc-sec .sc-fig:last-child{margin-bottom:0}
.sc-sec .sc-img{display:block;width:100%;height:auto}
.sc-sec .sc-cap{font-size:13px;color:var(--ink-600);line-height:1.55;padding:10px 14px;border-top:1px solid var(--ink-100)}
.sc-sec .sc-cap strong{color:var(--ink-900);font-weight:800}
@media print{.sc-sec .sc-fig{break-inside:avoid}}
`;

const esc = (v) => String(v == null ? '' : v).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
// Only ever emit a safe image data-URI (never javascript:/http:).
const isSafeDataUri = (s) => typeof s === 'string' && /^data:image\/(png|webp|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(s);

/**
 * renderSummaryChartsSection(charts) → HTML for the "ניתוח גרפי" section, or '' when there are none.
 * `charts` = state.summaryCharts (each { dataUri, title, caption }). Unsafe/malformed entries skipped.
 */
function renderSummaryChartsSection(charts) {
  const list = (Array.isArray(charts) ? charts : []).filter(ch => ch && isSafeDataUri(ch.dataUri));
  if (!list.length) return '';
  const figs = list.map((ch, i) => {
    const meta = SUMMARY_CHART_META[i] || {};
    const title = ch.title || meta.title || `גרף ${i + 1}`;
    const caption = ch.caption || meta.caption || '';
    return `<figure class="sc-fig">
      <img class="sc-img" src="${ch.dataUri}" alt="${esc(title)}" loading="lazy">
      <figcaption class="sc-cap"><strong>${esc(title)}</strong>${caption ? ' — ' + esc(caption) : ''}</figcaption>
    </figure>`;
  }).join('\n  ');
  return `
<!-- GRAPHICAL ANALYSIS (Summary-sheet charts) -->
<div class="st-sec sc-sec">
  <h2 class="st-title"><span class="bar"></span>ניתוח גרפי</h2>
  ${figs}
</div>`;
}

const api = { SUMMARY_CHART_META, SUMMARY_CHARTS_CSS, renderSummaryChartsSection, isSafeDataUri };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.SummaryCharts = api;
