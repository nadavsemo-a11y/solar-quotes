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
  // CONTENT PARAGRAPHS — from Excel "הצעה גרפית" tab
  // Used by _buildContentSections() to inject user-selected paragraphs
  // ══════════════════════════════════════════════════════════════════════

  static CONTENT_PARAGRAPHS = {
    // Section 1: מבוא
    'intro-1': { section: 'מבוא', text: 'ברכות על הבחירה להצטרף לייצור אנרגיה סולארית. אנו נשמח לעבוד על הפרויקט יחד איתכם.' },
    'intro-2': { section: 'מבוא', text: 'בעידן שבו העולם צמא לאנרגיה ממקורות מתחדשים, להפיק חשמל נקי מזיהום, מאנרגיית השמש זה הדבר הנכון לעשות. כבעלי גג, יש לכם הזדמנות לעשות בו שימוש כדי לקדם מטרה שחשובה למדינה ולאנושות.' },
    'intro-3': { section: 'מבוא', text: 'כדי לתרום למאמץ, מדינת ישראל, באמצעות רשות החשמל, יצרה אסדרות בזכותן החשמל שתייצרו באמצעות המערכת הסולארית שתותקן על הגג שלכם ישמש להתקזזות מול עלויות צריכת החשמל ואף תוכלו למכור את עודפי ייצור החשמל לחברת החשמל. האסדרה מבטיחה את זכאותכם לתשלומים מול חברת החשמל למשך 25 שנה.' },
    'intro-4': { section: 'מבוא', text: 'באופן זה המערכת הסולארית תיצור עבורכם חיסכון והכנסות מעבר לעלותה, ובכך תניב לכם תשואה נאה, ותתרום לרווחתכם וביטחונכם הכלכלי.' },

    // Section 2: שירות אישי
    'service-1': { section: 'שירות אישי ומקצועי', text: 'אצלנו הכל מתחיל באנשים. מובילי החברה הם מוותיק התחום הסולארי בארץ ונותנים דגש מתמשך על מקצועיות ואיכות, בדגש על תשומת לב אישית. תוכלו להנות מהקשר האישי והגישה המקצועית.' },
    'service-2': { section: 'שירות אישי ומקצועי', text: 'נפעל כדי שהמערכת שלכם תשרת אתכם נאמנה שנים ארוכות ותהליך הפרויקט יהיה ברור ופשוט עבורכם.' },

    // Section 3: דגשים
    'focus-1': { section: 'דגשים מקצועיים', text: '<strong>תכנון מקצועי:</strong> כל פרויקט מתחיל בסקר השטח שיבוצע ע"י אחד מהיועצים המנוסים שלנו הכולל צילום תמונות רחפן, בדיקת הגג, ולוח החשמל. אנו נטפל בנדרש בצורה אישית כדי להבטיח התקנה ברמה הגבוהה ביותר.' },
    'focus-2': { section: 'דגשים מקצועיים', text: '<strong>ההצעה מפרטת הכל:</strong> אין תוספות לא צפויות או אותיות קטנות. אנחנו לוקחים את מלוא האחריות על כל התהליך, כולל הגשת אישורים לרשויות השונות, תכנון העמדה, והתקנת המערכת. נפעל ככל האפשר, למנוע מכם הפתעות.' },
    'focus-3': { section: 'דגשים מקצועיים', text: '<strong>ניהול פרויקט מקצועי:</strong> תקבלו מאיתנו עדכונים שוטפים והנחיות, בכדי שתוכלו להיות עם ראש שקט ולהנות מהתהליך.' },

    // Section 4: סביבה
    'env-1': { section: 'התועלת לסביבה', text: '{{annualKwh}} קווט"ש חשמל נקי, שמערכת הסולארית שלכם תייצר כל שנה.' },
    'env-2': { section: 'התועלת לסביבה', text: '{{co2Tons}} טון פליטות פחמן דו-חמצני, שלא חייבים לייצר עכשיו מדלק מזהם. (כל קווט"ש ייצור סולארי מונע כ-0.75 ק"ג פליטות בשנה)' },
    'env-3': { section: 'התועלת לסביבה', text: '{{forestDunam}} דונם יער, שצריך לשתול כחלופה להפחתת הזיהום של המערכת הסולארית ({{treeCount}} שווה ערך בכמות עצים). (כל מגה-ווט"ש ייצור סולארי שקול לכ-3.5 דונם יער)' },
    'env-4': { section: 'התועלת לסביבה', text: '{{carKm}} ק"מ נסיעה ברכב, שצריך לצמצם כדי להשתוות לתועלת לסביבה של המערכת הסולארית. (כל קווט"ש ייצור סולארי שקול לכ-3.8 ק"מ נסיעה ברכב)' },

    // Section 5: מפרט
    'spec-1': { section: 'מפרט טכני', text: 'פאנל מיצרן בדרג TIER 1 בהספק {{panelW}} וואט. יצרן הפאנל וההספק הסופי יקבעו בסיום התכנון.' },
    'spec-2': { section: 'מפרט טכני', text: 'ממיר זרם תוצרת {{inv}} או שווה ערך.' },
    'spec-3': { section: 'מפרט טכני', text: 'קונסטרוקציה מאלומיניום. ברגי נירוסטה.' },
    'spec-4': { section: 'מפרט טכני', text: 'מחברים PV PLUGS מתוצרת אירופאית/אמריקאית.' },
    'spec-5': { section: 'מפרט טכני', text: 'ציוד מיתוג — תוצרת ABB שוויץ או שווה ערך.' },
    'spec-6': { section: 'מפרט טכני', text: 'חיווט בתוך תעלות רשת מכוסות / צינורות.' },
    'spec-7': { section: 'מפרט טכני', text: 'אפליקציה לניטור ביצועי המערכת בסמארטפון ובמחשב.' },
    'spec-8': { section: 'מפרט טכני', text: 'הגנות ברקים DC + הגנה מרכזית למערכת.' },

    // Section 6: פרטים נוספים
    'add-1': { section: 'פרטים נוספים על הפרויקט', text: 'עיצוב ותכנון המערכת במלואה כולל הדמיה ממוחשבת.' },
    'add-2': { section: 'פרטים נוספים על הפרויקט', text: 'יוזמן אישור מהנדס מבנה/קונסטרוקטור למערכת על המבנה ע"פ הצורך.' },
    'add-3': { section: 'פרטים נוספים על הפרויקט', text: 'הספק הפאנלים יקבע ע"פ כמות השטח בפועל ובהתאם לשיקולים מקצועיים. הפנלים המוצעים מאושרים להתקנה על ידי חח"י.' },
    'add-4': { section: 'פרטים נוספים על הפרויקט', text: 'יסופקו ויותקנו מהפכים/ממיר מתח המאושרים על ידי חברת חשמל. מיקום המהפכים ייקבע ע"פ תנאי השטח, תוך התחשבות באופי המבנה וכיווני זרימת האוויר.' },
    'add-5': { section: 'פרטים נוספים על הפרויקט', text: 'הקונסטרוקציה תיבנה על פי צרכי המתקן בשטח.' },
    'add-6': { section: 'פרטים נוספים על הפרויקט', text: 'ציוד עזר וחומרים נלווים: המחיר כולל בתוכו כבלים לזרם DC עמיד UV בעלי בידוד כפול, מוליכים, מובילים להנחת הכבלים, הארקות נדרשות, מפסקים וכל ציוד עזר הנדרש להפעלה מלאה של המערכת.' },
    'add-7': { section: 'פרטים נוספים על הפרויקט', text: 'פיקוח הנדסי: העבודה כולה תתבצע תחת פיקוח הנדסי צמוד, וכל שלב יאושר על ידי הגורם המוסמך לכך.' },
    'add-8': { section: 'פרטים נוספים על הפרויקט', text: 'במידה ונדרשת הגדלת חיבור, העבודה כוללת: עבודה בירוקרטית מול חברת החשמל, תכנון הנדסי, חפירת תוואי, הנחת כבל, התקנת גומחת בטון וארונות חשמל, העברת בדיקה.' },

    // Section 7: עקרונות תכנון
    'design-1': { section: 'עקרונות התכנון', text: '<strong>יצירת מעברים תפעוליים:</strong> גישה נוחה ובטוחה לתחזוקת המערכת לאורך השנים למיקסום תפוקה.' },
    'design-2': { section: 'עקרונות התכנון', text: '<strong>מרחק ממערכות נוספות:</strong> נשמור על מרחק מאובייקטים שונים על הגג כמו מזגן, דוד שמש וצלחות לווין כדי לאפשר גישה נוחה למערכות נוספות ולהימנע מהצללה על הפאנלים.' },
    'design-3': { section: 'עקרונות התכנון', text: '<strong>מרחק מארובה:</strong> הפיח והחום הנפלטים מארובה עלולים להזיק למערכת. נשמור על מרחק כדי לשמור על הפאנלים, אחריות היצרן ויכולת הייצור לאורך זמן.' },
    'design-4': { section: 'עקרונות התכנון', text: '<strong>צמצום הצללות:</strong> הצללות משפיעות באופן משמעותי על התפוקה וההכנסות מהמערכת, ונוצרות מאובייקטים כמו קירות, מבנים סמוכים וצמחיה. לכן נימנע מהצבת פאנלים במיקומים בעלי פוטנציאל הצללה גבוה.' },
    'design-5': { section: 'עקרונות התכנון', text: '<strong>רעפים:</strong> וידוא מרחק ביטחון מרוכב הגג, כדי לשמור על שלמות הרעפים וטיב האיטום.' },
    'design-6': { section: 'עקרונות התכנון', text: '<strong>מרחק בין שורות (גג בטון):</strong> שמירה על מרווח נכון בין השורות מונעת הצללות ומגדילה את הרווחים מהמערכת.' },
    'design-7': { section: 'עקרונות התכנון', text: '<strong>זווית הפאנלים:</strong> מתוכננת למאפייני הגג שלכם, כדי למקסם את החשיפה לשמש ותפוקת המערכת.' },
    'design-8': { section: 'עקרונות התכנון', text: '<strong>אסתטיקה:</strong> נבחר זווית התקנה אופטימלית לתפוקה של הפאנלים על פי המתאפשר בגג. נקפיד על תכנון התקנה מכאנית והולכות חשמל אטרקטיבית ככל הניתן.' },

    // Section 8: אחריות
    'warranty-1': { section: 'אחריות', text: 'חברת סמו א.ג.ס בע"מ אחראית על ביצוע העבודה מתחילתה ועד סופה.' },
    'warranty-2': { section: 'אחריות', text: 'ממירים: אחריות יצרן במשך 10 שנים.' },
    'warranty-3': { section: 'אחריות', text: 'פאנלים פוטו-וולטאים: אחריות יצרן במשך 30 שנה.' },
    'warranty-4': { section: 'אחריות', text: 'התקנה ועבודה: אחריות למשך 5 שנים ממועד סיום ההתקנה.' },
    'warranty-5': { section: 'אחריות', text: 'האחריות אינה כוללת משלוח, פירוק, והרכבה לפאנלים תקולים.' },

    // Section 9: סדר פעולות
    'steps-1': { section: 'סדר הפעולות לאחר חתימת ההסכם', text: 'הגשת בקשה עקרונית לחברת חשמל לחיבור מערכת פוטו וולטאית + בקשה להגדלת חיבור / הזמנת חיבור חדש (במקרה של מבנה חדש).' },
    'steps-2': { section: 'סדר הפעולות לאחר חתימת ההסכם', text: 'הגשת תוכניות ואישורן על ידי חברת חשמל.' },
    'steps-3': { section: 'סדר הפעולות לאחר חתימת ההסכם', text: 'אישור פריסת הפאנלים וההספק הסופי ע"י הלקוח, קביעת הספק סופי + הפקת הזמנת עבודה מותאמת למפרט המוסכם ולהספק המדויק.' },
    'steps-4': { section: 'סדר הפעולות לאחר חתימת ההסכם', text: 'התקנת המערכת הסולארית על כל רכיביה (לרבות קולטים וממירים).' },
    'steps-5': { section: 'סדר הפעולות לאחר חתימת ההסכם', text: 'בדיקת המערכת ע"י חשמלאי בודק.' },
    'steps-6': { section: 'סדר הפעולות לאחר חתימת ההסכם', text: 'התקנת מונים ע"י חברת חשמל וחיבור לרשת החשמל הארצית.' },

    // Section 10: הערות
    'note-1':  { section: 'הערות והגבלות', text: '<strong>ההצעה איננה כוללת:</strong> תשלום לרשויות ולחברת החשמל בגין אגרות (כ-1,200 ₪ + מע"מ).' },
    'note-2':  { section: 'הערות והגבלות', text: 'אמצעי עלייה לגג (כגון סולמות), קיר ו/או כלוב להתקנת הממירים.' },
    'note-3':  { section: 'הערות והגבלות', text: 'חיזוקי מבנה שיש לבצע על פי הנחיית קונסטרוקטור/מהנדס.' },
    'note-4':  { section: 'הערות והגבלות', text: 'תיקונים ושיפורים להארקת המבנה, ארונות חשמל ומערכת החשמל.' },
    'note-5':  { section: 'הערות והגבלות', text: 'חפירות והנחת מוליכים באדמה, תיקוני טייח, תיקוני אספלט ובטון לחפירה.' },
    'note-6':  { section: 'הערות והגבלות', text: 'על הלקוח לוודא הימצאות היתר בניה וטופס 4 למבנה שעליו מוקמת המערכת.' },
    'note-7':  { section: 'הערות והגבלות', text: 'באחריות הלקוח לדאוג לנקודת תקשורת אלחוטית או קווית במקום בו יותקן הממיר.' },
    'note-8':  { section: 'הערות והגבלות', text: 'חברת סמו א.ג.ס בע"מ איננה אחראית למקרה של סירוב חברת החשמל, הרשות המקומית, רמ"י או כל גורם שלישי אחר אשר עלול שלא לאשר ו/או לעכב את הקמת המתקן.' },
    'note-9':  { section: 'הערות והגבלות', text: 'חברת סמו א.ג.ס בע"מ איננה אחראית לתעריף ייצור החשמל שיקבע לצרכן.' },
    'note-10': { section: 'הערות והגבלות', text: 'שווי הפאנלים צמוד לשער הדולר ביום ההצעה.' },
    'note-11': { section: 'הערות והגבלות', text: 'הזמנת העבודה שתופק מהווה אישרור להסכם לעלות הפרויקט המדויקת בהתאם לפריסת הפאנלים המאושרת והמפרט המוסכם ועל בסיס המחיר שמפורט בהצעת המחיר.' },
    'note-12': { section: 'הערות והגבלות', text: 'תוקף ההצעה — 14 יום.' },
  };

  // Section display order
  static CONTENT_SECTION_ORDER = [
    'מבוא',
    'שירות אישי ומקצועי',
    'דגשים מקצועיים',
    'התועלת לסביבה',
    'מפרט טכני',
    'פרטים נוספים על הפרויקט',
    'עקרונות התכנון',
    'אחריות',
    'סדר הפעולות לאחר חתימת ההסכם',
    'הערות והגבלות',
  ];

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

  /**
   * Returns extras config — reads category assignments from localStorage
   * (set by extras-manager.html). Falls back to defaults if not configured.
   */
  _getExtrasConfig() {
    const defaults = {
      upgrades: [
        { id: 'hybrid-inv', label: 'שדרוג לממיר היברידי', defaultPrice: 8900, calcType: 'fixed' },
        { id: 'batteries', label: 'מצברי אגירה (בטריות)', defaultPrice: 0, calcType: 'batteries' },
        { id: 'premium', label: 'שדרוג לפאנל פרמיום שחור', defaultPrice: 0, calcType: 'premium' },
        { id: 'solaredge', label: 'תוספת ממיר SolarEdge', defaultPrice: 0, calcType: 'solaredge' },
        { id: 'ev', label: 'עמדת טעינה לרכב חשמלי', defaultPrice: 4500 },
        { id: 'monitoring', label: 'ניטור ובקרה מרחוק (שנתי)', defaultPrice: 1500 },
      ],
      potential: [
        { id: 'drilling', label: 'קידוח ומעבר קיר בטון / בלוק', defaultPrice: 500 },
        { id: 'wifi', label: 'התקנת מגביר טווח אלחוטי (WiFi Extender)', defaultPrice: 450 },
        { id: 'support', label: 'קריאת שירות לשינויים בהגדרות האינטרנט', defaultPrice: 450 },
        { id: 'inspector', label: 'ביקור חשמלאי בודק לפני ההתקנה', defaultPrice: 850 },
      ]
    };
    try {
      const saved = localStorage.getItem('semo-extras-config');
      if (saved) {
        const cfg = JSON.parse(saved);
        if (!cfg.upgrades) cfg.upgrades = [];
        if (!cfg.potential) cfg.potential = [];
        // Merge missing default items (both upgrades and potential)
        const allIds = new Set([...cfg.upgrades.map(i=>i.id), ...cfg.potential.map(i=>i.id)]);
        for (const item of defaults.upgrades) {
          if (!allIds.has(item.id)) cfg.upgrades.push(item);
        }
        for (const item of defaults.potential) {
          if (!allIds.has(item.id)) cfg.potential.push(item);
        }
        return cfg;
      }
    } catch (e) { /* use defaults */ }
    return defaults;
  }

  /** מחזיר רשימת extras (upgrades + potential) עם מצב checked ומחיר */
  _getExtras(dcKW, premiumPanel, usdRate) {
    const cfg = this._getExtrasConfig();
    const panelCount = parseInt(document.getElementById('panelCount')?.value) || 0;
    const batt = parseInt(document.getElementById('batteries')?.value) || 0;
    const battFirstPrice = parseFloat(document.getElementById('battFirstPrice')?.value) || 8900;
    const battExtraPrice = parseFloat(document.getElementById('battExtraPrice')?.value) || 6500;

    const allItems = [
      ...(cfg.upgrades || []).map(i => ({ ...i, category: 'upgrade' })),
      ...(cfg.potential || []).map(i => ({ ...i, category: 'potential' })),
    ];
    return allItems.map(item => {
      const el = document.getElementById('chk-' + item.id);
      const checked = el ? el.checked : false; // no checkbox = not selected by client
      let price;
      let displayNote = '';
      switch (item.calcType) {
        case 'premium':
          price = Math.round(premiumPanel * usdRate * dcKW);
          displayNote = `$100 × ${dcKW} קו"ט × ${usdRate}$`;
          break;
        case 'solaredge':
          price = Math.round(270 * panelCount);
          displayNote = `270₪ × ${panelCount} פאנלים`;
          break;
        case 'batteries':
          if (batt >= 2) {
            price = battFirstPrice + (batt - 1) * battExtraPrice;
          } else if (batt === 1) {
            price = battFirstPrice;
          } else {
            price = 0;
          }
          displayNote = batt > 0 ? `${batt} בטריות` : 'לא נבחרו בטריות';
          break;
        default:
          price = parseFloat(document.getElementById('price-' + item.id)?.value) || item.defaultPrice || 0;
      }
      const row = document.getElementById('ex-' + item.id);
      if (row) row.classList.toggle('selected', checked);
      return { id: item.id, label: item.label, checked, price, category: item.category, calcType: item.calcType, displayNote };
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

  async shareEmail() {
    const url  = document.getElementById('share-url')?.value;
    const vals = this._getFormValues();
    const clientMail = document.getElementById('clientEmail')?.value?.trim() || '';

    if (!clientMail) {
      EmailService.showToast('⚠️ יש למלא אימייל לקוח בטופס', true);
      return;
    }

    const d = this.quoteData || {};
    const fmt = n => Math.round(n).toLocaleString('he-IL');

    try {
      const result = await EmailService.sendQuoteEmail({
        clientName:  vals.name,
        clientEmail: clientMail,
        quoteUrl:    url || '',
        systemKW:    String(d.dcKW || vals.kw || ''),
        totalPrice:  fmt(d.price || 0),
        quoteDate:   vals.date ? new Date(vals.date).toLocaleDateString('he-IL') : '',
        city:        vals.city || d.city || '',
      });

      if (result.success) {
        EmailService.showToast('📧 ההצעה נשלחה ל-' + clientMail);
      } else {
        EmailService.showToast('⚠️ שגיאה בשליחה: ' + (result.error || ''), true);
      }
    } catch (err) {
      console.error('shareEmail failed:', err);
      EmailService.showToast('⚠️ שגיאה בשליחת מייל', true);
    }
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

    // Post-signature flow: save → notify → confirm → lock
    const docId = window.location.pathname.split('/q/')[1]?.split('/')[0] || '';
    if (docId && typeof PostSignService !== 'undefined') {
      const clientEmail = document.getElementById('clientEmail')?.value?.trim() || '';
      const postResult = await PostSignService.process({
        docType:   'quote',
        docId,
        signature: result.signature,
        emailData: {
          clientName:  vals.name,
          clientEmail,
          docUrl:      window.location.href,
        },
        onLock: () => this._lockDocument(),
        onProgress: (step, ok, err) => {
          if (step === 'save' && ok === false) {
            EmailService.showToast('⚠️ שגיאה בשמירת החתימה: ' + (err || ''), true);
          }
        },
      });

      if (postResult.saved) {
        EmailService.showToast('✅ החתימה נשמרה בהצלחה');
      }
    }
  }

  /** Lock document after signing — disable all interactive elements */
  _lockDocument() {
    // Disable upgrade toggles
    document.querySelectorAll('[data-upgrade-toggle]').forEach(el => {
      el.disabled = true;
      el.closest('.upgrade-toggle-row')?.style.setProperty('pointer-events', 'none');
    });
    // Disable plan selector
    document.querySelectorAll('#quotePlanSelector > div').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.5';
    });
    // Hide signature form, show locked badge
    const sigForm = document.getElementById('sigForm');
    if (sigForm) sigForm.style.display = 'none';
    const sigSection = document.getElementById('sig-section');
    if (sigSection) {
      const badge = document.createElement('div');
      badge.style.cssText = 'text-align:center;padding:20px;background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;margin-top:12px;';
      badge.innerHTML = '<div style="font-size:28px;margin-bottom:8px">🔒</div><div style="font-size:16px;font-weight:800;color:#166534">מסמך זה נחתם ונעול</div>';
      sigSection.appendChild(badge);
    }
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
  // EXTRAS STATE — dynamic save/restore (no hardcoded IDs)
  // ══════════════════════════════════════════════════════════════════════

  /** Scans all extras from config, saves checked + price for each */
  _buildExtrasState() {
    const cfg = this._getExtrasConfig();
    const all = [...(cfg.upgrades || []), ...(cfg.potential || [])];
    const state = {};
    for (const item of all) {
      const chk = document.getElementById('chk-' + item.id);
      const price = document.getElementById('price-' + item.id);
      state[item.id] = {
        checked: chk?.checked || false,
        price: price?.value || '',
      };
    }
    return state;
  }

  /** Restores extras checkboxes + prices from saved state */
  _restoreExtrasState(extras) {
    if (!extras) return;
    // New format: { id: { checked, price } }
    for (const [id, val] of Object.entries(extras)) {
      const chk = document.getElementById('chk-' + id);
      if (chk) chk.checked = val.checked || false;
      const price = document.getElementById('price-' + id);
      if (price && val.price) price.value = val.price;
    }
  }

  /**
   * Backward compat: converts old hardcoded state (exEv, exMonitor...)
   * to new dynamic extras format. Called from _setFormFromState.
   */
  _migrateOldExtrasState(s) {
    if (s.extras) return s.extras; // already new format
    const map = {
      ev:         { checked: s.exEv,        price: s.exEvP },
      monitoring: { checked: s.exMonitor,   price: s.exMonitorP },
      premium:    { checked: s.exPremium,   price: '' },
      drilling:   { checked: s.exDrilling,  price: s.exDrillingP },
      wifi:       { checked: s.exWifi,      price: s.exWifiP },
      support:    { checked: s.exSupport,   price: s.exSupportP },
      inspector:  { checked: s.exInspector, price: s.exInspectorP },
    };
    const result = {};
    for (const [id, val] of Object.entries(map)) {
      if (val.checked !== undefined) {
        result[id] = { checked: val.checked || false, price: val.price || '' };
      }
    }
    return Object.keys(result).length > 0 ? result : null;
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
      // extras — dynamic: scans all items from config so new extras are auto-included
      extras: this._buildExtrasState(),
      // digital signature preference
      digSig: document.getElementById('chk-digital-sig')?.checked ?? true,
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
    // extras — dynamic restore (with backward compat for old format)
    this._restoreExtrasState(this._migrateOldExtrasState(s));
    // Store digital signature preference for client mode
    this._digitalSigPref = s.digSig !== undefined ? s.digSig : true;
  }

  _tryLoadFromUrl() {
    const state = this.storage.loadFromHash();
    if (!state) { setTimeout(() => this._tryLoadFromUrl2(), 300); return; }
    this._setFormFromState(state);
    this._updatePreview();
    this.generateQuote(true); // client mode
    this._checkIfSigned();
  }

  _tryLoadFromUrl2() {
    const state = this.storage.loadFromHash();
    if (!state) return;
    this._setFormFromState(state);
    this._updatePreview();
    this.generateQuote(true);
    this._checkIfSigned();
  }

  /** Check if this document was already signed and lock if so */
  async _checkIfSigned() {
    if (typeof PostSignService === 'undefined') return;
    const docId = window.location.pathname.split('/q/')[1]?.split('/')[0] || '';
    if (!docId) return;
    const result = await PostSignService.checkSignature(docId);
    if (result.signed) {
      this._lockDocument();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // HTML BUILDER (delegating to TemplateEngine when template is loaded)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Reads selected paragraph IDs from localStorage (set by quote-content-editor.html),
   * replaces template placeholders with actual quote data, and returns HTML sections.
   */
  /**
   * Build content sections from localStorage selections.
   * @param {object} d - quote data
   * @param {string[]} [filterSections] - optional: only include these section names
   */
  _buildContentSections(d, filterSections) {
    const fmt = n => Math.round(n).toLocaleString('he-IL');
    const allIds = Object.keys(QuoteUI.CONTENT_PARAGRAPHS);
    let selectedIds = allIds;
    try {
      const saved = localStorage.getItem('semo-quote-content');
      if (saved) selectedIds = JSON.parse(saved);
    } catch (e) { /* use default */ }

    if (selectedIds.length === 0) return '';

    const co2Tons = ((d.annualKwh * 0.75) / 1000).toFixed(1);
    const forestDunam = ((d.annualKwh / 1000) * 3.5).toFixed(1);
    const treeCount = Math.round(parseFloat(forestDunam) * 10);
    const carKm = fmt(Math.round(d.annualKwh * 3.8));
    const placeholders = {
      '{{annualKwh}}': fmt(d.annualKwh),
      '{{co2Tons}}': co2Tons,
      '{{forestDunam}}': forestDunam,
      '{{treeCount}}': String(treeCount),
      '{{carKm}}': carKm,
      '{{panelW}}': String(d.panelW),
      '{{inv}}': d.inv,
    };

    const grouped = {};
    for (const id of selectedIds) {
      const para = QuoteUI.CONTENT_PARAGRAPHS[id];
      if (!para) continue;
      if (!grouped[para.section]) grouped[para.section] = [];
      let text = para.text;
      for (const [ph, val] of Object.entries(placeholders)) {
        text = text.split(ph).join(val);
      }
      grouped[para.section].push(text);
    }

    const sections = filterSections || QuoteUI.CONTENT_SECTION_ORDER;
    let html = '';
    for (const sectionName of sections) {
      const paras = grouped[sectionName];
      if (!paras || paras.length === 0) continue;
      const items = paras.map(t => `<div style="padding:6px 0;line-height:1.8;font-size:13px;color:#334155;border-bottom:1px solid var(--border)">${t}</div>`).join('');
      html += `
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>${sectionName}</div>
    ${items}
  </div>`;
    }
    return html;
  }

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
    // Split extras into upgrades vs potential costs
    const allExtras = (d.extras || []);
    // Show ALL upgrade-category items in quote (customer toggles on/off)
    const allUpgrades = allExtras.filter(e => e.category === 'upgrade' || (!e.category && e.checked));
    const selectedPotential = allExtras.filter(e => e.checked && e.category === 'potential');
    const upgradesTotal = allUpgrades.filter(e => e.checked).reduce((s, e) => s + e.price, 0);
    const totalWithUpgrades = d.price + upgradesTotal;
    // Capture digital signature preference — in client mode use stored pref, in portal mode read checkbox
    const showDigitalSig = clientMode
      ? (this._digitalSigPref ?? true)
      : (document.getElementById('chk-digital-sig')?.checked ?? true);

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

  <!-- CONTENT: מבוא, שירות אישי, דגשים, סביבה -->
  ${this._buildContentSections(d, ['מבוא', 'שירות אישי ומקצועי', 'דגשים מקצועיים', 'התועלת לסביבה'])}

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

  ${allUpgrades.length > 0 ? `
  <!-- UPGRADES — customer can toggle (near plan selector) -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>שדרוגים (אופציונלי)</div>
    <div style="font-size:13px;color:var(--gray);margin-bottom:12px">ניתן לבחור שדרוגים — המחיר יתעדכן בהתאם:</div>
    <div id="upgrades-list">
      ${allUpgrades.map(e => `
      <div class="upgrade-toggle-row" data-upgrade-id="${e.id}" data-upgrade-price="${e.price}" data-calc-type="${e.calcType || 'fixed'}" data-batt-first="${d.battFirstPrice || 8900}" data-batt-extra="${d.battExtraPrice || 6500}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border);opacity:${e.checked ? '1' : '0.5'}">
        <div style="display:flex;align-items:center;gap:10px;flex:1">
          <label class="toggle-switch" style="position:relative;width:44px;height:24px;flex-shrink:0">
            <input type="checkbox" data-upgrade-toggle="${e.id}" ${e.checked ? 'checked' : ''} onchange="window._quoteUI._onUpgradeToggle()" style="opacity:0;width:0;height:0">
            <span style="position:absolute;cursor:pointer;inset:0;background:${e.checked ? '#F4A200' : '#cbd5e1'};border-radius:24px;transition:0.3s"></span>
            <span style="position:absolute;top:3px;${e.checked ? 'right:3px' : 'right:20px'};width:18px;height:18px;background:white;border-radius:50%;transition:0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span>
          </label>
          <span style="font-size:14px;font-weight:600;color:var(--sky)">${e.label}</span>
          ${e.calcType === 'batteries' ? `
          <span style="font-size:12px;color:var(--gray);margin-right:4px">כמות:</span>
          <select data-batt-qty onchange="window._quoteUI._onUpgradeToggle()" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-weight:700;font-family:inherit;background:white;color:var(--sky)">
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
          </select>
          <span style="font-size:11px;color:var(--gray)">(מינימום 2)</span>` : ''}
        </div>
        <strong class="upgrade-price-display" style="font-size:14px;color:var(--sky)">₪${fmt(e.price)}</strong>
      </div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;padding:12px 14px;font-weight:800;font-size:15px;color:var(--sky)">
      <span>סה"כ שדרוגים</span>
      <span id="upgrades-total">₪${fmt(upgradesTotal)}</span>
    </div>
  </div>` : ''}

  <!-- EQUIPMENT & WARRANTY -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>מפרט ציוד ואחריות</div>
    <div class="warranty-grid">
      <div class="warranty-card">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div class="warranty-icon">☀️</div>
          <div>
            <div class="warranty-title">פאנלים סולאריים</div>
            <div class="warranty-desc">${d.panelCount} פאנלים × ${d.panelW}W — Tier 1<br>אחריות יצרן: <strong>30 שנה</strong></div>
          </div>
        </div>
      </div>
      <div class="warranty-card">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div class="warranty-icon">⚡</div>
          <div>
            <div class="warranty-title">ממיר (אינוורטר)</div>
            <div class="warranty-desc">${d.inv}<br>אחריות יצרן: <strong>10 שנים</strong></div>
          </div>
        </div>
      </div>
      <div class="warranty-card">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div class="warranty-icon">🔧</div>
          <div>
            <div class="warranty-title">עבודת התקנה</div>
            <div class="warranty-desc">התקנה מקצועית על ידי צוות מוסמך<br>אחריות: <strong>5 שנים</strong></div>
          </div>
        </div>
      </div>
      <div class="warranty-card">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div class="warranty-icon">🛡️</div>
          <div>
            <div class="warranty-title">קונסטרוקציה ותשתיות</div>
            <div class="warranty-desc">נירוסטה, ברגים אירופאים, הגנות ברקים DC<br>ציוד מיתוג ABB (שוויץ)</div>
          </div>
        </div>
      </div>
      ${d.batt > 0 ? `<div class="warranty-card">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div class="warranty-icon">🔋</div>
          <div>
            <div class="warranty-title">מצברי אגירה</div>
            <div class="warranty-desc">${d.batt} × 5 קו"ט (${d.batt * 5} קו"ט סה"כ)<br>אחריות יצרן: <strong>10 שנים</strong></div>
          </div>
        </div>
      </div>` : ''}
    </div>
  </div>

  <!-- CONTENT: מפרט טכני, פרטים נוספים, עקרונות התכנון -->
  ${this._buildContentSections(d, ['מפרט טכני', 'פרטים נוספים על הפרויקט', 'עקרונות התכנון'])}

  <!-- INSTALLATION PROCESS -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>תהליך ההתקנה</div>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div class="step-body"><div class="step-title">חתימה על ההסכם</div><div class="step-desc">חתימה דיגיטלית, תשלום מקדמה ותחילת הליך הרישוי</div></div></div>
      <div class="step"><div class="step-num">2</div><div class="step-body"><div class="step-title">תכנון הנדסי</div><div class="step-desc">סקר גג, הדמיה תלת-ממדית ותוכניות ביצוע מפורטות</div></div></div>
      <div class="step"><div class="step-num">3</div><div class="step-body"><div class="step-title">רישוי ואישורים</div><div class="step-desc">הגשת בקשה לרשות החשמל, אישור חיבור מחברת החשמל</div></div></div>
      <div class="step"><div class="step-num">4</div><div class="step-body"><div class="step-title">התקנה</div><div class="step-desc">התקנת קונסטרוקציה, פאנלים, אינוורטר וחיווט — יום עבודה אחד</div></div></div>
      <div class="step"><div class="step-num">5</div><div class="step-body"><div class="step-title">בדיקות וחיבור</div><div class="step-desc">בדיקת חשמלאי, חיבור לרשת החשמל והפעלת מערכת הניטור</div></div></div>
    </div>
    <div style="font-size:12px;color:var(--gray);margin-top:10px">* לוח זמנים צפוי: עד 60 ימי עסקים מחתימת ההסכם</div>
  </div>

  <!-- CONTENT: סדר הפעולות לאחר חתימת ההסכם -->
  ${this._buildContentSections(d, ['סדר הפעולות לאחר חתימת ההסכם'])}

  <!-- CONTENT: אחריות, הערות והגבלות -->
  ${this._buildContentSections(d, ['אחריות', 'הערות והגבלות'])}

  <!-- PRICE BREAKDOWN -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>פירוט מחיר ההצעה</div>
    <ul class="spec-list" style="list-style:none;padding:0">
      <li style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>מערכת סולארית ${d.dcKW} קו"ט (${d.panelCount} פאנלים × ${d.panelW}W)</span><strong>₪${fmt(d.dcKW * d.ppkw)}</strong></li>
      ${concreteLine ? `<li style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>תוספת גג בטון</span><strong>₪${fmt(d.dcKW * d.concretePerKw)}</strong></li>` : ''}
      ${d.batt > 0 ? `<li style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>מצברי אגירה ${d.batt * 5} קו"ט (${d.batt} יח')</span><strong>₪${fmt(d.batteryPrice)}</strong></li>` : ''}
      ${d.needsMeter ? `<li style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>לוח מונה ייצור</span><strong>₪${fmt(d.meterPanelPrice)}</strong></li>` : ''}
      ${allUpgrades.map(e => `<li class="upgrade-price-line" data-upgrade-line="${e.id}" style="display:${e.checked ? 'flex' : 'none'};justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>${e.label}</span><strong>₪${fmt(e.price)}</strong></li>`).join('')}
      <li style="display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:800;color:var(--sky)"><span>סה"כ עלות הפרויקט (לא כולל מע"מ)</span><span id="project-total-display">₪${fmt(d.price)}</span></li>
      <li style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:var(--gray)"><span>סה"כ כולל מע"מ (18%)</span><span id="project-total-vat-display">₪${fmt(Math.round(d.price * VAT))}</span></li>
    </ul>
  </div>

  ${selectedPotential.length > 0 ? `
  <!-- POTENTIAL ADDITIONAL COSTS — informational only, NOT in project total -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>הוצאות פוטנציאליות נוספות</div>
    <div style="font-size:13px;color:var(--gray);margin-bottom:12px">הוצאות אלו עשויות להידרש בהתאם לתנאי השטח. <strong>אינן כלולות בעלות הפרויקט</strong> — במידה ויידרש, הלקוח יחויב בהתאם:</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="text-align:right;padding:8px 10px;border-bottom:2px solid var(--border);font-size:13px;color:var(--gray)">פריט</th>
        <th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);font-size:13px;color:var(--gray)">עלות משוערת</th>
      </tr></thead>
      <tbody>
        ${selectedPotential.map(e => `<tr><td style="padding:10px;border-bottom:1px solid var(--border);font-size:14px">${e.label}</td><td style="padding:10px;border-bottom:1px solid var(--border);font-size:14px;text-align:left;font-weight:600">₪${fmt(e.price)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size:11px;color:var(--gray);margin-top:8px;font-style:italic">* הסכומים הם הערכה בלבד ויקבעו סופית לאחר סקר שטח</div>
  </div>` : ''}

  <!-- PAYMENT -->
  <div class="sec">
    <div class="sec-title"><span class="bar"></span>תנאי תשלום</div>
    <table class="payment-table">
      <thead><tr><th>שלב התשלום</th><th>תיאור</th><th>סכום (₪)</th></tr></thead>
      <tbody>
        <tr><td>מקדמה</td><td>בחתימת ההסכם</td><td class="amount-col" id="pay-dep">₪${fmt(d.dep)}</td></tr>
        <tr><td>השלמה ל-35%</td><td>בקבלת תוכניות ביצוע</td><td class="amount-col" id="pay-p2">₪${fmt(d.p2)}</td></tr>
        <tr><td>השלמה ל-95%</td><td>7 ימי עסקים בטרם אספקת פאנלים לאתר</td><td class="amount-col" id="pay-p3">₪${fmt(d.p3)}</td></tr>
        <tr><td>5% אחרון</td><td>ביום החיבור לחברת החשמל</td><td class="amount-col" id="pay-p4">₪${fmt(d.p4)}</td></tr>
        <tr class="total-row"><td colspan="2"><strong>סה"כ</strong></td><td class="amount-col" id="pay-total"><strong>₪${fmt(d.price)}</strong></td></tr>
      </tbody>
    </table>
    <p class="vat-note" id="pay-vat-note">* לכל הסכומים הנ"ל יצורף מע"מ כחוק (סה"כ כולל מע"מ: ₪${fmt(Math.round(d.price*VAT))})</p>
  </div>

  <!-- GENERAL TERMS -->
  <div class="sec" style="font-size:13px;color:var(--gray);line-height:1.8">
    <div class="sec-title"><span class="bar"></span>תנאים כלליים</div>
    <div>
      1. הצעה זו בתוקף למשך 14 יום מתאריך הנפקתה.<br>
      2. לכל הסכומים יצורף מע"מ כחוק (18%).<br>
      3. כל שינוי בהסכם ייעשה בכתב ובהסכמת שני הצדדים.<br>
      4. הסכם זה כפוף לדין הישראלי וסמכות השיפוט לבתי המשפט בישראל.<br>
      5. על הלקוח לוודא גישה תקינה לגג וחיבור חשמלי תקני.<br>
      6. ההצעה אינה כוללת: עבודות חשמל בלוח הראשי (ככל שנדרשות), חיזוק גג, גידור או פיגומים חיצוניים.
    </div>
  </div>

  ${noteBox}

  <!-- CTA TO SIGN (only if digital signature enabled) -->
  ${showDigitalSig ? `
  <div id="cta-sign-block" style="background:linear-gradient(135deg,#0A1628,#1a3a5c);padding:40px 24px;text-align:center;border-radius:${clientMode ? '20px' : '0'}">
    <div style="font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">הצעה בתוקף ל-14 יום</div>
    <div style="font-size:24px;font-weight:900;color:white;margin-bottom:8px;line-height:1.35">${vals.name} יקר/ה,<br>${clientMode ? 'מוכן/ה לצאת לדרך?' : 'מוכן/ה לאשר את ההצעה?'}</div>
    ${clientMode ? '<div style="font-size:15px;color:rgba(255,255,255,0.6);margin-bottom:16px">בואו נחתום ונתקדם — ההצעה מחכה לאישורך</div>' : ''}
    <button onclick="openPrintDocument()" style="padding:14px 32px;background:var(--sun);color:white;font-size:16px;font-weight:800;border:none;border-radius:12px;cursor:pointer;box-shadow:0 4px 20px rgba(244,162,0,0.4);transition:all 0.2s">✍️ חתום על ההצעה</button>
  </div>` : ''}`;
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

  /**
   * Build content sections for the print template from localStorage selections.
   * Maps content editor sections to template placeholders:
   *   SPEC_SECTION_HTML ← מפרט טכני, פרטים נוספים, עקרונות התכנון, אחריות, מבוא, שירות, דגשים, סביבה
   *   STEPS_SECTION_HTML ← סדר הפעולות
   *   EXCLUSIONS_SECTION_HTML ← הערות והגבלות
   */
  _buildPrintContentSections(d) {
    const fmt = n => Math.round(n).toLocaleString('he-IL');
    const allIds = Object.keys(QuoteUI.CONTENT_PARAGRAPHS);
    let selectedIds = allIds; // default: all selected
    try {
      const saved = localStorage.getItem('semo-quote-content');
      if (saved) selectedIds = JSON.parse(saved);
    } catch (e) { /* use default */ }

    if (selectedIds.length === 0) return null;

    // Template placeholder values
    const co2Tons = ((d.annualKwh * 0.75) / 1000).toFixed(1);
    const forestDunam = ((d.annualKwh / 1000) * 3.5).toFixed(1);
    const treeCount = Math.round(parseFloat(forestDunam) * 10);
    const carKm = fmt(Math.round(d.annualKwh * 3.8));
    const placeholders = {
      '{{annualKwh}}': fmt(d.annualKwh),
      '{{co2Tons}}': co2Tons,
      '{{forestDunam}}': forestDunam,
      '{{treeCount}}': String(treeCount),
      '{{carKm}}': carKm,
      '{{panelW}}': String(d.panelW),
      '{{inv}}': d.inv,
    };

    // Group selected paragraphs by section
    const grouped = {};
    for (const id of selectedIds) {
      const para = QuoteUI.CONTENT_PARAGRAPHS[id];
      if (!para) continue;
      if (!grouped[para.section]) grouped[para.section] = [];
      let text = para.text;
      for (const [ph, val] of Object.entries(placeholders)) {
        text = text.split(ph).join(val);
      }
      grouped[para.section].push(text);
    }

    // Build section HTML helper
    const buildSection = (title, paras) => {
      if (!paras || paras.length === 0) return '';
      const items = paras.map(t => `<div style="margin-bottom:4px;font-size:9pt;line-height:1.7">${t}</div>`).join('');
      return `<div class="section"><h2>${title}</h2>${items}</div>`;
    };

    // Map to template placeholders
    const specSections = ['מבוא', 'שירות אישי ומקצועי', 'דגשים מקצועיים', 'התועלת לסביבה',
      'מפרט טכני', 'פרטים נוספים על הפרויקט', 'עקרונות התכנון', 'אחריות'];
    const stepsSections = ['סדר הפעולות לאחר חתימת ההסכם'];
    const exclSections = ['הערות והגבלות'];

    let spec = '', steps = '', exclusions = '';
    for (const s of specSections)  spec += buildSection(s, grouped[s]);
    for (const s of stepsSections) steps += buildSection(s, grouped[s]);
    for (const s of exclSections)  exclusions += buildSection(s, grouped[s]);

    return { spec, steps, exclusions };
  }

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

    const contentSections = this._buildPrintContentSections(d);
    const html = TemplateEngine.render(this._templateHtml, d, {
      name:    vals.name,
      phone:   vals.phone,
      address: vals.address,
      city:    vals.city,
      cid:     vals.cid,
      date:    vals.date,
      note:    vals.note,
    }, contentSections);

    const win = window.open('', '_blank');
    win.document.open();
    win.document.write(html);
    win.document.close();

    // Send email copy to client + company
    this._sendQuoteEmail(vals, d);
  }

  /** Send quote email via EmailService module */
  async _sendQuoteEmail(vals, d) {
    if (typeof EmailService === 'undefined') return;
    const fmt = n => Math.round(n).toLocaleString('he-IL');
    const quoteUrl = document.getElementById('share-url')?.value || '';
    const clientMail = document.getElementById('clientEmail')?.value?.trim() || '';

    try {
      const result = await EmailService.sendQuoteEmail({
        clientName:  vals.name,
        clientEmail: clientMail,
        quoteUrl:    quoteUrl,
        systemKW:    String(d.dcKW),
        totalPrice:  fmt(d.price),
        quoteDate:   vals.date ? new Date(vals.date).toLocaleDateString('he-IL') : '',
        city:        vals.city || d.city || '',
      });

      if (result.success) {
        const recipients = result.sentTo.join(', ');
        EmailService.showToast('📧 ההצעה נשלחה בהצלחה: ' + recipients);
      } else {
        EmailService.showToast('⚠️ שגיאה בשליחת מייל: ' + (result.error || ''), true);
      }
    } catch (err) {
      console.error('Email send failed:', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════════════════════

  /** Called when customer toggles an upgrade on/off in the quote view */
  _onUpgradeToggle() {
    const fmt = n => Math.round(n).toLocaleString('he-IL');
    const VAT = 1.18;
    const basePrice = this.quoteData?.price || 0;
    let upgradesTotal = 0;

    document.querySelectorAll('[data-upgrade-toggle]').forEach(cb => {
      const row = cb.closest('.upgrade-toggle-row');
      if (!row) return;
      const id = cb.dataset.upgradeToggle;
      let price = parseFloat(row.dataset.upgradePrice) || 0;
      const calcType = row.dataset.calcType;
      const slider = row.querySelectorAll('.toggle-switch span');

      // Recalculate battery price based on quantity
      if (calcType === 'batteries') {
        const qtySelect = row.querySelector('[data-batt-qty]');
        const qty = parseInt(qtySelect?.value) || 2;
        const battFirst = parseFloat(row.dataset.battFirst) || 8900;
        const battExtra = parseFloat(row.dataset.battExtra) || 6500;
        price = battFirst + (qty - 1) * battExtra;
        row.dataset.upgradePrice = price;
        const priceDisplay = row.querySelector('.upgrade-price-display');
        if (priceDisplay) priceDisplay.textContent = '₪' + fmt(price);
      }

      // Toggle visual state
      if (cb.checked) {
        upgradesTotal += price;
        if (slider[0]) slider[0].style.background = '#22c55e';
        if (slider[1]) slider[1].style.right = '3px';
        row.style.opacity = '1';
      } else {
        if (slider[0]) slider[0].style.background = '#cbd5e1';
        if (slider[1]) slider[1].style.right = '20px';
        row.style.opacity = '0.5';
      }

      // Show/hide corresponding line in price breakdown
      const priceLine = document.querySelector(`[data-upgrade-line="${id}"]`);
      if (priceLine) {
        priceLine.style.display = cb.checked ? 'flex' : 'none';
        if (cb.checked) {
          const priceEl = priceLine.querySelector('strong');
          if (priceEl) priceEl.textContent = '₪' + fmt(price);
        }
      }
    });

    const totalPrice = basePrice + upgradesTotal;

    // Update upgrades total
    const totalEl = document.getElementById('upgrades-total');
    if (totalEl) totalEl.textContent = '₪' + fmt(upgradesTotal);

    // Update price breakdown totals
    const projectEl = document.getElementById('project-total-display');
    if (projectEl) projectEl.textContent = '₪' + fmt(totalPrice);
    const vatEl = document.getElementById('project-total-vat-display');
    if (vatEl) vatEl.textContent = '₪' + fmt(Math.round(totalPrice * VAT));

    // Update payment stages
    const dep = 6000;
    const p2 = Math.round(totalPrice * 0.35) - dep;
    const p3 = Math.round(totalPrice * 0.95) - Math.round(totalPrice * 0.35);
    const p4 = totalPrice - Math.round(totalPrice * 0.95);

    const depEl = document.getElementById('pay-dep');
    if (depEl) depEl.textContent = '₪' + fmt(dep);
    const p2El = document.getElementById('pay-p2');
    if (p2El) p2El.textContent = '₪' + fmt(p2);
    const p3El = document.getElementById('pay-p3');
    if (p3El) p3El.textContent = '₪' + fmt(p3);
    const p4El = document.getElementById('pay-p4');
    if (p4El) p4El.textContent = '₪' + fmt(p4);
    const payTotalEl = document.getElementById('pay-total');
    if (payTotalEl) payTotalEl.innerHTML = '<strong>₪' + fmt(totalPrice) + '</strong>';
    const payVatEl = document.getElementById('pay-vat-note');
    if (payVatEl) payVatEl.textContent = '* לכל הסכומים הנ"ל יצורף מע"מ כחוק (סה"כ כולל מע"מ: ₪' + fmt(Math.round(totalPrice * VAT)) + ')';
  }

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

  // Fetch current USD/ILS rate
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    const rate = data.rates?.ILS;
    if (rate && document.getElementById('usdRate')) {
      document.getElementById('usdRate').value = rate.toFixed(2);
    }
  } catch (e) { /* keep default */ }

  // Close tips on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.tip-popup.active').forEach(p => p.classList.remove('active'));
  });
});

// ── Exports (ל-Node / בדיקות) ──────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QuoteUI };
}
