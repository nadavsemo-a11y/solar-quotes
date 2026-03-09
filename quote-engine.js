/**
 * quote-engine.js
 * SEMO AGS — Solar Quote Engine
 *
 * אחריות: חישובים עסקיים סולאריים בלבד.
 * אין כאן DOM, אין HTML, אין fetch, אין UI.
 * כל פונקציה מקבלת נתונים ומחזירה תוצאות.
 *
 * שימוש ב-Browser:  <script src="quote-engine.js"></script>  → window.QuoteEngine
 * שימוש ב-Worker:   import { QuoteEngine } from './quote-engine.js'
 */

const QuoteEngine = (() => {

  // ── קבועים ──────────────────────────────────────────────────────────────

  const VAT                = 1.18;
  const YEARS              = 25;
  const URBAN_PREMIUM      = 0.06;   // 6 אג׳ לקו"ט, 15 שנות ראשונות
  const URBAN_PREMIUM_YEARS = 15;
  const DEFAULT_HOURS      = 1750;   // שעות שמש שנתיות ברירת מחדל

  // תעריפי רכישה 2026 — ₪ לקו"ט (תקרות מצטברות)
  const TARIFF_TIERS = [
    { cap: 15,  rate: 0.48   },
    { cap: 100, rate: 0.3936 },
    { cap: 300, rate: 0.3437 },
    { cap: 630, rate: 0.2844 },
  ];

  // גדלי מפסק סטנדרטיים (אמפר)
  const BREAKER_SIZES = [25, 40, 63, 80, 100, 125, 160, 250, 400, 630];

  // שלבי תשלום (אחוזים מהמחיר)
  const PAYMENT_STAGES = [
    { label: '1 — מקדמה',           desc: 'בחתימת ההסכם',                       pct: null, fixed: 6000 },
    { label: '2 — השלמה ל-35%',     desc: 'בקבלת תוכניות ביצוע',                pct: 0.35 },
    { label: '3 — השלמה ל-95%',     desc: '7 ימי עסקים בטרם אספקת פנלים לאתר', pct: 0.95 },
    { label: '4 — 5% אחרון',        desc: 'ביום החיבור לחברת החשמל',            pct: 1.00 },
  ];

  // ── עזרים פנימיים ────────────────────────────────────────────────────────

  function _totalTariffIncome(kw) {
    if (kw <= 0) return 0;
    let inc = 0, prev = 0;
    for (const { cap, rate } of TARIFF_TIERS) {
      const chunk = Math.min(kw, cap) - prev;
      if (chunk <= 0) break;
      inc += chunk * rate;
      prev = cap;
      if (kw <= cap) break;
    }
    return inc;
  }

  // ── תעריפים ──────────────────────────────────────────────────────────────

  /**
   * calcWeightedRate(acKW, p0)
   * מחשב תעריף משוקלל שולי עבור מערכת חדשה בהספק acKW,
   * כאשר p0 הוא הספק קיים כבר של אותו צרכן (ברירת מחדל 0).
   * @returns {number} תעריף ב-₪ לקו"ט (4 ספרות אחרי הנקודה)
   */
  function calcWeightedRate(acKW, p0 = 0) {
    if (acKW <= 0) return 0.48;
    const p1 = p0 + acKW;
    const marginal = (_totalTariffIncome(p1) - _totalTariffIncome(p0)) / acKW;
    return Math.round(marginal * 10000) / 10000;
  }

  // ── מגן ראשי ─────────────────────────────────────────────────────────────

  /**
   * calcBreaker(acKW)
   * I = P / (√3 × 400V × PF0.9) — מחשב גודל מפסק לפי תקן
   * @returns {{ size: number, current: number }}
   */
  function calcBreaker(acKW) {
    const I    = (acKW * 1000) / (Math.sqrt(3) * 400 * 0.9);
    const size = BREAKER_SIZES.find(b => b >= I) || 630;
    return { size, current: Math.round(I * 10) / 10 };
  }

  // ── חישוב הכנסות לפי מסלול ───────────────────────────────────────────────

  /**
   * calcPlanIncome(params)
   * @param {object} params
   *   dcKW           {number} הספק DC
   *   acKW           {number} הספק AC
   *   price          {number} מחיר המערכת (ללא מע"מ)
   *   planKey        {string} 'green' | 'regular' | 'fast' | 'index'
   *   inflationPct   {number} אחוז אינפלציה שנתית (למסלול צמוד)
   *   hasUrbanPremium {boolean} פרמייה אורבנית
   *   hours          {number} שעות ייצור שנתיות (ברירת מחדל 1750)
   *
   * @returns {{
   *   yr1, totalInc, payback, roi,
   *   planName, planDesc, rateNote,
   *   yearlyBreakdown, avgAnnual, baseRateAg
   * }}
   */
  function calcPlanIncome({ dcKW, acKW, price, planKey, inflationPct, hasUrbanPremium, hours }) {
    const HOURS   = hours || DEFAULT_HOURS;
    const kwh     = dcKW * HOURS;
    const up      = hasUrbanPremium ? URBAN_PREMIUM : 0;
    const baseR   = calcWeightedRate(acKW);
    const rateAg  = Math.round(baseR * 100 * 100) / 100;

    let yearlyBreakdown = [], planName, planDesc, rateNote;

    if (planKey === 'green' || planKey === 'regular') {
      const rate      = baseR + up;
      const rateAfter = baseR;
      planName = planKey === 'green' ? '🌿 מסלול ירוק' : '📊 מסלול רגיל';
      const rateStr = `${Math.round((baseR + up) * 100 * 100) / 100} אג׳`;
      planDesc = hasUrbanPremium
        ? `${rateStr} (15 שנות ראשונות) + ${rateAg} אג׳ (לאחר מכן)`
        : `${rateAg} אג׳ קבוע | הספק AC ${acKW} kW`;
      rateNote = hasUrbanPremium
        ? `תעריף ${rateAg} אג׳ + פרמייה אורבנית 6 אג׳ = ${Math.round((baseR + up) * 100 * 100) / 100} אג׳ (15 שנים)`
        : `תעריף משוקלל ${rateAg} אג׳ לקו"ט | הספק AC ${acKW} kW`;
      for (let y = 1; y <= YEARS; y++) {
        yearlyBreakdown.push({ year: y, inc: kwh * (y <= URBAN_PREMIUM_YEARS ? rate : rateAfter) });
      }

    } else if (planKey === 'fast') {
      const kwhBelow = Math.min(dcKW, acKW) * HOURS;
      const kwhAbove = Math.max(dcKW - acKW, 0) * HOURS;
      const baseHigh = 0.60 + up, baseMid = 0.48 + up, baseLow = 0.39;
      planName = '⚡ מסלול החזר השקעה מהיר';
      planDesc = `60 אג׳ (≤${acKW}kW AC) | 48 אג׳ (מעל) | 39 אג׳ שנות 6–25`;
      rateNote = `שנות 1–5: 60 אג׳ (עד ${acKW}kW) + 48 אג׳ (מעל) | שנות 6–25: 39 אג׳`;
      const yr1_5  = kwhBelow * baseHigh + kwhAbove * baseMid;
      const yr6_25 = kwh * baseLow;
      for (let y = 1; y <= YEARS; y++) {
        yearlyBreakdown.push({ year: y, inc: y <= 5 ? yr1_5 : yr6_25 });
      }

    } else { // index
      const iR  = 0.387 + up;
      const iRA = 0.387;
      const inf = (inflationPct || 2.5) / 100;
      planName = '📈 מסלול צמוד מדד';
      planDesc = `${hasUrbanPremium ? '44.7' : '38.7'} אג׳ + צמוד מדד ${inflationPct || 2.5}% לשנה`;
      rateNote = `תעריף התחלתי ${hasUrbanPremium ? '44.7' : '38.7'} אג׳${hasUrbanPremium ? ' (כולל פרמייה)' : ''} | צמוד מדד ${inflationPct || 2.5}%`;
      for (let y = 1; y <= YEARS; y++) {
        const r = y <= URBAN_PREMIUM_YEARS ? iR : iRA;
        yearlyBreakdown.push({ year: y, inc: kwh * r * Math.pow(1 + inf, y - 1) });
      }
    }

    const totalInc  = yearlyBreakdown.reduce((s, r) => s + r.inc, 0);
    const yr1       = yearlyBreakdown[0].inc;
    const avgAnnual = totalInc / YEARS;
    const roi       = price > 0 ? yr1 / price : 0;

    if (price <= 0) return { yr1, totalInc, payback: YEARS, roi: 0, planName, planDesc, rateNote, yearlyBreakdown, avgAnnual, baseRateAg: rateAg };

    let cumul = 0, payback = YEARS;
    for (const { year, inc } of yearlyBreakdown) {
      cumul += inc;
      if (cumul >= price) {
        payback = year - 1 + (price - (cumul - inc)) / inc;
        break;
      }
    }

    return { yr1, totalInc, payback, roi, planName, planDesc, rateNote, yearlyBreakdown, avgAnnual, baseRateAg: rateAg };
  }

  // ── חישוב מחיר ───────────────────────────────────────────────────────────

  /**
   * calcPrice(params)
   * מחשב מחיר סופי של ההצעה לפי כל הפרמטרים.
   * @returns {number} מחיר ללא מע"מ
   */
  function calcPrice({ dcKW, roof, batt, inv, evCharger, needsMeter, extras,
                        ppkw, battUnitPrice, sePrice, concretePerKw,
                        meterPanelPrice, evPrice }) {
    let price = dcKW * ppkw;
    if (roof === 'בטון')      price += dcKW * concretePerKw;
    if (batt > 0)             price += batt * battUnitPrice;
    if (inv === 'Solaredge')  price += sePrice;
    if (evCharger === 'כן')   price += evPrice;
    if (needsMeter)           price += meterPanelPrice;
    const extrasTotal = (extras || []).filter(e => e.checked).reduce((s, e) => s + e.price, 0);
    price += extrasTotal;
    return price;
  }

  // ── שלבי תשלום ───────────────────────────────────────────────────────────

  /**
   * calcPaymentStages(price)
   * מחשב את 4 שלבי התשלום לפי המחיר.
   * @returns {{ dep, p2, p3, p4 }}
   */
  function calcPaymentStages(price) {
    const dep = 6000;
    const p2  = Math.round(price * 0.35) - dep;
    const p3  = Math.round(price * 0.95) - Math.round(price * 0.35);
    const p4  = price - Math.round(price * 0.95);
    return { dep, p2, p3, p4 };
  }

  // ── חישוב כולל (ה-API הראשי) ─────────────────────────────────────────────

  /**
   * calculate(params)
   * הפונקציה הראשית — מקבלת את כל פרמטרי הטופס, מחזירה את כל התוצאות.
   * זוהי נקודת הכניסה המרכזית ל-quote-engine.
   *
   * @param {object} params — כל שדות הטופס כ-plain object (ראה תיעוד מלא בהמשך)
   * @returns {object} תוצאות חישוב מלאות
   */
  function calculate(params) {
    const {
      dcKW, acKW, hours = DEFAULT_HOURS,
      ppkw, batt = 0, roof, inv,
      panelW, panelCount, roofArea,
      city, hasUrbanPremium = false,
      planKey, inflationPct = 2.5,
      battUnitPrice = 12000,
      hybridInvPrice = 10100,
      hybridFullPrice = 37100,
      sePrice = 12000,
      premiumPanel = 100,
      monitoringPrice = 1500,
      concretePerKw = 50,
      meterPanelPrice = 2500,
      evCharger = 'לא',
      evPrice = 4500,
      evModel = '',
      extras = [],
    } = params;

    const needsMeter       = acKW > 15;
    const effectivePlanKey = (planKey === 'green' && acKW > 15) ? 'regular' : planKey;

    const price       = calcPrice({ dcKW, roof, batt, inv, evCharger, needsMeter, extras,
                                     ppkw, battUnitPrice, sePrice, concretePerKw,
                                     meterPanelPrice, evPrice });
    const priceVAT    = Math.round(price * VAT);
    const annualKwh   = dcKW * (hours || DEFAULT_HOURS);
    const panelArea   = panelCount * 2.42;
    const breaker     = calcBreaker(acKW);
    const plan        = calcPlanIncome({ dcKW, acKW, price, planKey: effectivePlanKey,
                                          inflationPct, hasUrbanPremium, hours });
    const payments    = calcPaymentStages(price);
    const extrasTotal = (extras || []).filter(e => e.checked).reduce((s, e) => s + e.price, 0);

    return {
      // קלט מעובד
      dcKW, acKW, hours, ppkw, batt, roof, inv,
      panelW, panelCount, roofArea, panelArea,
      city, hasUrbanPremium,
      planKey, effectivePlanKey, inflationPct,
      needsMeter, evCharger, evPrice, evModel,
      extras, extrasTotal,
      // תוצאות מחיר
      price, priceVAT,
      // תוצאות טכניות
      annualKwh, breaker,
      // שלבי תשלום
      ...payments,
      // תוצאות פיננסיות לפי מסלול
      plan,
      // מחירים להפניה
      battUnitPrice, hybridInvPrice, hybridFullPrice,
      sePrice, premiumPanel, monitoringPrice,
      concretePerKw, meterPanelPrice,
    };
  }

  // ── נתוני עזר ─────────────────────────────────────────────────────────────

  /**
   * isUrbanPremiumCity(cityName)
   * בודק אם עיר זכאית לפרמייה אורבנית.
   * הרשימה מתוחזקת כאן — מקור האמת היחיד.
   */
  const PREMIUM_CITIES = new Set([
    "אום אל-פחם","אור יהודה","אילת","אלעד","אשדוד","אשקלון",
    "באקה אל גרבייה","באר יעקב","באר שבע","בית שמש","בני ברק","בת ים",
    "גבעתיים","דאלית אל-כרמל","דימונה","הוד השרון","הרצליה","חדרה",
    "חולון","חיפה","טבריה","טייבה","טירת כרמל","טמרה","יבנה",
    "יהוד-מונוסון","ירושלים","כפר יונה","כפר סבא","כרמיאל","לוד",
    "מודיעין-מכבים-רעות","נהריה","נוף הגליל","נס ציונה","נצרת","נשר",
    "נתיבות","נתניה","סחנין","עכו","עפולה","ערערה","פרדס חנה-כרכור",
    "פתח תקווה","צפת","קריית אונו","קרית אתא","קרית ביאליק","קרית גת",
    "קרית ים","קרית מוצקין","קרית מלאכי","קרית שמונה","ראש העין",
    "ראשון לציון","רהט","רחובות","רכסים","רמלה","רמת גן","רמת השרון",
    "רעננה","שגב-שלום","שדרות","שפרעם","תל אביב -יפו",
  ]);

  function isUrbanPremiumCity(cityName) {
    if (!cityName) return false;
    const n = cityName.trim().replace(/\s*-\s*/g, '-');
    for (const city of PREMIUM_CITIES) {
      if (city.trim().replace(/\s*-\s*/g, '-') === n) return true;
    }
    if (n === 'תל אביב' || n.startsWith('תל אביב')) return true;
    return false;
  }

  // ── פורמט ─────────────────────────────────────────────────────────────────

  function fmt(n)  { return Math.round(n).toLocaleString('he-IL'); }
  function fmtD(n) { return Number(n).toFixed(1); }

  // ── ייצוא ─────────────────────────────────────────────────────────────────

  return {
    // פונקציה ראשית
    calculate,
    // פונקציות בסיס (לשימוש ישיר אם צריך)
    calcWeightedRate,
    calcPlanIncome,
    calcPrice,
    calcPaymentStages,
    calcBreaker,
    // נתוני עזר
    isUrbanPremiumCity,
    PREMIUM_CITIES,
    TARIFF_TIERS,
    // פורמט
    fmt,
    fmtD,
    // קבועים
    VAT,
    YEARS,
    DEFAULT_HOURS,
    URBAN_PREMIUM,
    URBAN_PREMIUM_YEARS,
  };

})();

// תמיכה ב-ES Module (Worker) וב-browser global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QuoteEngine };
}
