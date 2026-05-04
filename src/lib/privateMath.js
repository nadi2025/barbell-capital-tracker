/**
 * privateMath — isolated calculation utilities for the Private Investments
 * module.
 *
 * IMPORTANT: This module is intentionally isolated from the rest of the app's
 * calculations. It MUST NOT be imported by anything outside `src/pages/private/`
 * or `src/components/private/`. Specifically, `dashboardCalcs.jsx`,
 * `useDashboardData.js`, `portfolioMath.js`, and `optionsHelpers.js` do not and
 * must not depend on this file. The Private Investments module is a separate
 * capital stream from the main IB / crypto streams; mixing the math here back
 * into the main dashboard would defeat the isolation guarantee.
 *
 * All functions accept plain entity arrays as inputs and return plain numbers
 * or arrays — no React hooks, no side effects.
 */

import { addMonths, addQuarters, addYears, isAfter, isBefore, parseISO } from "date-fns";

// TODO: make configurable — currently hardcoded for simplicity. Move to a
// settings entity or env-var when the module graduates from "internal tool".
const DEFAULT_FX_ILS_TO_USD = 3.7;

/**
 * Convert a value from a given currency to USD using the supplied FX rate.
 */
export function toUsd(value, currency, fxIlsToUsd = DEFAULT_FX_ILS_TO_USD) {
  const v = Number(value) || 0;
  if (!currency || currency === "USD") return v;
  if (currency === "ILS") return v / (fxIlsToUsd || DEFAULT_FX_ILS_TO_USD);
  return v;
}

/**
 * Format a numeric value as a localized currency string.
 */
export function fmtCurrency(value, currency = "USD", decimals = 0) {
  if (value == null || isNaN(value)) return currency === "ILS" ? "₪0" : "$0";
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const isActive = (i) => i?.status === "Active";

/**
 * Total current_value of all active private investments, summed in USD.
 */
export function calcPrivateTotalValue(investments = [], fxIlsToUsd = DEFAULT_FX_ILS_TO_USD) {
  return investments
    .filter(isActive)
    .reduce((sum, i) => sum + toUsd(i.current_value, i.currency, fxIlsToUsd), 0);
}

/**
 * Total initial_cost of active investments, in USD.
 */
export function calcPrivateTotalCost(investments = [], fxIlsToUsd = DEFAULT_FX_ILS_TO_USD) {
  return investments
    .filter(isActive)
    .reduce((sum, i) => sum + toUsd(i.initial_cost, i.currency, fxIlsToUsd), 0);
}

/**
 * Unrealized P&L = current_value - initial_cost on active investments, USD.
 */
export function calcPrivateUnrealizedPnl(investments = [], fxIlsToUsd = DEFAULT_FX_ILS_TO_USD) {
  return calcPrivateTotalValue(investments, fxIlsToUsd) - calcPrivateTotalCost(investments, fxIlsToUsd);
}

/**
 * Outstanding principal across active private debt investors, in USD.
 */
export function calcPrivateDebtOutstanding(investors = [], fxIlsToUsd = DEFAULT_FX_ILS_TO_USD) {
  return investors
    .filter(isActive)
    .reduce((sum, inv) => sum + toUsd(inv.principal, inv.currency, fxIlsToUsd), 0);
}

/**
 * Return scheduled payments due within the next `daysAhead` days, sorted
 * ascending by payment_date.
 */
export function getUpcomingPayments(payments = [], daysAhead = 90) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysAhead);
  return payments
    .filter((p) => p.status === "Scheduled" && p.payment_date)
    .filter((p) => {
      const d = parseISO(p.payment_date);
      return !isAfter(d, cutoff) && !isBefore(d, now);
    })
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date));
}

/**
 * Given a PrivateDebtInvestor, project the dates of all future scheduled
 * payments between today and maturity_date based on their payment_frequency.
 *
 * Returns an array of `{ date: Date, amount: number, currency: string }`. The
 * amount is the accrued interest for one period at the investor's rate. If
 * frequency is "At Maturity", returns a single entry on maturity_date with the
 * total interest for the full term.
 */
export function projectScheduledPayments(investor) {
  if (!investor || !investor.start_date || !investor.maturity_date) return [];
  const principal = Number(investor.principal) || 0;
  const annualRate = (Number(investor.interest_rate) || 0) / 100;
  const start = parseISO(investor.start_date);
  const maturity = parseISO(investor.maturity_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const out = [];
  if (investor.payment_frequency === "At Maturity") {
    if (!isBefore(maturity, today)) {
      const years = (maturity - start) / (1000 * 60 * 60 * 24 * 365.25);
      const totalInterest = principal * annualRate * Math.max(0, years);
      out.push({
        date: maturity,
        amount: totalInterest,
        currency: investor.currency || "USD",
      });
    }
    return out;
  }

  const periodsPerYear = investor.payment_frequency === "Monthly" ? 12
    : investor.payment_frequency === "Quarterly" ? 4
    : investor.payment_frequency === "Annual" ? 1
    : 12;
  const stepFn = investor.payment_frequency === "Monthly" ? (d) => addMonths(d, 1)
    : investor.payment_frequency === "Quarterly" ? (d) => addQuarters(d, 1)
    : (d) => addYears(d, 1);

  const perPeriod = principal * (annualRate / periodsPerYear);

  let cursor = stepFn(start);
  // Cap to avoid runaway loops on bad data.
  for (let i = 0; i < 600; i++) {
    if (isAfter(cursor, maturity)) break;
    if (!isBefore(cursor, today)) {
      out.push({
        date: cursor,
        amount: perPeriod,
        currency: investor.currency || "USD",
      });
    }
    cursor = stepFn(cursor);
  }
  return out;
}
