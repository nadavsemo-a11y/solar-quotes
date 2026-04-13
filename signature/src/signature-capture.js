/**
 * src/signature-capture.js — browser-side signature capture.
 *
 * Ported from SEMO OS `signature-service.js`. Behaviour preserved.
 *
 * Decoupling applied:
 *   - Stroke color / line width now come from injected config (captureConfig)
 *   - IP resolver injected via config.metadata.ipResolver (defaults to ipify)
 *   - ID validator pluggable via config.capture.idValidator:
 *       'israeli' (default) | 'none' | custom function
 *   - No hardcoded tenant values; no dependency on SEMO OS globals.
 */

import { validateIsraeliId } from '../utils/israeli-id.js';
import { hashSnapshot }      from '../utils/hash.js';
import { collectClientMetadata, defaultIpResolver } from '../utils/client-metadata.js';

export class SignatureCapture {
  constructor(canvasId, options = {}) {
    this._canvasId   = canvasId;
    this._canvas     = null;
    this._ctx        = null;
    this._drawing    = false;
    this._hasSig     = false;
    this._lastPoint  = null;
    this._points     = [];

    this._strokes       = [];
    this._currentStroke = null;

    const capture = options.capture || {};
    this._strokeColor = capture.strokeColor || '#0A1628';
    this._lineWidth   = capture.lineWidth   || 2.5;

    // Opt-in: when true, collect() includes `documentHtml`
    // (document.documentElement.outerHTML at capture time) in the returned
    // signature object. Used by downstream PDF pipelines that need the
    // exact HTML the signer saw. Default false — zero behaviour change
    // for existing callers.
    this._includeDocumentHtml = capture.includeDocumentHtml === true;

    // DI hooks — all optional with safe defaults
    this._ipResolver  = options.ipResolver || defaultIpResolver;
    this._idValidator = resolveIdValidator(capture.idValidator);
    this._env         = options.env || (typeof globalThis !== 'undefined' ? globalThis : {});
  }

  init() {
    const doc = this._env.document;
    if (!doc) {
      console.warn('SignatureCapture: no document available (non-browser runtime)');
      return;
    }
    this._canvas = doc.getElementById(this._canvasId);
    if (!this._canvas) {
      console.warn(`SignatureCapture: canvas #${this._canvasId} not found`);
      return;
    }
    this._ctx = this._canvas.getContext('2d');
    this._resize();

    this._canvas.addEventListener('mousedown',  e => this._onStart(e));
    this._canvas.addEventListener('mousemove',  e => this._onMove(e));
    this._canvas.addEventListener('mouseup',    () => this._onEnd());
    this._canvas.addEventListener('mouseleave', () => this._onEnd());

    this._canvas.addEventListener('touchstart', e => { e.preventDefault(); this._onStart(e); }, { passive: false });
    this._canvas.addEventListener('touchmove',  e => { e.preventDefault(); this._onMove(e);  }, { passive: false });
    this._canvas.addEventListener('touchend',   () => this._onEnd());

    this._env.addEventListener?.('resize', () => this._resize());
  }

  _resize() {
    if (!this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    const dpr  = this._env.devicePixelRatio || 1;
    const newW = rect.width  * dpr;
    const newH = rect.height * dpr;
    if (this._canvas.width === newW && this._canvas.height === newH) return;

    this._canvas.width  = newW;
    this._canvas.height = newH;
    this._ctx.scale(dpr, dpr);
    this._ctx.strokeStyle = this._strokeColor;
    this._ctx.lineWidth   = this._lineWidth;
    this._ctx.lineCap     = 'round';
    this._ctx.lineJoin    = 'round';

    if (this._hasSig) {
      this._hasSig  = false;
      this._strokes = [];
      const wrapper = this._canvas.parentElement;
      if (wrapper) wrapper.classList.add('sig-needs-resign');
    }
  }

  _getPos(e) {
    const rect = this._canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  _onStart(e) {
    this._drawing = true;
    const p = this._getPos(e);
    this._points = [p];
    this._lastPoint = p;
    this._currentStroke = [{ x: p.x, y: p.y, t: Date.now() }];
    const wrapper = this._canvas.parentElement;
    if (wrapper) wrapper.classList.remove('sig-needs-resign');
  }

  _onMove(e) {
    if (!this._drawing) return;
    const p = this._getPos(e);
    this._points.push(p);

    if (this._points.length >= 3) {
      const ctx = this._ctx;
      const len = this._points.length;
      const p0 = this._points[len - 3];
      const p1 = this._points[len - 2];
      const p2 = this._points[len - 1];
      const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(mid1.x, mid1.y);
      ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
      ctx.stroke();
    } else if (this._points.length === 2) {
      const ctx = this._ctx;
      ctx.beginPath();
      ctx.moveTo(this._points[0].x, this._points[0].y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    this._lastPoint = p;
    this._hasSig = true;
    if (this._currentStroke) {
      this._currentStroke.push({ x: p.x, y: p.y, t: Date.now() });
    }
  }

  _onEnd() {
    this._drawing = false;
    this._points = [];
    this._lastPoint = null;
    if (this._currentStroke && this._currentStroke.length > 1) {
      this._strokes.push(this._currentStroke);
    }
    this._currentStroke = null;
  }

  clear() {
    if (this._ctx && this._canvas) {
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
    this._hasSig  = false;
    this._strokes = [];
  }

  get hasSig()      { return this._hasSig; }
  get strokeData()  { return this._strokes; }

  toDataURL() {
    if (!this._canvas) return null;
    return this._canvas.toDataURL('image/png');
  }

  validate({ name, idNum, agreed, email, sigDate }) {
    const errors = [];
    if (!name || name.trim().length < 2)                           errors.push('name');
    if (!this._idValidator(idNum))                                  errors.push('idNum');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))        errors.push('email');
    if (!sigDate)                                                   errors.push('sigDate');
    if (!this._hasSig)                                              errors.push('canvas');
    if (!agreed)                                                    errors.push('agree');
    return { valid: errors.length === 0, errors };
  }

  async collect({ name, idNum, agreed, email, sigDate, quoteSnapshot = {}, clientData = {} }) {
    const { valid, errors } = this.validate({ name, idNum, agreed, email, sigDate });
    if (!valid) return { ok: false, errors };

    const sigImg  = this.toDataURL();
    const meta    = collectClientMetadata(this._env);
    const ipAddr  = await this._ipResolver();
    const refID   = 'SA-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const dateStr = new Date().toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const snapshotHash = await hashSnapshot(quoteSnapshot);

    const signature = {
      refID,
      dateStr,
      timestamp: meta.timestamp,

      name:   name.trim(),
      idNum:  String(idNum).replace(/\D/g, '').padStart(9, '0'),
      sigImg,

      strokeData:  this.strokeData,
      strokeCount: this._strokes.length,

      clientData,

      ipAddr,
      ...meta,

      quoteSnapshot,
      snapshotHash,
    };

    // Opt-in: capture the final rendered HTML at sign time. Used by the
    // new PDF pipeline to produce a byte-faithful signed PDF without
    // re-running the page through a headless browser.
    if (this._includeDocumentHtml) {
      freezeFormState(this._env.document);
      rasterizeOtherCanvases(this._env.document, this._canvas);
      let html = this._env.document?.documentElement?.outerHTML || null;
      if (html) html = staticizeHtml(html);
      if (html) signature.documentHtml = html;
    }

    return { ok: true, signature };
  }

  // Backward-compat static (was SignatureService.validateIsraeliID)
  static validateIsraeliID(id) { return validateIsraeliId(id); }
  static hashSnapshot(obj)     { return hashSnapshot(obj); }
}

function resolveIdValidator(spec) {
  if (typeof spec === 'function') return spec;
  if (spec === 'none')            return () => true;
  return validateIsraeliId;       // default 'israeli'
}

/**
 * Before serializing outerHTML, write DOM properties (.checked, .value,
 * .selected) back to attributes so the serialized HTML reflects what the
 * signer actually saw. Without this, user-typed inputs and checked
 * checkboxes render blank in the PDF.
 */
function freezeFormState(doc) {
  if (!doc || !doc.querySelectorAll) return;
  try {
    doc.querySelectorAll('input, textarea, select').forEach(el => {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) el.setAttribute('checked', '');
        else el.removeAttribute('checked');
      } else if (el.tagName === 'SELECT') {
        el.querySelectorAll('option').forEach(opt => {
          if (opt.selected) opt.setAttribute('selected', '');
          else opt.removeAttribute('selected');
        });
      } else if (el.tagName === 'TEXTAREA') {
        el.textContent = el.value;
      } else {
        el.setAttribute('value', el.value);
      }
    });
  } catch { /* best-effort — never block signing on a freeze failure */ }
}

/**
 * Strip scripts and inline event handlers from the serialized HTML so
 * the captured snapshot is genuinely static. Without this, running the
 * HTML through a headless browser (page.setContent) re-executes the
 * page's JS — which re-initializes components and overwrites the frozen
 * form/price state, producing wrong output in the PDF.
 */
function staticizeHtml(html) {
  if (typeof html !== 'string') return html;
  // Remove <script>...</script> blocks (both inline and src). [\s\S] for
  // multi-line; non-greedy to handle multiple script tags.
  let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove inline event-handler attributes (onclick=, onchange=, onload=, …).
  out = out.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');
  return out;
}

/**
 * Rasterize every <canvas> in the document (except the signature canvas
 * itself) into a static <img>. Without this, non-signature canvases —
 * e.g. inflation charts, payback graphs — render blank in the PDF.
 */
function rasterizeOtherCanvases(doc, signatureCanvas) {
  if (!doc || !doc.querySelectorAll) return;
  try {
    doc.querySelectorAll('canvas').forEach(canvas => {
      if (canvas === signatureCanvas) return;   // leave the signature canvas alone
      try {
        const img = doc.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.style.cssText = canvas.style.cssText || '';
        if (canvas.width)  img.width  = canvas.width;
        if (canvas.height) img.height = canvas.height;
        canvas.replaceWith(img);
      } catch { /* tainted/cross-origin canvas — skip */ }
    });
  } catch { /* best-effort */ }
}
