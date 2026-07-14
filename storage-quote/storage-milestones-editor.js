/**
 * storage-quote/storage-milestones-editor.js
 * SEMO AGS — INTERNAL authoring editor for the payment-milestone schedule ("אבני דרך לתשלום").
 *
 * A browser-only DOM component (mount-based, mirrors shared/client-details.js). It is PRESENTATION:
 * it never defines default wording or computes amounts itself — all business logic is delegated to
 * the pure domain layer StoragePaymentMilestones (buildDefaultSchedule / normalizeSchedule /
 * resolveSchedule / validateSchedule). The customer document never loads this file.
 *
 *   StorageMilestonesEditor.render(mount, { capex, schedule })  — build the editor
 *   StorageMilestonesEditor.getSchedule(mount)                  — read the current config back out
 *   StorageMilestonesEditor.setCapex(mount, capex)              — re-price when CapEx changes
 *
 * The residual ("complete to 100%") row is structurally protected: it is always the last row, its
 * rule type is locked, and its amount is read-only (computed). Add inserts before it; it cannot be
 * removed or reordered past. Domain validation is the backstop for anything the UI can't prevent.
 */
(function () {
'use strict';

const PM = (typeof globalThis !== 'undefined') ? globalThis.StoragePaymentMilestones : undefined;

const COMPONENT_LABELS = { pvCost: 'תוספת DC (פאנלים)', storageCost: 'מערכת אגירה', balanceOfPlantCost: 'עבודות ותשתית (BOP)' };
const RULE_LABELS = {
  fixed_amount: 'סכום קבוע (₪)',
  cumulative_total_percent: 'השלמה ל-% מהעסקה',
  component_percent_delta: 'אחוז מרכיב (מ-% ל-%)',
  residual_to_total: 'יתרה עד 100% (אוטומטי)',
};

function esc(v) { return String(v == null ? '' : v).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function grp(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }

// ── per-mount state ────────────────────────────────────────────────────────
function stateOf(mount) { return mount.__milestones || (mount.__milestones = { capex: {}, schedule: PM.buildDefaultSchedule() }); }

function render(mount, opts) {
  if (!mount) return;
  if (!PM) { mount.innerHTML = '<div class="pm-ed-err">StoragePaymentMilestones module not loaded</div>'; return; }
  const st = stateOf(mount);
  if (opts && opts.capex) st.capex = opts.capex;
  if (opts && opts.schedule) st.schedule = PM.normalizeSchedule(opts.schedule);
  paint(mount);
}

function setCapex(mount, capex) { const st = stateOf(mount); st.capex = capex || {}; paint(mount); }

/** Read the live DOM values into st.schedule (called before any structural op and on getSchedule). */
function readForm(mount) {
  const st = stateOf(mount);
  const rows = [...mount.querySelectorAll('.pm-ed-row')];
  st.schedule = {
    version: PM.MILESTONES_SCHEMA_VERSION,
    milestones: rows.map((row) => {
      const f = (name) => { const el = row.querySelector(`[data-field="${name}"]`); return el ? el.value : ''; };
      const type = f('ruleType') || 'fixed_amount';
      const rule = { type };
      if (type === 'fixed_amount') rule.amount = Number(f('amount'));
      else if (type === 'cumulative_total_percent') rule.targetPercent = Number(f('targetPercent'));
      else if (type === 'component_percent_delta') { rule.component = f('component'); rule.fromPercent = Number(f('fromPercent')); rule.toPercent = Number(f('toPercent')); }
      return { id: row.getAttribute('data-id'), name: f('name'), description: f('description'), rule };
    }),
  };
  return st.schedule;
}

function getSchedule(mount) { return PM.normalizeSchedule(readForm(mount)); }

// ── rendering ──────────────────────────────────────────────────────────────
function paint(mount) {
  const st = stateOf(mount);
  const cfg = st.schedule;
  const resolved = PM.resolveSchedule(cfg, st.capex);
  const amountById = resolved.rows.reduce((o, r) => (o[r.id] = r.amount, o), {});

  const rowsHtml = cfg.milestones.map((ms, i) => {
    const isResidual = ms.rule && ms.rule.type === 'residual_to_total';
    const amt = amountById[ms.id];
    return `<div class="pm-ed-row${isResidual ? ' pm-ed-residual' : ''}" data-idx="${i}" data-id="${esc(ms.id)}">
      <div class="pm-ed-order">
        <button type="button" class="pm-ed-mini" data-act="up" ${i === 0 || isResidual ? 'disabled' : ''} title="למעלה">▲</button>
        <button type="button" class="pm-ed-mini" data-act="down" ${(i >= cfg.milestones.length - 2) || isResidual ? 'disabled' : ''} title="למטה">▼</button>
      </div>
      <input class="pm-ed-name" data-field="name" value="${esc(ms.name)}" placeholder="שם אבן הדרך">
      <input class="pm-ed-desc" data-field="description" value="${esc(ms.description)}" placeholder="תיאור + הערות">
      <div class="pm-ed-rule">
        <select data-field="ruleType" ${isResidual ? 'disabled' : ''}>
          ${Object.keys(RULE_LABELS).filter(t => t !== 'residual_to_total' || isResidual).map(t =>
            `<option value="${t}"${ms.rule && ms.rule.type === t ? ' selected' : ''}>${esc(RULE_LABELS[t])}</option>`).join('')}
        </select>
        ${ruleParamsHtml(ms.rule)}
      </div>
      <div class="pm-ed-amount ${amt < 0 ? 'pm-ed-neg' : ''}">₪${grp(amt)}</div>
      <button type="button" class="pm-ed-del" data-act="remove" ${isResidual ? 'disabled title="שורת היתרה אינה ניתנת למחיקה"' : ''}>✕</button>
    </div>`;
  }).join('');

  mount.innerHTML = `
    <div class="pm-ed">
      <div class="pm-ed-head"><strong>אבני דרך לתשלום</strong>
        <button type="button" class="pm-ed-reset" data-act="reset">שחזר ברירת מחדל</button></div>
      <div class="pm-ed-rows">${rowsHtml}</div>
      <button type="button" class="pm-ed-add" data-act="add" ${cfg.milestones.length >= PM.MAX_MILESTONES ? 'disabled title="הגעת למספר המרבי של אבני דרך"' : ''}>+ הוסף אבן דרך</button>
      <div class="pm-ed-foot">
        <div class="pm-ed-total">סה"כ אבני דרך: <strong id="pm-ed-total">₪${grp(resolved.total)}</strong>
          <span class="pm-ed-target">· סכום העסקה: ₪${grp(st.capex.totalProjectCost)}</span></div>
        <div class="pm-ed-msg" id="pm-ed-msg"></div>
      </div>
    </div>`;

  wire(mount);
  refreshPreview(mount);
}

function ruleParamsHtml(rule) {
  const r = rule || {};
  if (r.type === 'fixed_amount')
    return `<label>₪<input type="number" data-field="amount" min="0" step="100" value="${Number(r.amount) || 0}"></label>`;
  if (r.type === 'cumulative_total_percent')
    return `<label><input type="number" data-field="targetPercent" min="0" max="100" step="1" value="${Number(r.targetPercent) || 0}">%</label>`;
  if (r.type === 'component_percent_delta')
    return `<select data-field="component">${Object.keys(COMPONENT_LABELS).map(c => `<option value="${c}"${r.component === c ? ' selected' : ''}>${esc(COMPONENT_LABELS[c])}</option>`).join('')}</select>
      <label>מ-<input type="number" data-field="fromPercent" min="0" max="100" step="1" value="${Number(r.fromPercent) || 0}">%</label>
      <label>ל-<input type="number" data-field="toPercent" min="0" max="100" step="1" value="${Number(r.toPercent) || 0}">%</label>`;
  return `<span class="pm-ed-auto">מחושב אוטומטית</span>`;
}

// ── interaction ────────────────────────────────────────────────────────────
function wire(mount) {
  // live preview on any field edit (no re-render → inputs keep focus)
  mount.querySelectorAll('.pm-ed-row input, .pm-ed-row select').forEach(el => {
    const evt = (el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(evt, () => {
      if (el.getAttribute('data-field') === 'ruleType') { readForm(mount); paint(mount); } // rule type → params change → re-render
      else refreshPreview(mount);
    });
  });
  mount.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => act(mount, btn.getAttribute('data-act'), btn)));
}

function act(mount, action, btn) {
  const st = stateOf(mount);
  readForm(mount);
  const list = st.schedule.milestones;
  const row = btn.closest('.pm-ed-row');
  const idx = row ? Number(row.getAttribute('data-idx')) : -1;
  if (action === 'reset') { st.schedule = PM.buildDefaultSchedule(); }
  else if (action === 'add') {
    // insert a new negotiable row just before the residual (which stays last)
    const resIdx = list.findIndex(m => m.rule && m.rule.type === 'residual_to_total');
    const at = resIdx >= 0 ? resIdx : list.length;
    list.splice(at, 0, { id: newId(list), name: 'אבן דרך חדשה', description: '', rule: { type: 'cumulative_total_percent', targetPercent: 50 } });
  } else if (action === 'remove' && idx >= 0) { list.splice(idx, 1); }
  else if (action === 'up' && idx > 0) { const t = list[idx - 1]; list[idx - 1] = list[idx]; list[idx] = t; }
  else if (action === 'down' && idx < list.length - 1) { const t = list[idx + 1]; list[idx + 1] = list[idx]; list[idx] = t; }
  paint(mount);
}

function newId(list) {
  const used = new Set(list.map(m => m.id));
  let i = 1, id;
  do { id = 'custom_' + i++; } while (used.has(id));
  return id;
}

/** Recompute amounts + total + validation message without a full re-render. */
function refreshPreview(mount) {
  const st = stateOf(mount);
  const cfg = readForm(mount);
  const resolved = PM.resolveSchedule(cfg, st.capex);
  const byId = resolved.rows.reduce((o, r) => (o[r.id] = r.amount, o), {});
  mount.querySelectorAll('.pm-ed-row').forEach(row => {
    const amt = byId[row.getAttribute('data-id')];
    const cell = row.querySelector('.pm-ed-amount');
    if (cell) { cell.textContent = '₪' + grp(amt); cell.classList.toggle('pm-ed-neg', amt < 0); }
  });
  const totalEl = mount.querySelector('#pm-ed-total'); if (totalEl) totalEl.textContent = '₪' + grp(resolved.total);
  const msg = mount.querySelector('#pm-ed-msg');
  if (msg) {
    const v = PM.validateSchedule(cfg, st.capex);
    if (v.ok) { msg.className = 'pm-ed-msg ok'; msg.textContent = '✓ הלוח תקין ומסתכם לסכום העסקה'; }
    else { msg.className = 'pm-ed-msg err'; msg.innerHTML = v.errors.map(e => '⚠ ' + esc(e.message)).join('<br>'); }
  }
}

/** True when the current DOM schedule is a valid partition (for the portal to block save). */
function isValid(mount) {
  const st = stateOf(mount);
  return PM.validateSchedule(readForm(mount), st.capex).ok;
}

const api = { render, setCapex, getSchedule, isValid };
if (typeof globalThis !== 'undefined') globalThis.StorageMilestonesEditor = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
