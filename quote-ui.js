/**
 * quote-ui.js — SEMO AGS Quote UI Controller
 *
 * זהו הקובץ היחיד שמכיר את ה-DOM.
 * אחריות: לקרוא ערכים מהטופס, להאזין לאירועים,
 * ולחבר את כל המודולים האחרים.
 *
 * תלויות (חייבות להיטען לפני):
 *   - quote-engine.js    → QuoteEngine
 *   - storage-service.js → StorageService
 *   - signature-service.js → SignatureService
 *   - template-engine.js → TemplateEngine
 *
 * שימוש:
 *   const ui = new QuoteUI();
 *   ui.init();
 */

class QuoteUI {

  constructor() {
    // ── מופעי שירותים ────────────────────────────────────────────────────
    this.storage   = new StorageService('https://s-a.gs');
    this.signature = new SignatureService('sigCanvas');

    // ── state ────────────────────────────────────────────────────────────
    this.selectedCity    = 'מעגלים';
    this.quotePlanKey    = 'regular';
    this.quoteInflation  = 2.5;
    this.quoteData       = null; // תוצאת QuoteEngine.calculate אחרון
  }

  // ══════════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════════

  init() {
    this._initCitySearch();
    this._bindInputListeners();
    this._initInverterToggle();
    this._initBatteryValidation();
    this._updatePanelCount();
    this._updatePreview();
    this.signature.init();
    this._tryLoadFromUrl();
  }

  _initInverterToggle() {
    document.querySelectorAll('input[name="inv"]').forEach(el => {
      el.addEventListener('change', () => {
        const field = document.getElementById('customInvField');
        if (field) field.style.display = el.value === 'אחר' && el.checked ? 'block' : 'none';
      });
    });
  }

  _initBatteryValidation() {
    const battEl = document.getElementById('batteries');
    if (!battEl) return;
    battEl.addEventListener('change', () => {
      const v = parseInt(battEl.value) || 0;
      if (v === 1) { battEl.value = 2; }
      if (v < 0)   { battEl.value = 0; }
    });
  }

  _updatePanelCount() {
    const dcKW   = parseFloat(document.getElementById('sysKW')?.value) || 0;
    const panelW = parseInt(document.getElementById('panelW')?.value) || 640;
    const countEl = document.getElementById('panelCount');
    if (countEl && panelW > 0) {
      countEl.value = Math.ceil((dcKW * 1000) / panelW);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // READ FORM VALUES
  // ══════════════════════════════════════════════════════════════════════

  /** קורא את כל ערכי הטופס ומחזיר plain object */
  _getFormValues() {
    const get  = id => document.getElementById(id)?.value ?? '';
    const radio = name => document.querySelector(`input[name="${name}"]:checked`)?.value ?? '';
    const chk  = id => document.getElementById(id)?.checked ?? false;

    const dcKW    = parseFloat(get('sysKW')) || 0;
    const panelW  = parseInt(get('panelW')) || 640;
    const premiumPanel = parseFloat(get('premiumPanelPrice')) || 0;
    const usdRate      = parseFloat(get('usdRate')) || 3.65;

    return {
      // לקוח
      name:    get('clientName'),
      phone:   get('clientPhone'),
      address: get('clientAddress'),
      cid:     get('clientID'),
      date:    get('quoteDate'),
      note:    get('customNote'),
      city:    this.selectedCity || get('citySearch'),

      // מערכת
      kw:       dcKW,
      acKW:     parseFloat(get('sysAC'))       || 0,
      ppkw:     parseFloat(get('ppkw'))        || 0,
      batt:     parseInt(get('batteries'))     || 0,
      panelW:   panelW,
      panelCount: panelW > 0 ? Math.ceil((dcKW * 1000) / panelW) : 0,
      roofArea: parseFloat(get('roofArea'))    || 0,
      hours:    parseFloat(get('hoursPerKw'))  || 0,
      roof:     radio('roof'),
      inv:      radio('inv'),
      customInvModel: get('customInvModel'),
      plan:     radio('planRadio') || 'green',
      inflation: parseFloat(get('inflationPct')) || 2.5,

      // מחירי יחידה
      battFirstPrice:  parseFloat(get('battFirstPrice'))   || 8900,
      battExtraPrice:  parseFloat(get('battExtraPrice'))   || 6500,
      hybridInvPrice:  parseFloat(get('hybridInvPrice'))   || 0,
      hybridFullPrice: parseFloat(get('hybridFullPrice'))  || 0,
      premiumPanel,
      usdRate,
      concretePerKw:   parseFloat(get('concretePerKw'))    || 0,
      meterPanelPrice: parseFloat(get('meterPanelPrice'))  || 0,
      evModel:         get('evModel'),

      // תוספות
      extras: this._getExtras(dcKW, premiumPanel, usdRate),
    };
  }

  /** מחזיר רשימת extras עם מצב checked ומחיר */
  _getExtras(dcKW, premiumPanel, usdRate) {
    const items = [
      { id: 'ev',         label: 'עמדת טעינה לרכב חשמלי' },
      { id: 'monitoring', label: 'ניטור ובקרה מרחוק (שנתי)' },
      { id: 'premium',    label: 'שדרוג לפאנל פרמיום שחור', calcPrice: () => Math.round(premiumPanel * usdRate * dcKW) },
      { id: 'drilling',   label: 'קידוח ומעבר קיר בטון / בלוק' },
      { id: 'wifi',       label: 'התקנת מגביר טווח אלחוטי (WiFi Extender)' },
      { id: 'support',    label: 'קריאת שירות לשינויים בהגדרות האינטרנט' },
      { id: 'inspector',  label: 'ביקור חשמלאי בודק לפני ההתקנה' },
    ];
    return items.map(item => {
      const checked = document.getElementById('chk-' + item.id)?.checked || false;
      const price   = item.calcPrice ? item.calcPrice() : (parseFloat(document.getElementById('price-' + item.id)?.value) || 0);
      const row     = document.getElementById('ex-' + item.id);
      if (row) row.classList.toggle('selected', checked);
      return { id: item.id, label: item.label, checked, price };
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // CITY SEARCH
  // ══════════════════════════════════════════════════════════════════════

  _initCitySearch() {
    const input = document.getElementById('citySearch');
    if (!input) return;

    const list = document.getElementById('cityDropdown');
    if (!list) return;

    input.addEventListener('input', () => {
      const q = input.value.trim();
      list.innerHTML = '';
      if (q.length < 1) { list.style.display = 'none'; return; }
      const matches = ALL_CITIES.filter(c => c.includes(q)).slice(0, 12);
      if (!matches.length) { list.style.display = 'none'; return; }
      matches.forEach(city => {
        const li = document.createElement('li');
        li.textContent = city;
        li.addEventListener('mousedown', () => this._selectCity(city));
        list.appendChild(li);
      });
      list.style.display = 'block';
    });

    input.addEventListener('blur', () => {
      setTimeout(() => { list.style.display = 'none'; }, 150);
    });
  }

  _selectCity(name) {
    this.selectedCity = name;
    const input = document.getElementById('citySearch');
    if (input) input.value = name;
    this._updatePreview();
  }

  // ══════════════════════════════════════════════════════════════════════
  // LIVE PREVIEW (sidebar)
  // ══════════════════════════════════════════════════════════════════════

  _bindInputListeners() {
    document.querySelectorAll('input,select,textarea').forEach(el => {
      el.addEventListener('input', () => { this._updatePanelCount(); this._updatePreview(); });
    });
    document.querySelectorAll('input[type=radio]').forEach(el => {
      el.addEventListener('change', () => { this._updatePanelCount(); this._updatePreview(); });
    });
  }

  _updatePreview() {
    const vals = this._getFormValues();
    const d    = QuoteEngine.calculate({
      ...vals,
      dcKW:           vals.kw,
      planKey:        vals.plan,
      inflationPct:   vals.inflation,
      hasUrbanPremium: QuoteEngine.isUrbanPremiumCity(vals.city),
    });
    this._updatePlanBadges(d.acKW, d.meterPanelPrice);

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('lp-price',     '₪' + this._fmt(d.price));
    set('lp-annual',    '₪' + this._fmt(d.plan.yr1));
    set('lp-total',     '₪' + this._fmt(d.plan.totalInc));
    set('lp-payback',   this._fmtD(d.plan.payback) + ' שנים');
    set('lp-plan-name', d.plan.planName);
    set('lp-plan-desc', d.plan.planDesc + (d.hasUrbanPremium ? ' | ★ פרמייה אורבנית' : ''));
  }

  _updatePlanBadges(acKW, meterPrice) {
    const r    = QuoteEngine.calcWeightedRate(acKW);
    const rAg  = (Math.round(r * 100 * 100) / 100).toFixed(2);
    const set  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('green-rate-badge',    rAg + " אג'");
    set('regular-rate-badge',  rAg + " אג'");
    set('green-rate-desc',     `תעריף משוקלל ${rAg} אג' | הספק AC ${acKW} kW`);
    set('regular-rate-desc',   `תעריף משוקלל ${rAg} אג' | הספק AC ${acKW} kW`);

    const mp = this._fmt(meterPrice);
    ['meter-price-preview','meter-price-preview2','meter-price-preview3'].forEach(id => set(id, mp));

    const greenCard  = document.getElementById('pc-green');
    const greenWarn  = document.getElementById('green-over15-warning');
    const greenRadio = greenCard?.querySelector('input[type=radio]');
    if (acKW > 15) {
      greenCard?.classList.add('locked');
      if (greenWarn) greenWarn.style.display = 'block';
      if (greenRadio?.checked) {
        const reg = document.querySelector('input[name="planRadio"][value="regular"]');
        if (reg) reg.checked = true;
      }
    } else {
      greenCard?.classList.remove('locked');
      if (greenWarn) greenWarn.style.display = 'none';
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // GENERATE QUOTE
  // ══════════════════════════════════════════════════════════════════════

  /**
   * generateQuote(clientMode)
   * מחשב + מרנדר את עמוד ההצעה.
   * clientMode=true: הלקוח צופה (ללא share bar).
   */
  async generateQuote(clientMode = false) {
    const vals = this._getFormValues();
    const d    = QuoteEngine.calculate({
      ...vals,
      dcKW:           vals.kw,
      planKey:        vals.plan,
      inflationPct:   vals.inflation,
      hasUrbanPremium: QuoteEngine.isUrbanPremiumCity(vals.city),
    });
    this.quoteData    = d;
    this.quotePlanKey = d.effectivePlanKey;

    const html = this._buildQuoteHTML(d, vals, clientMode);
    const page = document.getElementById('quotePage');
    if (page) page.innerHTML = html;

    // Share bar (portal mode only)
    if (!clientMode) await this._initShareBar(vals);

    document.getElementById('portal').style.display       = 'none';
    document.getElementById('quote-output').style.display = 'block';
    window.scrollTo(0, 0);

    if (clientMode) this._prepareSigSection(d, vals);

    // ROI bar animation
    const roiW = Math.min(d.plan.roi * 100 * 2, 94).toFixed(1);
    setTimeout(() => {
      const f = document.getElementById('roiFill');
      if (f) f.style.width = roiW + '%';
    }, 400);
  }

  showPortal() {
    document.getElementById('portal').style.display       = 'flex';
    document.getElementById('quote-output').style.display = 'none';
    window.scrollTo(0, 0);
  }

  // ── Plan switcher (shown on quote page) ─────────────────────────────

  switchPlan(key, el) {
    if (!el) return;
    if (key === 'green' && this.quoteData?.acKW > 15) return;
    this.quotePlanKey = key;

    document.querySelectorAll('#quotePlanSelector > div').forEach(btn => {
      const isGreen  = btn.id === 'qbtn-green';
      const isActive = btn === el;
      btn.style.border     = '2px solid ' + (isActive ? (isGreen ? '#22c55e' : 'var(--sun)') : 'var(--border)');
      btn.style.background = isActive ? (isGreen ? 'rgba(34,197,94,0.07)' : 'rgba(244,162,0,0.05)') : 'var(--light)';
    });

    const infRow = document.getElementById('quoteInflationRowDiv');
    if (infRow) infRow.style.display = key === 'index' ? 'flex' : 'none';

    if (this.quoteData) this._refreshQuoteFinancials();
  }

  _refreshQuoteFinancials() {
    const d   = this.quoteData;
    if (!d) return;
    const inf = parseFloat(document.getElementById('quoteInflationInput')?.value) || 2.5;
    this.quoteInflation = inf;

    const effectivePK = (this.quotePlanKey === 'green' && d.acKW > 15) ? 'regular' : this.quotePlanKey;
    const p = QuoteEngine.calcPlanIncome({ dcKW: d.dcKW, acKW: d.acKW, price: d.price, planKey: effectivePK, inflationPct: inf, hasUrbanPremium: d.hasUrbanPremium, hours: d.hours });

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('qp-name',          p.planName);
    set('qp-rate',          p.rateNote);
    set('qf-yr1',           '₪' + this._fmt(p.yr1));
    set('qf-total',         '₪' + this._fmt(p.totalInc));
    set('qf-profit',        '₪' + this._fmt(Math.round(p.totalInc - d.price)));
    set('qf-roi',           (p.roi * 100).toFixed(1) + '%');
    set('qf-payback',       this._fmtD(p.payback));
    set('qf-avg',           '₪' + this._fmt(p.avgAnnual));
    set('qf-roi-bar-label', `תשואה שנה 1: ${(p.roi*100).toFixed(1)}% | החזר: ${this._fmtD(p.payback)} שנים`);

    const roiFill = document.getElementById('roiFill');
    if (roiFill) roiFill.style.width = Math.min(p.roi * 100 * 2, 94).toFixed(1) + '%';

    // Fast plan breakdown
    const fpBox = document.getElementById('qf-fastplan');
    if (fpBox) {
      fpBox.style.display = this.quotePlanKey === 'fast' ? 'grid' : 'none';
      if (this.quotePlanKey === 'fast') {
        set('qf-fast-yr1', '₪' + this._fmt(p.yearlyBreakdown[0].inc));
        set('qf-fast-yr6', '₪' + this._fmt(p.yearlyBreakdown[5].inc));
      }
    }

    // Index plan breakdown
    const ixBox = document.getElementById('qf-indexplan');
    if (ixBox) {
      ixBox.style.display = this.quotePlanKey === 'index' ? 'grid' : 'none';
      if (this.quotePlanKey === 'index') {
        [['qf-ix-yr1', 0], ['qf-ix-yr10', 9], ['qf-ix-yr25', 24]].forEach(([id, i]) => {
          set(id, '₪' + this._fmt(p.yearlyBreakdown[i].inc));
        });
      }
    }

    // Meter notice
    const meterNotice = document.getElementById('qf-meter-notice');
    if (meterNotice) {
      meterNotice.style.display = d.acKW > 15 ? 'flex' : 'none';
      if (d.acKW > 15) set('qf-meter-price', '₪' + this._fmt(d.meterPanelPrice));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SHARE BAR
  // ══════════════════════════════════════════════════════════════════════

  async _initShareBar(vals) {
    const bar     = document.getElementById('share-bar');
    const loading = document.getElementById('share-loading');
    const ready   = document.getElementById('share-ready');
    const errDiv  = document.getElementById('share-error');
    if (!bar) return;

    bar.style.display     = 'block';
    loading.style.display = 'block';
    ready.style.display   = 'none';
    if (errDiv) errDiv.style.display = 'none';

    const state = this._buildState(vals);
    let shortUrl;
    try {
      shortUrl = await this.storage.save(state);
    } catch {
      shortUrl = this.storage.buildFallbackUrl(state);
      if (errDiv) {
        errDiv.style.display = 'block';
        errDiv.textContent   = '⚠️ לא ניתן ליצור לינק קצר — נוצר לינק ארוך במקום';
      }
    }

    const urlInput = document.getElementById('share-url');
    if (urlInput) urlInput.value = shortUrl;
    loading.style.display = 'none';
    ready.style.display   = 'block';
  }

  async copyShareUrl() {
    const url = document.getElementById('share-url')?.value;
    if (!url) return;
    const ok = await this.storage.copyToClipboard(url);
    if (ok) {
      const conf = document.getElementById('copy-confirm');
      const btn  = document.getElementById('copy-btn');
      if (conf) conf.style.display = 'block';
      if (btn)  btn.textContent    = '✔ הועתק!';
      setTimeout(() => {
        if (conf) conf.style.display = 'none';
        if (btn)  btn.textContent    = '📋 העתק לינק';
      }, 2500);
    }
  }

  openShareUrl() {
    const url = document.getElementById('share-url')?.value;
    if (url) window.open(url, '_blank');
  }

  shareWhatsApp() {
    const url   = document.getElementById('share-url')?.value;
    const vals  = this._getFormValues();
    const waUrl = this.storage.buildWhatsAppUrl(url, vals.name, vals.phone, vals.kw);
    window.open(waUrl, '_blank');
  }

  shareEmail() {
    const url    = document.getElementById('share-url')?.value;
    const vals   = this._getFormValues();
    const mailto = this.storage.buildEmailUrl(url, vals.name, vals.kw);
    window.open(mailto, '_blank');
  }

  // ══════════════════════════════════════════════════════════════════════
  // SIGNATURE SECTION
  // ══════════════════════════════════════════════════════════════════════

  _prepareSigSection(d, vals) {
    const sec = document.getElementById('sig-section');
    if (!sec) return;
    // Keep hidden — will be revealed by CTA button click
    sec.style.display = 'none';

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sqs-name',  vals.name  || '—');
    set('sqs-kw',    (vals.kw  || 0) + ' kW');
    set('sqs-price', '₪' + this._fmt(d.price || 0));

    // Pre-fill name + ID
    const nameEl = document.getElementById('sigName');
    const idEl   = document.getElementById('sigID');
    if (nameEl && vals.name) nameEl.value = vals.name;
    if (idEl   && vals.cid)  idEl.value   = vals.cid;

    setTimeout(() => this.signature.init(), 100);
  }

  async submitSig() {
    const name   = document.getElementById('sigName')?.value.trim()  || '';
    const idNum  = document.getElementById('sigID')?.value.trim()    || '';
    const agreed = document.getElementById('sigAgree')?.checked      || false;

    const vals   = this._getFormValues();
    const client = { name: vals.name, phone: vals.phone, address: vals.address, city: vals.city };

    const result = await this.signature.collect({
      name, idNum, agreed,
      quoteSnapshot: this.quoteData,
      clientData:    client,
    });

    if (!result.ok) {
      this._showSigErrors(result.errors);
      return;
    }

    this._clearSigErrors();
    this._showSigSuccess(result.signature);
    // כאן אפשר לשלוח ל-Worker: await this.storage.saveSignature(result.signature);
  }

  _showSigErrors(errors) {
    const show = (id, condition) => {
      const el = document.getElementById(id);
      if (el) el.style.display = condition ? 'block' : 'none';
    };
    show('err-sigName',   errors.includes('name'));
    show('err-sigID',     errors.includes('idNum'));
    show('err-sigCanvas', errors.includes('canvas'));
    if (errors.includes('agree')) alert('נא לסמן את תיבת האישור');
    document.getElementById('sigName')?.classList.toggle('sig-err', errors.includes('name'));
    document.getElementById('sigID')?.classList.toggle('sig-err',   errors.includes('idNum'));
    document.getElementById('sigBox')?.classList.toggle('sig-err',  errors.includes('canvas'));
  }

  _clearSigErrors() {
    ['err-sigName','err-sigID','err-sigCanvas'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    ['sigName','sigID','sigBox'].forEach(id => {
      document.getElementById(id)?.classList.remove('sig-err');
    });
  }

  _showSigSuccess(signature) {
    document.getElementById('sigForm').style.display      = 'none';
    document.getElementById('sig-success').style.display  = 'block';
    const imgEl = document.getElementById('sigPreviewImg');
    if (imgEl) imgEl.src = signature.sigImg;
    const metaEl = document.getElementById('sigMetaBox');
    if (metaEl) metaEl.innerHTML =
      `<strong>שם החותם:</strong> ${signature.name}<br>
       <strong>ת.ז:</strong> ${signature.idNum}<br>
       <strong>תאריך ושעה:</strong> ${signature.dateStr}<br>
       <strong>כתובת IP:</strong> ${signature.ipAddr}<br>
       <strong>מזהה אישור:</strong> ${signature.refID}`;
  }

  clearSigCanvas() {
    this.signature.clear();
  }

  // ══════════════════════════════════════════════════════════════════════
  // STATE ENCODE / LOAD
  // ══════════════════════════════════════════════════════════════════════

  _buildState(vals) {
    const get = id => document.getElementById(id)?.value ?? '';
    return {
      name: vals.name, phone: vals.phone, addr: vals.address,
      cid: vals.cid, date: vals.date, note: vals.note, city: vals.city,
      kw: get('sysKW'), acKW: get('sysAC'), ppkw: get('ppkw'),
      batt: get('batteries'), panelW: get('panelW'), panelCt: get('panelCount'),
      roofArea: get('roofArea'), hours: get('hoursPerKw'), infl: get('inflationPct'),
      roof: vals.roof, inv: vals.inv, plan: vals.plan,
      customInvModel: get('customInvModel'),
      battFP: get('battFirstPrice'), battEP: get('battExtraPrice'),
      hybrP: get('hybridInvPrice'), hybrFP: get('hybridFullPrice'),
      premP: get('premiumPanelPrice'), usdRate: get('usdRate'),
      concP: get('concretePerKw'), meterP: get('meterPanelPrice'),
      evM: get('evModel'),
      // extras checkboxes + prices
      exEv:        document.getElementById('chk-ev')?.checked         || false,
      exMonitor:   document.getElementById('chk-monitoring')?.checked || false,
      exPremium:   document.getElementById('chk-premium')?.checked    || false,
      exDrilling:  document.getElementById('chk-drilling')?.checked   || false,
      exWifi:      document.getElementById('chk-wifi')?.checked       || false,
      exSupport:   document.getElementById('chk-support')?.checked    || false,
      exInspector: document.getElementById('chk-inspector')?.checked  || false,
      exEvP: get('price-ev'), exMonitorP: get('price-monitoring'),
      exDrillingP: get('price-drilling'), exWifiP: get('price-wifi'),
      exSupportP:  get('price-support'),  exInspectorP: get('price-inspector'),
    };
  }

  _setFormFromState(s) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    set('clientName', s.name); set('clientPhone', s.phone);
    set('clientAddress', s.addr); set('clientID', s.cid);
    set('quoteDate', s.date); set('customNote', s.note);
    set('sysKW', s.kw); set('sysAC', s.acKW); set('ppkw', s.ppkw);
    set('batteries', s.batt); set('panelW', s.panelW); set('panelCount', s.panelCt);
    set('roofArea', s.roofArea); set('hoursPerKw', s.hours);
    set('inflationPct', s.infl);
    set('customInvModel', s.customInvModel);
    set('battFirstPrice', s.battFP); set('battExtraPrice', s.battEP);
    set('hybridInvPrice', s.hybrP); set('hybridFullPrice', s.hybrFP);
    set('premiumPanelPrice', s.premP); set('usdRate', s.usdRate);
    set('concretePerKw', s.concP); set('meterPanelPrice', s.meterP);
    set('evModel', s.evM);
    if (s.city) this._selectCity(s.city);
    const radio = (name, val) => {
      if (!val) return;
      const r = document.querySelector(`input[name="${name}"][value="${val}"]`);
      if (r) r.checked = true;
    };
    radio('roof', s.roof); radio('inv', s.inv);
    radio('planRadio', s.plan);
    // Show custom inv field if needed
    if (s.inv === 'אחר') {
      const field = document.getElementById('customInvField');
      if (field) field.style.display = 'block';
    }
    const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val || false; };
    setChk('chk-ev', s.exEv); setChk('chk-monitoring', s.exMonitor);
    setChk('chk-premium', s.exPremium);
    setChk('chk-drilling', s.exDrilling); setChk('chk-wifi', s.exWifi);
    setChk('chk-support',  s.exSupport);  setChk('chk-inspector', s.exInspector);
    set('price-ev', s.exEvP); set('price-monitoring', s.exMonitorP);
    set('price-drilling', s.exDrillingP); set('price-wifi', s.exWifiP);
    set('price-support',  s.exSupportP);  set('price-inspector', s.exInspectorP);
  }

  _tryLoadFromUrl() {
    const state = this.storage.loadFromHash();
    if (!state) { setTimeout(() => this._tryLoadFromUrl2(), 300); return; }
    this._setFormFromState(state);
    this._updatePreview();
    this.generateQuote(true); // client mode
  }

  _tryLoadFromUrl2() {
    const state = this.storage.loadFromHash();
    if (!state) return;
    this._setFormFromState(state);
    this._updatePreview();
    this.generateQuote(true);
  }

  // ══════════════════════════════════════════════════════════════════════
  // HTML BUILDER (delegating to TemplateEngine when template is loaded)
  // ══════════════════════════════════════════════════════════════════════

  _buildQuoteHTML(d, vals, clientMode) {
    const p    = d.plan;
    const fmt  = n => Math.round(n).toLocaleString('he-IL');
    const fmtD = n => Number(n).toFixed(1);
    const VAT  = 1.18;
    const YEARS = 25;
    const calcWeightedRate = QuoteEngine.calcWeightedRate;

    const dateStr     = vals.date ? new Date(vals.date).toLocaleDateString('he-IL') : '';
    const profit      = Math.round(p.totalInc - d.price);
    const fullAddress = `${d.city}${vals.address ? ', ' + vals.address : ''}`;

    const meterLine   = d.needsMeter ? `<li>לוח מונה ייצור — <strong>₪${fmt(d.meterPanelPrice)}</strong></li>` : '';
    const meterInc    = d.needsMeter ? `<div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">לוח מונה ייצור</div></div>` : '';
    const battLine    = d.batt > 0 ? `<li>מצברי אגירה ${d.batt*5} קו"ט (${d.batt} יח') — <strong>₪${fmt(d.batteryPrice)}</strong></li>` : '';
    const battInc     = d.batt > 0 ? `<div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">${d.batt} מצברי 5 קו"ט לגיבוי אנרגיה</div></div>` : '';
    const noteBox     = vals.note ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 20px;margin-bottom:18px;font-size:14px;color:var(--sky-mid);display:flex;gap:10px;"><span style="font-size:18px;flex-shrink:0">💬</span><span>${vals.note}</span></div>` : '';
    const concreteLine = d.roof === 'בטון' ? `<li>תוספת גג בטון — <strong>₪${fmt(d.dcKW * d.concretePerKw)}</strong> כלולה במחיר</li>` : '';
    // Extras summary for quote
    const selectedExtras = (d.extras || []).filter(e => e.checked);
    const extrasLines = selectedExtras.map(e => `<li>${e.label} — <strong>₪${fmt(e.price)}</strong></li>`).join('');
    const totalWithExtras = d.price + selectedExtras.reduce((s, e) => s + e.price, 0);

    const fastPlanHTML = d.planKey === 'fast' ? `
      <div id="qf-fastplan" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
        <div style="background:rgba(244,162,0,0.15);border-radius:9px;padding:10px 14px">
          <div style="font-weight:800;color:var(--sun-light);margin-bottom:4px">שנות 1–5</div>
          <div>60 אג׳ על ${Math.min(d.dcKW,15)} kW ראשונים${d.dcKW>15 ? ' | 48 אג׳ על '+(d.dcKW-15).toFixed(1)+' kW נוספים' : ''}</div>
          <div style="font-weight:800;color:var(--sun-light);margin-top:4px" id="qf-fast-yr1">₪${fmt(p.yearlyBreakdown[0].inc)} / שנה</div>
        </div>
        <div style="background:rgba(255,255,255,0.08);border-radius:9px;padding:10px 14px">
          <div style="font-weight:800;opacity:0.8;margin-bottom:4px">שנות 6–25</div>
          <div>39 אג׳ על כל הייצור</div>
          <div style="font-weight:800;opacity:0.8;margin-top:4px" id="qf-fast-yr6">₪${fmt(p.yearlyBreakdown[5].inc)} / שנה</div>
        </div>
      </div>` : '';

    const indexPlanHTML = d.planKey === 'index' ? `
      <div id="qf-indexplan" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:12px">
        <div style="background:rgba(255,255,255,0.08);border-radius:9px;padding:10px 14px">
          <div style="opacity:0.7;margin-bottom:3px">שנה 1</div>
          <div style="font-weight:800;color:var(--sun-light)" id="qf-ix-yr1">₪${fmt(p.yearlyBreakdown[0].inc)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.08);border-radius:9px;padding:10px 14px">
          <div style="opacity:0.7;margin-bottom:3px">שנה 10</div>
          <div style="font-weight:800;color:var(--sun-light)" id="qf-ix-yr10">₪${fmt(p.yearlyBreakdown[9].inc)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.08);border-radius:9px;padding:10px 14px">
          <div style="opacity:0.7;margin-bottom:3px">שנה 25</div>
          <div style="font-weight:800;color:var(--sun-light)" id="qf-ix-yr25">₪${fmt(p.yearlyBreakdown[24].inc)}</div>
        </div>
      </div>` : '';

    return `
  <!-- HERO -->
  <div class="q-hero">
    <div class="hero-head">
      <div style="display:flex;align-items:center;gap:10px">
        <div><strong style="font-size:20px;font-weight:900;color:white;letter-spacing:1px">SEMO AGS</strong><div style="font-size:11px;color:rgba(255,255,255,0.6);font-weight:300">סמו א.ג.ס בע"מ</div></div>
      </div>
      <div class="hero-title">הצעת מחיר<br><span>מערכת סולארית</span></div>
      <div class="hero-sub">סמו א.ג.ס בע"מ | ח.פ. 515942282</div>
    </div>
    <div class="hero-badge">תאריך: <strong>${dateStr}</strong> | ${p.planName}</div>
  </div>
  <div class="client-strip">
    <div class="cs-field"><label>לכבוד</label><span>${vals.name}</span></div>
    <div class="cs-field"><label>כתובת</label><span>${fullAddress}</span></div>
    <div class="cs-field"><label>טלפון</label><span>${vals.phone}</span></div>
  </div>

  <!-- SYSTEM TYPE -->
  <div class="sec">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;text-align:center;">
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray);margin-bottom:5px">סוג מערכת</div><div style="font-size:17px;font-weight:800;color:var(--sky)">מערכת סולארית ביתית</div></div>
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray);margin-bottom:5px">סוג גג</div><div style="font-size:17px;font-weight:800;color:var(--sky)">${d.roof}</div></div>
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray);margin-bottom:5px">הספק מערכת</div><div style="font-size:17px;font-weight:800;color:var(--sky)">${d.dcKW} קילו-וואט</div></div>
    </div>
  </div>

  ${d.hasUrbanPremium ? `
  <div class="urban-banner">
    <div class="ub-icon">🏙️</div>
    <div>
      <div class="ub-title">★ ישוב ${d.city} זכאי לפרמייה אורבנית!</div>
      <div class="ub-rate">תוספת 6 אג׳ לכל קו"ט מיוצר ✦ בתוקף ל-15 השנים הראשונות</div>
    </div>
  </div>` : ''}

  <!-- STATS -->
  <div class="stats-row">
    <div class="stat-card"><div class="stat-icon ic-y">⚡</div><span class="stat-val">${d.dcKW}</span><div class="stat-unit">קו"ט DC</div><div class="stat-label">הספק המערכת</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(99,102,241,0.1)">🔋</div><span class="stat-val">${d.acKW}</span><div class="stat-unit">קו"ט AC</div><div class="stat-label">הספק ממיר (קובע תעריף)</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(239,68,68,0.1)">⚡</div><span class="stat-val" style="font-size:18px">3×${d.breaker.size}A</span><div class="stat-unit" style="font-size:10px;color:var(--gray)">${d.breaker.current}A נומינלי</div><div class="stat-label">גודל חיבור מינימלי</div></div>
    <div class="stat-card"><div class="stat-icon ic-g">🔆</div><span class="stat-val">${fmt(d.annualKwh)}</span><div class="stat-unit">קו"ט לשנה</div><div class="stat-label">ייצור אנרגיה</div></div>
  </div>

  <!-- INCLUDES -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>ההצעה כוללת</div>
    <div class="inc-grid">
      <div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">פאנלים Tier 1 בניצולת גבוהה עם אחריות 30 שנה</div></div>
      <div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">ממיר ${d.inv} איכותי עם אחריות 10 שנים</div></div>
      <div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">טיפול מלא ברישוי ובירוקרטיה מול הרשויות</div></div>
      <div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">תכנון הנדסי מקצועי ומפורט + הדמיה ממוחשבת</div></div>
      <div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">התקנה מהירה וקפדנית על איכות ונראות</div></div>
      <div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">אפליקציה לניטור ביצועי המערכת בסמארטפון</div></div>
      ${battInc}${meterInc}
    </div>
  </div>

  <!-- FINANCIALS -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>המערכת הסולארית במספרים</div>

    <!-- PLAN SELECTOR -->
    <div class="sec" style="padding:24px 28px;margin-bottom:18px">
      <div class="sec-title" style="font-size:17px"><span class="bar"></span>בחר מסלול תעריף — ההכנסות יתעדכנו מיד</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px" id="quotePlanSelector">
        <div class="qplan-btn" id="qbtn-green" onclick="${d.acKW<=15?'switchPlan(\'green\',this)':''}" style="cursor:${d.acKW<=15?'pointer':'not-allowed'};border-radius:12px;padding:14px;border:2px solid ${d.effectivePlanKey==='green'?'#22c55e':'var(--border)'};background:${d.effectivePlanKey==='green'?'rgba(34,197,94,0.07)':'var(--light)'};opacity:${d.acKW>15?'0.4':'1'};transition:all 0.2s">
          <div style="font-size:16px;margin-bottom:4px">🌿</div>
          <div style="font-weight:800;color:var(--sky);font-size:13px">מסלול ירוק</div>
          <div style="font-size:10px;color:#15803d;margin-top:2px;font-weight:700">${Math.round(calcWeightedRate(d.acKW)*10000)/100} אג׳</div>
          <div style="font-size:10px;color:var(--gray);margin-top:1px">${d.acKW>15?'לא זמין >15kW':'ללא מונה ייצור ✓'}</div>
        </div>
        <div class="qplan-btn" id="qbtn-regular" onclick="switchPlan('regular',this)" style="cursor:pointer;border-radius:12px;padding:14px;border:2px solid ${d.effectivePlanKey==='regular'?'var(--sun)':'var(--border)'};background:${d.effectivePlanKey==='regular'?'rgba(244,162,0,0.05)':'var(--light)'};transition:all 0.2s">
          <div style="font-size:16px;margin-bottom:4px">📊</div>
          <div style="font-weight:800;color:var(--sky);font-size:13px">מסלול רגיל</div>
          <div style="font-size:10px;color:#b45309;margin-top:2px;font-weight:700">${Math.round(calcWeightedRate(d.acKW)*10000)/100} אג׳</div>
          <div style="font-size:10px;color:var(--gray);margin-top:1px">+ לוח מונה ייצור</div>
        </div>
        <div class="qplan-btn" id="qbtn-fast" onclick="switchPlan('fast',this)" style="cursor:pointer;border-radius:12px;padding:14px;border:2px solid ${d.effectivePlanKey==='fast'?'var(--sun)':'var(--border)'};background:${d.effectivePlanKey==='fast'?'rgba(244,162,0,0.05)':'var(--light)'};transition:all 0.2s">
          <div style="font-size:16px;margin-bottom:4px">⚡</div>
          <div style="font-weight:800;color:var(--sky);font-size:13px">החזר מהיר</div>
          <div style="font-size:10px;color:#b45309;margin-top:2px;font-weight:700">60/48 → 39 אג׳</div>
          <div style="font-size:10px;color:var(--gray);margin-top:1px">שנות 1–5 vs 6–25</div>
        </div>
        <div class="qplan-btn" id="qbtn-index" onclick="switchPlan('index',this)" style="cursor:pointer;border-radius:12px;padding:14px;border:2px solid ${d.effectivePlanKey==='index'?'var(--sun)':'var(--border)'};background:${d.effectivePlanKey==='index'?'rgba(244,162,0,0.05)':'var(--light)'};transition:all 0.2s">
          <div style="font-size:16px;margin-bottom:4px">📈</div>
          <div style="font-weight:800;color:var(--sky);font-size:13px">צמוד מדד</div>
          <div style="font-size:10px;color:#b45309;margin-top:2px;font-weight:700">38.7 אג׳ + מדד</div>
          <div style="font-size:10px;color:var(--gray);margin-top:1px">${d.needsMeter ? "⚡ כולל מונה ייצור" : "ללא מונה ייצור ✓"}</div>
        </div>
      </div>
      <div id="quoteInflationRowDiv" style="display:none;align-items:center;gap:8px;margin-top:12px;background:rgba(244,162,0,0.08);border:1px solid rgba(244,162,0,0.25);border-radius:9px;padding:10px 14px;font-size:13px;font-weight:600;color:#112240">
        <span>📉 אחוז אינפלציה שנתי:</span>
        <input id="quoteInflationInput" type="number" value="2.5" min="0" max="15" step="0.5" style="width:68px;padding:5px 8px;border:2px solid #E2E8F0;border-radius:7px;font-size:14px;font-weight:800;text-align:center;font-family:inherit;background:white;color:#0A1628;direction:ltr" oninput="refreshQuoteFinancials()">
        <span>%</span>
      </div>
    </div>

    <!-- METER NOTICE -->
    <div id="qf-meter-notice" style="display:${d.needsMeter?'flex':'none'};align-items:center;gap:12px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;border-radius:12px;padding:14px 20px;margin-bottom:14px">
      <span style="font-size:22px;flex-shrink:0">⚡</span>
      <div>
        <div style="font-weight:800;font-size:14px">לוח מונה ייצור נדרש</div>
        <div style="font-size:12px;opacity:0.85">מסלול זה מחייב לוח מונה ייצור — <span id="qf-meter-price">₪${fmt(d.meterPanelPrice)}</span> כלול במחיר המערכת</div>
      </div>
    </div>

    <!-- PLAN BANNER -->
    <div style="background:linear-gradient(135deg,#0A1628,#1D3461);border-radius:14px;padding:18px 22px;margin-bottom:18px;color:white">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px" id="qp-name">${p.planName}</div>
      <div style="font-size:13px;opacity:0.8;margin-bottom:10px" id="qp-rate">${p.rateNote}</div>
      ${fastPlanHTML}
      ${indexPlanHTML}
    </div>

    <!-- FIN CARDS -->
    <div class="fin-grid">
      <div class="fin-card dark">
        <span class="fin-val">₪${fmt(d.price)}</span>
        <div class="fin-lbl">עלות רכישת המערכת</div>
        <div class="fin-note">לא כולל מע"מ | כולל מע"מ: ₪${fmt(Math.round(d.price*VAT))}</div>
      </div>
      <div class="fin-card">
        <span class="fin-val" style="color:var(--green-dark)" id="qf-yr1">₪${fmt(p.yr1)}</span>
        <div class="fin-lbl">הכנסות שנה 1</div>
        <div class="fin-note">${p.rateNote} — הערכה</div>
      </div>
      <div class="fin-card">
        <span class="fin-val" id="qf-total">₪${fmt(p.totalInc)}</span>
        <div class="fin-lbl">סה"כ הכנסות 25 שנה</div>
        <div class="fin-note">ממוצע שנתי: <span id="qf-avg">₪${fmt(p.avgAnnual)}</span></div>
      </div>
      <div class="fin-card">
        <span class="fin-val" style="color:var(--green-dark)" id="qf-profit">₪${fmt(profit)}</span>
        <div class="fin-lbl">רווח לאורך חיי המערכת</div>
        <div class="fin-note">לאחר החזר השקעה — הערכה</div>
      </div>
    </div>
    <div class="fin-grid" style="margin-top:14px">
      <div class="fin-card" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0">
        <span class="fin-val" style="color:var(--green-dark)" id="qf-roi">${(p.roi*100).toFixed(1)}%</span>
        <div class="fin-lbl" style="color:#166534">תשואה שנה 1</div>
      </div>
      <div class="fin-card" style="background:linear-gradient(135deg,#fffbeb,#fef9c3);border:1px solid #fde68a">
        <span class="fin-val" style="color:#92400e" id="qf-payback">${fmtD(p.payback)}</span>
        <div class="fin-lbl" style="color:#92400e">שנות החזר השקעה</div>
      </div>
    </div>

    <!-- ROI BAR -->
    <div class="roi-section">
      <div class="roi-labels">
        <span id="qf-roi-bar-label">תשואה שנה 1: ${(p.roi*100).toFixed(1)}% | החזר: ${fmtD(p.payback)} שנים מתוך ${YEARS}</span>
      </div>
      <div class="roi-track"><div class="roi-fill" style="width:0%" id="roiFill"></div></div>
      <div class="roi-caption">ציר זמן להחזר מול חיי מערכת של ${YEARS} שנה | ${p.rateNote} | עלות לקו"ט: ₪${fmt(d.ppkw)}</div>
    </div>
  </div>

  <!-- PAYMENT -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>תנאי תשלום</div>
    <table class="payment-table">
      <thead><tr><th>שלב התשלום</th><th>תיאור</th><th>סכום (₪)</th></tr></thead>
      <tbody>
        <tr><td>מקדמה</td><td>בחתימת ההסכם</td><td class="amount-col">₪${fmt(d.dep)}</td></tr>
        <tr><td>השלמה ל-35%</td><td>בקבלת תוכניות ביצוע</td><td class="amount-col">₪${fmt(d.p2)}</td></tr>
        <tr><td>השלמה ל-95%</td><td>7 ימי עסקים בטרם אספקת פאנלים לאתר</td><td class="amount-col">₪${fmt(d.p3)}</td></tr>
        <tr><td>5% אחרון</td><td>ביום החיבור לחברת החשמל</td><td class="amount-col">₪${fmt(d.p4)}</td></tr>
        <tr class="total-row"><td colspan="2"><strong>סה"כ</strong></td><td class="amount-col"><strong>₪${fmt(d.price)}</strong></td></tr>
      </tbody>
    </table>
    <p class="vat-note">* לכל הסכומים הנ"ל יצורף מע"מ כחוק (סה"כ כולל מע"מ: ₪${fmt(Math.round(d.price*VAT))})</p>
  </div>

  ${noteBox}

  <!-- CTA TO SIGN -->
  <div id="cta-sign-block" style="background:linear-gradient(135deg,#0A1628,#1a3a5c);padding:40px 24px;text-align:center;border-radius:${clientMode ? '20px' : '0'}">
    <div style="font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">הצעה בתוקף ל-14 יום</div>
    <div style="font-size:24px;font-weight:900;color:white;margin-bottom:8px;line-height:1.35">${vals.name} יקר/ה,<br>${clientMode ? 'מוכן/ה לצאת לדרך?' : 'מוכן/ה לאשר את ההצעה?'}</div>
    ${clientMode ? '<div style="font-size:15px;color:rgba(255,255,255,0.6);margin-bottom:16px">בואו נחתום ונתקדם — ההצעה מחכה לאישורך</div>' : ''}
    <button onclick="openPrintDocument()" style="padding:14px 32px;background:var(--sun);color:white;font-size:16px;font-weight:800;border:none;border-radius:12px;cursor:pointer;box-shadow:0 4px 20px rgba(244,162,0,0.4);transition:all 0.2s">✍️ חתום על ההצעה</button>
  </div>`;
  }

  /** טוען את ה-template HTML חיצוני (קורא fetch) */
  async loadTemplate(url = 'solar-quote-template.html') {
    try {
      const res  = await fetch(url);
      this._templateHtml = await res.text();
    } catch (e) {
      console.warn('QuoteUI: לא ניתן לטעון template', e);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRINT DOCUMENT
  // ══════════════════════════════════════════════════════════════════════

  openPrintDocument() {
    const vals = this._getFormValues();
    const d    = this.quoteData || QuoteEngine.calculate({
      ...vals,
      dcKW:           vals.kw,
      planKey:        vals.plan,
      inflationPct:   vals.inflation,
      hasUrbanPremium: QuoteEngine.isUrbanPremiumCity(vals.city),
    });

    if (!this._templateHtml) {
      alert('Template לא נטען — נא להפעיל loadTemplate() תחילה');
      return;
    }

    const html = TemplateEngine.render(this._templateHtml, d, {
      name:    vals.name,
      phone:   vals.phone,
      address: vals.address,
      city:    vals.city,
      cid:     vals.cid,
      date:    vals.date,
      note:    vals.note,
    });

    const win = window.open('', '_blank');
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════════════════════

  _fmt(n)  { return Math.round(n).toLocaleString('he-IL'); }
  _fmtD(n) { return Number(n).toFixed(1); }

  _toggleTip(id, e) {
    e.stopPropagation();
    const popup = document.getElementById(id);
    if (!popup) return;
    const isOpen = popup.classList.contains('active');
    document.querySelectorAll('.tip-popup.active').forEach(p => p.classList.remove('active'));
    if (!isOpen) popup.classList.add('active');
  }
}

// ── Global helpers (לשימוש מ-HTML inline handlers) ─────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  window._quoteUI = new QuoteUI();
  await _quoteUI.loadTemplate('solar-quote-template.html');
  _quoteUI.init();

  // Close tips on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.tip-popup.active').forEach(p => p.classList.remove('active'));
  });
});

// ── Exports (ל-Node / בדיקות) ──────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QuoteUI };
}
