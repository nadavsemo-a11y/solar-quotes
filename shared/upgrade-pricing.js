/**
 * shared/upgrade-pricing.js
 * SEMO AGS — THE single source of truth for how an upgrade / potential-cost price is resolved.
 *
 * NO DOM, NO window, NO fetch, NO localStorage, NO HTML, NO element ids. Pure data in → data out.
 * Deterministic and testable without a browser.
 *
 * Browser:  <script src="shared/upgrade-pricing.js"></script>  → UpgradePricing
 * Worker:   import / require('./shared/upgrade-pricing.js')
 *
 * WHY THIS MODULE EXISTS
 * Before it, the same pricing `switch` was written twice — once in quote-ui.js (browser, reading
 * the DOM) and once in quote-public.js (Worker, reading a saved state), each a hand-maintained
 * copy of the other. Both now call resolveExtras(); the rules live here only.
 *
 * PRICE-SNAPSHOT INVARIANT (do not break)
 * This catalog supplies DEFAULTS at authoring time. The price a quote was actually sold at is
 * carried by the SAVED QUOTE STATE (`extras[id].price`, `battFP`, `battEP`, `premP`, `usdRate`).
 * Every resolver below therefore prefers the caller-supplied context/override over the catalog,
 * so re-rendering a quote signed months ago never reprices it from today's configuration.
 */

const UpgradePricing = (() => {

  const InvCat = (typeof module !== 'undefined' && module.exports)
    ? require('./inverter-catalog.js').InverterCatalog
    : (typeof globalThis !== 'undefined' ? globalThis.InverterCatalog : undefined);

  /** Bump when the SHAPE of a stored extras config changes (not when a price changes). */
  const PRICING_SCHEMA_VERSION = 1;

  // ── the per-inverter price book — DATA ONLY ──────────────────────────────────────────────────
  // Changing what a manufacturer costs is a change HERE and nowhere else: no QuoteUI edit, no
  // HTML edit, no engine edit. Today all three are identical on purpose; that is a business fact,
  // not an architectural one.
  const INVERTER_PRICING = {
    Sungrow:  { hybridInverter: 8900, batteryFirst: 8900, batteryAdditional: 6500 },
    GoodWe:   { hybridInverter: 8900, batteryFirst: 8900, batteryAdditional: 6500 },
    Solinteg: { hybridInverter: 8900, batteryFirst: 8900, batteryAdditional: 6500 },
  };

  // LEGACY COMPATIBILITY: quotes saved before the catalog existed carry inverters that are not in
  // it (`אחר`, `Huawei`, …). They still have to resolve to a number when re-rendered. These are the
  // values the engine and the portal used at the time, so a legacy quote resolves exactly as it did.
  const LEGACY_INVERTER_PRICING = { hybridInverter: 8900, batteryFirst: 8900, batteryAdditional: 6500 };

  // Portal input defaults — the numbers a FRESH quote form starts with. They used to be typed into
  // index.html AND duplicated as `||` fallbacks in quote-ui.js, which is how `usdRate` ended up
  // being 3.09 in the HTML and 3.14 in one JS fallback.
  const NEW_QUOTE_INPUT_DEFAULTS = {
    meterPanelPrice: 2500,
    premiumPanelUsd: 100,
    usdRate: 3.09,
  };

  // ── the upgrade catalog ─────────────────────────────────────────────────────────────────────
  // `calcType` is the pricing strategy and is CODE-OWNED (shared/extras-catalog.js re-derives it on
  // every published version, so a client can never pin one). `label`/`defaultPrice`
  // are CONFIG-OWNED — the extras manager may change them.
  // `inverterPriceKey` opts an item into the per-inverter price book.
  // `legacy: true` = resolvable for historical quotes, never offered on a new one.
  const DEFAULT_CATALOG = {
    upgrades: [
      { id: 'hybrid-inv', label: 'שדרוג לממיר היברידי',      defaultPrice: 8900, calcType: 'fixed', inverterPriceKey: 'hybridInverter' },
      { id: 'batteries',  label: 'מצברי אגירה (בטריות)',      defaultPrice: 0,    calcType: 'batteries' },
      { id: 'premium',    label: 'שדרוג לפאנל פרמיום שחור',   defaultPrice: 0,    calcType: 'premium' },
      { id: 'solaredge',  label: 'תוספת ממיר SolarEdge',      defaultPrice: 0,    calcType: 'solaredge', legacy: true },
      { id: 'ev',         label: 'עמדת טעינה לרכב חשמלי',     defaultPrice: 4500 },
      { id: 'monitoring', label: 'ניטור ובקרה מרחוק (שנתי)',  defaultPrice: 1500 },
    ],
    potential: [
      { id: 'drilling',  label: 'קידוח ומעבר קיר בטון / בלוק',                defaultPrice: 500 },
      { id: 'wifi',      label: 'התקנת מגביר טווח אלחוטי (WiFi Extender)',    defaultPrice: 450 },
      { id: 'support',   label: 'קריאת שירות לשינויים בהגדרות האינטרנט',      defaultPrice: 450 },
      { id: 'inspector', label: 'ביקור חשמלאי בודק לפני ההתקנה',              defaultPrice: 850 },
    ],
  };

  // ── coercers (same semantics as quote-public.js `num`: a non-finite value falls back) ────────
  function num(v, dflt) { const n = parseFloat(v); return Number.isFinite(n) ? n : dflt; }
  function int(v, dflt) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : dflt; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** The default catalog, deep-copied. */
  function getDefaultCatalog() { return clone(DEFAULT_CATALOG); }

  /** Ids that must never appear as a choice on a NEW quote (still resolvable for old ones). */
  function legacyUpgradeIds() {
    return DEFAULT_CATALOG.upgrades.filter(i => i.legacy).map(i => i.id);
  }

  function isLegacyUpgrade(id) { return legacyUpgradeIds().includes(id); }

  /** Portal input defaults for a fresh quote form. */
  function getNewQuoteInputDefaults() { return { ...NEW_QUOTE_INPUT_DEFAULTS }; }

  /**
   * The per-inverter price book for one manufacturer.
   * An unsupported/legacy inverter resolves to LEGACY_INVERTER_PRICING rather than throwing —
   * a historical quote must still render.
   */
  function getInverterPricing(inverter) {
    const book = INVERTER_PRICING[inverter];
    return book ? { ...book } : { ...LEGACY_INVERTER_PRICING };
  }

  /** True when this manufacturer has its own entry (false ⇒ the legacy fallback was used). */
  function hasInverterPricing(inverter) {
    return Object.prototype.hasOwnProperty.call(INVERTER_PRICING, inverter);
  }

  /**
   * The upgrade defaults a portal should show once an inverter is selected.
   * This is what the seller-facing price inputs are populated from.
   */
  function resolveInverterDefaults(inverter) {
    const book = getInverterPricing(inverter);
    return {
      inverter,
      supported: InvCat ? InvCat.isSupportedInverter(inverter) : hasInverterPricing(inverter),
      hybridInverter: book.hybridInverter,
      batteryFirst: book.batteryFirst,
      batteryAdditional: book.batteryAdditional,
    };
  }

  /**
   * migrateExtrasSelections(state)
   * Quotes written before the dynamic extras format stored one flat key per upgrade
   * (`exEv`, `exMonitor`, …). This lifts them into the `{ id: { checked, price } }` shape every
   * resolver expects. Returns null when there is nothing to migrate.
   * Lived in quote-ui.js AND quote-public.js as two identical copies; it is one rule, so it is
   * one function, and both callers now share it.
   */
  function migrateExtrasSelections(state) {
    const s = state || {};
    if (s.extras) return s.extras; // already the current format
    const map = {
      ev:         { checked: s.exEv,        price: s.exEvP },
      monitoring: { checked: s.exMonitor,   price: s.exMonitorP },
      premium:    { checked: s.exPremium,   price: '' },
      drilling:   { checked: s.exDrilling,  price: s.exDrillingP },
      wifi:       { checked: s.exWifi,      price: s.exWifiP },
      support:    { checked: s.exSupport,   price: s.exSupportP },
      inspector:  { checked: s.exInspector, price: s.exInspectorP },
    };
    const result = {};
    for (const [id, val] of Object.entries(map)) {
      if (val.checked !== undefined) result[id] = { checked: val.checked || false, price: val.price || '' };
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  /** Flattens a catalog into one list, stamping `category` on every item. */
  function flattenCatalog(catalog) {
    const c = catalog || DEFAULT_CATALOG;
    return [
      ...(c.upgrades  || []).map(i => ({ ...i, category: 'upgrade'   })),
      ...(c.potential || []).map(i => ({ ...i, category: 'potential' })),
    ];
  }

  // ── pricing strategies ──────────────────────────────────────────────────────────────────────
  // Each returns { price, displayNote }. `ctx` is plain data; `override` is the per-quote value
  // (a seller-typed input or a saved state price) and ALWAYS wins where the strategy allows it.
  const STRATEGIES = {

    /** Batteries: first + N additional, per inverter, overridable per quote. */
    batteries(item, ctx) {
      const book = getInverterPricing(ctx.inverter);
      const first = num(ctx.batteryFirstPrice, book.batteryFirst);
      const extra = num(ctx.batteryAdditionalPrice, book.batteryAdditional);
      const qty = int(ctx.batteryQuantity, 0);
      const price = qty >= 1 ? first + (qty - 1) * extra : 0;
      return { price, displayNote: qty > 0 ? `${qty} בטריות` : 'לא נבחרו בטריות' };
    },

    /** Premium black panel: a USD figure per DC kW, converted at the quote's own USD rate. */
    premium(item, ctx) {
      const dcKW = num(ctx.dcKW, 0);
      const usd = num(ctx.premiumPanelUsd, 0);
      const rate = num(ctx.usdRate, 0);
      return {
        price: Math.round(usd * rate * dcKW),
        displayNote: `$100 × ${dcKW} קו"ט × ${rate}$`,
      };
    },

    /**
     * LEGACY COMPATIBILITY — SolarEdge optimiser surcharge, ₪270 per panel.
     * Not offered on new quotes (catalog item is `legacy: true`); kept because quotes signed
     * before its removal carry it and must re-render at the price they were signed at.
     */
    solaredge(item, ctx) {
      const panelCount = int(ctx.panelCount, 0);
      return { price: Math.round(270 * panelCount), displayNote: `270₪ × ${panelCount} פאנלים` };
    },
  };

  /**
   * The flat/fixed strategy — also the fallback for any item without a `calcType`.
   * Precedence: per-quote override → per-inverter book (when the item opts in) → catalog default.
   */
  function resolveFlatPrice(item, ctx, override) {
    const inverterDefault = item.inverterPriceKey
      ? getInverterPricing(ctx.inverter)[item.inverterPriceKey]
      : undefined;
    const base = inverterDefault != null ? inverterDefault : (item.defaultPrice || 0);
    return { price: num(override, base), displayNote: '' };
  }

  /**
   * resolvePrice(item, ctx, override) → { price, displayNote }
   * `item`     — a catalog item ({ id, calcType, defaultPrice, inverterPriceKey })
   * `ctx`      — { inverter, dcKW, panelCount, batteryQuantity, usdRate, premiumPanelUsd,
   *                batteryFirstPrice, batteryAdditionalPrice }
   * `override` — the per-quote price for this item, if any (string or number; '' / null = none)
   */
  function resolvePrice(item, ctx = {}, override = undefined) {
    const strategy = item && item.calcType ? STRATEGIES[item.calcType] : undefined;
    if (strategy) return strategy(item, ctx);
    return resolveFlatPrice(item || {}, ctx, override);
  }

  /**
   * resolveExtras({ catalog, selections, ctx }) → array of resolved extras
   * THE shared entry point. `selections` is `{ [id]: { checked, price } }`; an id with no entry is
   * treated as unselected, which is exactly what "no checkbox rendered" meant before.
   * Output shape is unchanged from the two implementations it replaces, so every downstream
   * consumer (engine, contract, WEB, PDF) sees what it always saw.
   */
  function resolveExtras({ catalog, selections, ctx } = {}) {
    const items = flattenCatalog(catalog);
    const sel = selections && typeof selections === 'object' ? selections : {};
    const context = ctx || {};
    return items.map(item => {
      const entry = sel[item.id];
      const checked = entry ? !!entry.checked : false;
      const { price, displayNote } = resolvePrice(item, context, entry ? entry.price : undefined);
      return {
        id: item.id,
        label: item.label,
        checked,
        price,
        category: item.category,
        calcType: item.calcType,
        displayNote,
      };
    });
  }

  /** Project price = checked upgrades only. Potential costs are informational and never counted. */
  function sumUpgrades(extras) {
    return (extras || [])
      .filter(e => e.checked && e.category !== 'potential')
      .reduce((s, e) => s + (num(e.price, 0)), 0);
  }

  return {
    PRICING_SCHEMA_VERSION,
    getDefaultCatalog,
    migrateExtrasSelections,
    flattenCatalog,
    legacyUpgradeIds,
    isLegacyUpgrade,
    getNewQuoteInputDefaults,
    getInverterPricing,
    hasInverterPricing,
    resolveInverterDefaults,
    resolvePrice,
    resolveExtras,
    sumUpgrades,
    // exposed for tests / guards — the price book itself, read-only by convention
    INVERTER_PRICING,
    LEGACY_INVERTER_PRICING,
  };

})();

// Worker/Node (CommonJS, bundled by esbuild) + browser global.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UpgradePricing };
}
if (typeof globalThis !== 'undefined') {
  globalThis.UpgradePricing = UpgradePricing;
}
