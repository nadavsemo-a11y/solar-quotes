/**
 * post-sign-service.js — COMPATIBILITY WRAPPER
 * ══════════════════════════════════════════════════════════════════════════
 *  Classic-script compat layer for legacy HTML callers:
 *      <script src="post-sign-service.js"></script>
 *      PostSignService.process({ ... })
 *
 *  Canonical implementation now lives in:
 *      /signature/src/post-sign.js
 *      /signature/adapters/transport-http.js
 *      /signature/adapters/notifier-http.js
 *
 *  Differences from the canonical module (intentional, compat-only):
 *    - WORKER_URL and COMPANY_EMAIL are hardcoded here to preserve the
 *      historical behaviour for pages that pre-date the module split.
 *      The ESM module takes both via injected config and hardcodes neither.
 *    - All methods remain `static` to match the original call shape
 *      `PostSignService.process(...)`. The new module is instance-based.
 *
 *  To migrate a page off this wrapper:
 *    1. Switch the host to <script type="module">
 *    2. `import { createSignatureModule } from '/signature/index.js'`
 *    3. `const sig = createSignatureModule({ transport: { baseUrl }, notifier: { companyEmail } })`
 *    4. Replace `PostSignService.process(...)` with `sig.handleCallback(...)`
 *    5. Delete this file once no classic-script callers remain.
 * ══════════════════════════════════════════════════════════════════════════
 */

class PostSignService {

  static WORKER_URL    = 'https://s-a.gs';
  static COMPANY_EMAIL = 'nadav.s@s-a.gs';

  static async process({ docType, docId, signature, emailData = {}, onLock, onProgress }) {
    const errors = [];
    const progress = onProgress || (() => {});

    progress('save', null);
    const saveResult = await PostSignService._saveSignature(docType, docId, signature);
    progress('save', saveResult.ok, saveResult.error);
    if (!saveResult.ok) {
      errors.push('save: ' + (saveResult.error || 'unknown'));
      return { saved: false, notified: false, confirmed: false, errors };
    }

    if (onLock) {
      try { onLock(); } catch { /* UI lock is best-effort */ }
    }

    const notified  = saveResult.action_results?.notify_company?.ok           || false;
    const confirmed = saveResult.action_results?.send_client_confirmation?.ok || false;
    if (!notified) errors.push('notify: server-side notification may have failed');

    progress('done', true);
    return { saved: true, notified, confirmed, errors };
  }

  static async _saveSignature(docType, docId, signature) {
    try {
      const resp = await fetch(`${PostSignService.WORKER_URL}/sign/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, signature }),
      });
      const data = await resp.json();
      if (resp.status === 409) return { ok: false, error: 'המסמך כבר נחתם' };
      return data.success
        ? { ok: true, event_id: data.event_id, action_results: data.action_results }
        : { ok: false, error: data.error };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  static async checkSignature(docId) {
    try {
      const resp = await fetch(`${PostSignService.WORKER_URL}/sign/${docId}`);
      return await resp.json();
    } catch {
      return { signed: false };
    }
  }

  static async _notifyCompany(docType, docId, signature, emailData) {
    try {
      const resp = await fetch(`${PostSignService.WORKER_URL}/q/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'signNotify',
          companyEmail: PostSignService.COMPANY_EMAIL,
          docType, docId,
          signerName: signature.name,
          signerId:   signature.idNum,
          refID:      signature.refID,
          dateStr:    signature.dateStr,
          ipAddr:     signature.ipAddr,
          clientName: emailData.clientName || '',
          docUrl:     emailData.docUrl     || '',
        }),
      });
      return await resp.json();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  static async _confirmClient(docType, signature, emailData) {
    try {
      const resp = await fetch(`${PostSignService.WORKER_URL}/q/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:      'signConfirm',
          clientEmail: emailData.clientEmail,
          clientName:  emailData.clientName || '',
          docType,
          refID:   signature.refID,
          dateStr: signature.dateStr,
          docUrl:  emailData.docUrl || '',
        }),
      });
      return await resp.json();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

window.PostSignService = PostSignService;
