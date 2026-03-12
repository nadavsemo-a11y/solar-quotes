// ═══════════════════════════════════════════════════════════════
//  SEMO AGS — Email Service Module
//  Sends quote emails via Google Apps Script backend
//  Part of SEMO OS architecture — standalone module
// ═══════════════════════════════════════════════════════════════

class EmailService {

  static ENDPOINT = 'https://s-a.gs/q/email';
  static COMPANY_EMAIL = 'nadav.s@s-a.gs';

  /**
   * sendQuoteEmail — sends the quote to client + company copy
   *
   * @param {object} opts
   * @param {string} opts.clientName   — שם הלקוח
   * @param {string} opts.clientEmail  — מייל הלקוח
   * @param {string} opts.quoteUrl     — לינק להצעה
   * @param {string} opts.systemKW     — הספק המערכת
   * @param {string} opts.totalPrice   — מחיר כולל (מפורמט)
   * @param {string} opts.quoteDate    — תאריך ההצעה
   * @param {string} opts.city         — יישוב
   * @returns {Promise<{success: boolean, sentTo?: string[], error?: string}>}
   */
  static async sendQuoteEmail(opts) {
    try {
      const payload = {
        action: 'sendQuote',
        clientName:   opts.clientName   || '',
        clientEmail:  opts.clientEmail  || '',
        companyEmail: EmailService.COMPANY_EMAIL,
        quoteUrl:     opts.quoteUrl     || '',
        systemKW:     opts.systemKW     || '',
        totalPrice:   opts.totalPrice   || '',
        quoteDate:    opts.quoteDate    || '',
        city:         opts.city         || '',
      };

      const resp = await fetch(EmailService.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}` };
      }

      const result = await resp.json().catch(() => null);

      if (result && result.success) {
        return { success: true, sentTo: result.sentTo || [opts.clientEmail, EmailService.COMPANY_EMAIL].filter(Boolean) };
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
