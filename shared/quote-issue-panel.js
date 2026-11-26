/**
 * shared/quote-issue-panel.js — THE preview-and-send screen of every quote type. One component.
 *
 * WHAT IT IS
 *   The screen a seller reaches after filling a quote form: the quote exactly as the customer will
 *   see it, under one fixed bar with the same actions in the same order whatever the quote is —
 *   back to editing, create, send by WhatsApp, send by mail. It is NOT part of any quote type. A
 *   type hands it a prepared state and three sentences of wording; the layout, the buttons, the
 *   order of operations and the rules below are here and nowhere else, so a new quote type gets the
 *   whole screen by calling open().
 *
 * THE RULE IT ENFORCES
 *   Opening this screen issues NOTHING. The page is rendered by the server from a preview draft
 *   (POST /q/save {preview:true} → shared/quote-draft.js): a temporary record that is never
 *   registered and deletes itself. The quote is created — link minted, reported to the CRM — only
 *   when the seller presses «צור הצעה», «וואטסאפ» or «מייל», and then exactly once: the state that
 *   was previewed is the state that is issued, byte for byte, and a second press reuses the quote
 *   already created instead of making another.
 *
 * WHAT A QUOTE TYPE SUPPLIES — open(options)
 *   typeLabel      'הצעת מחיר — מערכת סולארית'        shown in the bar
 *   encodedState   the base64 state POST /q/save takes  (previewed AND issued — never rebuilt)
 *   stateKey       optional string naming "the same quote" for the no-twin rule; defaults to
 *                  encodedState. A type whose state gains a field BECAUSE the quote was issued (the
 *                  solar state adopts the HubSpot contact id the CRM report returns) passes the
 *                  state without that field, or reopening the preview would offer a second quote.
 *   customer       { name, phone, email }
 *   whatsappText   (url) → the message text
 *   emailSubject   string                              (for the mail-client fallback)
 *   emailText      (url) → the message text            (for the mail-client fallback)
 *   sendEmail      optional async ({ id, url, email }) → { ok, message }
 *                  a type whose mail is sent by the server supplies it; without it «מייל» opens the
 *                  seller's own mail client with the message ready.
 *   onIssued       optional async ({ id, url, response }) — the type's CRM report (HubSpot sync).
 *                  Runs once per issued quote. Best-effort: a failure never hides the link.
 *   onClose        optional () — the panel was closed
 *   apiBase        optional; defaults to window.__SEMO_API_BASE__ or https://s-a.gs
 *
 * Classic script, wrapped in an IIFE (a top-level `const api` would collide with the other shared
 * modules a portal loads). The pure helpers are exported for tests.
 */
(function () {
  'use strict';

  var DEFAULT_API_BASE = 'https://s-a.gs';
  var LOGO_URL = 'https://nadavsemo-a11y.github.io/solar-quotes/ags-logo.png';

  // ── pure helpers (tested in tests/quote-issue-panel.test.js) ─────────────────────────────────

  /** Israeli mobile → the international form wa.me wants; '' when there is no usable number. */
  function whatsappNumber(phone) {
    var digits = String(phone == null ? '' : phone).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.indexOf('972') === 0) return digits;
    if (digits.charAt(0) === '0') return '972' + digits.slice(1);
    return digits.length >= 8 ? '972' + digits : '';
  }

  /** A direct chat when the customer's number is known, the share sheet otherwise. */
  function buildWhatsAppUrl(phone, text) {
    var number = whatsappNumber(phone);
    return 'https://wa.me/' + number + '?text=' + encodeURIComponent(String(text == null ? '' : text));
  }

  function buildMailtoUrl(email, subject, text) {
    return 'mailto:' + encodeURIComponent(String(email || '').trim()).replace(/%40/g, '@')
      + '?subject=' + encodeURIComponent(String(subject || ''))
      + '&body=' + encodeURIComponent(String(text || ''));
  }

  /** The server's refusal, as a sentence the seller can act on. */
  function describeError(status, body) {
    var b = body && typeof body === 'object' ? body : {};
    if (b.error === 'catalog_stale') {
      return 'קטלוג השדרוגים עודכן מאז שהטופס נפתח. יש לרענן את העמוד ולהזין שוב את השדרוגים.';
    }
    var details = Array.isArray(b.details) ? b.details.filter(Boolean).join(' · ') : '';
    var main = b.detail || b.message || b.error || '';
    if (main && details) return main + ' — ' + details;
    if (main || details) return String(main || details);
    return status ? 'שגיאת שרת ' + status : 'אין תקשורת עם השרת';
  }

  /**
   * The issue ledger: one quote per previewed state for as long as the page is open.
   * `remember` records what a state became; `recall` answers it again instead of issuing a twin.
   */
  function createIssueLedger() {
    var issued = Object.create(null);
    return {
      recall: function (encodedState) { return issued[encodedState] || null; },
      remember: function (encodedState, result) { issued[encodedState] = result; return result; },
    };
  }

  var ledger = createIssueLedger();

  // ── the screen ──────────────────────────────────────────────────────────────────────────────

  var CSS = ''
    + '.sqp-root{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#F8F8F8;'
    + 'font-family:"Heebo",system-ui,"Segoe UI",Arial,sans-serif;color:#0A0A0A;direction:rtl;text-align:right}'
    + '.sqp-root *{box-sizing:border-box;font-family:inherit}'
    + '.sqp-bar{background:#0A0A0A;color:#fff;border-bottom:3px solid #9CF5C4;padding:10px 16px;display:flex;'
    + 'align-items:center;gap:12px;flex-wrap:wrap}'
    + '.sqp-logo{height:26px;width:auto;filter:brightness(0) invert(1);flex-shrink:0}'
    + '.sqp-title{display:flex;flex-direction:column;min-width:0;margin-inline-end:auto}'
    + '.sqp-title b{font-size:15px;font-weight:900;line-height:1.25}'
    + '.sqp-title span{font-size:12px;color:#C4C4C4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.sqp-chip{font-size:12px;font-weight:800;padding:5px 10px;border-radius:2px;border:1.5px solid #C4C4C4;color:#E4E4E4;'
    + 'white-space:nowrap}'
    + '.sqp-chip.is-issued{background:#9CF5C4;border-color:#9CF5C4;color:#0A0A0A}'
    + '.sqp-actions{background:#fff;border-bottom:1.5px solid #E4E4E4;padding:10px 16px;display:flex;align-items:center;'
    + 'gap:8px;flex-wrap:wrap}'
    + '.sqp-btn{cursor:pointer;font-weight:800;font-size:13.5px;border-radius:4px;padding:10px 16px;border:2px solid #0A0A0A;'
    + 'background:#fff;color:#0A0A0A;display:inline-flex;align-items:center;justify-content:center;gap:6px;'
    + 'text-decoration:none;line-height:1.2;min-height:42px}'
    + '.sqp-btn:hover:not(:disabled){box-shadow:3px 3px 0 #0A0A0A;transform:translate(-1px,-1px)}'
    + '.sqp-btn:disabled{opacity:.5;cursor:default}'
    + '.sqp-btn.is-primary{background:#9CF5C4}'
    + '.sqp-btn.is-done{background:#D8FBE7;border-color:#5FE0A0}'
    + '.sqp-btn.is-quiet{border-color:#C4C4C4;font-weight:700}'
    + '.sqp-spacer{flex:1 1 auto}'
    + '.sqp-view{display:inline-flex;border:1.5px solid #C4C4C4;border-radius:4px;overflow:hidden}'
    + '.sqp-view button{cursor:pointer;border:0;background:#fff;font-size:12.5px;font-weight:700;padding:8px 12px;color:#6B6B6B}'
    + '.sqp-view button.is-on{background:#0A0A0A;color:#9CF5C4}'
    + '.sqp-note{padding:9px 16px;font-size:13px;font-weight:700;border-bottom:1.5px solid #E4E4E4;display:none}'
    + '.sqp-note.is-info{display:block;background:#fff}'
    + '.sqp-note.is-error{display:block;background:#FFF1F1;color:#B00020}'
    + '.sqp-link{display:none;align-items:center;gap:8px;padding:9px 16px;background:#D8FBE7;border-bottom:1.5px solid #5FE0A0;flex-wrap:wrap}'
    + '.sqp-link.is-on{display:flex}'
    + '.sqp-link label{font-size:12.5px;font-weight:800}'
    + '.sqp-link input{flex:1 1 220px;min-width:0;border:1.5px solid #0A0A0A;border-radius:4px;background:#fff;padding:8px 10px;'
    + 'font-size:13px;direction:ltr;text-align:left;font-family:"JetBrains Mono",ui-monospace,monospace}'
    + '.sqp-stage{flex:1 1 auto;min-height:0;display:flex;justify-content:center;background:#E4E4E4;position:relative}'
    + '.sqp-frame{border:0;width:100%;height:100%;background:#fff;display:block}'
    + '.sqp-stage.is-mobile{padding:14px 0}'
    + '.sqp-stage.is-mobile .sqp-frame{width:390px;max-width:100%;border:2px solid #0A0A0A;border-radius:4px;'
    + 'box-shadow:4px 4px 0 #0A0A0A}'
    + '.sqp-wait{position:absolute;inset:0;display:grid;place-items:center;background:#F8F8F8;font-size:14px;font-weight:800;'
    + 'color:#6B6B6B;text-align:center;padding:24px}'
    + '@media (max-width:640px){.sqp-view{display:none}.sqp-actions .sqp-btn{flex:1 1 45%}.sqp-spacer{display:none}'
    + '.sqp-chip{order:3}}'
    + '@media print{.sqp-root{display:none!important}}';

  var styleInjected = false;
  function injectStyle(doc) {
    if (styleInjected) return;
    var s = doc.createElement('style');
    s.setAttribute('data-sqp', '1');
    s.textContent = CSS;
    doc.head.appendChild(s);
    styleInjected = true;
  }

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  var current = null;   // the one open panel

  function close() {
    if (!current) return;
    var panel = current;
    current = null;
    panel.doc.removeEventListener('keydown', panel.onKey);
    if (panel.root.parentNode) panel.root.parentNode.removeChild(panel.root);
    panel.doc.documentElement.style.overflow = panel.previousOverflow;
    if (typeof panel.options.onClose === 'function') { try { panel.options.onClose(); } catch (e) { /* the type's own */ } }
  }

  function open(options) {
    var opts = options || {};
    if (typeof opts.encodedState !== 'string' || !opts.encodedState) throw new Error('QuoteIssuePanel.open: encodedState is required');
    close();

    var doc = document;
    injectStyle(doc);
    var apiBase = opts.apiBase || (typeof window !== 'undefined' && window.__SEMO_API_BASE__) || DEFAULT_API_BASE;
    var customer = opts.customer || {};
    var stateKey = (typeof opts.stateKey === 'string' && opts.stateKey) || opts.encodedState;
    var issuing = null;      // the in-flight issue, so two fast presses share one request

    // ── build ──
    var root = el(doc, 'div', 'sqp-root');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'תצוגה מקדימה ושליחה');

    var bar = el(doc, 'div', 'sqp-bar');
    var logo = el(doc, 'img', 'sqp-logo'); logo.src = LOGO_URL; logo.alt = 'A.G.S';
    var title = el(doc, 'div', 'sqp-title');
    title.appendChild(el(doc, 'b', '', 'תצוגה מקדימה'));
    title.appendChild(el(doc, 'span', '', [opts.typeLabel, customer.name].filter(Boolean).join(' · ')));
    var chip = el(doc, 'div', 'sqp-chip', 'טיוטה — ההצעה עדיין לא נוצרה');
    bar.appendChild(logo); bar.appendChild(title); bar.appendChild(chip);

    var actions = el(doc, 'div', 'sqp-actions');
    var backBtn = el(doc, 'button', 'sqp-btn is-quiet', '→ חזרה לעריכה'); backBtn.type = 'button';
    var createBtn = el(doc, 'button', 'sqp-btn is-primary', 'צור הצעה'); createBtn.type = 'button';
    var waBtn = el(doc, 'button', 'sqp-btn', 'שליחה בוואטסאפ'); waBtn.type = 'button';
    var mailBtn = el(doc, 'button', 'sqp-btn', 'שליחה במייל'); mailBtn.type = 'button';
    var view = el(doc, 'div', 'sqp-view');
    var viewDesktop = el(doc, 'button', 'is-on', 'מחשב'); viewDesktop.type = 'button';
    var viewMobile = el(doc, 'button', '', 'נייד'); viewMobile.type = 'button';
    view.appendChild(viewDesktop); view.appendChild(viewMobile);
    actions.appendChild(backBtn); actions.appendChild(createBtn); actions.appendChild(waBtn); actions.appendChild(mailBtn);
    actions.appendChild(el(doc, 'div', 'sqp-spacer')); actions.appendChild(view);

    var note = el(doc, 'div', 'sqp-note');
    var linkRow = el(doc, 'div', 'sqp-link');
    var linkLabel = el(doc, 'label', '', 'הקישור ללקוח');
    var linkInput = el(doc, 'input'); linkInput.type = 'text'; linkInput.readOnly = true; linkInput.id = 'sqp-link-input';
    linkLabel.htmlFor = 'sqp-link-input';
    var copyBtn = el(doc, 'button', 'sqp-btn', 'העתקת הקישור'); copyBtn.type = 'button';
    linkRow.appendChild(linkLabel); linkRow.appendChild(linkInput); linkRow.appendChild(copyBtn);

    var stage = el(doc, 'div', 'sqp-stage');
    var frame = el(doc, 'iframe', 'sqp-frame'); frame.title = 'ההצעה כפי שהלקוח יראה אותה';
    var wait = el(doc, 'div', 'sqp-wait', 'מכין את התצוגה המקדימה…');
    stage.appendChild(frame); stage.appendChild(wait);

    root.appendChild(bar); root.appendChild(actions); root.appendChild(note); root.appendChild(linkRow); root.appendChild(stage);

    var sendButtons = [createBtn, waBtn, mailBtn];
    function setSendEnabled(on) { sendButtons.forEach(function (b) { b.disabled = !on; }); }
    function say(kind, text) { note.className = 'sqp-note' + (kind ? ' is-' + kind : ''); note.textContent = text || ''; }

    function showIssued(result) {
      chip.textContent = 'ההצעה נוצרה ✓';
      chip.className = 'sqp-chip is-issued';
      createBtn.textContent = 'ההצעה נוצרה ✓';
      createBtn.className = 'sqp-btn is-done';
      createBtn.disabled = true;
      linkInput.value = result.url;
      linkRow.className = 'sqp-link is-on';
    }

    // ── the two server calls ──
    function post(payload) {
      return fetch(apiBase + '/q/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok || !json) { var err = new Error(describeError(res.status, json)); err.status = res.status; throw err; }
          return json;
        });
      }, function () { throw new Error(describeError(0, null)); });
    }

    /** Issue the previewed state — once. Every send button goes through here. */
    function issue() {
      var known = ledger.recall(stateKey);
      if (known) return Promise.resolve(known);
      if (issuing) return issuing;
      setSendEnabled(false);
      say('info', 'יוצר את ההצעה…');
      issuing = post({ data: opts.encodedState }).then(function (json) {
        var result = ledger.remember(stateKey, { id: json.id, url: json.url, response: json });
        say('', '');
        showIssued(result);
        waBtn.disabled = false; mailBtn.disabled = false;
        if (typeof opts.onIssued === 'function') {
          // The CRM report. Its failure must not take the link away from the seller.
          Promise.resolve().then(function () { return opts.onIssued(result); }).catch(function (e) {
            if (typeof console !== 'undefined') console.warn('[quote-issue-panel] onIssued failed:', e && e.message);
          });
        }
        return result;
      }, function (err) {
        issuing = null;
        setSendEnabled(true);
        say('error', 'ההצעה לא נוצרה: ' + err.message);
        throw err;
      });
      return issuing;
    }

    // ── wiring ──
    backBtn.onclick = close;
    createBtn.onclick = function () { issue().catch(function () {}); };

    waBtn.onclick = function () {
      var known = ledger.recall(stateKey);
      var text = function (url) { return typeof opts.whatsappText === 'function' ? opts.whatsappText(url) : url; };
      if (known) { window.open(buildWhatsAppUrl(customer.phone, text(known.url)), '_blank'); return; }
      // The tab is opened inside the click, before the request: a browser blocks a window opened
      // after an await. It waits blank for the link, and is closed again if the quote is refused.
      var tab = null;
      try { tab = window.open('about:blank', '_blank'); } catch (e) { tab = null; }
      issue().then(function (result) {
        var url = buildWhatsAppUrl(customer.phone, text(result.url));
        if (tab && !tab.closed) tab.location.href = url;
        else say('info', 'ההצעה נוצרה. הדפדפן חסם את פתיחת וואטסאפ — לחיצה נוספת על «שליחה בוואטסאפ» תפתח אותו.');
      }, function () { if (tab && !tab.closed) tab.close(); });
    };

    mailBtn.onclick = function () {
      // A server-sent mail needs the customer's address, and that is checked BEFORE the quote is
      // created: a missing address must not leave an issued quote behind a failed send.
      if (typeof opts.sendEmail === 'function' && !String(customer.email || '').trim()) {
        say('error', 'חסרה כתובת מייל של הלקוח — יש לחזור לעריכה ולהוסיף אותה.');
        return;
      }
      issue().then(function (result) {
        if (typeof opts.sendEmail === 'function') {
          mailBtn.disabled = true;
          say('info', 'שולח את המייל…');
          return Promise.resolve(opts.sendEmail({ id: result.id, url: result.url, email: customer.email || '' }))
            .then(function (out) {
              say(out && out.ok ? 'info' : 'error', (out && out.message) || (out && out.ok ? 'המייל נשלח' : 'המייל לא נשלח'));
            }, function () { say('error', 'המייל לא נשלח'); })
            .then(function () { mailBtn.disabled = false; });
        }
        var subject = opts.emailSubject || opts.typeLabel || '';
        var body = typeof opts.emailText === 'function' ? opts.emailText(result.url) : result.url;
        var a = doc.createElement('a');
        a.href = buildMailtoUrl(customer.email, subject, body);
        a.style.display = 'none';
        root.appendChild(a); a.click(); root.removeChild(a);
        say('info', 'נפתחה הודעת מייל מוכנה בתוכנת הדואר — נותר לשלוח אותה.');
      }, function () {});
    };

    copyBtn.onclick = function () {
      var url = linkInput.value;
      var done = function () { copyBtn.textContent = 'הקישור הועתק ✓'; setTimeout(function () { copyBtn.textContent = 'העתקת הקישור'; }, 2200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { linkInput.select(); });
      else { linkInput.select(); try { doc.execCommand('copy'); done(); } catch (e) { /* the field stays selected */ } }
    };

    viewDesktop.onclick = function () { stage.classList.remove('is-mobile'); viewDesktop.className = 'is-on'; viewMobile.className = ''; };
    viewMobile.onclick = function () { stage.classList.add('is-mobile'); viewMobile.className = 'is-on'; viewDesktop.className = ''; };

    var onKey = function (e) { if (e.key === 'Escape') close(); };
    doc.addEventListener('keydown', onKey);

    var previousOverflow = doc.documentElement.style.overflow;
    doc.documentElement.style.overflow = 'hidden';
    doc.body.appendChild(root);
    current = { root: root, doc: doc, onKey: onKey, previousOverflow: previousOverflow, options: opts };

    // ── load the preview ──
    setSendEnabled(false);
    var already = ledger.recall(stateKey);
    post({ data: opts.encodedState, preview: true }).then(function (json) {
      if (current === null || current.root !== root) return;
      frame.onload = function () { wait.style.display = 'none'; };
      frame.src = json.url;
      setSendEnabled(true);
      // The same state was already issued from this page: show that quote, do not offer a twin.
      if (already) showIssued(already);
    }, function (err) {
      if (current === null || current.root !== root) return;
      wait.textContent = 'לא ניתן להציג תצוגה מקדימה';
      say('error', err.message);
    });

    return { close: close, issue: issue };
  }

  var api = {
    open: open, close: close,
    whatsappNumber: whatsappNumber, buildWhatsAppUrl: buildWhatsAppUrl, buildMailtoUrl: buildMailtoUrl,
    describeError: describeError, createIssueLedger: createIssueLedger,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.QuoteIssuePanel = api;
})();
