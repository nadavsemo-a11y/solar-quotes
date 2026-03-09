/**
 * template-engine.js — SEMO AGS Template Engine
 *
 * אחריות: מילוי תבנית HTML בנתונים.
 * מקבל: אובייקט נתונים מ-quote-engine
 * מחזיר: HTML מוכן להצגה / הדפסה
 *
 * שימוש:
 *   const html = TemplateEngine.render(templateHtml, quoteData);
 *   document.open(); document.write(html); document.close();
 */

const TemplateEngine = (() => {

  // ── פורמט עזר ─────────────────────────────────────────────────────────
  function fmt(n)  { return Math.round(n).toLocaleString('he-IL'); }
  function fmtD(n) { return Number(n).toFixed(1); }

  // ── בניית שורות טבלת מפרט ─────────────────────────────────────────────
  function buildSpecRows(d) {
    const rows = [
      ['הספק DC',           `${d.dcKW} קו"ט`],
      ['הספק AC',           `${d.acKW} קו"ט`],
      ['מספר פנלים',        `${d.panelCount} יח' × ${d.panelW}W`],
      ['שטח פנלים משוער',   `${fmtD(d.panelArea)} מ"ר`],
      ['סוג גג',            d.roof],
      ['אינוורטר',          d.inv],
      ['ייצור שנתי משוער',  `${fmt(d.annualKwh)} קו"ט`],
      ['מפסק ראשי',         `${d.breaker.size}A (${d.breaker.current}A חישובי)`],
    ];
    if (d.batt > 0) rows.push(['מצברי אגירה', `${d.batt} × 5 קו"ט`]);
    if (d.evCharger === 'כן') rows.push(['עמדת טעינה EV', d.evModel || 'כלול']);
    if (d.needsMeter) rows.push(['לוח מונה ייצור', 'נדרש (AC > 15kW)']);
    return rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n    ');
  }

  // ── בניית שורות פירוט מחיר ────────────────────────────────────────────
  function buildPriceRows(d) {
    const rows = [];
    rows.push([`מערכת סולארית ${d.dcKW} קו"ט`, `₪${fmt(d.dcKW * d.ppkw)}`]);
    if (d.roof === 'בטון') rows.push(['תוספת גג בטון', `₪${fmt(d.dcKW * d.concretePerKw)}`]);
    if (d.batt > 0)        rows.push([`מצברי אגירה ${d.batt} × 5 קו"ט`, `₪${fmt(d.batt * d.battUnitPrice)}`]);
    if (d.inv === 'Solaredge') rows.push(['תוספת ממיר SolarEdge', `₪${fmt(d.sePrice)}`]);
    if (d.evCharger === 'כן')  rows.push([`עמדת טעינה EV${d.evModel ? ' — ' + d.evModel : ''}`, `₪${fmt(d.evPrice)}`]);
    if (d.needsMeter)          rows.push(['לוח מונה ייצור', `₪${fmt(d.meterPanelPrice)}`]);
    return rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('\n    ');
  }

  // ── שורת אחריות מצבר ──────────────────────────────────────────────────
  function buildBatteryWarrantyRow(d) {
    if (d.batt <= 0) return '';
    return `<tr><td>מצברי אגירה ${d.batt} × 5 קו"ט</td><td>אחריות יצרן 10 שנים</td></tr>`;
  }

  // ── שדה ת.ז. (אופציונלי) ──────────────────────────────────────────────
  function buildClientIdField(cid) {
    if (!cid) return '';
    return `<div class="field"><span class="label">ת.ז.:</span><span class="val">${cid}</span></div>`;
  }

  // ── עלויות נוספות אפשריות ─────────────────────────────────────────────
  function buildExtrasSection(extras) {
    const checked = (extras || []).filter(e => e.checked);
    if (checked.length === 0) return '';
    const rows = checked.map(e =>
      `<tr><td>${e.label}</td><td class="num">₪${fmt(e.price)}</td></tr>`
    ).join('\n    ');
    return `
<div class="section">
  <h2>עלויות נוספות אפשריות</h2>
  <div class="extras-note">הפריטים הבאים אינם כלולים במחיר ההצעה — ייתכן שיידרשו בהתאם לתנאי השטח.</div>
  <table>
    <tr><th>פריט</th><th style="text-align:left">עלות</th></tr>
    ${rows}
  </table>
</div>`;
  }

  // ── הערה אישית ────────────────────────────────────────────────────────
  function buildNoteSection(note) {
    if (!note) return '';
    return `
<div class="section">
  <h2>הערה</h2>
  <div class="note-text">${note}</div>
</div>`;
  }

  // ── פונקציה ראשית: render ──────────────────────────────────────────────
  /**
   * render(templateHtml, quoteData)
   * מחליף את כל ה-placeholders ב-{{...}} בנתונים אמיתיים.
   *
   * @param {string} templateHtml  — תוכן קובץ solar-quote-template.html
   * @param {object} d             — תוצאת QuoteEngine.calculate()
   * @param {object} client        — { name, phone, address, city, cid, date, note }
   * @returns {string}             — HTML מוכן
   */
  function render(templateHtml, d, client) {
    const p        = d.plan;
    const profit   = Math.round(p.totalInc - d.price);
    const today    = new Date().toLocaleDateString('he-IL');
    const quoteDate = client.date
      ? new Date(client.date).toLocaleDateString('he-IL')
      : today;

    const replacements = {
      // לקוח
      '{{CLIENT_NAME}}':       client.name    || '—',
      '{{CLIENT_PHONE}}':      client.phone   || '—',
      '{{CLIENT_ADDRESS}}':    client.address || '—',
      '{{CLIENT_CITY}}':       client.city    || '—',
      '{{CLIENT_ID_FIELD}}':   buildClientIdField(client.cid),
      '{{QUOTE_DATE}}':        quoteDate,
      '{{TODAY_DATE}}':        today,

      // מחירים
      '{{TOTAL_PRICE}}':       fmt(d.price),
      '{{TOTAL_PRICE_VAT}}':   fmt(d.priceVAT),
      '{{PAY_1}}':             fmt(d.dep),
      '{{PAY_2}}':             fmt(d.p2),
      '{{PAY_3}}':             fmt(d.p3),
      '{{PAY_4}}':             fmt(d.p4),

      // פיננסי
      '{{FIN_YR1}}':           fmt(p.yr1),
      '{{FIN_ROI}}':           (p.roi * 100).toFixed(1),
      '{{FIN_PAYBACK}}':       fmtD(p.payback),
      '{{FIN_TOTAL_25}}':      fmt(p.totalInc),
      '{{FIN_AVG_ANNUAL}}':    fmt(p.avgAnnual),
      '{{FIN_PROFIT}}':        fmt(profit),
      '{{RATE_NOTE}}':         p.rateNote,

      // ציוד
      '{{PANEL_W}}':           String(d.panelW),
      '{{INVERTER}}':          d.inv,

      // טבלאות דינמיות
      '{{SPEC_ROWS}}':         buildSpecRows(d),
      '{{PRICE_ROWS}}':        buildPriceRows(d),
      '{{BATTERY_WARRANTY_ROW}}': buildBatteryWarrantyRow(d),

      // סקציות אופציונליות (מוזרקות מה-UI)
      '{{SPEC_SECTION_HTML}}':       '',  // ימולא על ידי ה-UI אם נדרש
      '{{STEPS_SECTION_HTML}}':      '',
      '{{EXCLUSIONS_SECTION_HTML}}': '',
      '{{EXTRAS_SECTION_HTML}}':     buildExtrasSection(d.extras),
      '{{NOTE_SECTION_HTML}}':       buildNoteSection(client.note),

      // לוגו — ניתן לשנות ל-URL חיצוני
      '{{LOGO_SRC}}':          '', // ימולא בעת הקריאה
    };

    let html = templateHtml;
    for (const [placeholder, value] of Object.entries(replacements)) {
      html = html.split(placeholder).join(value ?? '');
    }
    // נקה כל placeholder שנשאר (למנוע דליפת {{...}} ללקוח)
    html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
    return html;
  }

  // ── ייצוא ─────────────────────────────────────────────────────────────
  return { render };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TemplateEngine };
}
