// ═══════════════════════════════════════════════════════════════
//  SEMO AGS — Email Service Module
//  Asks the Worker (/q/email) to send a saved quote to its customer
//  Part of SEMO OS architecture — standalone module
// ═══════════════════════════════════════════════════════════════

class EmailService {

  /**
   * The Worker origin this page talks to. `window.__SEMO_API_BASE__` is injected by the Worker when it
   * serves the portal (s-a.gs/portal, or the CRM's own origin when the CRM embeds it), exactly as
   * StorageService and CatalogClient read it.
   */
  static endpoint() {
    return ((typeof window !== 'undefined' && window.__SEMO_API_BASE__) || 'https://s-a.gs') + '/q/email';
  }

  // What the seller sees for a refusal the server explains by status rather than by text.
  static STATUS_MESSAGES = {
    401: 'נדרשת התחברות לפורטל המוכרים כדי לשלוח הצעה במייל',
    403: 'נדרשת התחברות לפורטל המוכרים כדי לשלוח הצעה במייל',
    409: 'כתובת המייל בטופס שונה מזו שנשמרה בהצעה — יש להפיק את ההצעה מחדש כדי לשלוח לכתובת החדשה',
    429: 'נשלחו יותר מדי מיילים בדקה האחרונה — יש לנסות שוב בעוד דקה',
  };

  /**
   * sendQuoteEmail — asks the Worker to send a SAVED quote to its customer (+ the company copy).
   *
   * The request names the quote; the server builds the mail from the stored record — name, city,
   * kW, date and the quote link — and sends it to the address saved on the quote. `clientEmail` is
   * honoured only for a quote saved without one. Sent with the seller's session (same-origin).
   *
   * @param {object} opts
   * @param {string} opts.quoteId       — מזהה ההצעה השמורה (storage.lastSaveResult.id)
   * @param {string} [opts.clientEmail] — מייל הלקוח מהטופס (אימות / תיקון להצעה שנשמרה בלי מייל)
   * @returns {Promise<{success: boolean, sentTo?: string[], error?: string}>}
   */
  static async sendQuoteEmail(opts) {
    try {
      const payload = { action: 'sendQuote', quoteId: (opts && opts.quoteId) || '' };
      if (opts && opts.clientEmail) payload.clientEmail = opts.clientEmail;

      const resp = await fetch(EmailService.endpoint(), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await resp.json().catch(() => null);

      if (!resp.ok) {
        const known = EmailService.STATUS_MESSAGES[resp.status];
        return { success: false, status: resp.status, error: known || (result && result.error) || `HTTP ${resp.status}` };
      }

      if (result && result.success) {
        return { success: true, sentTo: Array.isArray(result.sentTo) ? result.sentTo : [] };
      }

      return { success: false, error: result?.error || 'תגובה לא תקינה מהשרת' };

    } catch (err) {
      console.error('EmailService: failed to send', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Show toast notification for email status
   */
  static showToast(message, isError = false) {
    const existing = document.getElementById('email-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'email-toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: ${isError ? '#dc2626' : '#0A1628'}; color: white;
      padding: 14px 28px; border-radius: 12px; font-size: 14px; font-weight: 700;
      font-family: 'Assistant', sans-serif; z-index: 9999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      animation: emailToastIn 0.3s ease;
    `;
    toast.textContent = message;

    // Add animation keyframes if not already present
    if (!document.getElementById('email-toast-style')) {
      const style = document.createElement('style');
      style.id = 'email-toast-style';
      style.textContent = `
        @keyframes emailToastIn { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}

// Make available globally
window.EmailService = EmailService;
