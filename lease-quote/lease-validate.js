/**
 * lease-quote/lease-validate.js — the shape of a residential solar LEASING quote, and its validation.
 *
 * Runs in the authoring page (before save) and in the Worker (/q/save, through the quote-type
 * registry), so the seller and the server refuse the same things. Pure; no I/O.
 *
 * The state carries only what varies per agreement: who, where, which system, and the lease term in
 * years (the one commercial parameter the seller sets). Everything else in the agreement — ₪0
 * installation, ₪0 monthly fee, the billing formula, ownership, revenues, the clauses — is the
 * template version (lease-agreement.js), never per-quote data.
 *
 *   {
 *     type: 'lease', leaseVersion: 1,
 *     customer: { name, phone, email, address, city, date, note, hubspotId },
 *     system:   { dcKw, acKw, panelCount, panelWatt, panelModel, inverterModel, roofType },
 *     lease:    { termYears },
 *     property: { parcel },
 *     sourceQuoteId: '<solar quote the system data was taken from>' | ''
 *   }
 */
'use strict';
(function () {

const LEASE_VERSION = 1;
const TERM_YEARS = Object.freeze({ min: 1, max: 25, default: 6 });

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DECIMAL_RE = /^\d{1,3}(\.\d{1,2})?$/;
const PHONE_RE = /^0\d{1,2}-?\d{7}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const QUOTE_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
// No markup, template or escape characters in anything printed into the agreement.
const UNSAFE_RE = /[<>{}\\`$]/;
// Control characters and bidi overrides would let a value reorder the legal text around it.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;

function str(v) { return typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : ''); }

function emptyLeaseState() {
  return {
    type: 'lease', leaseVersion: LEASE_VERSION,
    customer: { name: '', phone: '', email: '', address: '', city: '', date: '', note: '', hubspotId: '' },
    system: { dcKw: '', acKw: '', panelCount: 0, panelWatt: 0, panelModel: '', inverterModel: '', roofType: '' },
    lease: { termYears: TERM_YEARS.default },
    property: { parcel: '' },
    sourceQuoteId: '',
  };
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

  const y = s.lease && s.lease.termYears;
  if (!Number.isSafeInteger(y) || y < TERM_YEARS.min || y > TERM_YEARS.max) {
    errors.push(`תקופת הליסינג חייבת להיות מספר שלם של שנים בין ${TERM_YEARS.min} ל-${TERM_YEARS.max}`);
  }

  const sys = s.system || {};
  const dc = str(sys.dcKw);
  const ac = str(sys.acKw);
  if (!DECIMAL_RE.test(dc) || Number(dc) <= 0) errors.push('הספק DC אינו תקין');
  if (!DECIMAL_RE.test(ac) || Number(ac) <= 0) errors.push('הספק AC אינו תקין');
  const count = sys.panelCount;
  const watt = sys.panelWatt;
  if (!Number.isSafeInteger(count) || count < 1 || count > 2000) errors.push('מספר הפאנלים אינו תקין');
  if (!Number.isSafeInteger(watt) || watt < 100 || watt > 1000) errors.push('הספק הפאנל אינו תקין');
  // The table states one DC figure and the panel line another; they must be the same system.
  if (!errors.length && Math.abs(count * watt / 1000 - Number(dc)) > 0.1) {
    errors.push(`הספק DC (${dc}) אינו תואם ${count} פאנלים × ${watt} וואט`);
  }
  text(sys.panelModel, 'דגם הפאנלים', 2, 160);
  text(sys.inverterModel, 'דגם הממיר', 2, 160);
  if (str(sys.roofType)) text(sys.roofType, 'סוג הגג', 0, 60);
  if (Number(ac) > Number(dc) * 1.2 && DECIMAL_RE.test(ac) && DECIMAL_RE.test(dc)) {
    warnings.push('הספק ה-AC גבוה בהרבה מהספק ה-DC — כדאי לבדוק');
  }

  const p = s.property || {};
  if (str(p.parcel)) text(p.parcel, 'גוש/חלקה', 0, 80);
  else warnings.push('לא הוזנו גוש/חלקה — בהסכם יודפס קו למילוי');

  if (str(s.sourceQuoteId) && !QUOTE_ID_RE.test(str(s.sourceQuoteId))) errors.push('מזהה הצעת המקור אינו תקין');

  return { ok: errors.length === 0, errors, warnings };
}

const api = { LEASE_VERSION, TERM_YEARS, emptyLeaseState, validateLeaseState };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.LeaseValidate = api;
})();
