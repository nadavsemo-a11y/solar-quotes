/**
 * @semo/signature — public API barrel
 *
 * This is the ONLY supported entry point for consumers using the signature
 * module as an internal library. Do not import from src/, services/, or
 * adapters/ directly — those paths are internal and may be restructured.
 *
 * For the HTTP service mode, use server.js instead.
 */

import { createSignatureModule } from './signature-module.js';
import { defineConfig, defaultConfig } from './config/index.js';

export { createSignatureModule, defineConfig, defaultConfig };

// Re-exports for power users who need low-level pieces.
// Each of these is documented in docs/api.md (to be written in Phase 5).
export { SignatureCapture } from './src/signature-capture.js';
export { PostSign } from './src/post-sign.js';
export { HttpTransport } from './adapters/transport-http.js';
export { HttpNotifier } from './adapters/notifier-http.js';
export { validateIsraeliId } from './utils/israeli-id.js';
export { hashSnapshot } from './utils/hash.js';
export { collectClientMetadata, defaultIpResolver } from './utils/client-metadata.js';

export default createSignatureModule;
