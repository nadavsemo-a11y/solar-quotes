/**
 * content-manager.js — SEMO AGS Content Block Manager
 *
 * מנהל את כל בלוקי התוכן הטקסטואלי שמופיעים בהצעת המחיר.
 * מאפשר: עריכה, הפעלה/כיבוי, שינוי סדר, הוספת בלוקים, שמירת ברירת מחדל, ושמירה חד-פעמית.
 *
 * localStorage keys:
 *   semo-content-blocks  — ברירות מחדל מותאמות אישית
 *   semo-content-session  — שינויים חד-פעמיים להצעה הנוכחית
 */

const ContentManager = (() => {

  const STORAGE_KEY = 'semo-content-blocks';
  const SESSION_KEY = 'semo-content-session';

  // ══════════════════════════════════════════════════════════════════════
  // DEFAULT CONTENT BLOCKS
  // ══════════════════════════════════════════════════════════════════════

  // -- SINGLE SOURCE of default editorial content (solar-content-blocks) --
  // ContentManager does NOT own a second copy of the narrative content. The 14 editorial sections
  // (and the small inline-helper label sections) are PROJECTED from the canonical structured source
  // into ContentManager inline-HTML block shape. A wording change is made once, in solar-content-blocks.
  const _SCB = (typeof module !== "undefined" && module.exports)
    ? require("./solar-quote/solar-content-blocks.js")
    : (typeof globalThis !== "undefined" ? globalThis.SolarContentBlocks : undefined);
  if (!_SCB) throw new Error("content-manager: SolarContentBlocks not loaded -- include solar-quote/solar-content-blocks.js before content-manager.js");
  function _spansToHtml(spans){ return (spans||[]).map(function(sp){ return sp.emphasis==="strong" ? "<strong>"+sp.text+"</strong>" : sp.text; }).join(""); }
  function _projBlock(b){
    var o={ id:b.id, enabled:true };
    if (Array.isArray(b.spans)) o.text=_spansToHtml(b.spans);
    else if (Array.isArray(b.lines)) { o.icon=b.icon; o.title=b.title; o.text=b.lines.join("\n"); }
    else if (b.type==="process-step") { o.title=b.title; o.text=b.text; }
    else o.text=b.text;
    return o;
  }
  function _projSection(sec){ return { title:sec.title, type:sec.type, enabled:true, region:sec.region, blocks:sec.blocks.map(_projBlock) }; }
  function __solarEditorialDefaults(){
    var out={};
    var ids=_SCB.SOLAR_SECTION_ORDER.filter(function(id){ return _SCB.SOLAR_SECTIONS[id]; });
    for (var i=0;i<ids.length;i++){ out[ids[i]]=_projSection(_SCB.SOLAR_SECTIONS[ids[i]]); }
    var u=_SCB.SOLAR_UPGRADES_INTRO, p=_SCB.SOLAR_POTENTIAL_INTRO, pay=_SCB.SOLAR_PAYMENT_DESCRIPTIONS;
    out["payment-desc"]={ title:"תיאורי שלבי תשלום", type:"payment-stages", enabled:true, region:"post-payment",
      blocks: pay.map(function(d){ return { id:d.id, title:d.title, text:d.text, enabled:true }; }) };
    out["upgrades-intro"]={ title:"כותרות סקציית שדרוגים", type:"single-texts", enabled:true, region:"post-financial",
      blocks:[ { id:"upgrades-title", text:u.title, enabled:true }, { id:"upgrades-subtitle", text:u.subtitle, enabled:true } ] };
    out["potential-intro"]={ title:"כותרות סקציית הוצאות פוטנציאליות", type:"single-texts", enabled:true, region:"post-financial",
      blocks:[ { id:"potential-title", text:p.title, enabled:true }, { id:"potential-subtitle", text:p.subtitle, enabled:true } ] };
    return out;
  }

  const DEFAULTS = {
    sectionOrder: _SCB.SOLAR_SECTION_ORDER.slice(),

    sections: {

...__solarEditorialDefaults(),

      // FIXED / CALCULATED SECTIONS (position-only, not editable)

      'financials': {
        title: 'נתונים פיננסיים ומסלול תעריף',
        type: 'fixed',
        enabled: true,
        fixedKey: 'financials',
        description: 'בוחר מסלול תעריף, כרטיסי הכנסות, ROI ותחזית כלכלית',
        editLink: null,
      },

      'upgrades-section': {
        title: 'שדרוגים והוצאות נוספות',
        type: 'fixed',
        enabled: true,
        fixedKey: 'upgrades-section',
        description: 'רשימת השדרוגים שהלקוח יכול לבחור (toggle)',
        editLink: 'extras-manager.html',
        editLabel: 'ניהול שדרוגים והוצאות',
      },

      'price-breakdown': {
        title: 'פירוט מחיר ההצעה',
        type: 'fixed',
        enabled: true,
        fixedKey: 'price-breakdown',
        description: 'טבלת פירוט עלות המערכת, תוספות ומע"מ',
        editLink: null,
      },

      'potential-costs': {
        title: 'הוצאות פוטנציאליות',
        type: 'fixed',
        enabled: true,
        fixedKey: 'potential-costs',
        description: 'טבלת הוצאות שעשויות לחול — לידיעה בלבד, לא כלולות במחיר',
        editLink: 'extras-manager.html',
        editLabel: 'ניהול שדרוגים והוצאות',
      },

      'payment-section': {
        title: 'תנאי תשלום',
        type: 'fixed',
        enabled: true,
        fixedKey: 'payment-section',
        description: 'טבלת שלבי תשלום — שמות, תיאורים, אחוזים וסכום מקדמה',
        editLink: 'payment-editor.html',
        editLabel: 'עריכת תנאי תשלום',
      },
    },
  };

  // ══════════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════════════════════

  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  let _counter = Date.now();
  function uid() { return 'blk-' + (++_counter).toString(36); }

  // ══════════════════════════════════════════════════════════════════════
  // LOAD / SAVE
  // ══════════════════════════════════════════════════════════════════════

  /** Load content: session > saved defaults > hardcoded defaults */
  function load() {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      if (session) {
        const data = JSON.parse(session);
        return _mergeWithDefaults(data);
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        return _mergeWithDefaults(data);
      }
    } catch (e) { console.warn('ContentManager: load error', e); }
    return deepClone(DEFAULTS);
  }

  /** Merge saved data with defaults — ensures new default sections/blocks aren't lost */
  function _mergeWithDefaults(saved) {
    const defaults = deepClone(DEFAULTS);
    // Add any missing sections from defaults
    for (const [sectionId, section] of Object.entries(defaults.sections)) {
      if (!saved.sections[sectionId]) {
        saved.sections[sectionId] = section;
        if (!saved.sectionOrder.includes(sectionId)) {
          saved.sectionOrder.push(sectionId);
        }
      }
    }
    // Add any missing blocks within existing sections
    for (const [sectionId, section] of Object.entries(defaults.sections)) {
      if (saved.sections[sectionId]) {
        const existing = new Set(saved.sections[sectionId].blocks.map(b => b.id));
        for (const block of section.blocks) {
          if (!existing.has(block.id)) {
            saved.sections[sectionId].blocks.push(deepClone(block));
          }
        }
      }
    }
    return saved;
  }

  /** Save as persistent defaults */
  function saveDefaults(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Also sync legacy key for backward compatibility
    _syncLegacyKey(data);
  }

  /** Save as session-only (one-time for current quote) */
  function saveSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  /** Clear session overrides */
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  /** Check if session overrides exist */
  function hasSession() {
    return !!localStorage.getItem(SESSION_KEY);
  }

  /** Reset to factory defaults */
  function resetToDefaults() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    _syncLegacyKey(deepClone(DEFAULTS));
    return deepClone(DEFAULTS);
  }

  /** Sync the legacy semo-quote-content key (list of selected paragraph IDs) */
  function _syncLegacyKey(data) {
    const paragraphSections = ['intro', 'service', 'focus', 'environment', 'spec',
      'project-details', 'design', 'warranty', 'steps', 'notes'];
    const selectedIds = [];
    for (const sid of paragraphSections) {
      const section = data.sections[sid];
      if (!section || !section.enabled) continue;
      for (const block of section.blocks) {
        if (block.enabled) selectedIds.push(block.id);
      }
    }
    localStorage.setItem('semo-quote-content', JSON.stringify(selectedIds));
  }

  // ══════════════════════════════════════════════════════════════════════
  // CONTENT API — used by quote rendering
  // ══════════════════════════════════════════════════════════════════════

  /** Get section by ID */
  function getSection(sectionId) {
    const data = load();
    return data.sections[sectionId] || null;
  }

  /** Get enabled blocks of a section, in order */
  function getEnabledBlocks(sectionId) {
    const section = getSection(sectionId);
    if (!section || !section.enabled) return [];
    return section.blocks.filter(b => b.enabled);
  }

  /** Get ordered section IDs */
  function getSectionOrder() {
    const data = load();
    return data.sectionOrder;
  }

  /** Get ordered sections filtered by region */
  function getSectionsByRegion(region) {
    const data = load();
    return data.sectionOrder
      .filter(sid => data.sections[sid] && data.sections[sid].region === region && data.sections[sid].enabled)
      .map(sid => ({ id: sid, ...data.sections[sid] }));
  }

  /** Get a single block's text (with placeholder replacement) */
  function getBlockText(sectionId, blockId) {
    const section = getSection(sectionId);
    if (!section) return '';
    const block = section.blocks.find(b => b.id === blockId);
    return block ? block.text : '';
  }

  // ══════════════════════════════════════════════════════════════════════
  // MUTATION API — used by editor
  // ══════════════════════════════════════════════════════════════════════

  /** Update a block's text */
  function updateBlockText(data, sectionId, blockId, newText) {
    const section = data.sections[sectionId];
    if (!section) return;
    const block = section.blocks.find(b => b.id === blockId);
    if (block) block.text = newText;
  }

  /** Update a block's title (for process-steps, warranty-cards) */
  function updateBlockTitle(data, sectionId, blockId, newTitle) {
    const section = data.sections[sectionId];
    if (!section) return;
    const block = section.blocks.find(b => b.id === blockId);
    if (block) block.title = newTitle;
  }

  /** Toggle block enabled state */
  function toggleBlock(data, sectionId, blockId) {
    const section = data.sections[sectionId];
    if (!section) return;
    const block = section.blocks.find(b => b.id === blockId);
    if (block) block.enabled = !block.enabled;
  }

  /** Toggle entire section */
  function toggleSection(data, sectionId) {
    const section = data.sections[sectionId];
    if (section) section.enabled = !section.enabled;
  }

  /** Move block within section (direction: -1 = up, +1 = down) */
  function moveBlock(data, sectionId, blockId, direction) {
    const section = data.sections[sectionId];
    if (!section) return;
    const idx = section.blocks.findIndex(b => b.id === blockId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= section.blocks.length) return;
    const temp = section.blocks[idx];
    section.blocks[idx] = section.blocks[newIdx];
    section.blocks[newIdx] = temp;
  }

  /** Move section in order (direction: -1 = up, +1 = down) */
  function moveSection(data, sectionId, direction) {
    const idx = data.sectionOrder.indexOf(sectionId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= data.sectionOrder.length) return;
    const temp = data.sectionOrder[idx];
    data.sectionOrder[idx] = data.sectionOrder[newIdx];
    data.sectionOrder[newIdx] = temp;
  }

  /** Add a new block to a section */
  function addBlock(data, sectionId, text, title) {
    const section = data.sections[sectionId];
    if (!section) return null;
    const block = { id: uid(), text: text || '', enabled: true };
    if (title !== undefined) block.title = title;
    if (section.type === 'warranty-cards') block.icon = '📌';
    section.blocks.push(block);
    return block;
  }

  /** Remove a block from a section */
  function removeBlock(data, sectionId, blockId) {
    const section = data.sections[sectionId];
    if (!section) return;
    section.blocks = section.blocks.filter(b => b.id !== blockId);
  }

  /** Update section title */
  function updateSectionTitle(data, sectionId, newTitle) {
    const section = data.sections[sectionId];
    if (section) section.title = newTitle;
  }

  /** Add a new custom section */
  function addSection(data, title, type) {
    const id = 'custom-' + uid();
    data.sections[id] = {
      title: title || 'סקציה חדשה',
      type: type || 'paragraphs',
      enabled: true,
      region: 'post-financial',
      blocks: [],
    };
    data.sectionOrder.push(id);
    return id;
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER HELPERS — used by _buildQuoteHTML in quote-ui.js
  // ══════════════════════════════════════════════════════════════════════

  /** Replace content placeholders in text */
  function replacePlaceholders(text, d) {
    if (!text || !d) return text;
    const fmt = n => Math.round(n).toLocaleString('he-IL');
    const co2Tons = ((d.annualKwh * 0.75) / 1000).toFixed(1);
    const forestDunam = ((d.annualKwh / 1000) * 3.5).toFixed(1);
    const treeCount = Math.round(parseFloat(forestDunam) * 10);
    const carKm = fmt(Math.round(d.annualKwh * 3.8));
    const map = {
      '{{annualKwh}}': fmt(d.annualKwh),
      '{{co2Tons}}': co2Tons,
      '{{forestDunam}}': forestDunam,
      '{{treeCount}}': String(treeCount),
      '{{carKm}}': carKm,
      '{{panelW}}': String(d.panelW),
      '{{panelCount}}': String(d.panelCount),
      '{{inv}}': d.inv,
    };
    for (const [ph, val] of Object.entries(map)) {
      text = text.split(ph).join(val);
    }
    return text;
  }

  /** Render a paragraph-type section as HTML for the quote */
  function renderParagraphSection(sectionId, d) {
    const section = getSection(sectionId);
    if (!section || !section.enabled) return '';
    const blocks = section.blocks.filter(b => b.enabled);
    if (blocks.length === 0) return '';
    const items = blocks.map(b => {
      const text = replacePlaceholders(b.text, d);
      return `<div style="padding:6px 0;line-height:1.8;font-size:13px;color:#334155;border-bottom:1px solid var(--border)">${text}</div>`;
    }).join('');
    return `
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>${section.title}</div>
    ${items}
  </div>`;
  }

  /** Render include-items section */
  function renderIncludesSection(d, extraItems) {
    const section = getSection('includes');
    if (!section || !section.enabled) return '';
    const blocks = section.blocks.filter(b => b.enabled);
    if (blocks.length === 0 && !extraItems) return '';
    const items = blocks.map(b => {
      const text = replacePlaceholders(b.text, d);
      return `<div class="inc-item"><div class="inc-check">✓</div><div class="inc-text">${text}</div></div>`;
    }).join('\n      ');
    return `
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>${section.title}</div>
    <div class="inc-grid">
      ${items}
      ${extraItems || ''}
    </div>
  </div>`;
  }

  /** Render process-steps section */
  function renderProcessSection() {
    const section = getSection('process');
    if (!section || !section.enabled) return '';
    const blocks = section.blocks.filter(b => b.enabled);
    if (blocks.length === 0) return '';
    const steps = blocks.map((b, i) =>
      `<div class="step"><div class="step-num">${i + 1}</div><div class="step-body"><div class="step-title">${b.title}</div><div class="step-desc">${b.text}</div></div></div>`
    ).join('\n      ');
    return `
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>${section.title}</div>
    <div class="steps">
      ${steps}
    </div>
    <div style="font-size:12px;color:var(--gray);margin-top:10px">* לוח זמנים צפוי: עד 60 ימי עסקים מחתימת ההסכם</div>
  </div>`;
  }

  /** Render warranty-cards section */
  function renderWarrantyCardsSection(d, extraCard) {
    const section = getSection('warranty-cards');
    if (!section || !section.enabled) return '';
    const blocks = section.blocks.filter(b => b.enabled);
    if (blocks.length === 0 && !extraCard) return '';
    const cards = blocks.map(b => {
      const text = replacePlaceholders(b.text, d).replace(/\n/g, '<br>');
      const title = replacePlaceholders(b.title || '', d);
      return `<div class="warranty-card">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div class="warranty-icon">${b.icon || '📌'}</div>
          <div>
            <div class="warranty-title">${title}</div>
            <div class="warranty-desc">${text}</div>
          </div>
        </div>
      </div>`;
    }).join('\n      ');
    return `
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>${section.title}</div>
    <div class="warranty-grid">
      ${cards}
      ${extraCard || ''}
    </div>
  </div>`;
  }

  /** Render terms section */
  function renderTermsSection() {
    const section = getSection('terms');
    if (!section || !section.enabled) return '';
    const blocks = section.blocks.filter(b => b.enabled);
    if (blocks.length === 0) return '';
    const clauses = blocks.map((b, i) => `${i + 1}. ${b.text}`).join('<br>\n      ');
    return `
  <div class="sec" style="font-size:13px;color:var(--gray);line-height:1.8">
    <div class="sec-title"><span class="bar"></span>${section.title}</div>
    <div>
      ${clauses}
    </div>
  </div>`;
  }

  /** Render any section by ID and type */
  function renderSection(sectionId, d, opts) {
    const section = getSection(sectionId);
    if (!section || !section.enabled) return '';
    switch (section.type) {
      case 'paragraphs':      return renderParagraphSection(sectionId, d);
      case 'include-items':   return renderIncludesSection(d, opts && opts.extraIncludeItems);
      case 'process-steps':   return renderProcessSection();
      case 'warranty-cards':  return renderWarrantyCardsSection(d, opts && opts.extraBatteryCard);
      case 'terms':           return renderTermsSection();
      case 'payment-stages':  return ''; // handled inline in _buildQuoteHTML
      case 'single-texts':    return ''; // titles handled inline
      case 'fixed':           return ''; // rendered by _buildQuoteHTML order loop
      default:                return renderParagraphSection(sectionId, d);
    }
  }

  /** Render all sections for a given region */
  function renderRegion(region, d, opts) {
    const data = load();
    return data.sectionOrder
      .filter(sid => {
        const s = data.sections[sid];
        return s && s.enabled && s.region === region &&
               s.type !== 'payment-stages' && s.type !== 'single-texts' && s.type !== 'fixed';
      })
      .map(sid => renderSection(sid, d, opts))
      .join('\n');
  }

  /** Get text values for inline sections (upgrades-intro, potential-intro, payment-desc) */
  function getInlineText(sectionId, blockId) {
    const blocks = getEnabledBlocks(sectionId);
    const block = blocks.find(b => b.id === blockId);
    return block ? block.text : '';
  }

  /** Get payment stage descriptions */
  function getPaymentDescriptions() {
    const blocks = getEnabledBlocks('payment-desc');
    const result = {};
    for (const b of blocks) {
      result[b.id] = { title: b.title, text: b.text };
    }
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════
  // EXPORT
  // ══════════════════════════════════════════════════════════════════════

  return {
    load,
    saveDefaults,
    saveSession,
    clearSession,
    hasSession,
    resetToDefaults,
    getSection,
    getEnabledBlocks,
    getSectionOrder,
    getSectionsByRegion,
    getBlockText,
    getInlineText,
    getPaymentDescriptions,
    replacePlaceholders,
    renderSection,
    renderRegion,
    renderParagraphSection,
    renderIncludesSection,
    renderProcessSection,
    renderWarrantyCardsSection,
    renderTermsSection,
    // Mutation API
    updateBlockText,
    updateBlockTitle,
    toggleBlock,
    toggleSection,
    moveBlock,
    moveSection,
    addBlock,
    removeBlock,
    updateSectionTitle,
    addSection,
    // Helpers
    deepClone: deepClone,
    DEFAULTS: DEFAULTS,
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentManager };
}
