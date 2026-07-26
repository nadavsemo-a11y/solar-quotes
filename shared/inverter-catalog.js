/**
 * shared/inverter-catalog.js
 * SEMO AGS — THE single source of truth for which inverter manufacturers a NEW quote may use.
 *
 * NO DOM, NO window, NO fetch, NO localStorage. Pure data in → data out.
 * NO PRICING lives here — prices belong to shared/upgrade-pricing.js, keyed by these ids.
 *
 * Browser:  <script src="shared/inverter-catalog.js"></script>  → InverterCatalog
 * Worker:   import / require('./shared/inverter-catalog.js')
 *
 * LEGACY NOTE (read before "cleaning" anything here):
 * Quotes saved before 2026-07 may carry an inverter this catalog does not list — historically the
 * portal offered `Sungrow` or the literal `אחר` plus a free-text `customInvModel`. Those saved
 * states are rendered as-is for the customer and MUST NOT be auto-converted to a supported brand;
 * `legacyInverterLabel()` exists to DISPLAY them, never to replace them.
 */

const InverterCatalog = (() => {

  // The authoritative list. Order here is the order shown in the portal selector.
  const INVERTERS = [
    { id: 'Sungrow',  label: 'Sungrow'  },
    { id: 'GoodWe',   label: 'GoodWe'   },
    { id: 'Solinteg', label: 'Solinteg' },
  ];

  const DEFAULT_INVERTER_ID = 'Sungrow';

  /** The manufacturers a NEW quote may use. Returns copies — callers cannot mutate the catalog. */
  function listInverters() {
    return INVERTERS.map(i => ({ ...i }));
  }

  /** Canonical ids only, in display order. */
  function listInverterIds() {
    return INVERTERS.map(i => i.id);
  }

  function getDefaultInverter() {
    return DEFAULT_INVERTER_ID;
  }

  function isSupportedInverter(value) {
    return INVERTERS.some(i => i.id === value);
  }

  function getInverter(value) {
    const hit = INVERTERS.find(i => i.id === value);
    return hit ? { ...hit } : null;
  }

  /**
   * Human label for an inverter value that came out of a SAVED quote.
   * Mirrors QuoteEngine's `invDisplay` resolution (inv === 'אחר' && customInvModel → the model)
   * so the portal shows the salesperson exactly what the customer's document says.
   * Pure display — it never maps an unsupported value onto a supported one.
   */
  function legacyInverterLabel(inv, customInvModel) {
    const v = (inv == null ? '' : String(inv)).trim();
    const m = (customInvModel == null ? '' : String(customInvModel)).trim();
    if (v === 'אחר' && m) return m;
    return v || m;
  }

  return {
    listInverters,
    listInverterIds,
    getDefaultInverter,
    isSupportedInverter,
    getInverter,
    legacyInverterLabel,
    DEFAULT_INVERTER_ID,
  };

})();

// Worker/Node (CommonJS, bundled by esbuild) + browser global.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InverterCatalog };
}
if (typeof globalThis !== 'undefined') {
  globalThis.InverterCatalog = InverterCatalog;
}
