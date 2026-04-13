/**
 * adapters/transport-http.js — default HTTP transport.
 *
 * Ported from PostSignService._saveSignature / checkSignature. The specific
 * URL shape (`/sign/:docId`) is preserved, but the base URL is injected so
 * the same adapter works against SEMO's current Worker or any other backend
 * that implements the same endpoints.
 */

export class HttpTransport {
  constructor({ baseUrl, timeoutMs = 10000, headers = {} } = {}) {
    if (!baseUrl) throw new Error('HttpTransport: baseUrl is required');
    this._baseUrl   = baseUrl.replace(/\/+$/, '');
    this._timeoutMs = timeoutMs;
    this._headers   = headers;
  }

  async save({ docType, docId, signature }) {
    try {
      const resp = await fetch(`${this._baseUrl}/sign/${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this._headers },
        body: JSON.stringify({ docType, signature }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 409) return { ok: false, error: 'המסמך כבר נחתם' };
      return data.success
        ? { ok: true, event_id: data.event_id, action_results: data.action_results }
        : { ok: false, error: data.error };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async fetchArtifact(id) {
    try {
      const resp = await fetch(`${this._baseUrl}/sign/${encodeURIComponent(id)}`, {
        headers: this._headers,
      });
      return await resp.json();
    } catch {
      return { signed: false };
    }
  }
}
