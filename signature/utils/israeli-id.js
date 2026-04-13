/**
 * utils/israeli-id.js — Luhn-based Israeli ID validation.
 * Pure function, no DOM, no config. Extracted from SignatureService.validateIsraeliID.
 */

export function validateIsraeliId(id) {
  if (!id) return false;
  const clean = String(id).trim();
  if (!/^\d{5,9}$/.test(clean)) return false;
  if (/^0+$/.test(clean)) return false;
  const padded = clean.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = parseInt(padded[i], 10) * (i % 2 === 0 ? 1 : 2);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}
