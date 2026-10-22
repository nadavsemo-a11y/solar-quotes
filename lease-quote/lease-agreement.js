/**
 * lease-quote/lease-agreement.js — the residential solar leasing agreement
 * («הסכם ליסינג למערכת סולארית ביתית — מסלול בעלות מלאה לאחר N שנים»), as ONE complete, frozen,
 * self-contained HTML document.
 *
 * WHAT IS FIXED AND WHAT IS NOT. The clauses, the commercial policy (₪0 installation, ₪0 monthly
 * fee, the billing formula, SEMO ownership and revenues during the term, free ownership transfer at
 * the end, no early purchase), the declarations and the approval text are this TEMPLATE VERSION.
 * Per agreement, only the validated state varies: customer, address, system, and the lease term in
 * years. Changing any wording is a new TEMPLATE_VERSION — it enters the signed snapshot, so an
 * outstanding signing token for the old wording stops verifying instead of signing different text.
 *
 * THE DOCUMENT IS SIGNABLE EXACTLY ONE WAY. It follows the frozen-HTML rules of the generic signed
 * documents (docs/GENERIC_SIGNED_DOCUMENTS.md §6; tests run shared/documents/document-html-guard.js
 * on it): inline-v1 layout, one customer signature target, the name/idNum/dateStr evidence slots, no
 * script, no style attribute, no URL other than embedded fonts and PNG images. That is what lets the
 * signed PDF be rendered from these exact bytes plus the signer evidence (@semo/pdf
 * /render-signed-pdf), and what lets the customer page show it in a script-less sandboxed frame.
 *
 * Design: the house format of an official SEMO A.G.S document — the same stylesheet, fonts, logo and
 * running header/footer as the CRM appendix (semo-scheduling src/documents/design/appendixCss.ts).
 */
'use strict';
(function () {

const Assets = (typeof module !== 'undefined' && module.exports) ? require('./lease-assets.js') : globalThis.LeaseAssets;
const V = (typeof module !== 'undefined' && module.exports) ? require('./lease-validate.js') : globalThis.LeaseValidate;

const TEMPLATE_ID = 'solar-lease';
// '2' (2026-10-22): the system described with the sales quote's fields and labels (roof type and
// area, DC, AC, panels, inverter), and Annex A — the optional hybrid inverter + batteries the customer
// may choose on the link. No v1 lease was ever saved in production, so v1 is not kept.
const TEMPLATE_VERSION = '2';

// The labels a solar SALES document prints for the same facts (SolarContentBlocks.SOLAR_LABELS
// sys.* — pinned by tests/lease-quote.test.js), so a customer reads one vocabulary across documents.
const SYS_LABELS = Object.freeze({
  type: 'סוג מערכת', dc: 'הספק DC', ac: 'הספק AC', panels: 'פאנלים', inverter: 'ממיר', roof: 'סוג גג', roofArea: 'שטח גג',
});

/** Whole shekels with thousands separators — deterministic (no locale data), so the server and the
 *  page render the same bytes. */
function ils(n) {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ₪`;
}

const COMPANY = Object.freeze({
  name: 'סמו א.ג.ס בע"מ',
  registration: '515942282',
  address: 'רחוב סביון 4, קרית טבעון',
  trade: 'מערכות סולאריות',
});

const TITLE = 'הסכם ליסינג למערכת סולארית ביתית';

/** Fixed policy of this template version. The term is the only commercial value a quote sets. */
const POLICY = Object.freeze({
  installationPrice: 0,
  monthlyLeaseFee: 0,
  exportRevenueShareCompanyPercent: 100,
  earlyPurchase: false,
  conditionsLongStopDays: 180,
  paymentDueDays: 14,
  disputeNoticeDays: 30,
  propertySaleNoticeDays: 60,
});

// ── text helpers ─────────────────────────────────────────────────────────────────────────────────

/** Markup escaping. Named entities only, plus &#39; — the frozen-HTML guard refuses any other. */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A value → a double-quoted CSS string (the @page margin boxes). */
function cssString(v) {
  return `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3c ')}"`;
}

/** 1 → «שנה אחת», 2 → «שנתיים», n → «n שנים». */
function yearsHe(n) {
  if (n === 1) return 'שנה אחת';
  if (n === 2) return 'שנתיים';
  return `${n} שנים`;
}

/** YYYY-MM-DD → DD.MM.YYYY */
function formatDate(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

function subtitle(termYears) {
  return `מסלול בעלות מלאה לאחר ${yearsHe(termYears)}`;
}

function agreementNumber(quoteId) {
  return `SL-${quoteId}`;
}

// ── the agreement text ──────────────────────────────────────────────────────────────────────────
//
// A clause is a paragraph; `items` renders as a lettered list under it. Numbers are generated from
// position; cross-references name a chapter by its number AND its title, so a renumbering is visible.

const c = (text, items) => (items ? { text, items } : { text });

function sections(t) {
  const M = t.termMonths;
  const P = POLICY;
  return [
    { title: 'הצדדים והגדרות', clauses: [
      c('הסכם זה נערך בין החברה לבין הלקוח, כמפורט בטבלת הצדדים שבראש ההסכם. ההגדרות שלהלן יחולו בכל מקום בהסכם, אלא אם נאמר במפורש אחרת:', [
        '"הנכס" — הבית שבכתובת ההתקנה המפורטת בראש ההסכם, לרבות גגו, מבניו והמערכת החשמלית שבו.',
        '"המערכת" — המערכת הסולארית המפורטת בפרק "ערכים מסחריים", לרבות הפאנלים, הממיר (ובכלל זה ממיר היברידי שהותקן לפי נספח א\'), הקונסטרוקציה, הכבלים, ציוד המיתוג וההגנות, מערכת הניטור ומונה הצריכה הפרטי, וכל רכיב שיוחלף או יתווסף בהם במהלך תקופת ההסכם — למעט סוללות אגירה.',
        '"חברת החשמל" — חברת החשמל לישראל בע"מ או כל גורם אחר המוסמך על פי דין לספק חשמל לנכס, למדוד אותו או לחבר מתקן ייצור לרשת.',
        '"המונה הרשמי" — מונה החשמל הדו-כיווני שהתקינה חברת החשמל בנכס, המודד את החשמל הנצרך מהרשת ואת החשמל המוזרם אליה.',
        '"מונה הצריכה הפרטי" — המונה שתתקין החברה בנכס לפי פרק 5 (חשבון החשמל ומדידה), המודד את כלל צריכת החשמל של משק הבית.',
        '"הצריכה הכוללת" — כלל החשמל שצרך משק הבית בתקופת חיוב: החשמל שנצרך מהרשת בתוספת החשמל שיוצר במערכת ונצרך ישירות בנכס.',
        '"מועד ההפעלה" — המועד שבו התקיימו כל התנאים המתלים המפורטים בפרק 14 (תנאים מתלים), והמערכת חוברה לרשת, נבדקה ואושרה להפעלה; המועד ייקבע בהודעת הפעלה בכתב שתשלח החברה ללקוח.',
        `"תקופת ההסכם" — ${M} חודשים רצופים (${yearsHe(t.termYears)}) החל ממועד ההפעלה.`,
        '"המסלול" — הסדר חיבור מתקן ייצור חשמל סולארי לרשת במסלול הירוק, ללא מונה ייצור רשמי נפרד, כפי שיחול על המערכת על פי הסדרי רשות החשמל ונהלי חברת החשמל.',
      ]),
    ] },
    { title: 'מטרת ההסכם', clauses: [
      c('החברה תממן, תתכנן, תספק ותתקין בנכס את המערכת, ללא כל תשלום מצד הלקוח בגין רכישת המערכת או התקנתה, ותחזיק בבעלותה ותתחזק אותה לאורך תקופת ההסכם.'),
      c('בתקופת ההסכם ישלם הלקוח לחברה מדי חודש בעבור הצריכה הכוללת של משק הבית, לפי נוסחת החיוב שבפרק 6 (תשלומי חשמל) — כלומר כפי שהיה משלם אילו לא הותקנה המערכת. הכנסות המערכת והתועלת הכלכלית מהחשמל שהיא מייצרת שייכות לחברה, כמפורט בפרק 7 (הכנסות המערכת הסולארית).'),
      c(`בתום ${M} חודשים ממועד ההפעלה תעבור הבעלות המלאה במערכת ללקוח, ללא כל תשלום נוסף, כמפורט בפרק 13 (העברת בעלות בתום התקופה).`),
      c('הלקוח מאשר כי הובהר לו שבתקופת ההסכם לא יהיה לו חיסכון בתשלומי החשמל בשל המערכת, וכי התמורה שהוא מקבל לפי הסכם זה היא התקנת המערכת ללא תשלום, תחזוקתה בתקופת ההסכם והעברת הבעלות בה אליו בתום התקופה. אין בהסכם זה התחייבות לחשמל חינם או מוזל.'),
    ] },
    { title: 'התקנת המערכת', clauses: [
      c('החברה תתכנן את המערכת ותתקין אותה בהתאם לדין, לתקנים החלים, להוראות היצרנים ולמפרט הטכני שיוצג ללקוח לאישורו לפני ההתקנה. המפרט הטכני המאושר יהווה חלק בלתי נפרד מהסכם זה.'),
      c('ההתקנה כפופה לבדיקת היתכנות הנדסית, לרבות בדיקת מבנה הגג וחוזקו, ולקבלת כל האישורים הנדרשים מחברת החשמל ומכל רשות מוסמכת אחרת.'),
      c('יצרן הפאנלים ודגם הממיר הסופיים ייקבעו בסיום התכנון ויפורטו במפרט הטכני. החברה רשאית להחליף רכיב ברכיב שווה ערך או טוב ממנו. שינוי בהספק ה-DC המותקן ביותר מ-10% לעומת הספק המפורט בהסכם טעון את הסכמת הלקוח בכתב.'),
      c('החברה תתאם עם הלקוח מראש את מועדי העבודה בנכס, תבצע את העבודות באופן מקצועי ובטיחותי, תשמור על הניקיון ותשיב לקדמותו כל נזק שייגרם לנכס עקב העבודות.'),
      c('המערכת שבליסינג אינה כוללת סוללות אגירה. תוספת של ממיר היברידי וסוללות אגירה, אם הוצעה ללקוח ונבחרה על ידו, מוסדרת בנספח א\' — היא אינה חלק מעסקת הליסינג, ומחירה משולם על ידי הלקוח בנפרד. כל תוספת אחרת תיעשה רק בהסכם נפרד בכתב.'),
    ] },
    { title: 'בעלות וזכויות בנכס', clauses: [
      c('בתקופת ההסכם המערכת היא בבעלותה הבלעדית של החברה. המערכת היא מיטלטלין, והתקנתה על הגג או חיבורה למבנה לא יהפכו אותה לחלק מהנכס ולא יקנו ללקוח או לצד שלישי כל זכות בה.'),
      c('הלקוח מעניק לחברה, לעובדיה ולקבלניה, למשך תקופת ההסכם, רשות שימוש בגג הנכס ובשטחים הדרושים לצורך התקנת המערכת, הפעלתה, ניטורה, בדיקתה, תחזוקתה, תיקונה והחלפת רכיביה, וכן רשות גישה סבירה לשם כך, בתיאום מראש ובשעות סבירות. במקרה תקלה בטיחותית דחופה רשאית החברה להגיע בהודעה קצרה ככל שניתן.'),
      c('הרשות לפי פרק זה היא זכות חוזית בין הצדדים. אין בהסכם זה כדי ליצור זכות במקרקעין או לחייב את רישומה, ואין בו כדי לפגוע בבעלות הלקוח בנכס.'),
      c('הלקוח מצהיר כי הוא בעל הזכויות בנכס או מוסמך להתקשר בהסכם זה, וכי ככל שיש לנכס בעלים נוספים, מחזיק אחר או משכנתה, יתקבלו הסכמותיהם הנדרשות לפני ההתקנה, כמפורט בפרק 14 (תנאים מתלים).'),
      c('הלקוח לא ימכור, ימשכן, ישעבד או יעביר זכות כלשהי במערכת, ולא יאפשר לנושה שלו לעקל אותה. נודע ללקוח על ניסיון לעשות כן — יודיע לחברה מיד ויודיע לנושה כי המערכת שייכת לחברה.'),
    ] },
    { title: 'חשבון החשמל ומדידה', clauses: [
      c('חשבון החשמל של הנכס בחברת החשמל יועבר על שם החברה, לתקופת ההסכם, בכפוף לאישור חברת החשמל ולכל דין. הלקוח יחתום על כל מסמך שיידרש לשם כך. ממועד ההפעלה ועד תום תקופת ההסכם תשלם החברה לחברת החשמל בעבור החשמל שנצרך בנכס מהרשת, והלקוח ישלם לחברה לפי פרק 6 (תשלומי חשמל). עד מועד ההפעלה ימשיך הלקוח לשלם לחברת החשמל כרגיל.'),
      c('המונה הרשמי מודד רק את החשמל העובר בין הנכס לבין הרשת. הוא אינו מודד את החשמל שהמערכת מייצרת ושנצרך ישירות בבית. לכן תתקין החברה, על חשבונה, מונה צריכה פרטי שימדוד את הצריכה הכוללת של משק הבית.'),
      c('מונה הצריכה הפרטי יותקן בלוח החשמל של הנכס, על ההזנה של מעגלי הצריכה של הבית ובמורד נקודת החיבור של המערכת, כך שימדוד את כל החשמל שנצרך בבית — הן מהרשת והן מהמערכת — ולא ימדוד את החשמל המוזרם לרשת. המונה יהיה מונה אנרגיה מכויל ובעל אישור מתאים לשימוש למדידה לצורכי חיוב. שיטת המדידה ומיקום המונה יפורטו במפרט הטכני.'),
      c('אם יתברר בתכנון כי לא ניתן מבחינה טכנית למדוד את הצריכה הכוללת במונה אחד כאמור, תחושב הצריכה הכוללת כך: החשמל שנצרך מהרשת לפי המונה הרשמי, בתוספת החשמל שייצרה המערכת לפי מונה ייצור פרטי מכויל, בניכוי החשמל שהוזרם לרשת לפי המונה הרשמי. שיטה חלופית זו תפורט במפרט הטכני ותוצג ללקוח לאישור לפני ההתקנה.'),
      c('לצורכי החיוב לפי הסכם זה, מונה הצריכה הפרטי (או השיטה החלופית, אם נקבעה) הוא המדידה המחייבת.'),
      c('הקריאות יילקחו מרחוק, באופן אוטומטי, בסוף כל חודש קלנדרי. הלקוח יוכל לצפות בקריאות החודשיות ובנתוני הצריכה שלו באמצעות אפליקציית הניטור או באמצעות פנייה לחברה, ורשאי לבקש לראות את המונה בנכס בכל עת.'),
      c('הלקוח רשאי לבקש בדיקת דיוק של מונה הצריכה הפרטי. נמצא כי המונה חורג מרמת הדיוק המותרת לו — תתקן החברה או תחליף אותו על חשבונה, ותתקן את החיובים לתקופה שממועד הבדיקה התקינה האחרונה ועד התיקון, ולא יותר מ-12 חודשים לאחור. נמצא המונה תקין — הבדיקה תהיה על חשבון החברה, אלא אם הלקוח ביקש יותר מבדיקה אחת בשנה.'),
      c('בתקופה שבה מונה הצריכה הפרטי אינו תקין או שלא ניתן לקרוא אותו, תחושב הצריכה לפי ממוצע הצריכה היומית באותה תקופה בשנה הקודמת, ובהעדר נתון כזה — לפי ממוצע הצריכה היומית בשלושת חודשי החיוב התקינים האחרונים. בחשבון החודשי יצוין כי מדובר בחיוב משוער, והוא יתוקן אם יתקבלו נתונים מדויקים יותר.'),
    ] },
    { title: 'תשלומי חשמל', clauses: [
      c('הלקוח ישלם לחברה מדי חודש בעבור הצריכה הכוללת של אותו חודש, לפי הנוסחה הבאה:'),
      c('התשלום החודשי = הצריכה הכוללת בחודש (בקוט"ש) × תעריף החשמל הביתי.', [
        '"תעריף החשמל הביתי" — התעריף לצרכן ביתי בתעריף הכללי (שאינו תעריף לפי עומס וזמן), לקוט"ש, כפי שקבעה רשות החשמל ובתוקף בתקופת הצריכה, כולל מע"מ כדין.',
        'שינוי בתעריף החשמל הביתי או בשיעור המע"מ יחול על הצריכה החל ממועד כניסתו לתוקף, באותו אופן שבו היה חל על הלקוח אילו המשיך לרכוש את החשמל מחברת החשמל.',
        'לא ייגבו מהלקוח דמי ליסינג, דמי מנוי, תשלום קבוע, דמי חיבור, דמי קריאה או כל תשלום אחר שאינו מפורט בפרק זה.',
      ]),
      c(`החברה תפיק ללקוח חשבונית מס חודשית, שתפרט את קריאות המונה בתחילת התקופה ובסופה, את הצריכה הכוללת, את התעריף שהוחל ואת סכום החיוב. התשלום יבוצע בתוך ${P.paymentDueDays} ימים ממועד החשבונית, בהוראת קבע או בכרטיס אשראי, לפי בחירת הלקוח.`),
      c('על סכום שלא שולם במועדו תיווסף ריבית פיגורים כפי שתקבע על פי דין. החברה לא תפעל לניתוק אספקת החשמל לנכס כאמצעי גבייה, אלא במקרים ובהליך שהדין מתיר במפורש, ולאחר הודעה מוקדמת בכתב.'),
      c(`הלקוח רשאי להשיג על חשבון בהודעה בכתב בתוך ${P.disputeNoticeDays} ימים ממועדו. החברה תבדוק את ההשגה ותשיב בכתב בתוך ${P.disputeNoticeDays} ימים. בזמן הבירור ישלם הלקוח את החלק שאינו שנוי במחלוקת. חיוב יתר יוחזר או יקוזז מהחשבון הבא, וחיוב חסר שמקורו בטעות של החברה ייגבה רק לתקופה של עד 12 חודשים לאחור.`),
    ] },
    { title: 'הכנסות המערכת הסולארית', clauses: [
      c(`בתקופת ההסכם, ${P.exportRevenueShareCompanyPercent}% מההכנסות והזיכויים בגין חשמל שהמערכת מזרימה לרשת שייכים לחברה. הלקוח מעביר לחברה את זכותו לכל תשלום או זיכוי כאמור, ככל שיש לו זכות כזו.`),
      c('התועלת הכלכלית מהחשמל שהמערכת מייצרת ושנצרך ישירות בבית שייכת לחברה, והיא מתקבלת באמצעות התשלום החודשי לפי פרק 6 (תשלומי חשמל). הלקוח לא יקבל זיכוי, הנחה או תשלום נפרד בגין ייצור המערכת.'),
      c('אם לפני מועד ההפעלה, או מכל סיבה אחרת, ייזקפו לזכות הלקוח זיכויים או תשלומים בגין חשמל שהמערכת הזרימה לרשת, יעביר הלקוח את סכומם לחברה בתוך 30 ימים מקבלתם, או שהחברה תקזז אותם מהחשבון הבא.'),
      c('החברה אינה מתחייבת לרמת ייצור מסוימת. ירידה בייצור לא תשנה את חיובי הלקוח, שנקבעים לפי הצריכה הכוללת בלבד.'),
    ] },
    { title: 'תחזוקה ואחריות', clauses: [
      c('בתקופת ההסכם החברה אחראית לתחזוקת המערכת, על חשבונה, ובכלל זה:', [
        'ניטור מרחוק של תפקוד המערכת;',
        'בדיקה מונעת של המערכת לפחות פעם בשנה, לרבות בדיקת חיבורים, הגנות וקונסטרוקציה, וניקוי פאנלים לפי הצורך;',
        'תיקון תקלות והחלפת רכיבים פגומים בתוך זמן סביר מגילוי התקלה או מקבלת הודעת הלקוח;',
        'מימוש אחריות היצרנים מול היצרנים והספקים.',
      ]),
      c('החברה תתקן, על חשבונה, כל נזק שייגרם לנכס עקב התקנת המערכת, הפעלתה או תחזוקתה, לרבות חדירת מים לגג באזור העבודות.'),
      c('החברה לא תישא בעלות תיקון נזק שנגרם למערכת בשל שימוש לא סביר, שינוי או התערבות במערכת שלא בידי החברה, נזק שנגרם בזדון או ברשלנות של הלקוח או מי מטעמו, או עבודות בגג או בלוח החשמל שלא תואמו עם החברה. במקרים אלה ישא הלקוח בעלות התיקון הסבירה.'),
      c('נזק למערכת שנגרם בשל כוח עליון, אירוע טבע, מלחמה או פעולת צד שלישי, יתוקן על ידי החברה ובאחריותה, ובלבד שלא נגרם באשמת הלקוח.'),
      c('החברה אינה מתחייבת לפעולה רציפה של המערכת ואינה אחראית להפסקות באספקת החשמל מהרשת. הפסקה בייצור המערכת אינה פוגעת באספקת החשמל לבית, שתמשיך להגיע מהרשת.'),
    ] },
    { title: 'התחייבויות בעל הנכס', clauses: [
      c('הלקוח יאפשר לחברה גישה סבירה לגג, ללוח החשמל ולמערכת, בתיאום מראש.'),
      c('הלקוח לא יזיז, ינתק, ישנה, יכסה או יפגע במערכת או במונה הצריכה הפרטי, ולא יאפשר לאחר לעשות כן, אלא בתיאום עם החברה.'),
      c('הלקוח יודיע לחברה בהקדם על כל נזק, תקלה, סכנה או הצללה חדשה שנודעו לו, וכן על כל כוונה לבצע עבודות בגג או בלוח החשמל. פירוק זמני של המערכת לצורך עבודות בגג יבוצע על ידי החברה בלבד, בתיאום, ועל חשבון הלקוח אם העבודות נועדו לצרכיו.'),
      c('הלקוח ישמור על רציפות חיבור הנכס לחשמל ויאפשר את קריאת המונים ואת חיבור מערכת הניטור לרשת התקשורת.'),
    ] },
    { title: 'ביטוח ואחריות לנזקים', clauses: [
      c('החברה תבטח, על חשבונה ולאורך תקופת ההסכם, את המערכת מפני אובדן ונזק, וכן את אחריותה כלפי צד שלישי בגין התקנת המערכת, הפעלתה ותחזוקתה.'),
      c('הלקוח ימשיך לבטח את הנכס כרגיל ויודיע למבטח שלו על התקנת המערכת, ככל שהפוליסה מחייבת זאת. הלקוח אינו נדרש לבטח את המערכת.'),
      c('כל צד אחראי, על פי דין, לנזק שגרם הוא או מי מטעמו. אין בהסכם זה כדי להגביל אחריות בשל נזק גוף או בשל נזק שנגרם בזדון או ברשלנות רבתי.'),
    ] },
    { title: 'מכירת הנכס', clauses: [
      c(`הלקוח רשאי למכור את הנכס בכל עת. בכוונה למכור את הנכס בתקופת ההסכם, יודיע הלקוח לחברה בכתב לפחות ${P.propertySaleNoticeDays} ימים לפני מועד מסירת החזקה, ויגלה לקונה את קיום ההסכם ואת תנאיו.`),
      c('הלקוח יפעל כדי שהקונה יצטרף להסכם במקומו, באמצעות כתב המחאה והצטרפות שתספק החברה. החברה לא תסרב להצטרפות הקונה מטעמים בלתי סבירים. מיום הצטרפות הקונה ייכנס הקונה בנעלי הלקוח לכל דבר, ובכלל זה לזכות לקבל את הבעלות במערכת בתום התקופה, והלקוח ישוחרר מהתחייבויותיו לגבי התקופה שלאחר מכן, ובלבד שסילק את כל חיוביו עד אותו מועד.'),
      c('ההסכם אינו מחייב את הקונה כל עוד לא הסכים להצטרף אליו בכתב.'),
      c('אם הקונה לא יצטרף להסכם, רשאית החברה, לפי בחירתה: (א) לפרק את המערכת ולהשיב את הגג לקדמותו, על חשבונה; או (ב) להגיע עם הקונה להסדר אחר בכתב. במקרה כזה יפצה הלקוח את החברה על הנזק שנגרם לה בפועל בשל הפסקת ההסכם לפני תומו, כפי שיחושב על פי דין.'),
      c('רכישה מוקדמת של המערכת אינה אפשרית, ואין במכירת הנכס כדי להקנות לקונה או ללקוח זכות לרכוש את המערכת לפני תום התקופה.'),
    ] },
    { title: 'סיום מוקדם והפרת הסכם', clauses: [
      c('ההסכם אינו ניתן לסיום מרצון לפני תום תקופתו, למעט במקרים המפורטים בפרק זה, בפרק 11 (מכירת הנכס), בפרק 14 (תנאים מתלים), או מכוח זכות ביטול הקבועה בדין.'),
      c('הפר הלקוח הפרה יסודית — ובכלל זה אי-תשלום של חשבונות במשך 60 ימים, מניעת גישה מתמשכת מהחברה, או פגיעה מכוונת במערכת — ולא תיקן את ההפרה בתוך 30 ימים מקבלת התראה בכתב, רשאית החברה לבטל את ההסכם, לפרק את המערכת ולהשיב את הגג לקדמותו, ולתבוע את הנזק שנגרם לה בפועל, על פי דין.'),
      c('הפרה החברה הפרה יסודית את התחייבויותיה ולא תיקנה אותה בתוך 30 ימים מקבלת התראה בכתב, רשאי הלקוח לבטל את ההסכם ולתבוע את כל הסעדים העומדים לו על פי דין.'),
      c('נהרס הנכס או גגו או ניזוק באופן שאינו מאפשר את המשך הפעלת המערכת בתוך 180 ימים, או שנוצרה מניעה משפטית או רגולטורית להמשך ההסדר לפי פרקים 5 ו-6, ינהלו הצדדים משא ומתן בתום לב במשך 60 ימים כדי להתאים את ההסדר. לא הושגה הסכמה — כל צד רשאי לסיים את ההסכם בהודעה בכתב, והחברה תפרק את המערכת על חשבונה, ללא חיוב הלקוח, אלא אם הנזק נגרם באשמתו.'),
      c('בכל מקרה של סיום ההסכם יסלק הלקוח את חיוביו בגין הצריכה עד מועד הסיום, והחברה תשיב את חשבון החשמל לשם הלקוח, בשיתוף פעולה ועל חשבונה.'),
    ] },
    { title: 'העברת בעלות בתום התקופה', clauses: [
      c(`בתום ${M} חודשים ממועד ההפעלה תעבור הבעלות המלאה במערכת לבעלות הלקוח, ללא כל תשלום, ובמצבה כפי שהיא באותו מועד. הלקוח לא יידרש לשלם בעבור המערכת, ההעברה או כל רכיב בה.`),
      c('במועד העברת הבעלות:', [
        'תמסור החברה ללקוח מסמך העברת בעלות, את תיעוד המערכת (תוכניות, אישורי בדיקה, אישורי חברת החשמל) ואת שארית תעודות האחריות של היצרנים, ותמחה ללקוח את זכויותיה לפיהן ככל שהן ניתנות להמחאה;',
        'החברה תפעל, בשיתוף הלקוח ועל חשבונה, להשבת חשבון החשמל לשם הלקוח, ומאותו מועד ישלם הלקוח לחברת החשמל ישירות;',
        'זכויות ההכנסה והזיכוי בגין חשמל שהמערכת מזרימה לרשת, וכן התועלת מהחשמל שנצרך ישירות בבית, יהיו של הלקוח;',
        'תועבר ללקוח הגישה לאפליקציית הניטור של המערכת;',
        'מונה הצריכה הפרטי יישאר בנכס ללא תשלום, או יפורק על חשבון החברה, לפי בחירת הלקוח.',
      ]),
      c('לאחר העברת הבעלות תסתיים אחריותה של החברה לתחזוקת המערכת, וכל שירות שהלקוח יבקש ממנה יינתן בהסכם נפרד. העברת הבעלות אינה מותנית בדבר מלבד סילוק חיובי הצריכה של הלקוח עד מועד ההעברה.'),
    ] },
    { title: 'תנאים מתלים', clauses: [
      c('הלקוח רשאי לחתום על ההסכם לפני שהתקיימו התנאים שלהלן, אולם התחייבויות הצדדים להתקנת המערכת ולהפעלת הסדר החיוב כפופות לקיום כל התנאים הבאים:', [
        'בדיקת היתכנות הנדסית של הגג והנכס, שלפיה ניתן להתקין את המערכת בבטחה;',
        'אישור חברת החשמל לחיבור המערכת לרשת במסלול, וקבלת כל היתר או אישור נוסף הנדרש על פי דין להתקנה;',
        'אישור חברת החשמל להעברת חשבון החשמל של הנכס על שם החברה, והשלמת ההעברה;',
        'קבלת כל אישור, רישיון או פטור הנדרשים על פי דין, לפי עמדת רשות החשמל או כל רשות מוסמכת, לצורך הסדר המדידה והחיוב לפי פרקים 5 ו-6;',
        'התקנת מונה הצריכה הפרטי ואימות תקינות המדידה;',
        'קבלת הסכמת כל בעלי הזכויות בנכס, ובמקרה הצורך — הסכמת הגורם המממן של משכנתה החלה על הנכס;',
        'השלמת הסדרי המימון של החברה לפרויקט.',
      ]),
      c(`אם לא יתקיימו כל התנאים בתוך ${P.conditionsLongStopDays} ימים ממועד חתימת הלקוח, או אם יתברר קודם לכן שתנאי מהם לא יתקיים, רשאי כל צד לבטל את ההסכם בהודעה בכתב, ללא חבות כלפי הצד האחר. במקרה כזה תפרק החברה, על חשבונה, כל רכיב שהותקן ותשיב את הנכס לקדמותו. הצדדים רשאים להאריך את המועד בהסכמה בכתב.`),
      c('החברה תעדכן את הלקוח בכתב על קיום התנאים ותשלח לו הודעת הפעלה במועד ההפעלה. לפני מועד ההפעלה לא יחולו על הלקוח חיובים לפי פרק 6 (תשלומי חשמל).'),
    ] },
    { title: 'הוראות כלליות', clauses: [
      c('הודעות לפי הסכם זה יישלחו לכתובות הדוא"ל או הדואר של הצדדים המפורטות בהסכם, או לכל כתובת אחרת שצד הודיע עליה בכתב. הודעה בדוא"ל תיחשב כמתקבלת ביום העסקים שלאחר שליחתה.'),
      c('כל שינוי בהסכם ייעשה בכתב ובחתימת שני הצדדים. ויתור או ארכה במקרה מסוים לא יהוו ויתור על זכות.'),
      c('הלקוח לא יעביר את זכויותיו לפי ההסכם אלא לפי פרק 11 (מכירת הנכס). החברה רשאית להמחות את זכויותיה וחובותיה לפי ההסכם לגוף מממן או לגוף אחר, ובלבד שזכויות הלקוח לפי ההסכם, ובכלל זה הזכות לקבל את הבעלות במערכת בתום התקופה, לא ייפגעו.'),
      c('על הסכם זה יחול הדין הישראלי. סמכות השיפוט תהיה לבית המשפט המוסמך על פי דין.'),
      c('סדר העדיפות בין מסמכי ההסכם: גוף ההסכם, ולאחריו המפרט הטכני המאושר. במקרה של סתירה ביניהם יגבר גוף ההסכם, למעט בעניינים טכניים שהמפרט מפרט במפורש.'),
      c('אין באמור בהסכם זה כדי לגרוע מזכויות הלקוח על פי חוק הגנת הצרכן, התשמ"א-1981, לרבות זכות ביטול העסקה ככל שהיא חלה עליו.'),
    ] },
    { title: 'חתימות דיגיטליות', clauses: [
      c('הצדדים מסכימים כי הסכם זה ייחתם באמצעות חתימה אלקטרונית, באמצעות מערכת החתימה הדיגיטלית של החברה, וכי חתימה כזו תחייב אותם כחתימה בכתב יד, בהתאם לחוק חתימה אלקטרונית, התשס"א-2001.'),
      c('בעת החתימה תשמור החברה עותק נעול של ההסכם כפי שנחתם, את פרטי החותם, את מועד החתימה ואת נתוני האימות הטכניים שלה, ותשלח ללקוח עותק חתום בקובץ PDF לכתובת הדוא"ל שמסר. שינוי מאוחר בנתוני הלקוח או בתבנית ההסכם לא ישנה את ההסכם החתום.'),
    ] },
  ];
}

function declarations(t) {
  return [
    'קראתי את ההסכם במלואו, לרבות פרק "ערכים מסחריים", והבנתי את תנאיו.',
    `הבנתי שבמשך ${t.termMonths} החודשים של תקופת ההסכם לא יהיה לי חיסכון בחשבון החשמל, ושאשלם לחברה בעבור כל צריכת החשמל של הבית לפי תעריף החשמל הביתי, כאילו לא הותקנה מערכת סולארית.`,
    'הבנתי שהמערכת בבעלות החברה במשך תקופת ההסכם, שאין אפשרות לרכוש אותה לפני תום התקופה, ושבתום התקופה תעבור אליי הבעלות בה ללא תשלום.',
    'הבנתי שחשבון החשמל של הבית יועבר על שם החברה, בכפוף לאישורים, ושהסדר החיוב ייכנס לתוקף רק לאחר קיום התנאים המתלים ומשלוח הודעת הפעלה.',
    'הבנתי שאם אמכור את הבית בתקופת ההסכם, עליי לפעול כדי שהקונה יצטרף להסכם, וידועות לי התוצאות אם לא יצטרף.',
    'אני בעל/ת הזכויות בנכס או מוסמך/ת להתקשר בהסכם זה, ואדאג להסכמת בעלי הזכויות הנוספים, ככל שיש כאלה.',
  ];
}

const BACKUP_DECLARATION = 'הבנתי שתוספת הממיר ההיברידי והסוללות (נספח א\'), אם בחרתי בה, אינה חלק מעסקת הליסינג: מחירה ישולם על ידי במלואו לפני ההתקנה, הסוללות יהיו בבעלותי, והממיר ההיברידי יהיה חלק מהמערכת.';

// ── Annex A: the optional backup upgrade ────────────────────────────────────────────────────────
//
// The ONLY parts of the agreement that depend on the customer's choice on the link. Each is a whole
// element with a fixed id, rendered by the functions below — the server's frozen agreement AND the
// alternatives the customer page swaps in come from the same function, so what the customer sees for
// a choice is byte-for-byte what is frozen when they sign it.

const BACKUP_ROW_ID = 'lease-backup-row';
const BACKUP_ANNEX_ID = 'lease-backup-annex';

function backupRowHtml(state, n) {
  const offered = !!(state.backupOption && state.backupOption.offered);
  let v;
  if (!offered) v = 'ללא — המערכת אינה כוללת סוללות אגירה';
  else if (!n) v = 'לא נבחרה<small>ניתן לבחור ממיר היברידי וסוללות לגיבוי בהפסקת חשמל — נספח א\'</small>';
  else {
    const p = V.backupPrice(state, n);
    v = `ממיר היברידי + ${n} סוללות (${p.kWh} קוט&quot;ש) · ${esc(ils(p.gross))} כולל מע&quot;מ<small>על חשבון הלקוח, בנפרד מהליסינג · נספח א'</small>`;
  }
  return `<tr id="${BACKUP_ROW_ID}"><th>${esc('גיבוי בהפסקת חשמל (אופציונלי)')}</th><td>${v}</td></tr>`;
}

function backupAnnexHtml(state, n) {
  const offered = !!(state.backupOption && state.backupOption.offered);
  if (!offered) return `<section id="${BACKUP_ANNEX_ID}" class="clause-sec"></section>`;
  const head = `<h2>${esc('נספח א\' — תוספת אופציונלית: ממיר היברידי וסוללות אגירה (גיבוי בהפסקת חשמל)')}</h2>`;
  const para = (num, text) => `<p class="cl"><b>א.${num}</b><span>${esc(text)}</span></p>`;
  if (!n) {
    return `<section id="${BACKUP_ANNEX_ID}" class="clause-sec">${head}
${para(1, 'הלקוח לא בחר בתוספת ממיר היברידי וסוללות אגירה. ניתן להוסיף אותה בעתיד בהסכם נפרד בכתב.')}
</section>`;
  }
  const p = V.backupPrice(state, n);
  const inv = state.system.inv;
  const rows = [
    ['ממיר היברידי (במקום ממיר המערכת)', ils(p.hybrid)],
    [`${n} סוללות אגירה × ${V.BATTERY.kWhEach} קוט"ש`, ils(p.batteryTotal)],
    ['סה"כ לפני מע"מ', ils(p.net)],
    [`מע"מ (${Math.round((state.vatRate - 1) * 100)}%)`, ils(p.vat)],
    ['סה"כ לתשלום, כולל מע"מ', ils(p.gross)],
  ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n');
  return `<section id="${BACKUP_ANNEX_ID}" class="clause-sec">${head}
${para(1, `הלקוח בחר בתוספת הבאה, שאינה חלק מעסקת הליסינג: החלפת ממיר המערכת בממיר היברידי מתוצרת ${inv} או שווה ערך, והתקנת ${n} סוללות אגירה בקיבולת ${V.BATTERY.kWhEach} קוט"ש כל אחת (סה"כ ${p.kWh} קוט"ש).`)}
${para(2, 'התוספת מאפשרת אספקת חשמל לבית בזמן הפסקת חשמל ברשת, בהיקף ולמשך התלויים בקיבולת הסוללות, במצב הטעינה שלהן ובצריכת הבית. היא אינה מבטיחה אספקה רציפה או אספקה לכל צרכני הבית.')}
${para(3, 'מחיר התוספת:')}
<table class="kv"><tbody>
${rows}
</tbody></table>
${para(4, 'מלוא מחיר התוספת ישולם על ידי הלקוח לפני ביצוע ההתקנה, כנגד חשבונית מס. התקנת התוספת כפופה לתנאים המתלים שבפרק 14 ולכל אישור הנדרש להתקנת סוללות אגירה. לא הותקנה התוספת מסיבה שאינה תלויה בלקוח — יוחזר לו מלוא הסכום ששילם בעבורה.')}
${para(5, 'הסוללות יהיו בבעלות הלקוח מיום התקנתן, ואחריות היצרן להן תומחה ללקוח. הממיר ההיברידי הוא חלק מהמערכת: הוא בבעלות החברה בתקופת ההסכם, החברה מתחזקת אותו לפי פרק 8, והוא עובר לבעלות הלקוח יחד עם המערכת בתום התקופה לפי פרק 13.')}
${para(6, 'תחזוקת הסוללות ותיקונן אינם כלולים בהתחייבויות התחזוקה של החברה לפי פרק 8, מעבר למימוש אחריות היצרן בשם הלקוח.')}
${para(7, 'התוספת אינה משנה את תנאי הליסינג: תקופת ההסכם, נוסחת החיוב לפי פרק 6 (הצריכה הכוללת נמדדת כרגיל, גם כשהחשמל מגיע מהסוללות) וחלוקת ההכנסות לפי פרק 7 נשארות כפי שהן.')}
</section>`;
}

const APPROVAL_TEXT ='בחתימתי להלן אני מאשר/ת את ההצהרות שלעיל, וכי קראתי את הסכם הליסינג על כל פרקיו, ערכיו המסחריים ותנאיו, ואני מסכים/ה להם.';

// ── the house stylesheet (semo-scheduling src/documents/design/appendixCss.ts) ──────────────────

function fontFace(family, weights, base64, range) {
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weights};font-display:block;`
    + `src:url(data:font/woff2;base64,${base64}) format('woff2');unicode-range:${range}}`;
}

function houseCss({ headerLine, footerLabel, companyLine }) {
  return [
    fontFace('Heebo', '300 900', Assets.HEEBO_HEBREW.base64, 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F'),
    fontFace('Heebo', '300 900', Assets.HEEBO_LATIN.base64, 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'),
    fontFace('JetBrains Mono', '400 700', Assets.JETBRAINS_MONO_LATIN.base64, 'U+0000-00FF,U+2000-206F,U+20AC,U+2212'),
    `
:root{--ink-900:#0A0A0A;--ink-700:#2B2B2B;--ink-500:#6B6B6B;--ink-200:#E4E4E4;--ink-50:#F8F8F8;--mint:#9CF5C4;--paper:#FFFFFF}
*{margin:0;padding:0;box-sizing:border-box}
html{font-family:'Heebo',system-ui,sans-serif;color:var(--ink-900);background:var(--paper);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{line-height:1.5;direction:rtl;text-align:right;background:var(--paper)}
.screen-head{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;padding-bottom:2mm;margin-bottom:7mm;border-bottom:2px solid var(--ink-900)}
.screen-head .logo{height:9mm;width:auto;display:block}
.screen-head .meta{display:flex;flex-direction:column;align-items:flex-start;gap:1px;line-height:1.15;text-align:left}
.screen-head .he{font-size:11px;color:var(--ink-500);font-variant-numeric:tabular-nums}
.screen-foot{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:1.6mm;margin-top:10mm;border-top:1.5px solid var(--ink-900);font-size:11px;color:var(--ink-500)}
h1{font-size:32px;font-weight:900;letter-spacing:-.02em;line-height:1.1;margin:0 0 6px;text-wrap:balance}
.titlebar{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 16px;border-bottom:2px solid var(--ink-900);padding-bottom:5px;margin-bottom:12px}
.titlebar .stamp{font-size:12px;color:var(--ink-500);font-variant-numeric:tabular-nums}
h2{font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin:18px 0 7px;padding-bottom:5px;border-bottom:1.5px solid var(--ink-900);break-after:avoid;page-break-after:avoid}
p{font-size:14.5px;line-height:1.65;color:var(--ink-700);text-wrap:pretty;orphans:3;widows:3}
p+p{margin-top:8px}
strong{color:var(--ink-900);font-weight:700}
ul,ol{margin:6px 0 10px;padding-inline-start:1.6em;font-size:14.5px;line-height:1.65;color:var(--ink-700)}
li+li{margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:14.5px;margin:0 0 18px}
thead{display:table-header-group}
th{text-align:right;font-weight:500;font-size:13.5px;color:var(--ink-500);padding:6px 0;padding-inline-end:12px;width:22%;vertical-align:top}
td{padding:6px 0;padding-inline-end:20px;font-weight:700;vertical-align:top}
tbody tr{border-bottom:1px solid var(--ink-200);break-inside:avoid;page-break-inside:avoid}
table.kv th{width:34%;font-weight:700;font-size:14.5px;color:var(--ink-900)}
table.kv td{font-weight:400;color:var(--ink-700);padding-inline-end:0}
.fill{display:inline-block;border-bottom:1px solid var(--ink-900);vertical-align:-3px;min-height:1.2em;font-weight:700;color:var(--ink-900)}
.fill.w-date{min-width:120px}
.fill.w-id{min-width:130px}
.fill.w-long{min-width:min(100%,300px)}
.approval{margin-top:20px;break-inside:avoid;page-break-inside:avoid}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:20px;break-inside:avoid;page-break-inside:avoid}
.sign .line{height:72px;border-bottom:1.5px solid var(--ink-900);position:relative}
.sign .line .company-stamp{position:absolute;bottom:-9px;inset-inline-start:22px;height:96px;width:auto;display:block}
.sign .line .semo-inline-signature{position:absolute;bottom:2px;inset-inline-start:12px;max-height:66px!important;max-width:85%!important}
.sign .who{font-size:12.5px;font-weight:700;margin-top:11px}
.sign .who .signer:empty{display:none}
.sign .date{font-size:12px;color:var(--ink-500);font-variant-numeric:tabular-nums}
.lead{font-size:15px;color:var(--ink-700);margin:-4px 0 14px;font-weight:500}
.summary{border:2px solid var(--ink-900);box-shadow:4px 4px 0 var(--mint);padding:12px 16px;margin:6px 0 18px;break-inside:avoid;page-break-inside:avoid}
.summary h3{font-size:14px;font-weight:900;margin:0 0 6px}
.summary ul{margin:0}
table.kv caption{caption-side:top;text-align:right;font-size:13px;font-weight:900;padding:8px 0 4px;color:var(--ink-900)}
table.kv td small{display:block;color:var(--ink-500);font-size:12.5px;margin-top:2px}
section.clause-sec h2{letter-spacing:.04em;font-size:13.5px;text-transform:none}
p.cl{display:grid;grid-template-columns:2.6em 1fr;align-items:baseline}
p.cl b{font-weight:700;color:var(--ink-900);font-variant-numeric:tabular-nums}
ol.sub{list-style:hebrew;margin:2px 0 8px;padding-inline-start:4.2em}
ol.decl{padding-inline-start:1.6em}
@media screen{
  body{padding:clamp(0px,3vw,24px);background:#EFEFEC}
  .doc{max-width:210mm;margin:0 auto;background:var(--paper);padding:clamp(20px,6vw,15mm)}
}
@media screen and (max-width:640px){
  h1{font-size:25px}
  .screen-head{flex-direction:column;align-items:flex-start;gap:8px}
  .screen-head .meta{text-align:right;align-items:flex-start}
  .screen-foot{flex-direction:column;align-items:flex-start;gap:4px}
  table.parties tr{display:grid;grid-template-columns:1fr;padding:4px 0}
  table.parties th,table.parties td{width:auto;padding:2px 0}
  table.kv th{width:40%}
  .sign{grid-template-columns:1fr;gap:18px}
  .fill.w-long{min-width:60%}
  p.cl{grid-template-columns:2.2em 1fr}
  ol.sub{padding-inline-start:3em}
}
@media print{
  .screen-head,.screen-foot{display:none}
  .doc{padding:0}
}
@page{
  size:A4;
  margin:28mm 15mm 21mm;
  @top-right{content:image-set(url(data:image/png;base64,${Assets.AGS_LOGO.base64}) 4.5x);vertical-align:bottom;padding-bottom:2mm;border-bottom:2px solid #0A0A0A}
  @top-center{content:"";border-bottom:2px solid #0A0A0A}
  @top-left{content:${cssString(headerLine)};font-family:'Heebo',sans-serif;font-size:10.5px;line-height:1.35;color:#6B6B6B;text-align:left;vertical-align:bottom;padding-bottom:2mm;border-bottom:2px solid #0A0A0A}
  @bottom-right{content:${cssString(companyLine)};font-family:'Heebo',sans-serif;font-size:10.5px;color:#6B6B6B;vertical-align:top;padding-top:1.6mm;border-top:1.5px solid #0A0A0A}
  @bottom-center{content:"";border-top:1.5px solid #0A0A0A}
  @bottom-left{content:${cssString(footerLabel)} " · עמוד " counter(page) " מתוך " counter(pages);font-family:'Heebo',sans-serif;font-size:10.5px;color:#6B6B6B;text-align:left;vertical-align:top;padding-top:1.6mm;border-top:1.5px solid #0A0A0A}
}
`,
  ].join('\n');
}

// ── render ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The complete frozen agreement HTML for a VALIDATED lease state (lease-validate.js).
 * @param {object} state
 * @param {object} ctx  { id: the quote id (the agreement number),
 *                        knobs?: { backupBatteries } — the customer's choice (normalizeLeaseKnobs),
 *                        reviewDraft?: boolean }
 * @returns {string}
 */
function renderAgreement(state, ctx) {
  const id = ctx && ctx.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(id)) throw new Error('renderAgreement: a quote id is required');
  const knobs = V.normalizeLeaseKnobs(state, ctx.knobs || {});
  if (!knobs) throw new Error('renderAgreement: the backup choice is not valid for this quote');
  const backupN = knobs.backupBatteries;
  const offered = !!(state.backupOption && state.backupOption.offered);
  const cu = state.customer;
  const sys = state.system;
  const t = { termYears: state.lease.termYears, termMonths: state.lease.termYears * 12 };
  const number = agreementNumber(id);
  const issued = formatDate(cu.date);
  const parcel = state.property && state.property.parcel ? esc(state.property.parcel) : '<span class="fill w-long"></span>';
  const address = [cu.city, cu.address].filter(Boolean).join(', ');
  const headerLine = `${TITLE} · ${number} · ${issued}`;
  const companyLine = `${COMPANY.name} · ח.פ. ${COMPANY.registration} · ${COMPANY.trade}`;
  const footerLabel = number;

  const kv = (rows) => rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('\n');
  // The sales quote's facts, labels and formats (solar-document-contract systemRows).
  const panels = V.panelCount(sys);
  const systemRows = kv([
    [SYS_LABELS.type, esc(V.systemTypeLabel(sys))],
    [SYS_LABELS.dc, `${esc(sys.kw)} קילו-וואט`],
    [SYS_LABELS.ac, `${esc(sys.acKW)} קילו-וואט`],
    [SYS_LABELS.panels, `${panels} × ${esc(sys.panelW)}W<small>${esc(`פאנל מיצרן בדרג TIER 1 בהספק ${sys.panelW} וואט. יצרן הפאנל וההספק הסופי יקבעו בסיום התכנון.`)}</small>`],
    [SYS_LABELS.inverter, `${esc(sys.inv)}<small>${esc(`ממיר זרם תוצרת ${sys.inv} או שווה ערך.`)}</small>`],
    [SYS_LABELS.roof, esc(sys.roof)],
    [SYS_LABELS.roofArea, `${esc(sys.roofArea)} מ״ר`],
    ['מסלול חיבור', 'מסלול ירוק, ללא מונה ייצור רשמי נפרד'],
  ]);
  const termsRows = kv([
    ['עלות הקמה ללקוח', '0 ₪'],
    ['דמי ליסינג חודשיים', '0 ₪'],
    ['תקופת ההתקשרות', `${t.termMonths} חודשים (${esc(yearsHe(t.termYears))})`],
    ['מועד תחילת ההתקשרות', 'מועד ההפעלה, כהגדרתו בפרק 1'],
    ['מועד סיום ההתקשרות', `תום ${t.termMonths} חודשים ממועד ההפעלה`],
    ['תעריף חיוב החשמל', 'הצריכה הכוללת × תעריף החשמל הביתי של רשות החשמל, כולל מע&quot;מ<small>ללא תשלום קבוע או תוספת אחרת · פרק 6</small>'],
    ['תדירות חיוב', 'חודשית'],
    ['מדידת צריכת החשמל', 'מונה צריכה פרטי המודד את כלל צריכת הבית · פרק 5'],
    ['חלוקת הכנסות מהזרמה לרשת', `${POLICY.exportRevenueShareCompanyPercent}% לחברה בתקופת ההסכם`],
    ['בעלות בתקופת ההסכם', 'החברה'],
    ['אחריות לתחזוקה', 'החברה, על חשבונה'],
    ['רכישה מוקדמת', 'אינה אפשרית'],
    ['העברת בעלות', `בתום ${t.termMonths} חודשים, ללא תשלום נוסף`],
    ['מכירת הנכס', 'הקונה מצטרף להסכם במקום הלקוח · פרק 11'],
  ]) + '\n' + backupRowHtml(state, backupN);

  const body = sections(t).map((s, si) => {
    const n = si + 1;
    const clauses = s.clauses.map((cl, ci) => {
      const items = cl.items ? `<ol class="sub">${cl.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>` : '';
      return `<p class="cl"><b>${n}.${ci + 1}</b><span>${esc(cl.text)}</span></p>${items}`;
    }).join('\n');
    return `<section class="clause-sec"><h2>${n}. ${esc(s.title)}</h2>\n${clauses}\n</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="semo-signature-layout" content="inline-v1">
<meta name="semo-document-template" content="${TEMPLATE_ID}/${TEMPLATE_VERSION}">
<title>${esc(TITLE)} · ${esc(number)}</title>
<style>${houseCss({ headerLine, footerLabel, companyLine })}</style>
</head>
<body>
<div class="doc">
<header class="screen-head">
<img class="logo" src="data:image/png;base64,${Assets.AGS_LOGO.base64}" alt="A.G.S">
<div class="meta"><span class="he">${esc(headerLine)}</span></div>
</header>
<main>
${ctx.reviewDraft ? '<p class="summary"><strong>טיוטה לבדיקה — אינה מיועדת לחתימה</strong></p>' : ''}
<h1>${esc(TITLE)}</h1>
<p class="lead">${esc(subtitle(t.termYears))}</p>
<div class="titlebar"><span class="stamp">הסכם מס׳ ${esc(number)} · תאריך ההסכם ${esc(issued)}</span></div>
<h2>הצדדים להסכם</h2>
<table class="parties"><tbody>
<tr><th>החברה</th><td>${esc(COMPANY.name)} · ח.פ. ${esc(COMPANY.registration)} · ${esc(COMPANY.address)} (&quot;החברה&quot;)</td></tr>
<tr><th>הלקוח</th><td>${esc(cu.name)} · ת.ז. <span class="fill w-id" data-semo-signature-field="idNum"></span> (&quot;הלקוח&quot;)</td></tr>
<tr><th>טלפון ודוא&quot;ל</th><td>${esc(cu.phone)} · ${esc(cu.email)}</td></tr>
<tr><th>כתובת ההתקנה</th><td>${esc(address)}</td></tr>
<tr><th>גוש / חלקה / תת-חלקה</th><td>${parcel}</td></tr>
</tbody></table>
<div class="summary">
<h3>עיקרי העסקה</h3>
<ul>
<li>החברה מממנת ומתקינה את המערכת. הלקוח אינו משלם על רכישתה או התקנתה, ואינו משלם דמי ליסינג.</li>
<li>במשך ${t.termMonths} חודשים (${esc(yearsHe(t.termYears))}) המערכת בבעלות החברה, והחברה מתחזקת אותה על חשבונה.</li>
<li>הלקוח משלם לחברה מדי חודש על כל צריכת החשמל של הבית, לפי תעריף החשמל הביתי — כאילו לא הותקנה מערכת. <strong>בתקופה זו אין ללקוח חיסכון בחשבון החשמל.</strong></li>
<li>כל הכנסות המערכת בתקופה זו שייכות לחברה.</li>
<li>בתום התקופה המערכת עוברת לבעלות הלקוח, ללא תשלום. רכישה מוקדמת אינה אפשרית.</li>
<li>ההסדר נכנס לתוקף רק לאחר קיום התנאים המתלים שבפרק 14, לרבות העברת חשבון החשמל על שם החברה.</li>
${offered ? '<li>אופציונלי, בנפרד מהליסינג ועל חשבון הלקוח: ממיר היברידי וסוללות אגירה לגיבוי בזמן הפסקת חשמל (נספח א\').</li>' : ''}
</ul>
</div>
<h2>ערכים מסחריים</h2>
<table class="kv"><caption>המערכת</caption><tbody>
${systemRows}
</tbody></table>
<table class="kv"><caption>תנאי העסקה</caption><tbody>
${termsRows}
</tbody></table>
<div class="body">
${body}
${backupAnnexHtml(state, backupN)}
</div>
<section class="approval">
<h2>הצהרות הלקוח</h2>
<ol class="decl">${[...declarations(t), ...(offered ? [BACKUP_DECLARATION] : [])].map((d) => `<li>${esc(d)}</li>`).join('')}</ol>
<h2>אישור וחתימה דיגיטלית</h2>
<p>${esc(APPROVAL_TEXT)}</p>
<div class="sign">
<div class="party"><div class="line" data-semo-signature-target="customer"></div><div class="who">חתימת הלקוח · <span class="signer" data-semo-signature-field="name"></span></div><div class="date">תאריך: <span class="fill w-date" data-semo-signature-field="dateStr"></span></div></div>
<div class="party"><div class="line"></div><div class="who">חתימה וחותמת החברה · ${esc(COMPANY.name)}</div><div class="date">תאריך: ${esc(issued)}</div></div>
</div>
</section>
</main>
<footer class="screen-foot"><span>${esc(companyLine)}</span><span>${esc(footerLabel)}</span></footer>
</div>
</body>
</html>
`;
}

/**
 * A DISPLAY copy of the signed agreement with the signer evidence written into its inline-v1 slots
 * — what the customer sees after signing. Never stored, never hashed: the frozen bytes stay
 * evidence-free and the legal PDF receives the evidence separately (same as @semo/pdf inline-v1).
 * `evidence.idNum` is whatever the caller is allowed to show (masked on the public page).
 */
function withSignerEvidence(html, evidence) {
  const e = evidence || {};
  const img = typeof e.sigImg === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(e.sigImg)
    ? `<img class="semo-inline-signature" src="${e.sigImg}" alt="חתימת הלקוח">` : '';
  return html
    .replace('<span class="fill w-id" data-semo-signature-field="idNum"></span>', `<span class="fill w-id" data-semo-signature-field="idNum">${esc(e.idNum || '')}</span>`)
    .replace('<span class="signer" data-semo-signature-field="name"></span>', `<span class="signer" data-semo-signature-field="name">${esc(e.name || '')}</span>`)
    .replace('<span class="fill w-date" data-semo-signature-field="dateStr"></span>', `<span class="fill w-date" data-semo-signature-field="dateStr">${esc(e.dateStr || '')}</span>`)
    .replace('<div class="line" data-semo-signature-target="customer"></div>', `<div class="line" data-semo-signature-target="customer">${img}</div>`);
}

const api = {
  TEMPLATE_ID, TEMPLATE_VERSION, TITLE, COMPANY, POLICY, SYS_LABELS, BACKUP_ROW_ID, BACKUP_ANNEX_ID,
  renderAgreement, withSignerEvidence, agreementNumber, subtitle, yearsHe, ils, backupRowHtml, backupAnnexHtml,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.LeaseAgreement = api;
})();
