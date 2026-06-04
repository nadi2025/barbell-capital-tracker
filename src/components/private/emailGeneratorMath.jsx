/**
 * emailGeneratorMath — pure helpers for the investor email update generator.
 *
 * Simple interest on actual/365 basis:
 *   accrued = principal * rate * daysElapsed / 365
 *   balance = principal + accrued - totalPaid
 */

import { differenceInDays, parseISO, format } from "date-fns";

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