/**
 * storage-quote/summary-charts-browser.js — AUTHORING-ONLY (browser). Reads the chart PNGs that the
 * enSights "Summary" sheet embeds inside the .xlsx, shrinks them for mobile, and returns compressed
 * data-URIs to attach to the quote state (state.summaryCharts). Never bundled into the Worker.
 *
 * No external libraries: the .xlsx is a ZIP, parsed here with a tiny native reader + the browser's
 * DecompressionStream; images are downscaled + re-encoded (WebP) with a <canvas>. Falls back to the
 * original bytes if canvas/WebP is unavailable, so a browser quirk never loses the charts.
 *
 * Depends on shared/summary-charts.js (SUMMARY_CHART_META) being loaded first.
 */
(function () {
'use strict';

const META = (typeof globalThis !== 'undefined' && globalThis.SummaryCharts && globalThis.SummaryCharts.SUMMARY_CHART_META) || [];

// ── minimal ZIP reader (central-directory based; supports STORED + DEFLATE) ──
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

function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}
function bytesToBase64(u8) {
  let s = ''; const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(s);
}
// Downscale a PNG to <= maxWidth and re-encode (WebP, white background for transparent charts).
async function compress(u8, maxWidth, quality) {
  const url = URL.createObjectURL(new Blob([u8], { type: 'image/png' }));
  try {
    const img = await loadImage(url);
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
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
 * extract(arrayBuffer, opts) → Promise<[{ dataUri, title, caption }]>.
 * opts: { maxWidth=1100, quality=0.85, minBytes=12000 (skip logos), maxCharts=8 }.
 * Returns [] (never throws) if the workbook has no embedded charts or extraction fails.
 */
async function extract(arrayBuffer, opts) {
  opts = opts || {};
  const maxWidth = opts.maxWidth || 1100, quality = opts.quality || 0.85;
  const minBytes = opts.minBytes || 12000, maxCharts = opts.maxCharts || 8;
  try {
    const files = await unzip(arrayBuffer, /^xl\/media\/image\d+\.(png|jpe?g)$/i);
    const names = Object.keys(files)
      .filter(nm => files[nm] && files[nm].length >= minBytes) // drop tiny logos/icons
      .sort((a, b) => (parseInt((a.match(/(\d+)/) || [])[1], 10) || 0) - (parseInt((b.match(/(\d+)/) || [])[1], 10) || 0))
      .slice(0, maxCharts);
    const charts = [];
    for (let i = 0; i < names.length; i++) {
      const bytes = files[names[i]];
      let dataUri;
      try { dataUri = await compress(bytes, maxWidth, quality); }
      catch (e) { dataUri = 'data:image/png;base64,' + bytesToBase64(bytes); } // fallback: original bytes
      const meta = META[i] || {};
      charts.push({ dataUri, title: meta.title || ('גרף ' + (i + 1)), caption: meta.caption || '' });
    }
    return charts;
  } catch (e) {
    return [];
  }
}

const api = { extract };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.SummaryChartsBrowser = api;
})();
