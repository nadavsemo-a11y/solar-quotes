/**
 * lease-quote/lease-public.js — the browser-safe pure projections of a leasing quote: the signed
 * snapshot the signature is bound to, and the /q/hubspot/sync body. Loaded by the authoring page
 * (as a classic script) and required by the Worker adapter (lease-index.js), so both build them the
 * same way.
 */
'use strict';
(function () {

const A = (typeof module !== 'undefined' && module.exports) ? require('./lease-agreement.js') : globalThis.LeaseAgreement;

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

/** The deterministic, customer-facing projection of everything the agreement prints. */
function buildLeaseSignedSnapshot(state) {
  const s = state || {};
  const c = s.customer || {};
  const sys = s.system || {};
  return {
    kind: 'lease-signed-snapshot',
    template: `${A.TEMPLATE_ID}/${A.TEMPLATE_VERSION}`,
    leaseVersion: s.leaseVersion,
    customer: { name: str(c.name), phone: str(c.phone), email: str(c.email), city: str(c.city), address: str(c.address), date: str(c.date) },
    system: {
      dcKw: str(sys.dcKw), acKw: str(sys.acKw), panelCount: sys.panelCount, panelWatt: sys.panelWatt,
      panelModel: str(sys.panelModel), inverterModel: str(sys.inverterModel), roofType: str(sys.roofType),
    },
    lease: { termYears: s.lease && s.lease.termYears },
    property: { parcel: str(s.property && s.property.parcel) },
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
  const metricValue = `${str(sys.dcKw)} kW`;
  const noteBody = `הסכם ליסינג סולארי — ${name}<br>הספק DC: ${metricValue}<br>תקופת ליסינג: ${A.yearsHe(years)}<br>לינק: <a href="${quoteUrl}" target="_blank">${quoteUrl}</a>`;
  return {
    quoteType: 'lease', quoteId: x.quoteId || '', quoteUrl,
    hubspotId: str(c.hubspotId) || null,
    customer: { name, phone: str(c.phone), email: str(c.email), address: str(c.address), city: str(c.city) },
    headlineMetricLabel: 'הספק DC', headlineMetricValue: metricValue,
    noteBody, taskTitle: `מעקב הסכם ליסינג — ${name}`, taskBody: noteBody,
  };
}

const api = { buildLeaseSignedSnapshot, buildLeaseHubspotSyncPayload };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.LeasePublic = api;
})();
