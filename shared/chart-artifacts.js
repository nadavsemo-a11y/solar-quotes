/**
 * shared/chart-artifacts.js — build, hash and present the quote's chart artifacts.
 *
 * THE CENTRAL INVARIANT OF THIS SUBSYSTEM:
 *   a chart is rendered ONCE, at authoring time, into a serialized artifact that is persisted with
 *   the quote. The web page and the PDF both embed THAT STRING. Neither redraws anything, so the
 *   two documents cannot diverge — not through Chart.js versions, not through canvas rasterization,
 *   not through devicePixelRatio, not through duplicated drawing code that drifts apart.
 *
 * Each artifact carries a SHA-256 of its own bytes. The document contract, the web body and the PDF
 * payload all quote that hash, and a parity test asserts the three agree; if a presenter ever starts
 * drawing its own chart again the hashes stop matching and the build fails loudly.
 *
 * Artifacts are frozen with the quote. A signed document keeps the exact SVG it was signed with,
 * and a later renderer version cannot alter it — nothing re-renders a stored artifact.
 *
 * Pure apart from crypto.subtle (present in browsers, Cloudflare Workers and Node 18+).
 */
'use strict';

/* Wrapped in an IIFE so top-level names (api, esc, num, …) don't collide with the sibling modules
 * when the authoring page loads them as plain <script>s in one global scope. A duplicate top-level
 * `const` between two classic scripts is a SyntaxError that silently discards the whole file — that
 * took quote authoring down once already. */
(function () {

const CAT = (typeof module !== 'undefined' && module.exports)
  ? require('./chart-catalog.js') : globalThis.ChartCatalog;
const SVG = (typeof module !== 'undefined' && module.exports)
  ? require('./semo-chart-svg.js') : globalThis.SemoChartSvg;

/** Bump when the artifact envelope shape changes (not when a chart's pixels change). */
const CHART_ARTIFACTS_VERSION = 1;

const esc = (v) => String(v == null ? '' : v).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
/** Only ever emit a safe image data-URI (never javascript:/http:). */
const isSafeDataUri = (s) => typeof s === 'string' && /^data:image\/(png|webp|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(s);
/** A stored SVG artifact must be self-contained: no external fetch of any kind. */
const EXTERNAL_REF_RE = /(<script|xlink:href\s*=\s*"(?!#)|href\s*=\s*"https?:|url\(\s*['"]?https?:|@import)/i;
function isSafeSvg(s) {
  return typeof s === 'string' && s.indexOf('<svg') === 0 && !EXTERNAL_REF_RE.test(s);
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
  return 'sha256:' + hex;
}

/**
 * Assemble the per-chart inputs from the extracted quote state. Returns null for a chart whose
 * data the workbook did not supply — an absent chart is simply not rendered, never faked.
 */
function chartInput(id, ctx) {
  const s = ctx.series || {};
  const a = ctx.arrays || {};
  switch (id) {
    case 'daily_energy_flow':
      return s.hours && s.storageKwh && s.solarKwh && s.gridExportKwh
        ? { hours: s.hours, storageKwh: s.storageKwh, solarKwh: s.solarKwh, gridExportKwh: s.gridExportKwh } : null;
    case 'state_of_charge':
      return s.hours && s.socPct ? { hours: s.hours, socPct: s.socPct } : null;
    case 'cycles_per_day':
      return s.dailyCycles && s.dailyCycles.length ? { dailyCycles: s.dailyCycles } : null;
    case 'max_charge_discharge':
      return (s.dailyMaxChargeKw && s.dailyMaxDischargeKw && s.dailyMaxDischargeKw.length)
        ? { dailyMaxChargeKw: s.dailyMaxChargeKw, dailyMaxDischargeKw: s.dailyMaxDischargeKw } : null;
    case 'revenue_comparison':
      return (ctx.years && a.revenuesOptimized && a.revenuesBaseline)
        ? { years: ctx.years, revOptimized: a.revenuesOptimized, revBaseline: a.revenuesBaseline } : null;
    case 'annual_cash_flow':
      return (ctx.years && a.freeCashFlow && Number.isFinite(ctx.capex))
        ? { years: ctx.years, fcf: a.freeCashFlow, capex: ctx.capex } : null;
    case 'cumulative_cash_flow':
      return (ctx.years && a.cumulativeCashFlow && Number.isFinite(ctx.capex))
        ? { years: ctx.years, cumulative: a.cumulativeCashFlow, capex: ctx.capex, paybackYears: ctx.paybackYears } : null;
    default:
      return null;
  }
}

/**
 * buildChartArtifacts(state, retainedRasters) → Promise<artifact[]>
 *
 * `retainedRasters` = { [chartId]: dataUri } from storage-chart-images.js — the enSights sweeps.
 * Output is in canonical catalog order; every entry is { id, kind, hash, title, caption } plus
 * `svg` + `renderer` (kind 'svg') or `dataUri` + `source` (kind 'ensights-raster').
 */
async function buildChartArtifacts(state, retainedRasters) {
  const s = state || {};
  const a = s.arrays20y || {};
  const years = Array.isArray(a.freeCashFlow) ? a.freeCashFlow.map((_, i) => 2027 + i) : null;
  const ctx = {
    series: s.chartSeries || {},
    arrays: a,
    years,
    capex: Number(s.capex && s.capex.totalProjectCost),
    paybackYears: Number(s.metrics && s.metrics.paybackYears),
  };
  const rasters = retainedRasters || {};
  const out = [];

  for (const meta of CAT.CHART_CATALOG) {
    if (meta.source === 'ensights') {
      const uri = rasters[meta.id];
      if (!isSafeDataUri(uri)) continue;
      out.push({
        id: meta.id, kind: 'ensights-raster', source: 'enSights Storage Sizing Tool',
        dataUri: uri, hash: await sha256Hex(uri), title: meta.title, caption: meta.caption,
      });
      continue;
    }
    const input = chartInput(meta.id, ctx);
    if (!input) continue;
    let svg;
    try { svg = SVG.renderChartSvg(meta.id, input); }
    catch (e) { continue; }               // a renderer failure drops one chart, never the quote
    if (!isSafeSvg(svg)) continue;
    out.push({
      id: meta.id, kind: 'svg', renderer: SVG.CHART_RENDERER_VERSION,
      svg, hash: await sha256Hex(svg), title: meta.title, caption: meta.caption,
    });
  }
  return out;
}

/** The chart section's CSS. Shared by the web body; the PDF template carries its own print rules. */
const CHART_SECTION_CSS = `
.sc-sec .sc-fig{margin:0 0 20px;border:1.5px solid var(--ink-200);border-radius:var(--radius);overflow:hidden;background:#fff}
.sc-sec .sc-fig:last-child{margin-bottom:0}
.sc-sec .sc-art{display:block;width:100%;height:auto}
.sc-sec .sc-art svg{display:block;width:100%;height:auto}
.sc-sec .sc-cap{font-size:13px;color:var(--ink-600);line-height:1.55;padding:10px 14px;border-top:1px solid var(--ink-100)}
.sc-sec .sc-cap strong{color:var(--ink-900);font-weight:800}
@media print{.sc-sec .sc-fig{break-inside:avoid}}
`;

/**
 * renderChartSection(artifacts) → the "ניתוח גרפי" section HTML, or '' when there are none.
 * Embeds each artifact verbatim: the SVG string as-is, the retained raster as an <img>.
 */
function renderChartSection(artifacts) {
  const list = normalizeArtifacts(artifacts);
  if (!list.length) return '';
  const figs = list.map(art => {
    const body = art.kind === 'svg'
      ? `<div class="sc-art" data-chart-id="${esc(art.id)}">${art.svg}</div>`
      // No loading="lazy": the source is a data URI, so there is no request to defer — it only
      // collapses the figure to zero height until it is scrolled into view, which misrenders the
      // document on first paint and on print/export.
      : `<img class="sc-art" data-chart-id="${esc(art.id)}" src="${esc(art.dataUri)}" alt="${esc(art.title)}" decoding="sync">`;
    return `<figure class="sc-fig" data-chart="${esc(art.id)}" data-chart-hash="${esc(art.hash)}">
      ${body}
      <figcaption class="sc-cap"><strong>${esc(art.title)}</strong>${art.caption ? ' — ' + esc(art.caption) : ''}</figcaption>
    </figure>`;
  }).join('\n  ');
  return `
<!-- GRAPHICAL ANALYSIS — persisted chart artifacts; identical bytes in the web page and the PDF -->
<div class="st-sec sc-sec" data-qa-section="charts">
  <h2 class="st-title"><span class="bar"></span>ניתוח גרפי</h2>
  ${figs}
</div>`;
}

/** Drop unknown/unsafe entries and sort into canonical order. The single gate both presenters use. */
function normalizeArtifacts(artifacts) {
  return (Array.isArray(artifacts) ? artifacts : [])
    .filter(a => a && CAT.isChartId(a.id) && typeof a.hash === 'string'
      && (a.kind === 'svg' ? isSafeSvg(a.svg) : isSafeDataUri(a.dataUri)))
    .sort((x, y) => CAT.orderIndex(x.id) - CAT.orderIndex(y.id));
}

/** Compact { id → hash } fingerprint. The parity gate compares these across the three surfaces. */
function artifactHashes(artifacts) {
  const out = {};
  for (const a of normalizeArtifacts(artifacts)) out[a.id] = a.hash;
  return out;
}

const api = {
  CHART_ARTIFACTS_VERSION, CHART_SECTION_CSS,
  buildChartArtifacts, renderChartSection, normalizeArtifacts, artifactHashes,
  sha256Hex, isSafeSvg, isSafeDataUri,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.ChartArtifacts = api;
})();
