/**
 * shared/quote-validation.js
 * SEMO AGS — the rules a NEW solar quote must satisfy before it may be generated or saved.
 *
 * NO DOM, NO window, NO fetch, NO localStorage. Pure data in → data out, so every rule is
 * testable without a browser. quote-ui.js maps the returned field ids onto form elements.
 *
 * SCOPE — this validates AUTHORING a new quote. It is deliberately NOT applied when a customer
 * views an already-saved quote: historical quotes predate these rules (a missing roof area, an
 * inverter that is no longer sold) and must keep rendering exactly as they were signed.
 */

const QuoteValidation = (() => {

  const InvCat = (typeof module !== 'undefined' && module.exports)
    ? require('./inverter-catalog.js').InverterCatalog
    : (typeof globalThis !== 'undefined' ? globalThis.InverterCatalog : undefined);

  const MESSAGES = {
    'roofArea.required': 'יש למלא שטח גג',
    'roofArea.invalid':  'שטח הגג חייב להיות מספר גדול מאפס',
    'inverter.required': 'יש לבחור יצרן ממיר',
    'inverter.unsupported': 'יצרן הממיר בהצעה המקורית אינו זמין להצעות חדשות — יש לבחור יצרן נתמך',
  };

  function err(field, code, extra) {
    return { field, code, message: MESSAGES[`${field}.${code}`] || 'שדה לא תקין', ...(extra || {}) };
  }

  /**
   * validateRoofArea(raw) → error | null
   * Empty ⇒ required. Non-numeric / zero / negative ⇒ invalid. The portal's live preview keeps
   * coercing an empty field to 0 while typing; this is the boundary that refuses to let that 0
   * become a document.
   */
  function validateRoofArea(raw) {
    const s = raw == null ? '' : String(raw).trim();
    if (s === '') return err('roofArea', 'required');
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n <= 0) return err('roofArea', 'invalid');
    return null;
  }

  /**
   * validateInverter(raw) → error | null
   * A new quote must name one of the currently supported manufacturers. An inverter carried over
   * from a duplicated historical quote fails here ON PURPOSE — the salesperson has to choose, and
   * nothing silently rewrites the old value.
   */
  function validateInverter(raw) {
    const s = raw == null ? '' : String(raw).trim();
    if (s === '') return err('inverter', 'required');
    if (!InvCat || !InvCat.isSupportedInverter(s)) return err('inverter', 'unsupported', { value: s });
    return null;
  }

  /**
   * validateNewQuote({ roofArea, inverter }) → { valid, errors:[{field,code,message}] }
   * Errors come back in form order so the caller can focus the first one.
   */
  function validateNewQuote(input = {}) {
    const errors = [];
    const roof = validateRoofArea(input.roofArea);
    if (roof) errors.push(roof);
    const inv = validateInverter(input.inverter);
    if (inv) errors.push(inv);
    return { valid: errors.length === 0, errors };
  }

  return { validateNewQuote, validateRoofArea, validateInverter, MESSAGES };

})();

// Worker/Node (CommonJS, bundled by esbuild) + browser global.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QuoteValidation };
}
if (typeof globalThis !== 'undefined') {
  globalThis.QuoteValidation = QuoteValidation;
}
