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

  const DEFAULTS = {
    sectionOrder: [
      'includes',
      'intro', 'service', 'focus', 'environment',
      'warranty-cards',
      'spec', 'project-details', 'design',
      'process',
      'steps',
      'warranty', 'notes',
      'terms',
    ],

    sections: {

      // ── ההצעה כוללת ────────────────────────────────────────────
      'includes': {
        title: 'ההצעה כוללת',
        type: 'include-items',
        enabled: true,
        region: 'pre-financial',
        blocks: [
          { id: 'inc-1', text: 'פאנלים Tier 1 בניצולת גבוהה עם אחריות 30 שנה', enabled: true },
          { id: 'inc-2', text: 'ממיר {{inv}} איכותי עם אחריות 10 שנים', enabled: true },
          { id: 'inc-3', text: 'טיפול מלא ברישוי ובירוקרטיה מול הרשויות', enabled: true },
          { id: 'inc-4', text: 'תכנון הנדסי מקצועי ומפורט + הדמיה ממוחשבת', enabled: true },
          { id: 'inc-5', text: 'התקנה מהירה וקפדנית על איכות ונראות', enabled: true },
          { id: 'inc-6', text: 'אפליקציה לניטור ביצועי המערכת בסמארטפון', enabled: true },
        ],
      },

      // ── מבוא ────────────────────────────────────────────────────
      'intro': {
        title: 'מבוא',
        type: 'paragraphs',
        enabled: true,
        region: 'pre-financial',
        blocks: [
          { id: 'intro-1', text: 'ברכות על הבחירה להצטרף לייצור אנרגיה סולארית. אנו נשמח לעבוד על הפרויקט יחד איתכם.', enabled: true },
          { id: 'intro-2', text: 'בעידן שבו העולם צמא לאנרגיה ממקורות מתחדשים, להפיק חשמל נקי מזיהום, מאנרגיית השמש זה הדבר הנכון לעשות. כבעלי גג, יש לכם הזדמנות לעשות בו שימוש כדי לקדם מטרה שחשובה למדינה ולאנושות.', enabled: true },
          { id: 'intro-3', text: 'כדי לתרום למאמץ, מדינת ישראל, באמצעות רשות החשמל, יצרה אסדרות בזכותן החשמל שתייצרו באמצעות המערכת הסולארית שתותקן על הגג שלכם ישמש להתקזזות מול עלויות צריכת החשמל ואף תוכלו למכור את עודפי ייצור החשמל לחברת החשמל. האסדרה מבטיחה את זכאותכם לתשלומים מול חברת החשמל למשך 25 שנה.', enabled: true },
          { id: 'intro-4', text: 'באופן זה המערכת הסולארית תיצור עבורכם חיסכון והכנסות מעבר לעלותה, ובכך תניב לכם תשואה נאה, ותתרום לרווחתכם וביטחונכם הכלכלי.', enabled: true },
        ],
      },

      // ── שירות אישי ────────────────────────────────────────────
      'service': {
        title: 'שירות אישי ומקצועי',
        type: 'paragraphs',
        enabled: true,
        region: 'pre-financial',
        blocks: [
          { id: 'service-1', text: 'אצלנו הכל מתחיל באנשים. מובילי החברה הם מוותיק התחום הסולארי בארץ ונותנים דגש מתמשך על מקצועיות ואיכות, בדגש על תשומת לב אישית. תוכלו להנות מהקשר האישי והגישה המקצועית.', enabled: true },
          { id: 'service-2', text: 'נפעל כדי שהמערכת שלכם תשרת אתכם נאמנה שנים ארוכות ותהליך הפרויקט יהיה ברור ופשוט עבורכם.', enabled: true },
        ],
      },

      // ── דגשים מקצועיים ────────────────────────────────────────
      'focus': {
        title: 'דגשים מקצועיים',
        type: 'paragraphs',
        enabled: true,
        region: 'pre-financial',
        blocks: [
          { id: 'focus-1', text: '<strong>תכנון מקצועי:</strong> כל פרויקט מתחיל בסקר השטח שיבוצע ע"י אחד מהיועצים המנוסים שלנו הכולל צילום תמונות רחפן, בדיקת הגג, ולוח החשמל. אנו נטפל בנדרש בצורה אישית כדי להבטיח התקנה ברמה הגבוהה ביותר.', enabled: true },
          { id: 'focus-2', text: '<strong>ההצעה מפרטת הכל:</strong> אין תוספות לא צפויות או אותיות קטנות. אנחנו לוקחים את מלוא האחריות על כל התהליך, כולל הגשת אישורים לרשויות השונות, תכנון העמדה, והתקנת המערכת. נפעל ככל האפשר, למנוע מכם הפתעות.', enabled: true },
          { id: 'focus-3', text: '<strong>ניהול פרויקט מקצועי:</strong> תקבלו מאיתנו עדכונים שוטפים והנחיות, בכדי שתוכלו להיות עם ראש שקט ולהנות מהתהליך.', enabled: true },
        ],
      },

      // ── התועלת לסביבה ─────────────────────────────────────────
      'environment': {
        title: 'התועלת לסביבה',
        type: 'paragraphs',
        enabled: true,
        region: 'pre-financial',
        blocks: [
          { id: 'env-1', text: '{{annualKwh}} קווט"ש חשמל נקי, שמערכת הסולארית שלכם תייצר כל שנה.', enabled: true },
          { id: 'env-2', text: '{{co2Tons}} טון פליטות פחמן דו-חמצני, שלא חייבים לייצר עכשיו מדלק מזהם. (כל קווט"ש ייצור סולארי מונע כ-0.75 ק"ג פליטות בשנה)', enabled: true },
          { id: 'env-3', text: '{{forestDunam}} דונם יער, שצריך לשתול כחלופה להפחתת הזיהום של המערכת הסולארית ({{treeCount}} שווה ערך בכמות עצים). (כל מגה-ווט"ש ייצור סולארי שקול לכ-3.5 דונם יער)', enabled: true },
          { id: 'env-4', text: '{{carKm}} ק"מ נסיעה ברכב, שצריך לצמצם כדי להשתוות לתועלת לסביבה של המערכת הסולארית. (כל קווט"ש ייצור סולארי שקול לכ-3.8 ק"מ נסיעה ברכב)', enabled: true },
        ],
      },

      // ── מפרט טכני ──────────────────────────────────────────────
      'spec': {
        title: 'מפרט טכני',
        type: 'paragraphs',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'spec-1', text: 'פאנל מיצרן בדרג TIER 1 בהספק {{panelW}} וואט. יצרן הפאנל וההספק הסופי יקבעו בסיום התכנון.', enabled: true },
          { id: 'spec-2', text: 'ממיר זרם תוצרת {{inv}} או שווה ערך.', enabled: true },
          { id: 'spec-3', text: 'קונסטרוקציה מאלומיניום. ברגי נירוסטה.', enabled: true },
          { id: 'spec-4', text: 'מחברים PV PLUGS מתוצרת אירופאית/אמריקאית.', enabled: true },
          { id: 'spec-5', text: 'ציוד מיתוג — תוצרת ABB שוויץ או שווה ערך.', enabled: true },
          { id: 'spec-6', text: 'חיווט בתוך תעלות רשת מכוסות / צינורות.', enabled: true },
          { id: 'spec-7', text: 'אפליקציה לניטור ביצועי המערכת בסמארטפון ובמחשב.', enabled: true },
          { id: 'spec-8', text: 'הגנות ברקים DC + הגנה מרכזית למערכת.', enabled: true },
        ],
      },

      // ── פרטים נוספים ───────────────────────────────────────────
      'project-details': {
        title: 'פרטים נוספים על הפרויקט',
        type: 'paragraphs',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'add-1', text: 'עיצוב ותכנון המערכת במלואה כולל הדמיה ממוחשבת.', enabled: true },
          { id: 'add-2', text: 'יוזמן אישור מהנדס מבנה/קונסטרוקטור למערכת על המבנה ע"פ הצורך.', enabled: true },
          { id: 'add-3', text: 'הספק הפאנלים יקבע ע"פ כמות השטח בפועל ובהתאם לשיקולים מקצועיים. הפנלים המוצעים מאושרים להתקנה על ידי חח"י.', enabled: true },
          { id: 'add-4', text: 'יסופקו ויותקנו מהפכים/ממיר מתח המאושרים על ידי חברת חשמל. מיקום המהפכים ייקבע ע"פ תנאי השטח, תוך התחשבות באופי המבנה וכיווני זרימת האוויר.', enabled: true },
          { id: 'add-5', text: 'הקונסטרוקציה תיבנה על פי צרכי המתקן בשטח.', enabled: true },
          { id: 'add-6', text: 'ציוד עזר וחומרים נלווים: המחיר כולל בתוכו כבלים לזרם DC עמיד UV בעלי בידוד כפול, מוליכים, מובילים להנחת הכבלים, הארקות נדרשות, מפסקים וכל ציוד עזר הנדרש להפעלה מלאה של המערכת.', enabled: true },
          { id: 'add-7', text: 'פיקוח הנדסי: העבודה כולה תתבצע תחת פיקוח הנדסי צמוד, וכל שלב יאושר על ידי הגורם המוסמך לכך.', enabled: true },
          { id: 'add-8', text: 'במידה ונדרשת הגדלת חיבור, העבודה כוללת: עבודה בירוקרטית מול חברת החשמל, תכנון הנדסי, חפירת תוואי, הנחת כבל, התקנת גומחת בטון וארונות חשמל, העברת בדיקה.', enabled: true },
        ],
      },

      // ── עקרונות התכנון ─────────────────────────────────────────
      'design': {
        title: 'עקרונות התכנון',
        type: 'paragraphs',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'design-1', text: '<strong>יצירת מעברים תפעוליים:</strong> גישה נוחה ובטוחה לתחזוקת המערכת לאורך השנים למיקסום תפוקה.', enabled: true },
          { id: 'design-2', text: '<strong>מרחק ממערכות נוספות:</strong> נשמור על מרחק מאובייקטים שונים על הגג כמו מזגן, דוד שמש וצלחות לווין כדי לאפשר גישה נוחה למערכות נוספות ולהימנע מהצללה על הפאנלים.', enabled: true },
          { id: 'design-3', text: '<strong>מרחק מארובה:</strong> הפיח והחום הנפלטים מארובה עלולים להזיק למערכת. נשמור על מרחק כדי לשמור על הפאנלים, אחריות היצרן ויכולת הייצור לאורך זמן.', enabled: true },
          { id: 'design-4', text: '<strong>צמצום הצללות:</strong> הצללות משפיעות באופן משמעותי על התפוקה וההכנסות מהמערכת, ונוצרות מאובייקטים כמו קירות, מבנים סמוכים וצמחיה. לכן נימנע מהצבת פאנלים במיקומים בעלי פוטנציאל הצללה גבוה.', enabled: true },
          { id: 'design-5', text: '<strong>רעפים:</strong> וידוא מרחק ביטחון מרוכב הגג, כדי לשמור על שלמות הרעפים וטיב האיטום.', enabled: true },
          { id: 'design-6', text: '<strong>מרחק בין שורות (גג בטון):</strong> שמירה על מרווח נכון בין השורות מונעת הצללות ומגדילה את הרווחים מהמערכת.', enabled: true },
          { id: 'design-7', text: '<strong>זווית הפאנלים:</strong> מתוכננת למאפייני הגג שלכם, כדי למקסם את החשיפה לשמש ותפוקת המערכת.', enabled: true },
          { id: 'design-8', text: '<strong>אסתטיקה:</strong> נבחר זווית התקנה אופטימלית לתפוקה של הפאנלים על פי המתאפשר בגג. נקפיד על תכנון התקנה מכאנית והולכות חשמל אטרקטיבית ככל הניתן.', enabled: true },
        ],
      },

      // ── מפרט ציוד ואחריות ──────────────────────────────────────
      'warranty-cards': {
        title: 'מפרט ציוד ואחריות',
        type: 'warranty-cards',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'wc-panels', icon: '☀️', title: 'פאנלים סולאריים', text: '{{panelCount}} פאנלים × {{panelW}}W — Tier 1\nאחריות יצרן: 30 שנה', enabled: true },
          { id: 'wc-inverter', icon: '⚡', title: 'ממיר (אינוורטר)', text: '{{inv}}\nאחריות יצרן: 10 שנים', enabled: true },
          { id: 'wc-install', icon: '🔧', title: 'עבודת התקנה', text: 'התקנה מקצועית על ידי צוות מוסמך\nאחריות: 5 שנים', enabled: true },
          { id: 'wc-construct', icon: '🛡️', title: 'קונסטרוקציה ותשתיות', text: 'נירוסטה, ברגים אירופאים, הגנות ברקים DC\nציוד מיתוג ABB (שוויץ)', enabled: true },
        ],
      },

      // ── תהליך ההתקנה ──────────────────────────────────────────
      'process': {
        title: 'תהליך ההתקנה',
        type: 'process-steps',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'proc-1', title: 'חתימה על ההסכם', text: 'חתימה דיגיטלית, תשלום מקדמה ותחילת הליך הרישוי', enabled: true },
          { id: 'proc-2', title: 'תכנון הנדסי', text: 'סקר גג, הדמיה תלת-ממדית ותוכניות ביצוע מפורטות', enabled: true },
          { id: 'proc-3', title: 'רישוי ואישורים', text: 'הגשת בקשה לרשות החשמל, אישור חיבור מחברת החשמל', enabled: true },
          { id: 'proc-4', title: 'התקנה', text: 'התקנת קונסטרוקציה, פאנלים, אינוורטר וחיווט — יום עבודה אחד', enabled: true },
          { id: 'proc-5', title: 'בדיקות וחיבור', text: 'בדיקת חשמלאי, חיבור לרשת החשמל והפעלת מערכת הניטור', enabled: true },
        ],
      },

      // ── סדר הפעולות לאחר חתימת ההסכם ──────────────────────────
      'steps': {
        title: 'סדר הפעולות לאחר חתימת ההסכם',
        type: 'paragraphs',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'steps-1', text: 'הגשת בקשה עקרונית לחברת חשמל לחיבור מערכת פוטו וולטאית + בקשה להגדלת חיבור / הזמנת חיבור חדש (במקרה של מבנה חדש).', enabled: true },
          { id: 'steps-2', text: 'הגשת תוכניות ואישורן על ידי חברת חשמל.', enabled: true },
          { id: 'steps-3', text: 'אישור פריסת הפאנלים וההספק הסופי ע"י הלקוח, קביעת הספק סופי + הפקת הזמנת עבודה מותאמת למפרט המוסכם ולהספק המדויק.', enabled: true },
          { id: 'steps-4', text: 'התקנת המערכת הסולארית על כל רכיביה (לרבות קולטים וממירים).', enabled: true },
          { id: 'steps-5', text: 'בדיקת המערכת ע"י חשמלאי בודק.', enabled: true },
          { id: 'steps-6', text: 'התקנת מונים ע"י חברת חשמל וחיבור לרשת החשמל הארצית.', enabled: true },
        ],
      },

      // ── אחריות ─────────────────────────────────────────────────
      'warranty': {
        title: 'אחריות',
        type: 'paragraphs',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'warranty-1', text: 'חברת סמו א.ג.ס בע"מ אחראית על ביצוע העבודה מתחילתה ועד סופה.', enabled: true },
          { id: 'warranty-2', text: 'ממירים: אחריות יצרן במשך 10 שנים.', enabled: true },
          { id: 'warranty-3', text: 'פאנלים פוטו-וולטאים: אחריות יצרן במשך 30 שנה.', enabled: true },
          { id: 'warranty-4', text: 'התקנה ועבודה: אחריות למשך 5 שנים ממועד סיום ההתקנה.', enabled: true },
          { id: 'warranty-5', text: 'האחריות אינה כוללת משלוח, פירוק, והרכבה לפאנלים תקולים.', enabled: true },
        ],
      },

      // ── הערות והגבלות ──────────────────────────────────────────
      'notes': {
        title: 'הערות והגבלות',
        type: 'paragraphs',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'note-1', text: '<strong>ההצעה איננה כוללת:</strong> תשלום לרשויות ולחברת החשמל בגין אגרות (כ-1,200 ₪ + מע"מ).', enabled: true },
          { id: 'note-2', text: 'אמצעי עלייה לגג (כגון סולמות), קיר ו/או כלוב להתקנת הממירים.', enabled: true },
          { id: 'note-3', text: 'חיזוקי מבנה שיש לבצע על פי הנחיית קונסטרוקטור/מהנדס.', enabled: true },
          { id: 'note-4', text: 'תיקונים ושיפורים להארקת המבנה, ארונות חשמל ומערכת החשמל.', enabled: true },
          { id: 'note-5', text: 'חפירות והנחת מוליכים באדמה, תיקוני טייח, תיקוני אספלט ובטון לחפירה.', enabled: true },
          { id: 'note-6', text: 'על הלקוח לוודא הימצאות היתר בניה וטופס 4 למבנה שעליו מוקמת המערכת.', enabled: true },
          { id: 'note-7', text: 'באחריות הלקוח לדאוג לנקודת תקשורת אלחוטית או קווית במקום בו יותקן הממיר.', enabled: true },
          { id: 'note-8', text: 'חברת סמו א.ג.ס בע"מ איננה אחראית למקרה של סירוב חברת החשמל, הרשות המקומית, רמ"י או כל גורם שלישי אחר אשר עלול שלא לאשר ו/או לעכב את הקמת המתקן.', enabled: true },
          { id: 'note-9', text: 'חברת סמו א.ג.ס בע"מ איננה אחראית לתעריף ייצור החשמל שיקבע לצרכן.', enabled: true },
          { id: 'note-10', text: 'שווי הפאנלים צמוד לשער הדולר ביום ההצעה.', enabled: true },
          { id: 'note-11', text: 'הזמנת העבודה שתופק מהווה אישרור להסכם לעלות הפרויקט המדויקת בהתאם לפריסת הפאנלים המאושרת והמפרט המוסכם ועל בסיס המחיר שמפורט בהצעת המחיר.', enabled: true },
          { id: 'note-12', text: 'תוקף ההצעה — 14 יום.', enabled: true },
        ],
      },

      // ── תנאים כלליים ───────────────────────────────────────────
      'terms': {
        title: 'תנאים כלליים',
        type: 'terms',
        enabled: true,
        region: 'post-payment',
        blocks: [
          { id: 'term-1', text: 'הצעה זו בתוקף למשך 14 יום מתאריך הנפקתה.', enabled: true },
          { id: 'term-2', text: 'לכל הסכומים יצורף מע"מ כחוק (18%).', enabled: true },
          { id: 'term-3', text: 'כל שינוי בהסכם ייעשה בכתב ובהסכמת שני הצדדים.', enabled: true },
          { id: 'term-4', text: 'הסכם זה כפוף לדין הישראלי וסמכות השיפוט לבתי המשפט בישראל.', enabled: true },
          { id: 'term-5', text: 'על הלקוח לוודא גישה תקינה לגג וחיבור חשמלי תקני.', enabled: true },
          { id: 'term-6', text: 'ההצעה אינה כוללת: עבודות חשמל בלוח הראשי (ככל שנדרשות), חיזוק גג, גידור או פיגומים חיצוניים.', enabled: true },
        ],
      },

      // ── תיאורי שלבי תשלום ─────────────────────────────────────
      'payment-desc': {
        title: 'תיאורי שלבי תשלום',
        type: 'payment-stages',
        enabled: true,
        region: 'post-payment',
        blocks: [
          { id: 'pay-1', title: 'מקדמה', text: 'בחתימת ההסכם', enabled: true },
          { id: 'pay-2', title: 'השלמה ל-35%', text: 'בקבלת תוכניות ביצוע', enabled: true },
          { id: 'pay-3', title: 'השלמה ל-95%', text: '7 ימי עסקים בטרם אספקת פאנלים לאתר', enabled: true },
          { id: 'pay-4', title: '5% אחרון', text: 'ביום החיבור לחברת החשמל', enabled: true },
        ],
      },

      // ── כותרות שדרוגים ─────────────────────────────────────────
      'upgrades-intro': {
        title: 'כותרות סקציית שדרוגים',
        type: 'single-texts',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'upgrades-title', text: 'שדרוגים (אופציונלי)', enabled: true },
          { id: 'upgrades-subtitle', text: 'ניתן לבחור שדרוגים — המחיר יתעדכן בהתאם:', enabled: true },
        ],
      },

      // ── כותרות הוצאות פוטנציאליות ─────────────────────────────
      'potential-intro': {
        title: 'כותרות סקציית הוצאות פוטנציאליות',
        type: 'single-texts',
        enabled: true,
        region: 'post-financial',
        blocks: [
          { id: 'potential-title', text: 'הוצאות פוטנציאליות נוספות', enabled: true },
          { id: 'potential-subtitle', text: 'הוצאות אלו עשויות להידרש בהתאם לתנאי השטח. <strong>אינן כלולות בעלות הפרויקט</strong> — במידה ויידרש, הלקוח יחויב בהתאם:', enabled: true },
        ],
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
               s.type !== 'payment-stages' && s.type !== 'single-texts';
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
