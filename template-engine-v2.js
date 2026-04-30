/**
 * template-engine-v2.js — SEMO A.G.S Template Engine (v2 / A.G.S design)
 *
 * Same public API as template-engine.js. The visual difference vs v1:
 *   • Currency format: number-first ("12,400 ₪") — invoice/legal convention.
 *   • Generated HTML uses A.G.S class names (project-total-box, etc.) which
 *     are styled by solar-quote-template-v2.html.
 *   • No emoji anywhere.
 *
 * Loaded only when window.__TEMPLATE_VERSION__ === "v2". v1 is unaffected.
 */

const TemplateEngineV2 = (() => {

  // ── Format helpers ──────────────────────────────────────────────────
  function fmt(n)   { return Math.round(n).toLocaleString('he-IL'); }
  function fmtD(n)  { return Number(n).toFixed(1); }
  // A.G.S brand: number-first currency in invoices/legal context.
  function fmtNIS(n){ return fmt(n) + ' ₪'; }

  // ── Spec table rows ─────────────────────────────────────────────────
  function buildSpecRows(d) {
    const rows = [
      ['הספק DC',           `${d.dcKW} קו"ט`],
      ['הספק AC',           `${d.acKW} קו"ט`],
      ['מספר פנלים',        `${d.panelCount} יח' × ${d.panelW}W`],
      ['שטח פנלים משוער',   `${fmtD(d.panelArea)} מ"ר`],
      ['סוג גג',            d.roof],
    ];
    if (d.roofArea > 0) rows.push(['שטח הגג', `${fmt(d.roofArea)} מ"ר`]);
    rows.push(
      ['אינוורטר',          d.inv],
      ['ייצור שנתי משוער',  `${fmt(d.annualKwh)} קו"ט`],
      ['מפסק ראשי',         `${d.breaker.size}A (${d.breaker.current}A חישובי)`],
    );
    if (d.needsMeter) rows.push(['לוח מונה ייצור', 'נדרש (AC > 15kW)']);
    return rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n    ');
  }

  // ── Price breakdown rows ────────────────────────────────────────────
  function buildPriceRows(d) {
    const rows = [];
    rows.push([`מערכת סולארית ${d.dcKW} קו"ט (${fmtNIS(d.ppkw)} לקו"ט)`, fmtNIS(d.dcKW * d.ppkw)]);
    if (d.needsMeter)       rows.push(['לוח מונה ייצור', fmtNIS(d.meterPanelPrice)]);
    return rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('\n    ');
  }

  // ── Battery warranty stub (warranty content moved to content-manager) ──
  function buildBatteryWarrantyRow() { return ''; }

  // ── Client ID field (optional) ──────────────────────────────────────
  function buildClientIdField(cid) {
    if (!cid) return '';
    return `<div class="field"><span class="label">ת.ז.:</span><span class="val">${cid}</span></div>`;
  }

  // ── Extras / potential expenses sections ────────────────────────────
  function buildExtrasSection(extras, basePrice) {
    const upgrades  = (extras || []).filter(e => e.checked && e.category !== 'potential');
    const potential = (extras || []).filter(e => e.checked && e.category === 'potential');

    if (upgrades.length === 0 && potential.length === 0) return '';

    let html = '';

    if (upgrades.length > 0) {
      const upgradesTotal = upgrades.reduce((s, e) => s + e.price, 0);
      const projectTotal  = basePrice + upgradesTotal;
      const rows = upgrades.map(e =>
        `<tr><td>${e.label}</td><td class="num">${fmtNIS(e.price)}</td></tr>`
      ).join('\n    ');
      html += `
<div class="section">
  <h2>תוספות ושדרוגים</h2>
  <div class="extras-note">הפריטים הבאים נבחרו כתוספות לפרויקט:</div>
  <table>
    <tr><th>פריט</th><th class="num">עלות</th></tr>
    ${rows}
    <tr class="total-row">
      <td><strong>סה"כ תוספות</strong></td>
      <td class="num"><strong>${fmtNIS(upgradesTotal)}</strong></td>
    </tr>
  </table>
  <div class="project-total-box">
    <div class="project-total-label">סה"כ עלות הפרויקט (מערכת + תוספות, לא כולל מע"מ)</div>
    <div class="project-total-value">${fmtNIS(projectTotal)}</div>
  </div>
</div>`;
    }

    if (potential.length > 0) {
      const potRows = potential.map(e =>
        `<tr><td>${e.label}</td><td class="num">${fmtNIS(e.price)}</td></tr>`
      ).join('\n    ');
      html += `
<div class="section">
  <h2>הוצאות פוטנציאליות</h2>
  <div class="extras-note">העלויות הבאות עשויות לחול בהתאם לצורך בשטח — לידיעה בלבד, אינן כלולות במחיר ההצעה:</div>
  <table>
    <tr><th>פריט</th><th class="num">עלות משוערת</th></tr>
    ${potRows}
  </table>
</div>`;
    }

    return html;
  }

  // ── Custom note ─────────────────────────────────────────────────────
  function buildNoteSection(note) {
    if (!note) return '';
    return `
<div class="section">
  <h2>הערה</h2>
  <div class="note-text">${note}</div>
</div>`;
  }

  // ── Main render ─────────────────────────────────────────────────────
  /**
   * Same signature as v1 TemplateEngine.render().
   * @param {string} templateHtml  — content of solar-quote-template-v2.html
   * @param {object} d             — output of QuoteEngine.calculate()
   * @param {object} client        — { name, phone, address, city, cid, date, note }
   * @param {object} contentSections — { spec, steps, exclusions } HTML strings
   */
  function render(templateHtml, d, client, contentSections) {
    const p        = d.plan;
    const profit   = Math.round(p.totalInc - d.price);
    const today    = new Date().toLocaleDateString('he-IL');
    const quoteDate = client.date
      ? new Date(client.date).toLocaleDateString('he-IL')
      : today;

    const replacements = {
      // Client
      '{{CLIENT_NAME}}':       client.name    || '—',
      '{{CLIENT_PHONE}}':      client.phone   || '—',
      '{{CLIENT_ADDRESS}}':    client.address || '—',
      '{{CLIENT_CITY}}':       client.city    || '—',
      '{{CLIENT_ID_FIELD}}':   buildClientIdField(client.cid),
      '{{QUOTE_DATE}}':        quoteDate,
      '{{TODAY_DATE}}':        today,

      // Prices — v2 currency format: "12,400 ₪"
      '{{TOTAL_PRICE}}':       fmtNIS(d.price),
      '{{TOTAL_PRICE_VAT}}':   fmtNIS(d.priceVAT),
      '{{PAY_1}}':             fmtNIS(d.dep),
      '{{PAY_2}}':             fmtNIS(d.p2),
      '{{PAY_3}}':             fmtNIS(d.p3),
      '{{PAY_4}}':             fmtNIS(d.p4),

      // Financial — v2 also uses number-first currency for consistency
      '{{FIN_YR1}}':           fmtNIS(p.yr1),
      '{{FIN_ROI}}':           (p.roi * 100).toFixed(1),
      '{{FIN_PAYBACK}}':       fmtD(p.payback),
      '{{FIN_TOTAL_25}}':      fmtNIS(p.totalInc),
      '{{FIN_AVG_ANNUAL}}':    fmtNIS(p.avgAnnual),
      '{{FIN_PROFIT}}':        fmtNIS(profit),
      '{{RATE_NOTE}}':         p.rateNote,

      // Equipment
      '{{PANEL_W}}':           String(d.panelW),
      '{{INVERTER}}':          d.inv,

      // Dynamic tables / sections
      '{{SPEC_ROWS}}':         buildSpecRows(d),
      '{{PRICE_ROWS}}':        buildPriceRows(d),
      '{{BATTERY_WARRANTY_ROW}}': buildBatteryWarrantyRow(d),

      // Optional content sections (injected from UI / content editor)
      '{{SPEC_SECTION_HTML}}':       (contentSections && contentSections.spec) || '',
      '{{STEPS_SECTION_HTML}}':      (contentSections && contentSections.steps) || '',
      '{{EXCLUSIONS_SECTION_HTML}}': (contentSections && contentSections.exclusions) || '',
      '{{EXTRAS_SECTION_HTML}}':     buildExtrasSection(d.extras, d.price),
      '{{NOTE_SECTION_HTML}}':       buildNoteSection(client.note),

      // Logo — filled by caller, same as v1
      '{{LOGO_SRC}}':          '',
    };

    let html = templateHtml;
    for (const [placeholder, value] of Object.entries(replacements)) {
      html = html.split(placeholder).join(value ?? '');
    }
    // Strip any remaining {{...}} so they never leak to the customer.
    html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
    return html;
  }

  return { render };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TemplateEngineV2 };
}
