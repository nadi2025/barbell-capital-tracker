/**
 * fxMath — isolated calculations for the FX Hedging module.
 * Does NOT touch dashboardCalcs / portfolioMath / useDashboardData.
 * All functions are pure.
 */

import { parseISO, differenceInCalendarDays } from "date-fns";

/** Parse an ISO date string defensively. Returns null on bad input. */
function safeParse(d) {
  if (!d) return null;
  try {
    const p = typeof d === "string" ? parseISO(d) : new Date(d);
    if (isNaN(p.getTime())) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * Derive the effective status of a transaction at a reference date.
 * - CANCELLED stays CANCELLED.
 * - SETTLED stays SETTLED.
 * - OPEN stays OPEN until value_date passes (then automatically considered SETTLED).
 * - manual_close_date overrides and forces SETTLED.
 */
export function deriveStatus(tx, refDate = new Date()) {
  if (!tx) return "OPEN";
  if (tx.status === "CANCELLED") return "CANCELLED";
  if (tx.status === "SETTLED") return "SETTLED";
  if (tx.manual_close_date) {
    const d = safeParse(tx.manual_close_date);
    if (d && d <= refDate) return "SETTLED";
  }
  const vd = safeParse(tx.value_date);
  if (vd && vd < refDate) return "SETTLED";
  return "OPEN";
}

/** Days remaining until value_date. Negative if past. Null if unknown. */
export function daysToMaturity(tx, refDate = new Date()) {
  const vd = safeParse(tx?.value_date);
  if (!vd) return null;
  return differenceInCalendarDays(vd, refDate);
}

/**
 * Build a map of latest rates per pair: { "EURUSD": 1.1776, ... }.
 * Picks the most recent rate_date per pair.
 */
export function buildRatesMap(rates) {
  const map = {};
  const latestDate = {};
  for (const r of rates || []) {
    if (!r?.pair || r.rate == null) continue;
    const d = safeParse(r.rate_date);
    if (!d) continue;
    if (!latestDate[r.pair] || d > latestDate[r.pair]) {
      latestDate[r.pair] = d;
      map[r.pair] = r.rate;
    }
  }
  return map;
}

/**
 * Unrealized P&L in the QUOTE currency.
 * For SELL base: profit when current_rate < locked_rate (we locked higher).
 *   pnl_quote = base_amount * (locked_rate - current_rate)
 * For BUY base: profit when current_rate > locked_rate (we locked lower).
 *   pnl_quote = base_amount * (current_rate - locked_rate)
 */
export function calcUnrealizedPnl(tx, currentRate) {
  if (!tx || currentRate == null || tx.locked_rate == null || tx.base_amount == null) return null;
  const base = Number(tx.base_amount);
  const locked = Number(tx.locked_rate);
  const cur = Number(currentRate);
  if (!isFinite(base) || !isFinite(locked) || !isFinite(cur)) return null;
  const sign = tx.direction === "SELL" ? 1 : -1;
  return sign * base * (locked - cur);
}

/** P&L expressed as % of locked notional (quote_amount). */
export function calcUnrealizedPnlPct(tx, currentRate) {
  const pnl = calcUnrealizedPnl(tx, currentRate);
  if (pnl == null || !tx?.quote_amount) return null;
  const q = Number(tx.quote_amount);
  if (!isFinite(q) || q === 0) return null;
  return (pnl / Math.abs(q)) * 100;
}

/**
 * Net exposure per currency from OPEN transactions.
 * BUY base: +base in base ccy, -quote in quote ccy.
 * SELL base: -base in base ccy, +quote in quote ccy.
 */
export function calcNetExposure(transactions, refDate = new Date()) {
  const out = {};
  for (const tx of transactions || []) {
    if (deriveStatus(tx, refDate) !== "OPEN") continue;
    const base = Number(tx.base_amount) || 0;
    const quote = Number(tx.quote_amount) || 0;
    const sign = tx.direction === "BUY" ? 1 : -1;
    out[tx.base_currency] = (out[tx.base_currency] || 0) + sign * base;
    out[tx.quote_currency] = (out[tx.quote_currency] || 0) - sign * quote;
  }
  // Drop near-zero
  Object.keys(out).forEach((k) => {
    if (Math.abs(out[k]) < 0.01) delete out[k];
  });
  return out;
}

/**
 * Total unrealized P&L bucketed by the QUOTE currency of each open transaction.
 * Returns { USD: 1234.5, ILS: -987.0 }
 */
export function calcTotalUnrealizedPnl(transactions, ratesMap, refDate = new Date()) {
  const out = {};
  for (const tx of transactions || []) {
    if (deriveStatus(tx, refDate) !== "OPEN") continue;
    const pair = `${tx.base_currency}${tx.quote_currency}`;
    const cur = ratesMap?.[pair];
    if (cur == null) continue;
    const pnl = calcUnrealizedPnl(tx, cur);
    if (pnl == null) continue;
    out[tx.quote_currency] = (out[tx.quote_currency] || 0) + pnl;
  }
  return out;
}

/** Find a linked swap transaction by reference. */
export function findLinkedTransaction(tx, allTransactions) {
  if (!tx?.linked_to_reference) return null;
  return (allTransactions || []).find((t) => t.reference === tx.linked_to_reference) || null;
}

/**
 * Build an MTM time-series for a single transaction using historical rates
 * for its pair. Returns [{ date, pnl }] sorted ascending.
 */
export function buildMtmSeries(transaction, rates) {
  if (!transaction) return [];
  const pair = `${transaction.base_currency}${transaction.quote_currency}`;
  const filtered = (rates || [])
    .filter((r) => r?.pair === pair && r.rate_date && r.rate != null)
    .map((r) => ({ date: r.rate_date, rate: Number(r.rate) }))
    .filter((r) => isFinite(r.rate));

  // Dedup by date — keep last
  const byDate = {};
  for (const r of filtered) byDate[r.date] = r.rate;
  const points = Object.entries(byDate)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, rate]) => ({
      date,
      pnl: calcUnrealizedPnl(transaction, rate) ?? 0,
    }));

  return points;
}

// ───────────────────────────── Formatters ─────────────────────────────

/** Format a number as currency with the given ISO code suffix. */
export function fmtCurrency(value, currency = "USD", digits = 2) {
  if (value == null || !isFinite(value)) return "—";
  const formatted = Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${formatted} ${currency}`;
}

/** Format a rate (4 decimals by default). */
export function fmtRate(value, digits = 4) {
  if (value == null || !isFinite(value)) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}