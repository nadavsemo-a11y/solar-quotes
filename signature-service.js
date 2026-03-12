/**
 * signature-service.js — SEMO AGS Digital Signature Service
 *
 * אחריות: כל מה שקשור לחתימה דיגיטלית.
 *   - canvas ציור וניקוי
 *   - אימות ת.ז. ישראלית (Luhn)
 *   - אימות שדות טופס
 *   - איסוף מטא-דאטה (IP, UA, timezone, זמן)
 *   - החזרת אובייקט חתימה מוכן לשמירה
 *
 * אין כאן fetch לשמירה — זה תפקיד ה-storage-service.
 * אין כאן הפניה לנתוני ההצעה — מוזרקים מבחוץ.
 *
 * שימוש:
 *   const sig = new SignatureService('sigCanvas');
 *   sig.init();
 *   const result = await sig.collect({ name, idNum, agreed, quoteSnapshot });
 */

class SignatureService {

  /**
   * @param {string} canvasId  — ה-id של אלמנט ה-canvas
   * @param {object} [options]
   *   strokeColor  {string}  ברירת מחדל '#0A1628'
   *   lineWidth    {number}  ברירת מחדל 2.5
   */
  constructor(canvasId, options = {}) {
    this._canvasId   = canvasId;
    this._canvas     = null;
    this._ctx        = null;
    this._drawing    = false;
    this._hasSig     = false;
    this._lastPoint  = null;
    this._points     = [];

    this._strokeColor = options.strokeColor || '#0A1628';
    this._lineWidth   = options.lineWidth   || 2.5;
  }

  // ── אתחול ──────────────────────────────────────────────────────────────

  /**
   * init()
   * מחבר את ה-canvas ומגדיר event listeners.
   * יש לקרוא לאחר ש-DOM מוכן.
   */
  init() {
    this._canvas = document.getElementById(this._canvasId);
    if (!this._canvas) {
      console.warn(`SignatureService: canvas #${this._canvasId} not found`);
      return;
    }
    this._ctx = this._canvas.getContext('2d');
    this._resize();

    // Mouse events
    this._canvas.addEventListener('mousedown',  e => this._onStart(e));
    this._canvas.addEventListener('mousemove',  e => this._onMove(e));
    this._canvas.addEventListener('mouseup',    () => this._onEnd());
    this._canvas.addEventListener('mouseleave', () => this._onEnd());

    // Touch events
    this._canvas.addEventListener('touchstart', e => { e.preventDefault(); this._onStart(e); }, { passive: false });
    this._canvas.addEventListener('touchmove',  e => { e.preventDefault(); this._onMove(e);  }, { passive: false });
    this._canvas.addEventListener('touchend',   () => this._onEnd());

    // Resize
    window.addEventListener('resize', () => this._resize());
  }

  // ── Canvas internals ────────────────────────────────────────────────────

  _resize() {
    if (!this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    this._canvas.width  = rect.width  * dpr;
    this._canvas.height = rect.height * dpr;
    this._ctx.scale(dpr, dpr);
    this._ctx.strokeStyle = this._strokeColor;
    this._ctx.lineWidth   = this._lineWidth;
    this._ctx.lineCap     = 'round';
    this._ctx.lineJoin    = 'round';
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
  }

  _onMove(e) {
    if (!this._drawing) return;
    const p = this._getPos(e);
    this._points.push(p);

    // Use quadratic curves for smooth interpolation
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
      // First segment — simple line
      const ctx = this._ctx;
      ctx.beginPath();
      ctx.moveTo(this._points[0].x, this._points[0].y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    this._lastPoint = p;
    this._hasSig = true;
  }

  _onEnd() {
    this._drawing = false;
    this._points = [];
    this._lastPoint = null;
  }

  // ── ממשק ציבורי ──────────────────────────────────────────────────────────

  /** מנקה את ה-canvas */
  clear() {
    if (this._ctx && this._canvas) {
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
    this._hasSig = false;
  }

  /** האם נחתם */
  get hasSig() {
    return this._hasSig;
  }

  /** מחזיר תמונת החתימה כ-base64 PNG */
  toDataURL() {
    if (!this._canvas) return null;
    return this._canvas.toDataURL('image/png');
  }

  // ── אימות ─────────────────────────────────────────────────────────────

  /**
   * validateIsraeliID(id)
   * אלגוריתם Luhn לאימות ת.ז. ישראלית
   * @param {string} id
   * @returns {boolean}
   */
  static validateIsraeliID(id) {
    if (!id) return false;
    const clean = String(id).trim();
    // חייב להכיל ספרות בלבד, 5-9 תווים
    if (!/^\d{5,9}$/.test(clean)) return false;
    // כולה אפסים — לא תקין
    if (/^0+$/.test(clean)) return false;
    const padded = clean.padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let d = parseInt(padded[i]) * (i % 2 === 0 ? 1 : 2);
      if (d > 9) d -= 9;
      sum += d;
    }
    return sum % 10 === 0;
  }

  /**
   * validate(fields)
   * מאמת את כל שדות טופס החתימה.
   * @param {{ name, idNum, agreed }} fields
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate({ name, idNum, agreed }) {
    const errors = [];
    if (!name || name.trim().length < 2)          errors.push('name');
    if (!SignatureService.validateIsraeliID(idNum)) errors.push('idNum');
    if (!this._hasSig)                             errors.push('canvas');
    if (!agreed)                                   errors.push('agree');
    return { valid: errors.length === 0, errors };
  }

  // ── איסוף מטא-דאטה ──────────────────────────────────────────────────────

  /**
   * _collectMeta()
   * מידע טכני שנאסף בצד הלקוח לצרכי אימות חוקי.
   */
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

  /**
   * _getPublicIP()
   * מנסה לאחזר IP ציבורי. מחזיר 'לא זמין' אם נכשל.
   */
  async _getPublicIP() {
    try {
      const res  = await fetch('https://api.ipify.org?format=json');
      const json = await res.json();
      return json.ip || 'לא זמין';
    } catch {
      return 'לא זמין';
    }
  }

  // ── collect — ה-API הראשי ────────────────────────────────────────────────

  /**
   * collect(fields)
   * מאמת, אוסף את כל הנתונים, ומחזיר אובייקט חתימה מוכן לשמירה.
   *
   * @param {object} fields
   *   name           {string}  שם מלא
   *   idNum          {string}  ת.ז.
   *   agreed         {boolean} תיבת אישור
   *   quoteSnapshot  {object}  נתוני ההצעה (מ-QuoteEngine.calculate)
   *   clientData     {object}  פרטי לקוח { name, phone, address, city }
   *
   * @returns {Promise<{ ok: boolean, errors?: string[], signature?: object }>}
   */
  async collect({ name, idNum, agreed, quoteSnapshot = {}, clientData = {} }) {
    const { valid, errors } = this.validate({ name, idNum, agreed });
    if (!valid) return { ok: false, errors };

    const sigImg  = this.toDataURL();
    const meta    = this._collectMeta();
    const ipAddr  = await this._getPublicIP();
    const refID   = 'SA-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const dateStr = new Date().toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const signature = {
      // זיהוי
      refID,
      dateStr,
      timestamp: meta.timestamp,

      // חותם
      name:   name.trim(),
      idNum:  String(idNum).replace(/\D/g, '').padStart(9, '0'),
      sigImg,

      // לקוח
      clientData,

      // מטא-דאטה טכני
      ipAddr,
      ...meta,

      // snapshot של ההצעה
      quoteSnapshot,
    };

    return { ok: true, signature };
  }
}

// ── ייצוא ───────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SignatureService };
}
