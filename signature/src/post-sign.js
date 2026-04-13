/**
 * src/post-sign.js — orchestrates what happens after a signature is collected.
 *
 * Ported from SEMO OS `post-sign-service.js`. Behaviour preserved.
 *
 * Decoupling applied:
 *   - No `static WORKER_URL` — transport adapter injected
 *   - No `static COMPANY_EMAIL` — notifier config injected
 *   - No fetch calls — all I/O goes through the transport / notifier adapters
 *   - Instance-based (not all-static) so multiple configs can coexist
 *   - Document-type agnostic (unchanged — this was already clean)
 */

export class PostSign {
  constructor({ transport, notifier = null, config } = {}) {
    if (!transport) throw new Error('PostSign: transport adapter is required');
    if (!config)    throw new Error('PostSign: config is required');
    this._transport = transport;
    this._notifier  = notifier;
    this._config    = config;
  }

  /**
   * Single entry point after a signature has been collected client-side.
   *
   * @param {object} params
   * @param {string}   params.docType
   * @param {string}   params.docId
   * @param {object}   params.signature   — from SignatureCapture.collect()
   * @param {object}  [params.emailData]  — { clientName, clientEmail, docUrl, ...extra }
   * @param {function}[params.onLock]
   * @param {function}[params.onProgress]
   */
  async process({ docType, docId, signature, emailData = {}, onLock, onProgress }) {
    const errors = [];
    const progress = onProgress || (() => {});

    progress('save', null);
    const saveResult = await this._transport.save({ docType, docId, signature });
    progress('save', saveResult.ok, saveResult.error);
    if (!saveResult.ok) {
      errors.push('save: ' + (saveResult.error || 'unknown'));
      return { saved: false, notified: false, confirmed: false, errors };
    }

    if (onLock) {
      try { onLock(); } catch { /* UI lock is best-effort */ }
    }

    // Server-side trigger engine is preferred (reports status via action_results).
    // If the transport response doesn't carry those, fall back to the injected
    // notifier adapter — when one is configured.
    let notified  = saveResult.action_results?.notify_company?.ok            || false;
    let confirmed = saveResult.action_results?.send_client_confirmation?.ok  || false;

    if (this._notifier) {
      if (!notified) {
        try {
          const r = await this._notifier.notifyCompany({ docType, docId, signature, emailData, config: this._config });
          notified = !!r?.ok;
        } catch (err) { errors.push('notify: ' + err.message); }
      }
      if (!confirmed && emailData.clientEmail) {
        try {
          const r = await this._notifier.confirmToClient({ docType, signature, emailData, config: this._config });
          confirmed = !!r?.ok;
        } catch (err) { errors.push('confirm: ' + err.message); }
      }
    }

    if (!notified) errors.push('notify: no notification path succeeded');

    progress('done', true);
    return { saved: true, notified, confirmed, errors, event_id: saveResult.event_id };
  }

  /** Check whether a document is already signed. */
  async checkSignature(docId) {
    return this._transport.fetchArtifact(docId);
  }
}
