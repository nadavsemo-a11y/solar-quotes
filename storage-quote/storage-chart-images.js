/**
 * storage-quote/storage-chart-images.js — retrieve the enSights chart rasters we cannot honestly
 * redraw, and identify them by MEANING rather than by position.
 *
 * AUTHORING-ONLY (browser). Replaces the previous summary-charts-browser.js, which pulled every
 * image out of the workbook and captioned them by array index. enSights emits 6, 7 or 8 chart
 * images depending on which optimizer sweeps ran, so index N did not denote the same chart across
 * workbooks and 23% of real files received shifted captions.
 *
 * WHAT IS RETAINED, AND WHY ONLY THIS. Every chart whose underlying data the workbook exports is
 * now redrawn from that data (see storage-chart-series.js + shared/semo-chart-svg.js). The two IRR
 * sweeps are the exception: they are the optimizer's internal search across capacities that
 * enSights never writes to any sheet. Reconstructing them would mean reimplementing the optimizer,
 * and inventing a curve would misrepresent a third party's result. So those two — and only those
 * two — are kept as the original raster, presented in SEMO's chart frame and captioned as an
 * enSights output.
 *
 * IDENTIFICATION. Each image is anchored to a row of the Summary sheet by xl/drawings/*.xml. The
 * nearest Summary caption at or above that row states in English what the chart is. An image is
 * retained ONLY when that caption unambiguously matches a known sweep; anything else is dropped.
 * A missing, extra or reordered chart therefore cannot mislabel another one.
 */
(function () {
'use strict';

/**
 * Caption patterns → semantic chart id. Deliberately narrow: these are enSights' own sentences.
 * A workbook whose wording changes retains nothing rather than retaining the wrong thing.
 */
const CAPTION_PATTERNS = [
  { id: 'irr_storage_capacity', re: /IRR\s+changes\s+with\s+storage\s+capacity/i },
  { id: 'irr_additional_pv',    re: /IRR\s+changes\s+with\s+additional\s+PV/i },
];

// ── minimal ZIP reader (central-directory based; STORED + DEFLATE) ──
async function unzip(buf, wantRe) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i >= u8.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
    if (!wantRe.test(name)) continue;
    const lNameLen = dv.getUint16(lho + 26, true);
    const lExtraLen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lNameLen + lExtraLen;
    const comp = u8.subarray(start, start + compSize);
    if (method === 0) out[name] = comp;
    else if (method === 8) out[name] = await inflateRaw(comp);
  }
  return out;
}
async function inflateRaw(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const body = new Response(new Blob([u8])).body.pipeThrough(ds);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/**
 * Parse drawing XML + its rels into [{ row, target }] — the 0-based worksheet row each image is
 * anchored at, and the media part it points to. Pure string work, exported for tests.
 */
function parseDrawingAnchors(drawingXml, relsXml) {
  const rel = Object.create(null);
  const relRe = /Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let m;
  while ((m = relRe.exec(relsXml))) rel[m[1]] = m[2].replace(/^\.\.\//, 'xl/');
  const out = [];
  const anchorRe = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?r:embed="([^"]+)"/g;
  while ((m = anchorRe.exec(drawingXml))) {
    const target = rel[m[2]];
    if (target) out.push({ row: parseInt(m[1], 10), target });
  }
  return out;
}

/**
 * Index the Summary sheet's prose by row: [{ row (0-based), text }], longest cell per row.
 * Exported for tests.
 */
function summaryCaptions(summaryRows) {
  const out = [];
  if (!Array.isArray(summaryRows)) return out;
  for (let i = 0; i < summaryRows.length; i++) {
    const r = summaryRows[i];
    if (!Array.isArray(r)) continue;
    let best = '';
    for (const c of r) if (typeof c === 'string' && c.length > best.length) best = c;
    if (best.trim().length >= 20) out.push({ row: i, text: best });
  }
  return out;
}

/**
 * classifyAnchors(anchors, captions) → { [chartId]: target }
 * An anchor is classified by the nearest caption at or above it. Ambiguity (two images resolving
 * to the same id) keeps the FIRST in row order and drops the rest, so the result is deterministic.
 */
function classifyAnchors(anchors, captions) {
  const found = Object.create(null);
  const sorted = anchors.slice().sort((a, b) => a.row - b.row);
  for (const a of sorted) {
    let cap = null;
    for (const c of captions) { if (c.row <= a.row && (!cap || c.row > cap.row)) cap = c; }
    if (!cap) continue;
    for (const p of CAPTION_PATTERNS) {
      if (p.re.test(cap.text) && !found[p.id]) { found[p.id] = a.target; break; }
    }
  }
  return found;
}

// ── image helpers (browser only) ──
function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}
function bytesToBase64(u8) {
  let s = ''; const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(s);
}
/** Downscale to <= maxWidth and re-encode (WebP over a white ground; PNG if WebP is unavailable). */
async function compress(u8, maxWidth, quality) {
  const url = URL.createObjectURL(new Blob([u8], { type: 'image/png' }));
  try {
    const img = await loadImage(url);
    const s = img.width > maxWidth ? maxWidth / img.width : 1;
    const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let uri = cv.toDataURL('image/webp', quality);
    if (!/^data:image\/webp/.test(uri)) uri = cv.toDataURL('image/png');
    return uri;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * extractRetainedCharts(arrayBuffer, summaryRows, opts) → Promise<{ [chartId]: dataUri }>
 * Returns {} (never throws) when the workbook has no identifiable sweep charts.
 */
async function extractRetainedCharts(arrayBuffer, summaryRows, opts) {
  opts = opts || {};
  const maxWidth = opts.maxWidth || 1100, quality = opts.quality || 0.85;
  try {
    const parts = await unzip(arrayBuffer, /^xl\/(drawings\/(drawing\d+\.xml|_rels\/drawing\d+\.xml\.rels)|media\/image\d+\.(png|jpe?g))$/i);
    const dec = new TextDecoder();
    const captions = summaryCaptions(summaryRows);
    if (!captions.length) return {};

    let anchors = [];
    for (const name of Object.keys(parts)) {
      const dm = name.match(/^xl\/drawings\/(drawing\d+)\.xml$/i);
      if (!dm) continue;
      const relsName = `xl/drawings/_rels/${dm[1]}.xml.rels`;
      if (!parts[relsName]) continue;
      anchors = anchors.concat(parseDrawingAnchors(dec.decode(parts[name]), dec.decode(parts[relsName])));
    }
    const classified = classifyAnchors(anchors, captions);

    const out = {};
    for (const id of Object.keys(classified)) {
      const bytes = parts[classified[id]];
      if (!bytes || !bytes.length) continue;
      try { out[id] = await compress(bytes, maxWidth, quality); }
      catch (e) { out[id] = 'data:image/png;base64,' + bytesToBase64(bytes); }
    }
    return out;
  } catch (e) {
    return {};
  }
}

const api = { extractRetainedCharts, parseDrawingAnchors, summaryCaptions, classifyAnchors, CAPTION_PATTERNS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.StorageChartImages = api;
})();
