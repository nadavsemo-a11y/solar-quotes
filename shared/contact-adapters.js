/**
 * shared/contact-adapters.js — adapters between the normalized contact object (the shared
 * client-details contract) and each quote type's persisted state shape. CJS + global.
 *
 * Normalized contact: { name, phone, email, city, address, date, cid, note, hubspotId }.
 * Solar state stores these flat (address → `addr`). Storage state stores them under `customer:{}`
 * (address → `address`; email/cid are collected at sign time, not persisted in the quote state).
 *
 * `hubspotId` is the CRM identity, not a display field: it has no input in the client-details form
 * and is carried by the portal, not typed by anyone. It is what makes a second quote for the same
 * customer UPDATE their HubSpot contact instead of minting a duplicate — see the storage adapters
 * below. Solar keeps the same id in its flat state as `hsId`.
 *
 * Per-type adapters avoid forcing a risky migration of existing persisted states. Missing legacy
 * fields (note/email/cid) normalize to '' so old quotes never break.
 *
 * IIFE-wrapped to avoid top-level name collisions when loaded alongside sibling shared modules.
 */
(function () {
'use strict';

const s = (v) => (v == null ? '' : String(v));

// ── Solar (flat) ──
function contactFromSolarState(state) {
  const q = state || {};
  return { name: s(q.name), phone: s(q.phone), email: s(q.email), city: s(q.city),
    address: s(q.addr), date: s(q.date), cid: s(q.cid), note: s(q.note) };
}
function applyContactToSolarState(state, c) {
  c = c || {};
  return Object.assign({}, state, { name: s(c.name), phone: s(c.phone), email: s(c.email),
    city: s(c.city), addr: s(c.address), date: s(c.date), cid: s(c.cid), note: s(c.note) });
}

// ── Storage (customer:{}) ──
function contactFromStorageState(state) {
  const cu = (state && state.customer) || {};
  return { name: s(cu.name), phone: s(cu.phone), email: s(cu.email), city: s(cu.city),
    address: s(cu.address), date: s(cu.date), cid: s(cu.cid), note: s(cu.note),
    hubspotId: s(cu.hubspotId) };
}
function applyContactToStorageState(state, c) {
  c = c || {};
  const base = state || {};
  return Object.assign({}, base, {
    customer: Object.assign({}, base.customer, {
      name: s(c.name), phone: s(c.phone), address: s(c.address),
      city: s(c.city), date: s(c.date), note: s(c.note),
      // ALWAYS assigned, never only-when-present. This call has just replaced every customer field,
      // so a leftover id from a previously picked contact would make the save PATCH that OTHER
      // person with this customer's details — the exact defect fixed on the solar side in 541654f.
      hubspotId: s(c.hubspotId),
    }),
  });
}

const api = { contactFromSolarState, applyContactToSolarState, contactFromStorageState, applyContactToStorageState };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.ContactAdapters = api;
})();
