/**
 * solar-quote/solar-content-blocks.js
 * SEMO AGS — canonical, structured source of the SOLAR quote's EDITORIAL content.
 *
 * This is an EXACT, structured port of the editorial content that used to live only inside
 * content-manager.js's DEFAULTS object (sectionOrder + sections). It is now the single canonical
 * source for the solar quote's editorial text blocks. Fixed/calculated sections (financials,
 * upgrades-section, price-breakdown, potential-costs, payment-section) are NOT here — they are
 * produced elsewhere. The inline helper sections (upgrades-intro, potential-intro, payment-desc)
 * are exposed as dedicated exports below.
 *
 * Text is copied byte-for-byte from content-manager.js; {{placeholder}} tokens are kept literally
 * and resolved downstream. `enabled` state is intentionally NOT carried over — every block is listed
 * here as the base source, and enabled/disabled overrides are applied later.
 *
 * NOTE: This file is generated as a faithful mirror of content-manager.js DEFAULTS. Its fidelity is
 * guarded by solar-content-blocks.test.js (reconstructs each block's text and compares to the
 * ContentManager default). If ContentManager's editorial DEFAULTS change, update this file and the
 * test will confirm parity.
 */
'use strict';

const SOLAR_CONTENT_VERSION = 'solar-content-1';

const SOLAR_SECTION_ORDER = [
  "includes",
  "intro",
  "service",
  "focus",
  "environment",
  "financials",
  "upgrades-section",
  "warranty-cards",
  "spec",
  "project-details",
  "design",
  "process",
  "steps",
  "warranty",
  "notes",
  "price-breakdown",
  "potential-costs",
  "payment-section",
  "terms"
];

const SOLAR_SECTIONS = {
  "includes": {
    "id": "includes",
    "type": "include-items",
    "title": "ההצעה כוללת",
    "region": "pre-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "inc-1",
        "type": "included-item",
        "text": "פאנלים Tier 1 בניצולת גבוהה עם אחריות 30 שנה"
      },
      {
        "id": "inc-2",
        "type": "included-item",
        "text": "ממיר {{inv}} איכותי עם אחריות 10 שנים"
      },
      {
        "id": "inc-3",
        "type": "included-item",
        "text": "טיפול מלא ברישוי ובירוקרטיה מול הרשויות"
      },
      {
        "id": "inc-4",
        "type": "included-item",
        "text": "תכנון הנדסי מקצועי ומפורט + הדמיה ממוחשבת"
      },
      {
        "id": "inc-5",
        "type": "included-item",
        "text": "התקנה מהירה וקפדנית על איכות ונראות"
      },
      {
        "id": "inc-6",
        "type": "included-item",
        "text": "אפליקציה לניטור ביצועי המערכת בסמארטפון"
      }
    ]
  },
  "intro": {
    "id": "intro",
    "type": "paragraphs",
    "title": "מבוא",
    "region": "pre-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "intro-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "ברכות על הבחירה להצטרף לייצור אנרגיה סולארית. אנו נשמח לעבוד על הפרויקט יחד איתכם."
          }
        ]
      },
      {
        "id": "intro-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "בעידן שבו העולם צמא לאנרגיה ממקורות מתחדשים, להפיק חשמל נקי מזיהום, מאנרגיית השמש זה הדבר הנכון לעשות. כבעלי גג, יש לכם הזדמנות לעשות בו שימוש כדי לקדם מטרה שחשובה למדינה ולאנושות."
          }
        ]
      },
      {
        "id": "intro-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "כדי לתרום למאמץ, מדינת ישראל, באמצעות רשות החשמל, יצרה אסדרות בזכותן החשמל שתייצרו באמצעות המערכת הסולארית שתותקן על הגג שלכם ישמש להתקזזות מול עלויות צריכת החשמל ואף תוכלו למכור את עודפי ייצור החשמל לחברת החשמל. האסדרה מבטיחה את זכאותכם לתשלומים מול חברת החשמל למשך 25 שנה."
          }
        ]
      },
      {
        "id": "intro-4",
        "type": "paragraph",
        "spans": [
          {
            "text": "באופן זה המערכת הסולארית תיצור עבורכם חיסכון והכנסות מעבר לעלותה, ובכך תניב לכם תשואה נאה, ותתרום לרווחתכם וביטחונכם הכלכלי."
          }
        ]
      }
    ]
  },
  "service": {
    "id": "service",
    "type": "paragraphs",
    "title": "שירות אישי ומקצועי",
    "region": "pre-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "service-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "אצלנו הכל מתחיל באנשים. מובילי החברה הם מוותיק התחום הסולארי בארץ ונותנים דגש מתמשך על מקצועיות ואיכות, בדגש על תשומת לב אישית. תוכלו להנות מהקשר האישי והגישה המקצועית."
          }
        ]
      },
      {
        "id": "service-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "נפעל כדי שהמערכת שלכם תשרת אתכם נאמנה שנים ארוכות ותהליך הפרויקט יהיה ברור ופשוט עבורכם."
          }
        ]
      }
    ]
  },
  "focus": {
    "id": "focus",
    "type": "paragraphs",
    "title": "דגשים מקצועיים",
    "region": "pre-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "focus-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "תכנון מקצועי:",
            "emphasis": "strong"
          },
          {
            "text": " כל פרויקט מתחיל בסקר השטח שיבוצע ע\"י אחד מהיועצים המנוסים שלנו הכולל צילום תמונות רחפן, בדיקת הגג, ולוח החשמל. אנו נטפל בנדרש בצורה אישית כדי להבטיח התקנה ברמה הגבוהה ביותר."
          }
        ]
      },
      {
        "id": "focus-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "ההצעה מפרטת הכל:",
            "emphasis": "strong"
          },
          {
            "text": " אין תוספות לא צפויות או אותיות קטנות. אנחנו לוקחים את מלוא האחריות על כל התהליך, כולל הגשת אישורים לרשויות השונות, תכנון העמדה, והתקנת המערכת. נפעל ככל האפשר, למנוע מכם הפתעות."
          }
        ]
      },
      {
        "id": "focus-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "ניהול פרויקט מקצועי:",
            "emphasis": "strong"
          },
          {
            "text": " תקבלו מאיתנו עדכונים שוטפים והנחיות, בכדי שתוכלו להיות עם ראש שקט ולהנות מהתהליך."
          }
        ]
      }
    ]
  },
  "environment": {
    "id": "environment",
    "type": "paragraphs",
    "title": "התועלת לסביבה",
    "region": "pre-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "env-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "{{annualKwh}} קווט\"ש חשמל נקי, שמערכת הסולארית שלכם תייצר כל שנה."
          }
        ]
      },
      {
        "id": "env-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "{{co2Tons}} טון פליטות פחמן דו-חמצני, שלא חייבים לייצר עכשיו מדלק מזהם. (כל קווט\"ש ייצור סולארי מונע כ-0.75 ק\"ג פליטות בשנה)"
          }
        ]
      },
      {
        "id": "env-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "{{forestDunam}} דונם יער, שצריך לשתול כחלופה להפחתת הזיהום של המערכת הסולארית ({{treeCount}} שווה ערך בכמות עצים). (כל מגה-ווט\"ש ייצור סולארי שקול לכ-3.5 דונם יער)"
          }
        ]
      },
      {
        "id": "env-4",
        "type": "paragraph",
        "spans": [
          {
            "text": "{{carKm}} ק\"מ נסיעה ברכב, שצריך לצמצם כדי להשתוות לתועלת לסביבה של המערכת הסולארית. (כל קווט\"ש ייצור סולארי שקול לכ-3.8 ק\"מ נסיעה ברכב)"
          }
        ]
      }
    ]
  },
  "warranty-cards": {
    "id": "warranty-cards",
    "type": "warranty-cards",
    "title": "מפרט ציוד ואחריות",
    "region": "post-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "wc-panels",
        "type": "equipment-card",
        "icon": "☀️",
        "title": "פאנלים סולאריים",
        "lines": [
          "{{panelCount}} פאנלים × {{panelW}}W — Tier 1",
          "אחריות יצרן: 30 שנה"
        ]
      },
      {
        "id": "wc-inverter",
        "type": "equipment-card",
        "icon": "⚡",
        "title": "ממיר (אינוורטר)",
        "lines": [
          "{{inv}}",
          "אחריות יצרן: 10 שנים"
        ]
      },
      {
        "id": "wc-install",
        "type": "equipment-card",
        "icon": "🔧",
        "title": "עבודת התקנה",
        "lines": [
          "התקנה מקצועית על ידי צוות מוסמך",
          "אחריות: 5 שנים"
        ]
      },
      {
        "id": "wc-construct",
        "type": "equipment-card",
        "icon": "🛡️",
        "title": "קונסטרוקציה ותשתיות",
        "lines": [
          "נירוסטה, ברגים אירופאים, הגנות ברקים DC",
          "ציוד מיתוג ABB (שוויץ)"
        ]
      }
    ]
  },
  "spec": {
    "id": "spec",
    "type": "paragraphs",
    "title": "מפרט טכני",
    "region": "post-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "spec-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "פאנל מיצרן בדרג TIER 1 בהספק {{panelW}} וואט. יצרן הפאנל וההספק הסופי יקבעו בסיום התכנון."
          }
        ]
      },
      {
        "id": "spec-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "ממיר זרם תוצרת {{inv}} או שווה ערך."
          }
        ]
      },
      {
        "id": "spec-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "קונסטרוקציה מאלומיניום. ברגי נירוסטה."
          }
        ]
      },
      {
        "id": "spec-4",
        "type": "paragraph",
        "spans": [
          {
            "text": "מחברים PV PLUGS מתוצרת אירופאית/אמריקאית."
          }
        ]
      },
      {
        "id": "spec-5",
        "type": "paragraph",
        "spans": [
          {
            "text": "ציוד מיתוג — תוצרת ABB שוויץ או שווה ערך."
          }
        ]
      },
      {
        "id": "spec-6",
        "type": "paragraph",
        "spans": [
          {
            "text": "חיווט בתוך תעלות רשת מכוסות / צינורות."
          }
        ]
      },
      {
        "id": "spec-7",
        "type": "paragraph",
        "spans": [
          {
            "text": "אפליקציה לניטור ביצועי המערכת בסמארטפון ובמחשב."
          }
        ]
      },
      {
        "id": "spec-8",
        "type": "paragraph",
        "spans": [
          {
            "text": "הגנות ברקים DC + הגנה מרכזית למערכת."
          }
        ]
      }
    ]
  },
  "project-details": {
    "id": "project-details",
    "type": "paragraphs",
    "title": "פרטים נוספים על הפרויקט",
    "region": "post-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "add-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "עיצוב ותכנון המערכת במלואה כולל הדמיה ממוחשבת."
          }
        ]
      },
      {
        "id": "add-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "יוזמן אישור מהנדס מבנה/קונסטרוקטור למערכת על המבנה ע\"פ הצורך."
          }
        ]
      },
      {
        "id": "add-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "הספק הפאנלים יקבע ע\"פ כמות השטח בפועל ובהתאם לשיקולים מקצועיים. הפנלים המוצעים מאושרים להתקנה על ידי חח\"י."
          }
        ]
      },
      {
        "id": "add-4",
        "type": "paragraph",
        "spans": [
          {
            "text": "יסופקו ויותקנו מהפכים/ממיר מתח המאושרים על ידי חברת חשמל. מיקום המהפכים ייקבע ע\"פ תנאי השטח, תוך התחשבות באופי המבנה וכיווני זרימת האוויר."
          }
        ]
      },
      {
        "id": "add-5",
        "type": "paragraph",
        "spans": [
          {
            "text": "הקונסטרוקציה תיבנה על פי צרכי המתקן בשטח."
          }
        ]
      },
      {
        "id": "add-6",
        "type": "paragraph",
        "spans": [
          {
            "text": "ציוד עזר וחומרים נלווים: המחיר כולל בתוכו כבלים לזרם DC עמיד UV בעלי בידוד כפול, מוליכים, מובילים להנחת הכבלים, הארקות נדרשות, מפסקים וכל ציוד עזר הנדרש להפעלה מלאה של המערכת."
          }
        ]
      },
      {
        "id": "add-7",
        "type": "paragraph",
        "spans": [
          {
            "text": "פיקוח הנדסי: העבודה כולה תתבצע תחת פיקוח הנדסי צמוד, וכל שלב יאושר על ידי הגורם המוסמך לכך."
          }
        ]
      },
      {
        "id": "add-8",
        "type": "paragraph",
        "spans": [
          {
            "text": "במידה ונדרשת הגדלת חיבור, העבודה כוללת: עבודה בירוקרטית מול חברת החשמל, תכנון הנדסי, חפירת תוואי, הנחת כבל, התקנת גומחת בטון וארונות חשמל, העברת בדיקה."
          }
        ]
      }
    ]
  },
  "design": {
    "id": "design",
    "type": "paragraphs",
    "title": "עקרונות התכנון",
    "region": "post-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "design-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "יצירת מעברים תפעוליים:",
            "emphasis": "strong"
          },
          {
            "text": " גישה נוחה ובטוחה לתחזוקת המערכת לאורך השנים למיקסום תפוקה."
          }
        ]
      },
      {
        "id": "design-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "מרחק ממערכות נוספות:",
            "emphasis": "strong"
          },
          {
            "text": " נשמור על מרחק מאובייקטים שונים על הגג כמו מזגן, דוד שמש וצלחות לווין כדי לאפשר גישה נוחה למערכות נוספות ולהימנע מהצללה על הפאנלים."
          }
        ]
      },
      {
        "id": "design-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "מרחק מארובה:",
            "emphasis": "strong"
          },
          {
            "text": " הפיח והחום הנפלטים מארובה עלולים להזיק למערכת. נשמור על מרחק כדי לשמור על הפאנלים, אחריות היצרן ויכולת הייצור לאורך זמן."
          }
        ]
      },
      {
        "id": "design-4",
        "type": "paragraph",
        "spans": [
          {
            "text": "צמצום הצללות:",
            "emphasis": "strong"
          },
          {
            "text": " הצללות משפיעות באופן משמעותי על התפוקה וההכנסות מהמערכת, ונוצרות מאובייקטים כמו קירות, מבנים סמוכים וצמחיה. לכן נימנע מהצבת פאנלים במיקומים בעלי פוטנציאל הצללה גבוה."
          }
        ]
      },
      {
        "id": "design-5",
        "type": "paragraph",
        "spans": [
          {
            "text": "רעפים:",
            "emphasis": "strong"
          },
          {
            "text": " וידוא מרחק ביטחון מרוכב הגג, כדי לשמור על שלמות הרעפים וטיב האיטום."
          }
        ]
      },
      {
        "id": "design-6",
        "type": "paragraph",
        "spans": [
          {
            "text": "מרחק בין שורות (גג בטון):",
            "emphasis": "strong"
          },
          {
            "text": " שמירה על מרווח נכון בין השורות מונעת הצללות ומגדילה את הרווחים מהמערכת."
          }
        ]
      },
      {
        "id": "design-7",
        "type": "paragraph",
        "spans": [
          {
            "text": "זווית הפאנלים:",
            "emphasis": "strong"
          },
          {
            "text": " מתוכננת למאפייני הגג שלכם, כדי למקסם את החשיפה לשמש ותפוקת המערכת."
          }
        ]
      },
      {
        "id": "design-8",
        "type": "paragraph",
        "spans": [
          {
            "text": "אסתטיקה:",
            "emphasis": "strong"
          },
          {
            "text": " נבחר זווית התקנה אופטימלית לתפוקה של הפאנלים על פי המתאפשר בגג. נקפיד על תכנון התקנה מכאנית והולכות חשמל אטרקטיבית ככל הניתן."
          }
        ]
      }
    ]
  },
  "process": {
    "id": "process",
    "type": "process-steps",
    "title": "תהליך ההתקנה",
    "region": "post-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "proc-1",
        "type": "process-step",
        "title": "חתימה על ההסכם",
        "text": "חתימה דיגיטלית, תשלום מקדמה ותחילת הליך הרישוי"
      },
      {
        "id": "proc-2",
        "type": "process-step",
        "title": "תכנון הנדסי",
        "text": "סקר גג, הדמיה תלת-ממדית ותוכניות ביצוע מפורטות"
      },
      {
        "id": "proc-3",
        "type": "process-step",
        "title": "רישוי ואישורים",
        "text": "הגשת בקשה לרשות החשמל, אישור חיבור מחברת החשמל"
      },
      {
        "id": "proc-4",
        "type": "process-step",
        "title": "התקנה",
        "text": "התקנת קונסטרוקציה, פאנלים, אינוורטר וחיווט — יום עבודה אחד"
      },
      {
        "id": "proc-5",
        "type": "process-step",
        "title": "בדיקות וחיבור",
        "text": "בדיקת חשמלאי, חיבור לרשת החשמל והפעלת מערכת הניטור"
      }
    ]
  },
  "steps": {
    "id": "steps",
    "type": "paragraphs",
    "title": "סדר הפעולות לאחר חתימת ההסכם",
    "region": "post-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "steps-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "הגשת בקשה עקרונית לחברת חשמל לחיבור מערכת פוטו וולטאית + בקשה להגדלת חיבור / הזמנת חיבור חדש (במקרה של מבנה חדש)."
          }
        ]
      },
      {
        "id": "steps-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "הגשת תוכניות ואישורן על ידי חברת חשמל."
          }
        ]
      },
      {
        "id": "steps-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "אישור פריסת הפאנלים וההספק הסופי ע\"י הלקוח, קביעת הספק סופי + הפקת הזמנת עבודה מותאמת למפרט המוסכם ולהספק המדויק."
          }
        ]
      },
      {
        "id": "steps-4",
        "type": "paragraph",
        "spans": [
          {
            "text": "התקנת המערכת הסולארית על כל רכיביה (לרבות קולטים וממירים)."
          }
        ]
      },
      {
        "id": "steps-5",
        "type": "paragraph",
        "spans": [
          {
            "text": "בדיקת המערכת ע\"י חשמלאי בודק."
          }
        ]
      },
      {
        "id": "steps-6",
        "type": "paragraph",
        "spans": [
          {
            "text": "התקנת מונים ע\"י חברת חשמל וחיבור לרשת החשמל הארצית."
          }
        ]
      }
    ]
  },
  "warranty": {
    "id": "warranty",
    "type": "paragraphs",
    "title": "אחריות",
    "region": "post-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "warranty-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "חברת סמו א.ג.ס בע\"מ אחראית על ביצוע העבודה מתחילתה ועד סופה."
          }
        ]
      },
      {
        "id": "warranty-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "ממירים: אחריות יצרן במשך 10 שנים."
          }
        ]
      },
      {
        "id": "warranty-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "פאנלים פוטו-וולטאים: אחריות יצרן במשך 30 שנה."
          }
        ]
      },
      {
        "id": "warranty-4",
        "type": "paragraph",
        "spans": [
          {
            "text": "התקנה ועבודה: אחריות למשך 5 שנים ממועד סיום ההתקנה."
          }
        ]
      },
      {
        "id": "warranty-5",
        "type": "paragraph",
        "spans": [
          {
            "text": "האחריות אינה כוללת משלוח, פירוק, והרכבה לפאנלים תקולים."
          }
        ]
      }
    ]
  },
  "notes": {
    "id": "notes",
    "type": "paragraphs",
    "title": "הערות והגבלות",
    "region": "post-financial",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "note-1",
        "type": "paragraph",
        "spans": [
          {
            "text": "ההצעה איננה כוללת:",
            "emphasis": "strong"
          },
          {
            "text": " תשלום לרשויות ולחברת החשמל בגין אגרות (כ-1,200 ₪ + מע\"מ)."
          }
        ]
      },
      {
        "id": "note-2",
        "type": "paragraph",
        "spans": [
          {
            "text": "אמצעי עלייה לגג (כגון סולמות), קיר ו/או כלוב להתקנת הממירים."
          }
        ]
      },
      {
        "id": "note-3",
        "type": "paragraph",
        "spans": [
          {
            "text": "חיזוקי מבנה שיש לבצע על פי הנחיית קונסטרוקטור/מהנדס."
          }
        ]
      },
      {
        "id": "note-4",
        "type": "paragraph",
        "spans": [
          {
            "text": "תיקונים ושיפורים להארקת המבנה, ארונות חשמל ומערכת החשמל."
          }
        ]
      },
      {
        "id": "note-5",
        "type": "paragraph",
        "spans": [
          {
            "text": "חפירות והנחת מוליכים באדמה, תיקוני טייח, תיקוני אספלט ובטון לחפירה."
          }
        ]
      },
      {
        "id": "note-6",
        "type": "paragraph",
        "spans": [
          {
            "text": "על הלקוח לוודא הימצאות היתר בניה וטופס 4 למבנה שעליו מוקמת המערכת."
          }
        ]
      },
      {
        "id": "note-7",
        "type": "paragraph",
        "spans": [
          {
            "text": "באחריות הלקוח לדאוג לנקודת תקשורת אלחוטית או קווית במקום בו יותקן הממיר."
          }
        ]
      },
      {
        "id": "note-8",
        "type": "paragraph",
        "spans": [
          {
            "text": "חברת סמו א.ג.ס בע\"מ איננה אחראית למקרה של סירוב חברת החשמל, הרשות המקומית, רמ\"י או כל גורם שלישי אחר אשר עלול שלא לאשר ו/או לעכב את הקמת המתקן."
          }
        ]
      },
      {
        "id": "note-9",
        "type": "paragraph",
        "spans": [
          {
            "text": "חברת סמו א.ג.ס בע\"מ איננה אחראית לתעריף ייצור החשמל שיקבע לצרכן."
          }
        ]
      },
      {
        "id": "note-10",
        "type": "paragraph",
        "spans": [
          {
            "text": "שווי הפאנלים צמוד לשער הדולר ביום ההצעה."
          }
        ]
      },
      {
        "id": "note-11",
        "type": "paragraph",
        "spans": [
          {
            "text": "הזמנת העבודה שתופק מהווה אישרור להסכם לעלות הפרויקט המדויקת בהתאם לפריסת הפאנלים המאושרת והמפרט המוסכם ועל בסיס המחיר שמפורט בהצעת המחיר."
          }
        ]
      },
      {
        "id": "note-12",
        "type": "paragraph",
        "spans": [
          {
            "text": "תוקף ההצעה — 14 יום."
          }
        ]
      }
    ]
  },
  "terms": {
    "id": "terms",
    "type": "terms",
    "title": "תנאים כלליים",
    "region": "post-payment",
    "requiredIn": "both",
    "blocks": [
      {
        "id": "term-1",
        "type": "term",
        "spans": [
          {
            "text": "הצעה זו בתוקף למשך 14 יום מתאריך הנפקתה."
          }
        ]
      },
      {
        "id": "term-2",
        "type": "term",
        "spans": [
          {
            "text": "לכל הסכומים יצורף מע\"מ כחוק (18%)."
          }
        ]
      },
      {
        "id": "term-3",
        "type": "term",
        "spans": [
          {
            "text": "כל שינוי בהסכם ייעשה בכתב ובהסכמת שני הצדדים."
          }
        ]
      },
      {
        "id": "term-4",
        "type": "term",
        "spans": [
          {
            "text": "הסכם זה כפוף לדין הישראלי וסמכות השיפוט לבתי המשפט בישראל."
          }
        ]
      },
      {
        "id": "term-5",
        "type": "term",
        "spans": [
          {
            "text": "על הלקוח לוודא גישה תקינה לגג וחיבור חשמלי תקני."
          }
        ]
      },
      {
        "id": "term-6",
        "type": "term",
        "spans": [
          {
            "text": "ההצעה אינה כוללת: עבודות חשמל בלוח הראשי (ככל שנדרשות), חיזוק גג, גידור או פיגומים חיצוניים."
          }
        ]
      }
    ]
  }
};

const SOLAR_UPGRADES_INTRO = {
  "title": "שדרוגים (אופציונלי)",
  "subtitle": "ניתן לבחור שדרוגים — המחיר יתעדכן בהתאם:"
};

const SOLAR_POTENTIAL_INTRO = {
  "title": "הוצאות פוטנציאליות נוספות",
  "subtitle": "הוצאות אלו עשויות להידרש בהתאם לתנאי השטח. <strong>אינן כלולות בעלות הפרויקט</strong> — במידה ויידרש, הלקוח יחויב בהתאם:"
};

// ── the CALCULATED (priced) sections' customer-visible wording ─────────────────────────────────────
// These headings and sub-headings are part of what the customer document SAYS, so they belong to the
// editorial corpus — not to the contract builder or to a renderer. Sub-headings are STRUCTURED
// (spans, with an optional `emphasis`) because the canonical corpus must never carry raw HTML.
const SOLAR_CALC_TITLES = {
  "financials": "המערכת הסולארית במספרים",
  "upgrades-section": SOLAR_UPGRADES_INTRO.title,
  "price-breakdown": "פירוט מחיר ההצעה",
  "potential-costs": SOLAR_POTENTIAL_INTRO.title,
  "payment-section": "תנאי תשלום",
};

const SOLAR_CALC_SUBTITLES = {
  "upgrades-section": [
    { "text": "ניתן לבחור שדרוגים — המחיר יתעדכן בהתאם:" },
  ],
  "potential-costs": [
    { "text": "הוצאות אלו עשויות להידרש בהתאם לתנאי השטח. " },
    { "text": "אינן כלולות בעלות הפרויקט", "emphasis": "strong" },
    { "text": " — במידה ויידרש, הלקוח יחויב בהתאם:" },
  ],
};

// ── document-semantic LABELS ───────────────────────────────────────────────────────────────────────
// Every customer-visible label that names a calculated value. One authoritative location: a renderer
// or mapper that needs one of these reads it from the resolved corpus, never from its own literal.
const SOLAR_LABELS = {
  // system specification rows
  "sys.type": "סוג מערכת",
  "sys.dc_kw": "הספק DC",
  "sys.ac_kw": "הספק AC",
  "sys.panels": "פאנלים",
  "sys.roof": "סוג גג",
  "sys.roof_area": "שטח גג",
  "sys.connection": "גודל חיבור",
  "sys.inverter": "ממיר",
  "sys.production": "ייצור שנתי מוערך",
  // financial summary
  "fin.plan.name": "מסלול תעריף",
  "fin.plan.rateNote": "מבנה תעריף",
  "fin.annualIncome": "הכנסה שנתית",
  "fin.totalIncome": "הכנסה מצטברת",
  "fin.avg": "ממוצע שנתי",
  "fin.priceExcl": "עלות המערכת · לא כולל מע״מ",
  "fin.priceIncl": "עלות המערכת · כולל מע״מ",
  "fin.profit": "רווח נקי מוערך",
  "fin.roi": "תשואה שנה 1",
  "fin.payback": "החזר השקעה",
  // price breakdown
  "price.base": "מערכת בסיסית (turnkey)",
  "price.meter": "לוח מונה ייצור",
  "price.projectTotal": "סה״כ לפני מע״מ",
  "price.projectTotalVat": "סה״כ כולל מע״מ",
  // print table column headers (the PDF renders the optional-costs table as a table)
  "table.item": "פריט",
  "table.price": "מחיר (₪)",
  // payments
  "pay.total": "סה״כ",
  // renderer section headings that name a calculated group (customer-visible document wording)
  "section.systemSpec": "פרטי מערכת",
  "section.controls": "הבחירות שלך",
  // customer controls
  "ctrl.plan": "מסלול תעריף",
  "ctrl.sunHours": "שעות שמש שנתיות",
  "ctrl.inflationPct": "אחוז אינפלציה",
  "ctrl.vatDisplay": "תצוגת מחיר",
  "ctrl.upgrades": "שדרוגים נבחרים",
  "ctrl.battQty": "כמות בטריות",
};

// ── document-semantic PHRASES / units ──────────────────────────────────────────────────────────────
// Sentences, unit suffixes and enumerated control values that the customer reads. `{{…}}` tokens are
// resolved by solar-content-resolve exactly like editorial text.
const SOLAR_PHRASES = {
  "dash": "—",
  "urbanPremium": "יישוב {{city}} זכאי לפרמייה אורבנית — תוספת 6 אג׳ לכל קוט״ש מיוצר, בתוקף ל-15 השנים הראשונות.",
  "meterIncludeItem": "לוח מונה ייצור",
  "processTimeline": "* לוח זמנים צפוי: עד 60 ימי עסקים מחתימת ההסכם",
  "unit.kw": "קילו-וואט",
  "unit.sqm": "מ״ר",
  "unit.kwhPerYear": "קוט״ש/שנה",
  "unit.years": "שנים",
  "unit.hours": "שעות",
  "connection.nominal": "נומ׳",
  "plan.green": "מסלול ירוק",
  "plan.regular": "מסלול רגיל",
  "plan.fast": "החזר מהיר",
  "plan.index": "צמוד מדד",
  "vat.incl": "כולל מע״מ",
  "vat.excl": "לא כולל מע״מ",
  "upgrades.none": "אין",
};

const SOLAR_PAYMENT_DESCRIPTIONS = [
  {
    "id": "pay-1",
    "title": "מקדמה",
    "text": "בחתימת ההסכם"
  },
  {
    "id": "pay-2",
    "title": "השלמה ל-35%",
    "text": "בקבלת תוכניות ביצוע"
  },
  {
    "id": "pay-3",
    "title": "השלמה ל-95%",
    "text": "7 ימי עסקים בטרם אספקת פאנלים לאתר"
  },
  {
    "id": "pay-4",
    "title": "5% אחרון",
    "text": "ביום החיבור לחברת החשמל"
  }
];

const api = {
  SOLAR_CONTENT_VERSION,
  SOLAR_SECTION_ORDER,
  SOLAR_SECTIONS,
  SOLAR_UPGRADES_INTRO,
  SOLAR_POTENTIAL_INTRO,
  SOLAR_PAYMENT_DESCRIPTIONS,
  SOLAR_CALC_TITLES,
  SOLAR_CALC_SUBTITLES,
  SOLAR_LABELS,
  SOLAR_PHRASES,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.SolarContentBlocks = api;
