/**
 * storage-service.js — SEMO AGS Storage Service
 *
 * אחריות: כל מה שקשור לשמירה, טעינה ושיתוף של הצעות מחיר.
 *   - encode / decode של state (base64 JSON)
 *   - שמירה ל-Cloudflare KV דרך Worker
 *   - טעינה מ-URL hash או מ-Worker
 *
 * השליחה ללקוח (וואטסאפ / מייל / העתקת קישור) אינה כאן: היא במסך התצוגה המקדימה המשותף לכל סוגי
 * ההצעות — shared/quote-issue-panel.js.
 *
 * תלויות:
 *   - url-shortener.js → UrlShortener (מודול קיצור כתובות עצמאי)
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
    this.shortener  = new UrlShortener(workerUrl);
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
    if (!resp.ok) {
      // The server prices schema-2 quotes itself and refuses rather than guessing. Its structured
      // errors carry the reason, and the seller can act on all of them — a generic "server error"
      // would send them back to the portal with no idea what to change.
      let body = null;
      try { body = await resp.json(); } catch { /* non-JSON error page */ }
      const err = new Error((body && (body.detail || body.error)) || `שגיאת שרת ${resp.status}`);
      err.status = resp.status;
      err.code = (body && (body.code || body.error)) || null;
      err.currentVersionId = (body && body.currentVersionId) || null;
      throw err;
    }
    const json = await resp.json();
    // The response is now an object, not just a URL: a quote carrying seller-created one-time items
    // gets their SERVER-MINTED identities back so the still-open portal page can adopt them. Saving
    // twice would otherwise mint a second id for the same line.
    this.lastSaveResult = json;
    return json.url;
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
}

// ── ייצוא ────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageService };
}
