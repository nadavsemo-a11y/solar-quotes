/**
 * storage-service.js — SEMO AGS Storage Service
 *
 * אחריות: כל מה שקשור לשמירה, טעינה ושיתוף של הצעות מחיר.
 *   - encode / decode של state (base64 JSON)
 *   - שמירה ל-Cloudflare KV דרך Worker
 *   - טעינה מ-URL hash או מ-Worker
 *   - בניית קישורי שיתוף (WhatsApp, Email, fallback)
 *   - fallback URL (ללא Worker, embed מלא ב-hash)
 *
 * אין כאן גישה ל-DOM — הנתונים מועברים מבחוץ.
 * אין כאן לוגיקת UI — callbacks מוחזרים לקורא.
 *
 * שימוש:
 *   const storage = new StorageService('https://s-a.gs');
 *   const shortUrl = await storage.save(stateObject);
 *   const state    = await storage.load();   // מנסה hash ואז Worker
 */

class StorageService {

  /**
   * @param {string} workerUrl  — Worker base URL, e.g. 'https://s-a.gs'
   */
  constructor(workerUrl = 'https://s-a.gs') {
    this._workerUrl = workerUrl;
  }

  // ── Encode / Decode ────────────────────────────────────────────────────

  /**
   * encode(state)
   * מקודד אובייקט JS ל-base64 string בטוח ל-URL.
   * @param {object} state
   * @returns {string}
   */
  encode(state) {
    const json = JSON.stringify(state);
    return btoa(unescape(encodeURIComponent(json)));
  }

  /**
   * decode(encoded)
   * מפענח base64 string בחזרה לאובייקט JS.
   * @param {string} encoded
   * @returns {object|null}
   */
  decode(encoded) {
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────

  /**
   * save(state)
   * שומר את ה-state ב-Cloudflare KV דרך Worker.
   * מחזיר את ה-URL הקצר.
   *
   * @param {object} state  — אובייקט state (מ-buildStateFromForm או שקול)
   * @returns {Promise<string>}  — short URL, e.g. https://s-a.gs/q/abc123
   * @throws {Error} אם הבקשה נכשלת
   */
  async save(state) {
    const encoded = this.encode(state);
    const resp = await fetch(`${this._workerUrl}/q/save`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ data: encoded }),
    });
    if (!resp.ok) throw new Error(`שגיאת שרת ${resp.status}`);
    const json = await resp.json();
    return json.url;
  }

  /**
   * buildFallbackUrl(state, baseUrl?)
   * מייצר URL עם ה-state מוטבע ב-hash — ללא Worker.
   * שימושי כ-fallback אם השרת לא זמין.
   *
   * @param {object} state
   * @param {string} [baseUrl]  — ברירת מחדל: ה-URL הנוכחי
   * @returns {string}
   */
  buildFallbackUrl(state, baseUrl) {
    const base    = (baseUrl || window.location.href).split('#')[0];
    const encoded = this.encode(state);
    return `${base}#q=${encoded}`;
  }

  // ── Load ───────────────────────────────────────────────────────────────

  /**
   * loadFromHash()
   * מנסה לטעון state מה-URL hash (#q=...) או מ-window.__QUOTE_DATA__.
   *
   * @returns {object|null}  — state object אם נמצא, אחרת null
   */
  loadFromHash() {
    // Worker מזריק __QUOTE_DATA__ ישירות לדף (ב-script tag)
    if (typeof window !== 'undefined' && window.__QUOTE_DATA__) {
      return this.decode(window.__QUOTE_DATA__);
    }
    // fallback: URL hash
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.startsWith('#q=')) {
        return this.decode(hash.slice(3));
      }
    }
    return null;
  }

  /**
   * load()
   * מנסה לטעון state — קודם hash, אחר-כך מחזיר null.
   * async API לעתיד (למשל טעינה מ-API לפי ID).
   *
   * @returns {Promise<object|null>}
   */
  async load() {
    return this.loadFromHash();
  }

  // ── Share Links ────────────────────────────────────────────────────────

  /**
   * buildWhatsAppUrl(shortUrl, clientName, clientPhone, dcKW)
   * בונה קישור WhatsApp עם הודעה מוכנה.
   * אם יש מספר טלפון — פותח צ'אט ישיר, אחרת share כללי.
   *
   * @param {string} shortUrl
   * @param {string} clientName
   * @param {string} clientPhone   — מספר כולל/ללא קידומת
   * @param {string|number} dcKW
   * @returns {string}
   */
  buildWhatsAppUrl(shortUrl, clientName, clientPhone, dcKW) {
    const name  = clientName  || 'לקוח יקר';
    const kw    = dcKW        || '';
    const phone = String(clientPhone || '').replace(/\D/g, '');

    const msg = encodeURIComponent(
      `שלום ${name},\nמצורפת הצעת מחיר למערכת סולארית בהספק ${kw} kW:\n${shortUrl}`
    );

    return phone
      ? `https://wa.me/972${phone.replace(/^0/, '')}?text=${msg}`
      : `https://wa.me/?text=${msg}`;
  }

  /**
   * buildEmailUrl(shortUrl, clientName, dcKW)
   * בונה mailto: link עם נושא וגוף מוכנים.
   *
   * @param {string} shortUrl
   * @param {string} clientName
   * @param {string|number} dcKW
   * @returns {string}
   */
  buildEmailUrl(shortUrl, clientName, dcKW) {
    const name    = clientName || 'לקוח יקר';
    const kw      = dcKW      || '';
    const subject = encodeURIComponent(`הצעת מחיר למערכת סולארית ${kw} kW — SEMO AGS`);
    const body    = encodeURIComponent(
      `שלום ${name},\n\nמצורפת הצעת מחיר למערכת סולארית בהספק ${kw} kW:\n${shortUrl}\n\nבברכה,\nSEMO AGS`
    );
    return `mailto:?subject=${subject}&body=${body}`;
  }

  // ── Copy to Clipboard ──────────────────────────────────────────────────

  /**
   * copyToClipboard(text)
   * מעתיק טקסט ללוח. מחזיר Promise<boolean>.
   *
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

// ── ייצוא ────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageService };
}
