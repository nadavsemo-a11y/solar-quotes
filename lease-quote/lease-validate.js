/**
 * lease-quote/lease-validate.js — the shape of a residential solar LEASING quote, and its validation.
 *
 * Runs in the authoring page (before save) and in the Worker (/q/save, through the quote-type
 * registry), so the seller and the server refuse the same things. Pure; no I/O.
 *
 * THE SYSTEM IS DESCRIBED EXACTLY AS IN A SOLAR SALES QUOTE — same state keys, same values, same
 * rules, from the same modules:
 *   kw (DC kWp) · acKW (inverter kW) · panelW · roof (בטון / רעפים / פח, the sales form's radios) ·
 *   roofArea (QuoteValidation.validateRoofArea) · inv (InverterCatalog, QuoteValidation.validateInverter)
 *   panel count = ⌈kw × 1000 / panelW⌉ (the sales engine's formula — never stored)
 *
 * The only money in a lease is the OPTIONAL backup upgrade (hybrid inverter + batteries), offered to
 * the customer, chosen by the customer on the link, and paid by the customer before installation —
 * independent of the lease. Its prices default from the sales price book (UpgradePricing) and, as in
 * a sales quote, the seller may adjust them. Battery quantity bounds and capacity are the sales
 * quote's (2–6 × 5 kWh). VAT is QuoteEngine.VAT, frozen into the quote.
 *
 *   {
 *     type: 'lease', leaseVersion: 2,
 *     customer: { name, phone, email, address, city, date, note, hubspotId },
 *     system:   { kw, acKW, panelW, roof, roofArea, inv },
 *     lease:    { termYears },
 *     property: { parcel },
 *     backupOption: { offered, hybridInverterPrice, batteryFirstPrice, batteryAdditionalPrice },
 *     vatRate,
 *     sourceQuoteId: '<solar quote the data was taken from>' | ''
 *   }
 *
 * The customer's choice is NOT state: it is the signing knob { backupBatteries: 0 | 2..6 }.
 *
 * TWO MODELS share this shape (`lease.model`, absent = 'ownership' — every lease saved before the
 * rental model existed):
 *   'ownership'  the leasing agreement: SEMO owns the system for N years, then it passes to the
 *                customer for free (lease-agreement.js, template solar-lease/2).
 *   'rental'     the roof RENTAL agreement: SEMO owns the system for the whole term of its arrangement
 *                with the IEC (default 25 years) and pays the property owner an annual rent
 *                (`rent.annualAmount`, whole ₪). The billing right (chapters 5–6), the export revenue,
 *                and SEMO's right to register a warning note on the property are the template's
 *                (rental-terms.js, template solar-rental/1). The backup upgrade is not offered on a
 *                rental: the system and everything in it stay SEMO's, so `backupOption.offered` must
 *                be false.
 */
'use strict';
(function () {

const isNode = typeof module !== 'undefined' && module.exports;
const InverterCatalog = isNode ? require('../shared/inverter-catalog.js').InverterCatalog : globalThis.InverterCatalog;
const QuoteValidation = isNode ? require('../shared/quote-validation.js').QuoteValidation : globalThis.QuoteValidation;
const UpgradePricing = isNode ? require('../shared/upgrade-pricing.js').UpgradePricing : globalThis.UpgradePricing;
// quote-engine.js declares `const QuoteEngine` at the top level of a classic script: reachable by
// name from other scripts, but not as a property of globalThis.
function engineVat() {
  if (isNode) return require('../quote-engine.js').QuoteEngine.VAT;
  // eslint-disable-next-line no-undef
  return typeof QuoteEngine !== 'undefined' ? QuoteEngine.VAT : NaN;
}

const LEASE_VERSION = 2;
const TERM_YEARS = Object.freeze({ min: 1, max: 25, default: 6 });
const MODELS = Object.freeze(['ownership', 'rental']);
// A rental runs for the IEC arrangement's term. 25 years is the cap of the term (a longer one is a
// long lease — חכירה לדורות — in Israeli land law) and the default.
const RENTAL_TERM_YEARS = Object.freeze({ min: 1, max: 25, default: 25 });
const MAX_ANNUAL_RENT = 1000000;
// The roof types the sales form offers (index.html, radios name="roof"). Pinned by a test.
const ROOF_TYPES = Object.freeze(['בטון', 'רעפים', 'פח']);
// The sales quote's battery rules: 2–6 batteries (PricingSnapshot BATT_MIN/BATT_MAX), 5 kWh each
// (index.html «כמות מצברים (5 קו"ט)»). Pinned by a test.
const BATTERY = Object.freeze({ min: 2, max: 6, kWhEach: 5 });
const MAX_PRICE = 200000;

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PHONE_RE = /^0\d{1,2}-?\d{7}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const QUOTE_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
// No markup, template or escape characters in anything printed into the agreement.
const UNSAFE_RE = /[<>{}\\`$]/;
// Control characters and bidi overrides would let a value reorder the legal text around it.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;

function str(v) { return typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : ''); }
function num(v) { const n = typeof v === 'number' ? v : parseFloat(str(v)); return Number.isFinite(n) ? n : NaN; }

/** The sales engine's panel count: ⌈kw × 1000 / panelW⌉. */
function panelCount(system) {
  const kw = num(system && system.kw);
  const w = num(system && system.panelW);
  return kw > 0 && w > 0 ? Math.ceil((kw * 1000) / w) : 0;
}

/** «מערכת סולארית ביתית» up to 15 kW AC, «מסחרית» above — the sales quote's rule. */
function systemTypeLabel(system) {
  return num(system && system.acKW) > 15 ? 'מערכת סולארית מסחרית' : 'מערכת סולארית ביתית';
}

/** Default backup prices for an inverter — the sales price book. */
function defaultBackupPrices(inv) {
  const d = UpgradePricing.resolveInverterDefaults(inv);
  return { hybridInverterPrice: d.hybridInverter, batteryFirstPrice: d.batteryFirst, batteryAdditionalPrice: d.batteryAdditional };
}

/** 'ownership' | 'rental'. A lease saved before the rental model has no `lease.model`. */
function leaseModel(state) {
  return (state && state.lease && state.lease.model) === 'rental' ? 'rental' : 'ownership';
}
function isRental(state) { return leaseModel(state) === 'rental'; }

function emptyLeaseState(model) {
  const inv = InverterCatalog.getDefaultInverter();
  const rental = model === 'rental';
  const s = {
    type: 'lease', leaseVersion: LEASE_VERSION,
    customer: { name: '', phone: '', email: '', address: '', city: '', date: '', note: '', hubspotId: '' },
    system: { kw: '', acKW: '', panelW: 665, roof: 'בטון', roofArea: '', inv },
    lease: rental ? { model: 'rental', termYears: RENTAL_TERM_YEARS.default } : { termYears: TERM_YEARS.default },
    property: { parcel: '' },
    backupOption: Object.assign({ offered: !rental }, defaultBackupPrices(inv)),
    vatRate: engineVat(),
    sourceQuoteId: '',
  };
  if (rental) s.rent = { annualAmount: '' };
  return s;
}

/**
 * The customer's backup choice, validated against THIS quote. null = not acceptable.
 * Not offered → only "none" (0). Offered → 0, or MIN..MAX batteries.
 */
function normalizeLeaseKnobs(state, knobs) {
  const raw = knobs && Object.prototype.hasOwnProperty.call(knobs, 'backupBatteries') ? knobs.backupBatteries : 0;
  const n = typeof raw === 'number' ? raw : (raw === '' || raw == null ? 0 : Number(raw));
  if (!Number.isSafeInteger(n)) return null;
  if (n === 0) return { backupBatteries: 0 };
  const offered = !!(state && state.backupOption && state.backupOption.offered);
  if (!offered || n < BATTERY.min || n > BATTERY.max) return null;
  return { backupBatteries: n };
}

/** Every choice a customer can sign: "none", then each battery count when the option is offered. */
function leaseKnobChoices(state) {
  const out = [{ backupBatteries: 0 }];
  if (state && state.backupOption && state.backupOption.offered) {
    for (let n = BATTERY.min; n <= BATTERY.max; n++) out.push({ backupBatteries: n });
  }
  return out;
}

/**
 * The price of the backup upgrade with n batteries, through the SALES pricing strategy
 * (UpgradePricing 'batteries': first + (n-1) × additional). Whole shekels; VAT from the quote.
 * @returns {{ batteries: number, kWh: number, hybrid: number, batteryTotal: number, net: number, vat: number, gross: number }}
 */
function backupPrice(state, n) {
  const o = state.backupOption;
  const batteryTotal = UpgradePricing.resolvePrice({ calcType: 'batteries' }, {
    inverter: state.system.inv, batteryQuantity: n,
    batteryFirstPrice: o.batteryFirstPrice, batteryAdditionalPrice: o.batteryAdditionalPrice,
  }).price;
  const hybrid = n > 0 ? o.hybridInverterPrice : 0;
  const net = hybrid + batteryTotal;
  const gross = Math.round(net * state.vatRate);
  return { batteries: n, kWh: n * BATTERY.kWhEach, hybrid, batteryTotal, net, vat: gross - net, gross };
}

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 * Error strings are Hebrew: the authoring page shows them as they are.
 */
function validateLeaseState(state) {
  const errors = [];
  const warnings = [];
  const s = state || {};
  if (s.type !== 'lease') errors.push('סוג ההצעה אינו ליסינג');
  if (s.leaseVersion !== LEASE_VERSION) errors.push('גרסת מבנה ההצעה אינה נתמכת');

  const text = (v, label, min, max) => {
    const t = str(v);
    if (t.length < min) { errors.push(`${label} חסר`); return; }
    if (t.length > max) errors.push(`${label} ארוך מדי`);
    if (UNSAFE_RE.test(t) || CONTROL_RE.test(t)) errors.push(`${label} מכיל תווים אסורים`);
  };

  const c = s.customer || {};
  text(c.name, 'שם הלקוח', 2, 120);
  text(c.city, 'הישוב', 2, 80);
  text(c.address, 'הכתובת', 2, 120);
  if (!PHONE_RE.test(str(c.phone))) errors.push('מספר הטלפון אינו תקין');
  if (str(c.email).length > 254 || !EMAIL_RE.test(str(c.email))) errors.push('כתובת הדוא"ל אינה תקינה');
  if (!DATE_RE.test(str(c.date))) errors.push('תאריך ההסכם אינו תקין');
  if (str(c.note)) text(c.note, 'ההערה', 0, 500);
  if (str(c.hubspotId) && !/^\d{1,20}$/.test(str(c.hubspotId))) errors.push('מזהה HubSpot אינו תקין');

  const model = s.lease && s.lease.model;
  if (model !== undefined && !MODELS.includes(model)) errors.push('מודל ההסכם אינו מוכר');
  const rental = isRental(s);
  const y = s.lease && s.lease.termYears;
  const bounds = rental ? RENTAL_TERM_YEARS : TERM_YEARS;
  if (!Number.isSafeInteger(y) || y < bounds.min || y > bounds.max) {
    errors.push(`תקופת ${rental ? 'השכירות' : 'הליסינג'} חייבת להיות מספר שלם של שנים בין ${bounds.min} ל-${bounds.max}`);
  }
  if (rental) {
    const r = s.rent || {};
    if (!Number.isSafeInteger(r.annualAmount) || r.annualAmount <= 0 || r.annualAmount > MAX_ANNUAL_RENT) errors.push('דמי השכירות השנתיים אינם תקינים');
    if (s.backupOption && s.backupOption.offered) errors.push('בהסכם שכירות לא מוצעת תוספת ממיר היברידי וסוללות');
  } else if (s.rent !== undefined) {
    errors.push('דמי שכירות שייכים להסכם שכירות בלבד');
  }

  // ── the system, by the sales quote's rules ──
  const sys = s.system || {};
  const kw = num(sys.kw), ac = num(sys.acKW), w = num(sys.panelW);
  if (!(kw > 0 && kw <= 1000) || typeof sys.kw !== 'number') errors.push('הספק DC אינו תקין');
  if (!(ac >= 1 && ac <= 1000) || typeof sys.acKW !== 'number') errors.push('הספק AC אינו תקין');
  if (!Number.isSafeInteger(sys.panelW) || w < 100 || w > 1000) errors.push('הספק הפאנל אינו תקין');
  if (!ROOF_TYPES.includes(sys.roof)) errors.push('סוג הגג אינו תקין');
  // The sales quote's own gate: roof area required and > 0, a supported inverter manufacturer.
  const roofArea = typeof sys.roofArea === 'number' ? sys.roofArea : '';
  for (const e of QuoteValidation.validateNewQuote({ roofArea, inverter: sys.inv }).errors) errors.push(e.message);
  if (kw > 0 && ac > 0 && ac > kw * 1.2) warnings.push('הספק ה-AC גבוה בהרבה מהספק ה-DC — כדאי לבדוק');
  if (ac > 15) warnings.push('הספק AC מעל 15 קילוואט — המערכת תוגדר כמסחרית ולא תתאים למסלול הירוק');

  // ── the optional backup upgrade (the only money in a lease) ──
  const o = s.backupOption || {};
  if (typeof o.offered !== 'boolean') errors.push('יש לקבוע אם להציע את תוספת הגיבוי');
  for (const [k, label] of [['hybridInverterPrice', 'מחיר הממיר ההיברידי'], ['batteryFirstPrice', 'מחיר המצבר הראשון'], ['batteryAdditionalPrice', 'מחיר כל מצבר נוסף']]) {
    if (!Number.isSafeInteger(o[k]) || o[k] <= 0 || o[k] > MAX_PRICE) errors.push(`${label} אינו תקין`);
  }

  if (s.vatRate !== engineVat()) errors.push('שיעור המע"מ אינו תואם את שיעור המע"מ של המערכת');

  const p = s.property || {};
  if (str(p.parcel)) text(p.parcel, 'גוש/חלקה', 0, 80);
  else warnings.push('לא הוזנו גוש/חלקה — בהסכם יודפס קו למילוי');

  if (str(s.sourceQuoteId) && !QUOTE_ID_RE.test(str(s.sourceQuoteId))) errors.push('מזהה הצעת המקור אינו תקין');

  return { ok: errors.length === 0, errors, warnings };
}

const api = {
  LEASE_VERSION, TERM_YEARS, RENTAL_TERM_YEARS, MODELS, ROOF_TYPES, BATTERY,
  leaseModel, isRental, emptyLeaseState, validateLeaseState, normalizeLeaseKnobs, leaseKnobChoices, backupPrice,
  panelCount, systemTypeLabel, defaultBackupPrices, engineVat,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.LeaseValidate = api;
})();
