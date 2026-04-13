/**
 * utils/client-metadata.js — browser-side context collection.
 *
 * Extracted from SignatureService._collectMeta and _getPublicIP.
 * The IP resolver is decoupled: consumers can inject their own resolver
 * via config.metadata.ipResolver (e.g., for server-side resolution, or
 * to opt out entirely).
 */

export function collectClientMetadata(env = globalThis) {
  const nav    = env.navigator || {};
  const scr    = env.screen    || {};
  const loc    = env.location  || {};
  const tzFn   = env.Intl?.DateTimeFormat;

  return {
    userAgent:  nav.userAgent || '',
    language:   nav.language  || '',
    screenSize: scr.width && scr.height ? `${scr.width}x${scr.height}` : '',
    timezone:   tzFn ? (new tzFn()).resolvedOptions().timeZone || '' : '',
    pageUrl:    loc.href || '',
    timestamp:  new Date().toISOString(),
  };
}

/**
 * Default IP resolver — uses ipify. Override via config.metadata.ipResolver
 * for custom IP resolution, offline operation, or privacy-sensitive hosts.
 */
export async function defaultIpResolver() {
  try {
    const res  = await fetch('https://api.ipify.org?format=json');
    const json = await res.json();
    return json.ip || 'לא זמין';
  } catch {
    return 'לא זמין';
  }
}
