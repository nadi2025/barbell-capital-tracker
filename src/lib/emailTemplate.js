/**
 * emailTemplate — placeholder engine for investor email templates.
 *
 * Placeholders use the {variable_name} syntax and are replaced case-sensitively.
 * Unknown placeholders are left as-is so the user notices them.
 */

/**
 * Replace all {key} placeholders in `text` with values from `vars`.
 * @param {string} text
 * @param {Record<string, string | number>} vars
 */
export function renderTemplate(text, vars) {
  if (!text) return "";
  return text.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const v = vars[key];
      return v == null ? "" : String(v);
    }
    return match;
  });
}

/**
 * All supported placeholders — displayed in the template editor for reference.
 */
export const AVAILABLE_PLACEHOLDERS = [
  { key: "investor_name", desc: "שם פרטי של המשקיע" },
  { key: "principal", desc: "סכום קרן (מפורמט עם סימן מטבע)" },
  { key: "principal_raw", desc: "סכום קרן (מספר בלבד)" },
  { key: "currency", desc: "מטבע (USD/ILS/EUR)" },
  { key: "currency_symbol", desc: "סמל מטבע ($/₪/€)" },
  { key: "interest_rate", desc: "ריבית שנתית (%)" },
  { key: "interest_type", desc: "סוג ריבית (Simple/Compound)" },
  { key: "start_date", desc: "תאריך השקעה (DD/MM/YYYY)" },
  { key: "maturity_date", desc: "תאריך פדיון (DD/MM/YYYY)" },
  { key: "days_elapsed", desc: "ימים שחלפו מתחילת ההשקעה" },
  { key: "accrued_interest", desc: "ריבית שנצברה (מפורמט)" },
  { key: "total_paid", desc: "סה״כ שולם עד היום (מפורמט)" },
  { key: "current_balance", desc: "יתרה נוכחית — קרן + ריבית − שולם" },
  { key: "today_date", desc: "תאריך היום (DD/MM/YYYY)" },
  { key: "linked_investment", desc: "שם ההשקעה המשויכת" },
];

/**
 * Default template — used when no template is saved in the DB yet.
 */
export const DEFAULT_SUBJECT_TEMPLATE = "עדכון תקופתי על השקעתך – אואסיס פרויקט ג׳";

export const DEFAULT_BODY_TEMPLATE = `{investor_name} שלום רב,

שמחים לעדכן אותך על מצב השקעתך דרך חברת אואסיס פרויקט ג׳ בע״מ.

פרטי ההשקעה:
סכום השקעה מקורי: {principal}
תאריך השקעה: {start_date}
תאריך פדיון: {maturity_date}
ריבית שנתית: {interest_rate}% ({interest_type})

נכון ל-{today_date}, שווי ההשקעה הנוכחי – הכולל את הקרן ואת הריבית שנצברה – עומד על {current_balance}, המשקף רווח מצטבר של {accrued_interest} מאז תחילת ההשקעה ({days_elapsed} ימים).

אנחנו כאן לכל שאלה או בקשה, ונמשיך לעדכן אותך באופן שוטף.

בברכה,
צוות אואסיס פרויקט ג׳`;

export const PRIVATE_TEMPLATE_KEY = "private_investor_update";