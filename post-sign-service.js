// ═══════════════════════════════════════════════════════════════
//  SEMO AGS — Post-Signature Service
//  Handles what happens after a document is signed:
//  save to server, notify company, confirm to client, lock UI.
//  Document-type agnostic — works for quotes, agreements, etc.
// ═══════════════════════════════════════════════════════════════

class PostSignService {

  static WORKER_URL = 'https://s-a.gs';
  static COMPANY_EMAIL = 'nadav.s@s-a.gs';

  /**
   * process — single entry point after signature collected.
   *
   * @param {object} params
   * @param {string}   params.docType    — 'quote' | 'agreement' | ...
   * @param {string}   params.docId      — KV document ID (e.g. 'abc123')
   * @param {object}   params.signature  — from SignatureService.collect()
   * @param {object}   params.emailData  — { clientName, clientEmail, docUrl, ...extra }
   * @param {function} [params.onLock]   — callback to lock the UI
   * @param {function} [params.onProgress] — (step, ok, error?) callback
   * @returns {Promise<{ saved: boolean, notified: boolean, confirmed: boolean, errors: string[] }>}
   */
  static async process({ docType, docId, signature, emailData = {}, onLock, onProgress }) {
    const errors = [];
    const progress = onProgress || (() => {});

    // Step 1: Save signature to server (critical)
    progress('save', null);
    const saveResult = await PostSignService._saveSignature(docType, docId, signature);
    progress('save', saveResult.ok, saveResult.error);
    if (!saveResult.ok) {
      errors.push('save: ' + (saveResult.error || 'unknown'));
      return { saved: false, notified: false, confirmed: false, errors };
    }

    // Step 2: Lock the document
    if (onLock) {
      try { onLock(); } catch (e) { /* UI lock is best-effort */ }
    }

    // Step 3: Notify company + confirm client (best-effort, parallel)
    progress('notify', null);
    const [notifyResult, confirmResult] = await Promise.allSettled([
      PostSignService._notifyCompany(docType, docId, signature, emailData),
      emailData.clientEmail
        ? PostSignService._confirmClient(docType, signature, emailData)
        : Promise.resolve({ ok: true, skipped: true }),
    ]);

    const notified = notifyResult.status === 'fulfilled' && notifyResult.value.ok;
    const confirmed = confirmResult.status === 'fulfilled' && confirmResult.value.ok;

    if (!notified) errors.push('notify: ' + (notifyResult.reason || notifyResult.value?.error || 'failed'));
    if (!confirmed && !confirmResult.value?.skipped) errors.push('confirm: ' + (confirmResult.reason || confirmResult.value?.error || 'failed'));

    progress('done', true);
    return { saved: true, notified, confirmed, errors };
  }

  /** Save signature to Worker KV */
  static async _saveSignature(docType, docId, signature) {
    try {
      const resp = await fetch(`${PostSignService.WORKER_URL}/sign/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, signature }),
      });
      const data = await resp.json();
      if (resp.status === 409) return { ok: false, error: 'המסמך כבר נחתם' };
      return data.success ? { ok: true } : { ok: false, error: data.error };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /** Check if a document is already signed */
  static async checkSignature(docId) {
    try {
      const resp = await fetch(`${PostSignService.WORKER_URL}/sign/${docId}`);
      return await resp.json();
    } catch {
      return { signed: false };
    }
  }

  /** Notify company that a document was signed */
  static async _notifyCompany(docType, docId, signature, emailData) {
    try {
      const resp = await fetch(`${PostSignService.WORKER_URL}/q/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'signNotify',
          companyEmail: PostSignService.COMPANY_EMAIL,
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

  /** Send confirmation email to client */
  static async _confirmClient(docType, signature, emailData) {
    try {
      const resp = await fetch(`${PostSignService.WORKER_URL}/q/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

window.PostSignService = PostSignService;
