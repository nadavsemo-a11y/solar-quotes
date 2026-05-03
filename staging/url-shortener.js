/**
 * url-shortener.js — SEMO AGS URL Shortener Module
 *
 * מודול עצמאי לקיצור כתובות URL דרך שירות s-a.gs.
 * ניתן לשימוש בכל יישום — לא תלוי בהצעות מחיר או מודול אחר.
 *
 * שימוש:
 *   const shortener = new UrlShortener();
 *   const result = await shortener.shorten('https://example.com/long-url');
 *   console.log(result.url);  // https://s-a.gs/q/abc123
 *
 *   // עם slug מותאם אישית:
 *   const result2 = await shortener.shorten('https://...', 'my-slug');
 *   console.log(result2.url); // https://s-a.gs/q/my-slug
 *
 *   // העתקה ללוח:
 *   await shortener.copyToClipboard(result.url);
 */

class UrlShortener {

  /**
   * @param {string} [serviceUrl='https://s-a.gs'] — כתובת בסיס של שירות הקיצור
   */
  constructor(serviceUrl = 'https://s-a.gs') {
    this._serviceUrl = serviceUrl.replace(/\/+$/, '');
  }

  /**
   * shorten(url, slug?)
   * מקצר כתובת URL. מחזיר { id, url }.
   *
   * @param {string} url   — הכתובת המלאה לקיצור
   * @param {string} [slug] — slug מותאם אישית (אופציונלי). אם תפוס, יתווסף סיומת (-2, -3...)
   * @returns {Promise<{id: string, url: string}>}
   * @throws {Error} אם הכתובת לא תקינה או השרת לא זמין
   */
  async shorten(url, slug) {
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      throw new Error('כתובת URL חייבת להתחיל ב-http:// או https://');
    }

    const body = { url };
    if (slug) body.slug = slug;

    const resp = await fetch(`${this._serviceUrl}/q/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`שגיאת שרת ${resp.status}: ${text}`);
    }

    return resp.json();
  }

  /**
   * copyToClipboard(text)
   * מעתיק טקסט ללוח.
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
  module.exports = { UrlShortener };
}
