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
  const YEARS              = 26;
  const URBAN_PREMIUM      = 0.06;   // 6 אג׳ לקו"ט, 10 שנות ראשונות
  const URBAN_PREMIUM_YEARS = 10;
  const DEFAULT_HOURS      = 1750;   // שעות שמש שנתיות ברירת מחדל

  // מגבלות זכאות מסלולים לפי AC
  const MAX_AC_INDEX = 15;    // צמוד מדד: AC ≤ 15 בלבד
  const MAX_AC_FAST  = 30;    // החזר מהיר: AC ≤ 30 בלבד

  // תעריפי רכישה 2026 — אג׳ לקו"ט, מדרגות מצטברות (Nominal)
  const TARIFF_TIERS = [
    { cap: 15,    rate: 0.4800 },
    { cap: 100,   rate: 0.3731 },
    { cap: 630,   rate: 0.2958 },
    { cap: 5000,  rate: 0.2370 },
    { cap: Infinity, rate: 0.1716 },
  ];

  // תעריפי מסלול מהיר — מדרגות לפי AC
  const FAST_BLOCK1_HIGH = 0.60;    // שנות 1-5, block_1 (≤15kW)
  const FAST_BLOCK1_LOW  = 0.3807;  // שנות 6-26, block_1 (≤15kW)
  const FAST_BLOCK2      = 0.3731;  // כל התקופה, block_2 (>15kW)

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
        ? `${rateStr} (${URBAN_PREMIUM_YEARS} שנות ראשונות) + ${rateAg} אג׳ (לאחר מכן)`
        : `${rateAg} אג׳ קבוע | הספק AC ${acKW} kW`;
      rateNote = hasUrbanPremium
        ? `תעריף ${rateAg} אג׳ + פרמייה אורבנית ${URBAN_PREMIUM * 100} אג׳ = ${Math.round((baseR + up) * 100 * 100) / 100} אג׳ (${URBAN_PREMIUM_YEARS} שנים)`
        : `תעריף משוקלל ${rateAg} אג׳ לקו"ט | הספק AC ${acKW} kW`;
      for (let y = 1; y <= YEARS; y++) {
        yearlyBreakdown.push({ year: y, inc: kwh * (y <= URBAN_PREMIUM_YEARS ? rate : rateAfter) });
      }

    } else if (planKey === 'fast') {
      planName = '⚡ מסלול החזר השקעה מהיר';
      // מדרגות: block_1 = min(AC,15), block_2 = max(AC-15,0)
      const block1 = Math.min(acKW, 15);
      const block2 = Math.max(acKW - 15, 0);
      const kwhB1 = block1 * HOURS;
      const kwhB2 = block2 * HOURS;

      // תעריפים משוקללים
      const wHigh = acKW > 0 ? (block1 * FAST_BLOCK1_HIGH + block2 * FAST_BLOCK2) / acKW : FAST_BLOCK1_HIGH;
      const wLow  = acKW > 0 ? (block1 * FAST_BLOCK1_LOW  + block2 * FAST_BLOCK2) / acKW : FAST_BLOCK1_LOW;
      const wHighAg = Math.round(wHigh * 10000) / 100;
      const wLowAg  = Math.round(wLow  * 10000) / 100;

      planDesc = `${wHighAg} אג׳ (שנות 1–5) | ${wLowAg} אג׳ (שנות 6–26)`;
      rateNote = hasUrbanPremium
        ? `שנות 1–5: ${wHighAg} אג׳ | שנות 6–10: ${wLowAg}+${URBAN_PREMIUM*100} אג׳ | שנות 11–26: ${wLowAg} אג׳ (כולל פרמייה)`
        : `שנות 1–5: ${wHighAg} אג׳ | שנות 6–26: ${wLowAg} אג׳ | הספק AC ${acKW} kW`;

      for (let y = 1; y <= YEARS; y++) {
        const b1Rate = y <= 5 ? FAST_BLOCK1_HIGH : FAST_BLOCK1_LOW;
        const prem = y <= URBAN_PREMIUM_YEARS ? up : 0;
        const inc = kwhB1 * (b1Rate + prem) + kwhB2 * (FAST_BLOCK2 + prem);
        yearlyBreakdown.push({ year: y, inc });
      }

    } else { // index
      const iBase = 0.391;
      const inf = (inflationPct || 2.5) / 100;
      planName = '📈 מסלול צמוד מדד';
      const withPrem = Math.round((iBase + URBAN_PREMIUM) * 1000) / 10;
      const baseAg   = Math.round(iBase * 1000) / 10;
      planDesc = `${hasUrbanPremium ? withPrem : baseAg} אג׳ + צמוד מדד ${inflationPct || 2.5}% לשנה`;
      rateNote = hasUrbanPremium
        ? `תעריף ${baseAg} אג׳ + פרמייה ${URBAN_PREMIUM * 100} אג׳ = ${withPrem} אג׳ (10 שנות ראשונות) | צמוד מדד ${inflationPct || 2.5}%`
        : `תעריף התחלתי ${baseAg} אג׳ | צמוד מדד ${inflationPct || 2.5}%`;
      for (let y = 1; y <= YEARS; y++) {
        const prem = y <= URBAN_PREMIUM_YEARS ? up : 0;
        yearlyBreakdown.push({ year: y, inc: kwh * (iBase + prem) * Math.pow(1 + inf, y - 1) });
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
  function calcBatteryPrice(batt, battFirstPrice, battExtraPrice) {
    if (batt <= 0) return 0;
    return battFirstPrice + Math.max(0, batt - 1) * battExtraPrice;
  }

  function calcPrice({ dcKW, roof, batt, needsMeter,
                        ppkw, battFirstPrice, battExtraPrice, concretePerKw,
                        meterPanelPrice }) {
    let price = dcKW * ppkw;
    if (roof === 'בטון')  price += dcKW * concretePerKw;
    // Batteries are now an upgrade — NOT included in base price
    if (needsMeter)       price += meterPanelPrice;
    return price;
  }

  // ── שלבי תשלום ───────────────────────────────────────────────────────────

  /**
   * _loadPaymentStages()
   * טוען הגדרות שלבי תשלום מ-localStorage (payment-editor.html) או ברירת מחדל.
   */
  function _loadPaymentStages() {
    try {
      const saved = typeof localStorage !== 'undefined' && localStorage.getItem('semo-payment-stages');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [
      { label: 'מקדמה',       desc: 'בחתימת ההסכם',                         type: 'fixed',     value: 6000 },
      { label: 'השלמה ל-35%', desc: 'בקבלת תוכניות ביצוע',                  type: 'percent',   value: 35 },
      { label: 'השלמה ל-95%', desc: '7 ימי עסקים בטרם אספקת פנלים לאתר',   type: 'percent',   value: 95 },
      { label: '5% אחרון',    desc: 'ביום החיבור לחברת החשמל',               type: 'remainder', value: 100 },
    ];
  }

  /**
   * calcPaymentStages(price)
   * מחשב את שלבי התשלום לפי המחיר וההגדרות.
   * @returns {{ dep, p2, p3, p4, stages }}
   */
  function calcPaymentStages(price) {
    const config = _loadPaymentStages();
    const stages = [];
    let cumulative = 0;

    for (const s of config) {
      let amount = 0;
      if (s.type === 'fixed') {
        amount = s.value;
      } else if (s.type === 'percent') {
        amount = Math.round(price * s.value / 100) - cumulative;
      } else {
        // remainder
        amount = price - cumulative;
      }
      cumulative += amount;
      stages.push({ label: s.label, desc: s.desc, amount });
    }

    // Backward compatibility: return dep/p2/p3/p4 + full stages array
    return {
      dep: stages[0] ? stages[0].amount : 0,
      p2:  stages[1] ? stages[1].amount : 0,
      p3:  stages[2] ? stages[2].amount : 0,
      p4:  stages[3] ? stages[3].amount : 0,
      stages,
    };
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
      customInvModel = '',
      panelW = 640, roofArea,
      city, hasUrbanPremium = false,
      planKey, inflationPct = 2.5,
      battFirstPrice = 8900,
      battExtraPrice = 6500,
      hybridInvPrice = 8900,
      hybridFullPrice = 37100,
      premiumPanel = 100,
      usdRate = 3.65,
      concretePerKw = 50,
      meterPanelPrice = 2500,
      extras = [],
    } = params;

    const needsMeter       = acKW > 15;
    const effectivePlanKey = (planKey === 'green' && acKW > 15) ? 'regular' : planKey;
    const panelCount       = panelW > 0 ? Math.ceil((dcKW * 1000) / panelW) : 0;
    const batteryPrice     = calcBatteryPrice(batt, battFirstPrice, battExtraPrice);
    const premiumPanelNIS  = Math.round(premiumPanel * usdRate * dcKW);
    const invDisplay       = inv === 'אחר' && customInvModel ? customInvModel : inv;

    const price       = calcPrice({ dcKW, roof, batt, needsMeter,
                                     ppkw, battFirstPrice, battExtraPrice, concretePerKw,
                                     meterPanelPrice });
    const priceVAT    = Math.round(price * VAT);
    const annualKwh   = dcKW * (hours || DEFAULT_HOURS);
    const panelArea   = panelCount * 2.42;
    const breaker     = calcBreaker(acKW);
    const plan        = calcPlanIncome({ dcKW, acKW, price, planKey: effectivePlanKey,
                                          inflationPct, hasUrbanPremium, hours });
    const payments    = calcPaymentStages(price);
    // Only upgrades affect price; potential costs are informational only
    const extrasTotal = (extras || []).filter(e => e.checked && e.category !== 'potential').reduce((s, e) => s + e.price, 0);

    return {
      // קלט מעובד
      dcKW, acKW, hours, ppkw, batt, roof, inv: invDisplay,
      customInvModel,
      panelW, panelCount, roofArea, panelArea,
      city, hasUrbanPremium,
      planKey, effectivePlanKey, inflationPct,
      needsMeter,
      extras, extrasTotal,
      // תוצאות מחיר
      price, priceVAT, batteryPrice,
      premiumPanelNIS, premiumPanel, usdRate,
      // תוצאות טכניות
      annualKwh, breaker,
      // שלבי תשלום
      ...payments,
      // תוצאות פיננסיות לפי מסלול
      plan,
      // מחירים להפניה
      battFirstPrice, battExtraPrice,
      hybridInvPrice, hybridFullPrice,
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

  /**
   * getEligiblePlans(acKW)
   * מחזיר רשימת מסלולים זכאים לפי הספק AC.
   * @returns {string[]} מפתחות מסלולים זכאים
   */
  function getEligiblePlans(acKW) {
    const plans = ['green', 'regular']; // נומינלי תמיד זמין
    if (acKW <= MAX_AC_FAST)  plans.push('fast');
    if (acKW <= MAX_AC_INDEX) plans.push('index');
    return plans;
  }

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
    getEligiblePlans,
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
