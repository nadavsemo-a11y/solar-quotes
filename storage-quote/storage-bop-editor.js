/**
 * storage-quote/storage-bop-editor.js
 * SEMO AGS — INTERNAL authoring editor for the additional-cost breakdown ("פירוט עלויות נוספות").
 *
 * A browser-only DOM component (mount-based, mirrors storage-milestones-editor.js). It is
 * PRESENTATION: it never decides what is valid and never balances anything — every rule comes from
 * the pure domain layer StorageBopBreakdown (validateBreakdown / bopTarget / newItemId / presets).
 * The customer document never loads this file.
 *
 *   StorageBopEditor.render(mount, { capex, breakdown })  — build (or rebuild) the editor
 *   StorageBopEditor.getBreakdown(mount)                  — the raw config, or null when disabled
 *   StorageBopEditor.isValid(mount)                       — may the quote be saved?
 *   StorageBopEditor.validation(mount)                    — { enabled, ok, errors[] } for messaging
 *
 * HARD VALIDATION, NO MAGIC. There is no residual row, no hidden balancing, no auto-adjusting of a
 * neighbouring amount and no rounding. While itemisation is on, saving is blocked until the items
 * add up to the workbook's additional-cost figure EXACTLY, and the shortfall/excess is spelled out
 * in Hebrew. Turning itemisation off is an explicit click, never a consequence of leaving it broken.
 *
 * A blank amount field stays blank: it is read as null, NOT as Number('') === 0, so an unfilled row
 * is an error the salesperson can see rather than a silent ₪0 line in a signed quote.
 */
(function () {
'use strict';

const BOP = (typeof globalThis !== 'undefined') ? globalThis.StorageBopBreakdown : undefined;

function esc(v) { return String(v == null ? '' : v).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function grp(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
const ils = (n) => '₪' + grp(n);

/**
 * Hebrew wording for the domain's structured error codes. The domain speaks English (like the rest
 * of the codebase and like the Worker's `details` array); the salesperson-facing text lives here.
 */
/**
 * @param err      the domain's structured error
 * @param rowLabel the row's current name, for "…": prefixes
 * @param rawAmount the row's RAW amount field, so an untouched row reads as "missing" rather than
 *                  as "not a whole number" — the same domain code covers both, but they are very
 *                  different mistakes to the person typing.
 */
function hebrew(err, rowLabel, rawAmount) {
  const who = rowLabel ? `"${rowLabel}": ` : '';
  if (err.code === 'amount_invalid' && String(rawAmount == null ? '' : rawAmount).trim() === '') {
    return who + 'חסר סכום לשורה.';
  }
  switch (err.code) {
    case 'sum_mismatch':
      return err.delta > 0
        ? `הפירוט חורג ב-${ils(err.delta)} מעל סכום העלויות הנוספות שבסימולציה (${ils(err.target)}).`
        : `נותר לשייך ${ils(-err.delta)} מתוך ${ils(err.target)} של העלויות הנוספות שבסימולציה.`;
    case 'items_empty':       return 'הפעלתם פירוט אך לא הוספתם אף שורה. הוסיפו שורות, או בטלו את הפירוט.';
    case 'name_empty':        return who + 'חסר שם לשורה.';
    case 'name_too_long':     return who + `השם ארוך מדי (עד ${BOP.MAX_NAME_LEN} תווים).`;
    case 'name_untrimmed':    return who + 'יש רווח מיותר בתחילת השם או בסופו.';
    case 'amount_invalid':    return who + 'הסכום חייב להיות מספר שלם של שקלים.';
    case 'amount_not_positive': return who + 'הסכום חייב להיות גדול מ-0.';
    case 'too_many':          return `אפשר עד ${BOP.MAX_ITEMS} שורות פירוט.`;
    case 'target_zero':       return 'אין עלויות נוספות בסימולציה — אין מה לפרט.';
    case 'target_fractional': return 'סכום העלויות הנוספות בסימולציה אינו מספר שלם של שקלים ולכן לא ניתן לפרק אותו במדויק. אפשר להשאיר את השורה המקורית כפי שהיא.';
    case 'target_invalid':    return 'סכום העלויות הנוספות חסר או אינו תקין.';
    case 'sum_overflow':      return 'הסכומים גדולים מדי.';
    case 'id_duplicate':
    case 'id_invalid':
    case 'unknown_key':
    case 'version_unsupported':
    case 'malformed':         return 'תקלה במבנה הפירוט — רעננו את הדף ונסו שוב.';
    default:                  return err.message;
  }
}

// ── per-mount state ────────────────────────────────────────────────────────
// `items` holds what the salesperson typed: `amount` is a RAW STRING exactly as entered, so a blank
// field stays blank all the way to validation instead of becoming 0 somewhere in between.
function stateOf(mount) { return mount.__bop || (mount.__bop = { capex: {}, enabled: false, items: [] }); }

/**
 * render(mount, { capex, breakdown }) — ALWAYS resets to the arguments given, including when
 * `breakdown` is absent. This is what stops one quote's rows leaking into the next: switching or
 * re-importing a quote calls render() with that quote's own (usually absent) breakdown.
 */
function render(mount, opts) {
  if (!mount) return;
  if (!BOP) { mount.innerHTML = '<div class="bop-ed-err">StorageBopBreakdown module not loaded</div>'; return; }
  const o = opts || {};
  const st = stateOf(mount);
  st.capex = o.capex || {};
  const br = o.breakdown;
  const items = (br && Array.isArray(br.items)) ? br.items : null;
  st.enabled = !!items;
  st.items = items
    ? items.map(it => ({ id: String(it.id), name: String(it.name == null ? '' : it.name), amount: String(it.amount == null ? '' : it.amount) }))
    : [];
  paint(mount);
}

/** Re-price against a new CapEx without discarding what was typed (amounts are revalidated). */
function setCapex(mount, capex) { const st = stateOf(mount); st.capex = capex || {}; readForm(mount); paint(mount); }

/** Copy the live DOM values into st.items. Amounts stay strings; nothing is coerced or trimmed. */
function readForm(mount) {
  const st = stateOf(mount);
  const rows = [...mount.querySelectorAll('.bop-ed-row')];
  if (rows.length) {
    st.items = rows.map(row => ({
      id: row.getAttribute('data-id'),
      name: (row.querySelector('[data-field="name"]') || {}).value || '',
      amount: (row.querySelector('[data-field="amount"]') || {}).value || '',
    }));
  }
  return st.items;
}

/**
 * The RAW payload as it would be saved: `amount` parsed to a number, or null when the field is
 * blank or not a clean integer. Parsing here (rather than in the domain) keeps the domain strict —
 * it only ever sees a number or a null, and rejects the null.
 */
function toPayload(st) {
  return {
    version: BOP.BOP_BREAKDOWN_VERSION,
    items: st.items.map(it => ({ id: it.id, name: it.name, amount: parseAmount(it.amount) })),
  };
}
function parseAmount(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return null;                       // blank stays blank — never Number('') === 0
  if (!/^-?\d+$/.test(s)) return null;             // "12.5", "abc", "1e3" are not whole shekels
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** The config to store on the state, or null when itemisation is off. */
function getBreakdown(mount) {
  const st = stateOf(mount);
  readForm(mount);
  if (!st.enabled) return null;
  return toPayload(st);
}

function validation(mount) {
  const st = stateOf(mount);
  readForm(mount);
  if (!st.enabled) return { enabled: false, ok: true, errors: [] };
  const v = BOP.validateBreakdown(toPayload(st), st.capex);
  return { enabled: true, ok: v.ok, errors: v.errors };
}

function isValid(mount) { return validation(mount).ok; }

// ── rendering ──────────────────────────────────────────────────────────────
function paint(mount) {
  const st = stateOf(mount);
  const t = BOP.bopTarget(st.capex);
  const canEnable = t.ok;

  const presetOptions = BOP.PRESET_NAMES
    .map(nm => `<option value="${esc(nm)}">${esc(nm)}</option>`).join('');

  const rowsHtml = st.items.map((it, i) => `
    <div class="bop-ed-row" data-idx="${i}" data-id="${esc(it.id)}">
      <div class="bop-ed-order">
        <button type="button" class="bop-ed-mini" data-act="up" ${i === 0 ? 'disabled' : ''} title="למעלה">▲</button>
        <button type="button" class="bop-ed-mini" data-act="down" ${i >= st.items.length - 1 ? 'disabled' : ''} title="למטה">▼</button>
      </div>
      <input class="bop-ed-name" data-field="name" value="${esc(it.name)}" placeholder="שם הסעיף" maxlength="${BOP.MAX_NAME_LEN}">
      <input class="bop-ed-amt" data-field="amount" inputmode="numeric" value="${esc(it.amount)}" placeholder="₪">
      <button type="button" class="bop-ed-del" data-act="remove" title="הסר שורה">✕</button>
    </div>`).join('');

  mount.innerHTML = `
    <div class="bop-ed">
      <label class="bop-ed-toggle">
        <input type="checkbox" data-act="toggle" ${st.enabled ? 'checked' : ''} ${canEnable ? '' : 'disabled'}>
        <span>פרט את העלויות הנוספות לשורות נפרדות</span>
      </label>
      <p class="bop-ed-hint">
        ${canEnable
          ? `סכום העלויות הנוספות בסימולציה: <strong>${ils(t.target)}</strong>. הפירוט מחליף את השורה הזו בהצעה ללקוח — סכום השורות חייב להיות זהה בדיוק. מחיר ההצעה אינו משתנה.`
          : esc(hebrew({ code: t.code, target: t.target }))}
      </p>
      ${st.enabled ? `
      <div class="bop-ed-rows">${rowsHtml}</div>
      <div class="bop-ed-add-row">
        <select class="bop-ed-preset" data-field="preset"><option value="">— סעיף מוכן —</option>${presetOptions}</select>
        <button type="button" class="bop-ed-add" data-act="add-preset">+ הוסף סעיף מוכן</button>
        <button type="button" class="bop-ed-add" data-act="add">+ הוסף סעיף חדש</button>
      </div>
      <div class="bop-ed-foot">
        <div class="bop-ed-counter" id="bop-ed-counter"></div>
        <div class="bop-ed-msg" id="bop-ed-msg"></div>
      </div>` : ''}
    </div>`;

  wire(mount);
  if (st.enabled) refreshPreview(mount);
}

// ── interaction ────────────────────────────────────────────────────────────
function wire(mount) {
  // Typing only refreshes the counter/messages — the rows are NOT re-rendered, so the caret and
  // the partially typed value survive (the same discipline as the milestones editor).
  mount.querySelectorAll('.bop-ed-row input').forEach(el => {
    el.addEventListener('input', () => refreshPreview(mount));
  });
  mount.querySelectorAll('[data-act]').forEach(el => {
    const evt = (el.type === 'checkbox') ? 'change' : 'click';
    el.addEventListener(evt, () => act(mount, el.getAttribute('data-act'), el));
  });
}

function act(mount, action, el) {
  const st = stateOf(mount);
  readForm(mount);                                   // never lose what is already typed
  const row = el.closest ? el.closest('.bop-ed-row') : null;
  const idx = row ? Number(row.getAttribute('data-idx')) : -1;

  if (action === 'toggle') {
    st.enabled = !!el.checked;
    // Turning it on the first time seeds ONE empty row so there is somewhere to type. Turning it
    // off keeps the rows in memory, so an accidental click is undoable within the session — but
    // getBreakdown() returns null while it is off, so nothing half-finished can reach the quote.
    if (st.enabled && st.items.length === 0) st.items.push(newRow(st, ''));
  } else if (action === 'add') {
    if (st.items.length < BOP.MAX_ITEMS) st.items.push(newRow(st, ''));
  } else if (action === 'add-preset') {
    const sel = mount.querySelector('[data-field="preset"]');
    const name = sel ? sel.value : '';
    if (name && st.items.length < BOP.MAX_ITEMS) {
      // The label is COPIED into the quote. A later edit to PRESET_NAMES cannot reach this row.
      st.items.push(newRow(st, name));
      sel.value = '';
    }
  } else if (action === 'remove' && idx >= 0) {
    st.items.splice(idx, 1);
  } else if (action === 'up' && idx > 0) {
    const t = st.items[idx - 1]; st.items[idx - 1] = st.items[idx]; st.items[idx] = t;
  } else if (action === 'down' && idx >= 0 && idx < st.items.length - 1) {
    const t = st.items[idx + 1]; st.items[idx + 1] = st.items[idx]; st.items[idx] = t;
  }
  paint(mount);
}

/** Mint a row with a stable id. The id is created ONCE here and never re-derived from the label. */
function newRow(st, name) {
  return { id: BOP.newItemId(st.items.map(it => it.id)), name: name, amount: '' };
}

/** Recompute the counter + messages without re-rendering the rows (keeps focus). */
function refreshPreview(mount) {
  const st = stateOf(mount);
  readForm(mount);
  const t = BOP.bopTarget(st.capex);
  const target = t.ok ? t.target : 0;
  const allocated = st.items.reduce((s, it) => { const a = parseAmount(it.amount); return s + (a && a > 0 ? a : 0); }, 0);
  const remaining = target - allocated;

  const counter = mount.querySelector('#bop-ed-counter');
  if (counter) {
    counter.innerHTML = `שויכו <strong>${ils(allocated)}</strong> · סה״כ מהסימולציה <strong>${ils(target)}</strong> · `
      + (remaining === 0
        ? '<strong class="bop-ed-ok">נותר לשייך ₪0</strong>'
        : remaining > 0
          ? `<strong class="bop-ed-warn">נותר לשייך ${ils(remaining)}</strong>`
          : `<strong class="bop-ed-warn">חריגה של ${ils(-remaining)}</strong>`);
  }

  const msg = mount.querySelector('#bop-ed-msg');
  if (msg) {
    const v = BOP.validateBreakdown(toPayload(st), st.capex);
    if (v.ok) { msg.className = 'bop-ed-msg ok'; msg.textContent = '✓ הפירוט תקין ומסתכם בדיוק לסכום שבסימולציה'; }
    else {
      const byId = st.items.reduce((o, it) => (o[it.id] = it, o), {});
      msg.className = 'bop-ed-msg err';
      msg.innerHTML = v.errors.map(e => {
        const row = byId[e.itemId] || {};
        return '⚠ ' + esc(hebrew(e, row.name, row.amount));
      }).join('<br>');
    }
  }
}

const api = { render, setCapex, getBreakdown, validation, isValid };
if (typeof globalThis !== 'undefined') globalThis.StorageBopEditor = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
