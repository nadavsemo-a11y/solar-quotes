/**
 * signature-service.js — COMPATIBILITY WRAPPER
 * ══════════════════════════════════════════════════════════════════════════
 *  This file exists to keep existing classic-script consumers working:
 *      <script src="signature-service.js"></script>
 *      const sig = new SignatureService('sigCanvas');
 *
 *  Canonical implementation has moved to the standalone module:
 *      /signature/src/signature-capture.js
 *
 *  Why this file still has a body instead of being a one-liner:
 *    The new module is ESM. Classic scripts cannot synchronously import ESM,
 *    and no bundler is configured here. So this wrapper re-declares the
 *    legacy `SignatureService` class with the identical public API as
 *    before, preserving synchronous construction semantics.
 *
 *  Migration path: when a host page migrates to <script type="module">, it
 *  should `import { SignatureCapture } from '/signature/index.js'` instead,
 *  and this file can eventually be deleted.
 *
 *  DO NOT fork new features into this file. Add them to signature/src/
 *  and mirror here only if classic-script callers need them.
 * ══════════════════════════════════════════════════════════════════════════
 */

class SignatureService {

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

    this._strokeColor = options.strokeColor || '#0A1628';
    this._lineWidth   = options.lineWidth   || 2.5;
  }

  init() {
    this._canvas = document.getElementById(this._canvasId);
    if (!this._canvas) {
      console.warn(`SignatureService: canvas #${this._canvasId} not found`);
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

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    if (!this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
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

  get hasSig()     { return this._hasSig; }
  get strokeData() { return this._strokes; }

  toDataURL() {
    if (!this._canvas) return null;
    return this._canvas.toDataURL('image/png');
  }

  static validateIsraeliID(id) {
    if (!id) return false;
    const clean = String(id).trim();
    if (!/^\d{5,9}$/.test(clean)) return false;
    if (/^0+$/.test(clean)) return false;
    const padded = clean.padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let d = parseInt(padded[i], 10) * (i % 2 === 0 ? 1 : 2);
      if (d > 9) d -= 9;
      sum += d;
    }
    return sum % 10 === 0;
  }

  validate({ name, idNum, agreed, email, sigDate }) {
    const errors = [];
    if (!name || name.trim().length < 2)                           errors.push('name');
    if (!SignatureService.validateIsraeliID(idNum))                 errors.push('idNum');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))        errors.push('email');
    if (!sigDate)                                                   errors.push('sigDate');
    if (!this._hasSig)                                              errors.push('canvas');
    if (!agreed)                                                    errors.push('agree');
    return { valid: errors.length === 0, errors };
  }

  static async hashSnapshot(obj) {
    const json = JSON.stringify(obj, Object.keys(obj).sort());
    const buf = new TextEncoder().encode(json);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  _collectMeta() {
    return {
      userAgent:  navigator.userAgent,
      language:   navigator.language || '',
      screenSize: `${window.screen.width}x${window.screen.height}`,
      timezone:   Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      pageUrl:    window.location.href,
      timestamp:  new Date().toISOString(),
    };
  }

  async _getPublicIP() {
    try {
      const res  = await fetch('https://api.ipify.org?format=json');
      const json = await res.json();
      return json.ip || 'לא זמין';
    } catch {
      return 'לא זמין';
    }
  }

  async collect({ name, idNum, agreed, email, sigDate, quoteSnapshot = {}, clientData = {} }) {
    const { valid, errors } = this.validate({ name, idNum, agreed, email, sigDate });
    if (!valid) return { ok: false, errors };

    const sigImg  = this.toDataURL();
    const meta    = this._collectMeta();
    const ipAddr  = await this._getPublicIP();
    const refID   = 'SA-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const dateStr = new Date().toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const snapshotHash = await SignatureService.hashSnapshot(quoteSnapshot);

    const signature = {
      refID, dateStr, timestamp: meta.timestamp,
      name:  name.trim(),
      idNum: String(idNum).replace(/\D/g, '').padStart(9, '0'),
      sigImg,
      strokeData:  this.strokeData,
      strokeCount: this._strokes.length,
      clientData,
      ipAddr,
      ...meta,
      quoteSnapshot,
      snapshotHash,
    };

    return { ok: true, signature };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SignatureService };
}
