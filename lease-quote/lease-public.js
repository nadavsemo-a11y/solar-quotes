/**
 * lease-quote/lease-public.js — the browser-safe pure projections of a leasing quote: the signed
 * snapshot the signature is bound to, and the /q/hubspot/sync body. Loaded by the authoring page
 * (as a classic script) and required by the Worker adapter (lease-index.js), so both build them the
 * same way.
 */
'use strict';
(function () {

const isNode = typeof module !== 'undefined' && module.exports;
const A = isNode ? require('./lease-agreement.js') : globalThis.LeaseAgreement;
const V = isNode ? require('./lease-validate.js') : globalThis.LeaseValidate;

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

/**
 * The deterministic, customer-facing projection of everything the agreement prints, for ONE choice
 * of the backup option. Binds the template version (new wording ⇒ new hash ⇒ an old token stops
 * verifying), and the computed price of the chosen option, so the signature proves the customer
 * signed that option at that price.
 * @param {object} state   a validated lease state
 * @param {object} knobs   normalized: { backupBatteries }
 */
function buildLeaseSignedSnapshot(state, knobs) {
  const s = state || {};
  const c = s.customer || {};
  const sys = s.system || {};
  const o = s.backupOption || {};
  const n = (knobs && knobs.backupBatteries) || 0;
  // A rental binds its model and its rent too. An ownership lease's snapshot keeps exactly the keys it
  // had before the rental model existed, so a page served before a deploy still signs after it.
  const rental = V.isRental(s) ? { model: 'rental', rent: { annualAmount: s.rent && s.rent.annualAmount } } : {};
  return {
    kind: 'lease-signed-snapshot',
    template: A.templateOf(s),
    ...rental,
    leaseVersion: s.leaseVersion,
    customer: { name: str(c.name), phone: str(c.phone), email: str(c.email), city: str(c.city), address: str(c.address), date: str(c.date) },
    system: { kw: sys.kw, acKW: sys.acKW, panelW: sys.panelW, panelCount: V.panelCount(sys), roof: sys.roof, roofArea: sys.roofArea, inv: sys.inv },
    lease: { termYears: s.lease && s.lease.termYears },
    property: { parcel: str(s.property && s.property.parcel) },
    backupOption: { offered: !!o.offered, hybridInverterPrice: o.hybridInverterPrice, batteryFirstPrice: o.batteryFirstPrice, batteryAdditionalPrice: o.batteryAdditionalPrice },
    vatRate: s.vatRate,
    chosenBackup: n ? V.backupPrice(s, n) : null,
  };
}

/**
 * The /q/hubspot/sync body — the generic per-type shape storage sends. `hubspotId` is read at the
 * TOP level only; inside `customer` it is ignored and every quote would mint a duplicate contact.
 */
function buildLeaseHubspotSyncPayload(state, ctx) {
  const c = (state && state.customer) || {};
  const sys = (state && state.system) || {};
  const x = ctx || {};
  const quoteUrl = x.quoteUrl || (x.quoteId ? `https://s-a.gs/q/${x.quoteId}` : '');
  const name = str(c.name);
  const years = state && state.lease && state.lease.termYears;
  const metricValue = `${sys.kw} kW`;
  const rental = V.isRental(state);
  const kind = rental ? 'הסכם שכירות גג סולארי' : 'הסכם ליסינג סולארי';
  const termLine = rental
    ? `תקופת שכירות: ${A.yearsHe(years)}<br>דמי שכירות: ${A.ils(state.rent.annualAmount)} לשנה`
    : `תקופת ליסינג: ${A.yearsHe(years)}`;
  const noteBody = `${kind} — ${name}<br>הספק DC: ${metricValue}<br>${termLine}<br>לינק: <a href="${quoteUrl}" target="_blank">${quoteUrl}</a>`;
  return {
    quoteType: 'lease', quoteId: x.quoteId || '', quoteUrl,
    hubspotId: str(c.hubspotId) || null,
    customer: { name, phone: str(c.phone), email: str(c.email), address: str(c.address), city: str(c.city) },
    headlineMetricLabel: 'הספק DC', headlineMetricValue: metricValue,
    noteBody, taskTitle: `מעקב ${rental ? 'הסכם שכירות גג' : 'הסכם ליסינג'} — ${name}`, taskBody: noteBody,
  };
}

const api = { buildLeaseSignedSnapshot, buildLeaseHubspotSyncPayload };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.LeasePublic = api;
})();
