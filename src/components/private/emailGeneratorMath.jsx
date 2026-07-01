/**
 * emailGeneratorMath — pure helpers for the investor email update generator.
 *
 * Simple interest on actual/365 basis:
 *   accrued = principal * rate * daysElapsed / 365
 *   balance = principal + accrued - totalPaid
 */

import { differenceInDays, parseISO, format } from "date-fns";
import { renderTemplate, DEFAULT_BODY_TEMPLATE, DEFAULT_SUBJECT_TEMPLATE } from "@/lib/emailTemplate";

const SYMBOL = { USD: "$", ILS: "₪", EUR: "€" };

export function fmtAmount(value, currency = "USD") {
  const v = Number(value) || 0;
  const sym = SYMBOL[currency] || "";
  return `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDateDMY(date) {
  if (!date) return "";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "dd/MM/yyyy");
}

/**
 * Compute the accrued interest & current balance for a single investor row.
 * Returns null if start_date is missing.
 */
export function computeInvestorAccrual(investor, payments = [], asOf = new Date()) {
  if (!investor) return null;
  if (!investor.start_date) {
    return { missingStartDate: true, investor };
  }
  const principal = Number(investor.principal) || 0;
  const annualRate = (Number(investor.interest_rate) || 0) / 100;
  const start = parseISO(investor.start_date);
  const daysElapsed = Math.max(0, differenceInDays(asOf, start));
  const accrued = principal * annualRate * (daysElapsed / 365);

  const totalPaid = payments
    .filter((p) => p.investor_id === investor.id && p.status === "Paid")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const balance = principal + accrued - totalPaid;

  return {
    investor,
    principal,
    currency: investor.currency || "USD",
    interestRate: Number(investor.interest_rate) || 0,
    startDate: investor.start_date,
    daysElapsed,
    accrued,
    totalPaid,
    balance,
    missingStartDate: false,
  };
}

/**
 * Aggregate accruals for all investments of a given investor name, grouped by
 * currency. Each currency group sums independently (no FX mixing).
 */
export function aggregateByCurrency(accruals) {
  const groups = {};
  accruals.forEach((a) => {
    if (!a || a.missingStartDate) return;
    const c = a.currency;
    if (!groups[c]) {
      groups[c] = {
        currency: c,
        principal: 0,
        accrued: 0,
        totalPaid: 0,
        balance: 0,
        earliestStart: a.startDate,
        weightedRateNum: 0,
        weightedRateDen: 0,
        daysElapsed: 0,
      };
    }
    const g = groups[c];
    g.principal += a.principal;
    g.accrued += a.accrued;
    g.totalPaid += a.totalPaid;
    g.balance += a.balance;
    g.weightedRateNum += a.interestRate * a.principal;
    g.weightedRateDen += a.principal;
    if (a.startDate < g.earliestStart) g.earliestStart = a.startDate;
    if (a.daysElapsed > g.daysElapsed) g.daysElapsed = a.daysElapsed;
  });
  return Object.values(groups).map((g) => ({
    ...g,
    weightedRate: g.weightedRateDen > 0 ? g.weightedRateNum / g.weightedRateDen : 0,
  }));
}

/**
 * Build the email body. Single-investment case or aggregated/multi-currency.
 */
export function buildEmailBody({ investorName, items, todayDate }) {
  const today = fmtDateDMY(todayDate);
  const greeting = `${investorName} שלום רב,`;
  const intro = `שמחים לעדכן אותך על מצב השקעתך דרך חברת אואסיס פרויקט ג׳ בע״מ.`;
  const sign = `אנחנו כאן לכל שאלה או בקשה, ונמשיך לעדכן אותך באופן שוטף.\n\nבברכה,\nצוות אואסיס פרויקט ג׳`;

  // Single-currency single-block format (matches template verbatim)
  if (items.length === 1) {
    const it = items[0];
    return [
      greeting,
      "",
      intro,
      "",
      "פרטי ההשקעה:",
      `סכום השקעה מקורי: ${fmtAmount(it.principal, it.currency)}`,
      `תאריך השקעה: ${fmtDateDMY(it.startDate || it.earliestStart)}`,
      `ריבית שנתית: ${(it.interestRate ?? it.weightedRate).toFixed(2)}%`,
      "",
      `נכון ל-${today}, שווי ההשקעה הנוכחי – הכולל את הקרן ואת הריבית שנצברה – עומד על ${fmtAmount(it.balance, it.currency)}, המשקף רווח מצטבר של ${fmtAmount(it.accrued, it.currency)} מאז תחילת ההשקעה.`,
      "",
      sign,
    ].join("\n");
  }

  // Multi-currency aggregated format
  const blocks = items.map((it) => [
    `— השקעה במטבע ${it.currency} —`,
    `סכום השקעה מקורי: ${fmtAmount(it.principal, it.currency)}`,
    `תאריך השקעה: ${fmtDateDMY(it.earliestStart || it.startDate)}`,
    `ריבית שנתית: ${(it.weightedRate ?? it.interestRate).toFixed(2)}%`,
    `שווי נוכחי (כולל ריבית): ${fmtAmount(it.balance, it.currency)}`,
    `רווח מצטבר: ${fmtAmount(it.accrued, it.currency)}`,
  ].join("\n")).join("\n\n");

  return [
    greeting,
    "",
    intro,
    "",
    "פרטי ההשקעות:",
    blocks,
    "",
    `נכון ל-${today}, להלן סיכום מצב השקעותיך.`,
    "",
    sign,
  ].join("\n");
}

export const EMAIL_SUBJECT = "עדכון תקופתי על השקעתך – אואסיס פרויקט ג׳";

/**
 * Build the variable dictionary used to fill an email template for a single
 * investor / single investment. When `item` aggregates several investments
 * (multi-currency), most single-value placeholders fall back to the first
 * currency block — the multi-currency scenario keeps using buildEmailBody().
 */
export function buildTemplateVars({ investorName, item, todayDate, investor }) {
  const rate = item?.interestRate ?? item?.weightedRate ?? 0;
  const currency = item?.currency || "USD";
  return {
    investor_name: investorName || "",
    principal: fmtAmount(item?.principal, currency),
    principal_raw: (Number(item?.principal) || 0).toString(),
    currency,
    currency_symbol: SYMBOL[currency] || "",
    interest_rate: Number(rate).toFixed(2),
    interest_type: investor?.interest_type || "Simple",
    start_date: fmtDateDMY(item?.startDate || item?.earliestStart),
    maturity_date: fmtDateDMY(investor?.maturity_date),
    days_elapsed: String(item?.daysElapsed ?? 0),
    accrued_interest: fmtAmount(item?.accrued, currency),
    total_paid: fmtAmount(item?.totalPaid, currency),
    current_balance: fmtAmount(item?.balance, currency),
    today_date: fmtDateDMY(todayDate),
    linked_investment: investor?.linked_investment_name || "",
  };
}

/**
 * Render the email using a saved template (subject + body), or fall back to
 * the built-in defaults. For a single investment only — multi-currency
 * aggregated emails continue to use buildEmailBody().
 */
export function renderEmailFromTemplate({ investorName, item, todayDate, investor, template }) {
  const vars = buildTemplateVars({ investorName, item, todayDate, investor });
  const subjectTpl = template?.subject_template || DEFAULT_SUBJECT_TEMPLATE;
  const bodyTpl = template?.body_template || DEFAULT_BODY_TEMPLATE;
  return {
    subject: renderTemplate(subjectTpl, vars),
    body: renderTemplate(bodyTpl, vars),
  };
}