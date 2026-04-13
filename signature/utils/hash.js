/**
 * utils/hash.js — SHA-256 of a canonical JSON form.
 * Uses the platform `crypto.subtle` (browser + Node 20+).
 * Extracted from SignatureService.hashSnapshot.
 */

export async function hashSnapshot(obj) {
  const json = JSON.stringify(obj, Object.keys(obj).sort());
  const buf = new TextEncoder().encode(json);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
