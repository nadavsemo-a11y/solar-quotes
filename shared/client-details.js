/**
 * shared/client-details.js — single source for the customer-details ENTRY form, shared by the
 * solar portal (index.html) and the storage portal. Plain JS (no Web Component / Shadow DOM /
 * iframe), CJS + global, browser-oriented.
 *
 * It renders the SAME markup + element IDs the solar quote-ui.js already reads/writes
 * (clientName / clientPhone / clientEmail / citySearch + cityDropdown / clientAddress / quoteDate /
 * clientID / customNote), so solar can adopt it without changing quote-ui's wiring. Styles are
 * inline so the form looks identical wherever it is mounted.
 *
 * Canonical normalized contact: { name, phone, email, city, address, date, cid, note }.
 *
 * API:
 *   renderClientDetails(container, opts)        — inject the form (opts.wireAutocomplete!==false → wire city search)
 *   getClientDetailsValues(container)           — → normalized contact
 *   setClientDetailsValues(container, contact)  — populate fields
 *   clearClientDetails(container)               — reset
 * Depends on global ISRAEL_CITIES (shared/israel-cities.js) for the city autocomplete.
 *
 * IIFE-wrapped so its top-level names don't collide with sibling modules loaded as plain
 * <script>s in one global scope (the portals load several shared modules together).
 */
(function () {
'use strict';

const _C = {
  inp: 'width:100%;padding:10px 12px;border:1.5px solid #C4C4C4;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box',
  lbl: 'display:block;font-size:13px;font-weight:700;margin:0 0 5px;color:#1A1A1A',
};

function _formHTML() {
  return `
  <div class="ags-cd" style="background:#fff;border:1.5px solid #E4E4E4;border-radius:14px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;background:#0A0A0A;color:#fff;padding:14px 18px">
      <span style="display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;background:#9CF5C4;border-radius:8px;color:#0A0A0A">👤</span>
      <strong style="font-size:16px">פרטי לקוח</strong>
    </div>
    <div style="padding:18px;display:grid;gap:14px">
      <div><label style="${_C.lbl}">שם לקוח</label><input id="clientName" type="text" placeholder="שם מלא" style="${_C.inp}"></div>
      <div><label style="${_C.lbl}">טלפון</label><input id="clientPhone" type="tel" dir="ltr" placeholder="050-0000000" style="${_C.inp}"></div>
      <div><label style="${_C.lbl}">אימייל לקוח</label><input id="clientEmail" type="email" dir="ltr" placeholder="client@example.com" style="${_C.inp}"></div>
      <div style="position:relative"><label style="${_C.lbl}">ישוב</label>
        <input id="citySearch" type="text" autocomplete="off" placeholder="הקלד שם ישוב..." style="${_C.inp}">
        <ul id="cityDropdown" style="display:none;position:absolute;top:100%;right:0;left:0;list-style:none;margin:3px 0 0;padding:0;background:#fff;border:1.5px solid #9CF5C4;border-radius:8px;max-height:200px;overflow-y:auto;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.12)"></ul>
      </div>
      <div><label style="${_C.lbl}">כתובת (רחוב + מספר)</label><input id="clientAddress" type="text" placeholder="רחוב ומספר" style="${_C.inp}"></div>
      <div><label style="${_C.lbl}">תאריך הצעה</label><input id="quoteDate" type="date" dir="ltr" style="${_C.inp}"></div>
      <div><label style="${_C.lbl}">ת.ז. לקוח (לחתימה)</label><input id="clientID" type="text" inputmode="numeric" dir="ltr" placeholder="000000000" style="${_C.inp}"></div>
      <div><label style="${_C.lbl}">הערה אישית לגוף ההצעה</label><textarea id="customNote" rows="2" placeholder="הוסף הערה שתופיע בהצעה..." style="${_C.inp};resize:vertical"></textarea></div>
    </div>
  </div>`;
}

function _byId(container, id) { return (container || document).querySelector('#' + id); }

function wireCityAutocomplete(container, opts) {
  opts = opts || {};
  const input = _byId(container, 'citySearch');
  const list = _byId(container, 'cityDropdown');
  if (!input || !list) return;
  const cities = (typeof globalThis !== 'undefined' && globalThis.ISRAEL_CITIES) || [];
  input.addEventListener('input', () => {
    const q = input.value.trim();
    list.innerHTML = '';
    if (q.length < 1) { list.style.display = 'none'; return; }
    const matches = cities.filter(c => c.includes(q)).slice(0, 12);
    if (!matches.length) { list.style.display = 'none'; return; }
    matches.forEach(city => {
      const li = document.createElement('li');
      li.textContent = city;
      li.style.cssText = 'padding:8px 12px;cursor:pointer';
      li.addEventListener('mouseover', () => { li.style.background = '#D8FBE7'; });
      li.addEventListener('mouseout', () => { li.style.background = ''; });
      li.addEventListener('mousedown', () => {
        input.value = city; input.setAttribute('data-selected', city); list.style.display = 'none';
        if (typeof opts.onCitySelect === 'function') opts.onCitySelect(city);
      });
      list.appendChild(li);
    });
    list.style.display = 'block';
  });
  input.addEventListener('blur', () => { setTimeout(() => { list.style.display = 'none'; }, 150); });
}

function renderClientDetails(container, opts) {
  opts = opts || {};
  container.innerHTML = _formHTML();
  const d = _byId(container, 'quoteDate');
  if (d && !d.value) { try { d.value = new Date().toISOString().slice(0, 10); } catch (e) {} }
  if (opts.wireAutocomplete !== false) wireCityAutocomplete(container, opts);
  return container;
}

function getClientDetailsValues(container) {
  const v = (id) => { const el = _byId(container, id); return el ? (el.value || '').trim() : ''; };
  return { name: v('clientName'), phone: v('clientPhone'), email: v('clientEmail'),
    city: v('citySearch'), address: v('clientAddress'), date: v('quoteDate'), cid: v('clientID'), note: v('customNote') };
}

function setClientDetailsValues(container, c) {
  c = c || {};
  const set = (id, val) => { const el = _byId(container, id); if (el && val != null) el.value = val; };
  set('clientName', c.name); set('clientPhone', c.phone); set('clientEmail', c.email);
  set('citySearch', c.city); set('clientAddress', c.address); set('quoteDate', c.date);
  set('clientID', c.cid); set('customNote', c.note);
  const ci = _byId(container, 'citySearch'); if (ci && c.city) ci.setAttribute('data-selected', c.city);
}

function clearClientDetails(container) {
  ['clientName', 'clientPhone', 'clientEmail', 'citySearch', 'clientAddress', 'clientID', 'customNote']
    .forEach(id => { const el = _byId(container, id); if (el) el.value = ''; });
}

const api = { renderClientDetails, getClientDetailsValues, setClientDetailsValues, clearClientDetails, wireCityAutocomplete };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.ClientDetails = api;
})();
