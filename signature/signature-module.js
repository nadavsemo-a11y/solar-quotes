/**
 * signature-module.js — core factory
 *
 * The heart of the module. Returns a plain object of pure-ish functions
 * that the caller can invoke from ANY runtime:
 *   - Node process (internal library)
 *   - Express handler (via server.js)
 *   - Cloudflare Worker
 *   - AWS Lambda
 *   - Browser (capture side only)
 *
 * It must NEVER:
 *   - import Express, Koa, Fastify, or any HTTP framework
 *   - read process.env directly (config is injected)
 *   - call fetch/axios directly (transport is injected via adapter)
 *   - hardcode URLs, emails, IDs, or tenant-specific strings
 *
 * Everything HTTP-shaped lives in server.js.
 * Everything I/O-shaped lives in adapters/.
 */

import { defineConfig } from './config/index.js';
import { SignatureCapture } from './src/signature-capture.js';
import { PostSign } from './src/post-sign.js';
import { HttpTransport } from './adapters/transport-http.js';
import { HttpNotifier } from './adapters/notifier-http.js';

/**
 * createSignatureModule — factory
 *
 * @param {object} userConfig — see config/default.js for shape
 * @param {object} [overrides] — optional deps for testing or advanced use
 * @param {object} [overrides.transport] — transport adapter (defaults to HttpTransport)
 * @param {object} [overrides.notifier]  — notifier adapter (defaults to no-op)
 * @returns {{
 *   createSignRequest: (args: object) => Promise<object>,
 *   handleCallback:    (args: object) => Promise<object>,
 *   getArtifact:       (id: string)   => Promise<object | null>,
 *   config: object
 * }}
 */
export function createSignatureModule(userConfig = {}, overrides = {}) {
  const config = defineConfig(userConfig);

  const transport = overrides.transport || new HttpTransport(config.transport);
  const notifier  = overrides.notifier
    || (config.notifier?.companyEmail ? new HttpNotifier(config.transport) : null);

  const postSign = new PostSign({ transport, notifier, config });

  return {
    /**
     * Create a new signature request. Browser-side consumers instantiate
     * SignatureCapture directly; this method is for server-side or
     * programmatic request creation (e.g., generating a signing link).
     * Kept as a thin stub — most current consumers use SignatureCapture.
     */
    async createSignRequest({ docType, docId, payload = {} }) {
      return { ok: true, docType, docId, payload, createdAt: new Date().toISOString() };
    },

    /** Handle a signature callback (signed payload arrives). */
    async handleCallback({ docType, docId, signature, emailData, onLock, onProgress }) {
      return postSign.process({ docType, docId, signature, emailData, onLock, onProgress });
    },

    /** Fetch a signed artifact by id. */
    async getArtifact(id) {
      return postSign.checkSignature(id);
    },

    // Escape hatches for consumers that want direct access
    postSign,
    transport,
    notifier,
    SignatureCapture,

    config,
  };
}

// Browser global fallback — lets existing <script src> consumers in SEMO OS
// migrate gradually. See Phase 2 design doc for rationale.
if (typeof window !== 'undefined') {
  window.SignatureModule = window.SignatureModule || {
    createSignatureModule,
    SignatureCapture,
    PostSign,
  };
}
