/**
 * adapters/notifier-http.js — default HTTP notifier.
 *
 * Ported from PostSignService._notifyCompany / _confirmClient. The endpoint
 * path (`/q/email`) and payload shape are preserved. The company email,
 * previously hardcoded as `PostSignService.COMPANY_EMAIL`, now comes from
 * the injected config.notifier.companyEmail.
 */

export class HttpNotifier {
  constructor({ baseUrl, headers = {} } = {}) {
    if (!baseUrl) throw new Error('HttpNotifier: baseUrl is required');
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._headers = headers;
  }

  async notifyCompany({ docType, docId, signature, emailData = {}, config }) {
    const companyEmail = config?.notifier?.companyEmail;
    if (!companyEmail) return { ok: false, error: 'notifier.companyEmail not configured' };

    try {
      const resp = await fetch(`${this._baseUrl}/q/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this._headers },
        body: JSON.stringify({
          action: 'signNotify',
          companyEmail,
          docType,
          docId,
          signerName: signature.name,
          signerId: signature.idNum,
          refID: signature.refID,
          dateStr: signature.dateStr,
          ipAddr: signature.ipAddr,
          clientName: emailData.clientName || '',
          docUrl: emailData.docUrl || '',
        }),
      });
      return await resp.json();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async confirmToClient({ docType, signature, emailData = {} }) {
    if (!emailData.clientEmail) return { ok: false, error: 'clientEmail missing' };
    try {
      const resp = await fetch(`${this._baseUrl}/q/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this._headers },
        body: JSON.stringify({
          action: 'signConfirm',
          clientEmail: emailData.clientEmail,
          clientName: emailData.clientName || '',
          docType,
          refID: signature.refID,
          dateStr: signature.dateStr,
          docUrl: emailData.docUrl || '',
        }),
      });
      return await resp.json();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}
