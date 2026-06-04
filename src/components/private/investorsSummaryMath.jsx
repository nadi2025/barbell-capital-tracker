/**
 * investorsSummaryMath — pure calculation helpers for the Private Debt
 * Investors summary dashboard. Scoped to the PrivateInvestorsPage.
 *
 * All "USD" calculations rely on each investor's stored `fx_rate_at_conversion`
 * when available (for ILS/EUR). When missing, fall back to default rates.
 */

import { addDays, differenceInDays, isBefore, parseISO } from "date-fns";

const DEFAULT_FX = { ILS: 3.7, EUR: 0.92, USD: 1 };

export function toUsdInvestor(inv) {
  if (!inv) return 0;
  const p = Number(inv.principal) || 0;
  const cur = inv.currency || "USD";
  if (cur === "USD") return p;
  const fx = Number(inv.fx_rate_at_conversion) || DEFAULT_FX[cur] || 1;
  return p / fx;
}

export function toUsdAmount(amount, currency, fxRate) {
  const v = Number(amount) || 0;
  if (!currency || currency === "USD") return v;
  const fx = Number(fxRate) || DEFAULT_FX[currency] || 1;
  return v / fx;
}

export function fmtMoney(value, currency = "USD", decimals = 0) {
  if (value == null || isNaN(value)) value = 0;
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Build the global summary (USD-converted) from enriched investor rows.
 * Each row must already have: principal, currency, interest_rate,
 * fx_rate_at_conversion, totalPaid, projectedTotal, nextDate, status, name.
 */
export function buildGlobalSummary(rows) {
  const usdPrincipals = rows.map((r) => toUsdInvestor(r));
  const totalPrincipalUsd = usdPrincipals.reduce((s, v) => s + v, 0);

  const uniqueInvestors = new Set(rows.map((r) => (r.name || "").trim().toLowerCase()).filter(Boolean)).size;
  const activeCount = rows.filter((r) => r.status === "Active").length;

  // Weighted average rate (weighted by USD principal)
  const weightedRate = totalPrincipalUsd > 0
    ? rows.reduce((s, r, i) => s + (Number(r.interest_rate) || 0) * usdPrincipals[i], 0) / totalPrincipalUsd
    : 0;

  const projectedUsd = rows.reduce(
    (s, r) => s + toUsdAmount(r.projectedTotal, r.currency, r.fx_rate_at_conversion),
    0,
  );
  const paidUsd = rows.reduce(
    (s, r) => s + toUsdAmount(r.totalPaid, r.currency, r.fx_rate_at_conversion),
    0,
  );

  // Per-currency principal breakdown (native amount)
  const byCurrency = {};
  rows.forEach((r) => {
    const c = r.currency || "USD";
    byCurrency[c] = (byCurrency[c] || 0) + (Number(r.principal) || 0);
  });

  return {
    totalPrincipalUsd,
    uniqueInvestors,
    positions: rows.length,
    activeCount,
    weightedRate,
    projectedUsd,
    paidUsd,
    remainingUsd: projectedUsd - paidUsd,
    byCurrency,
  };
}

/**
 * Per-currency breakdown — separate card for each currency present.
 */
export function buildCurrencyBreakdown(rows) {
  const groups = {};
  rows.forEach((r) => {
    const c = r.currency || "USD";
    if (!groups[c]) groups[c] = [];
    groups[c].push(r);
  });

  return Object.entries(groups).map(([currency, group]) => {
    const totalPrincipal = group.reduce((s, r) => s + (Number(r.principal) || 0), 0);
    const projected = group.reduce((s, r) => s + (Number(r.projectedTotal) || 0), 0);
    const paid = group.reduce((s, r) => s + (Number(r.totalPaid) || 0), 0);
    const uniqueInvestors = new Set(group.map((r) => (r.name || "").trim().toLowerCase()).filter(Boolean)).size;
    const weightedRate = totalPrincipal > 0
      ? group.reduce((s, r) => s + (Number(r.interest_rate) || 0) * (Number(r.principal) || 0), 0) / totalPrincipal
      : 0;
    const avgPrincipal = group.length > 0 ? totalPrincipal / group.length : 0;

    return {
      currency,
      totalPrincipal,
      uniqueInvestors,
      positions: group.length,
      weightedRate,
      projected,
      paid,
      remaining: projected - paid,
      avgPrincipal,
    };
  }).sort((a, b) => b.totalPrincipal - a.totalPrincipal);
}

/**
 * Maturity buckets: 30 / 60 / 90 days, next year, later. Principal in USD.
 */
export function buildMaturityBuckets(rows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = {
    "30d": { label: "30 ימים", days: 30, usd: 0, count: 0 },
    "60d": { label: "60 ימים", days: 60, usd: 0, count: 0 },
    "90d": { label: "90 ימים", days: 90, usd: 0, count: 0 },
    "1y": { label: "שנה", days: 365, usd: 0, count: 0 },
    later: { label: "מעל שנה", days: Infinity, usd: 0, count: 0 },
  };

  rows.forEach((r) => {
    if (!r.maturity_date) return;
    const m = parseISO(r.maturity_date);
    const days = differenceInDays(m, today);
    if (days < 0) return; // already matured
    const usd = toUsdInvestor(r);
    if (days <= 30) { buckets["30d"].usd += usd; buckets["30d"].count++; }
    else if (days <= 60) { buckets["60d"].usd += usd; buckets["60d"].count++; }
    else if (days <= 90) { buckets["90d"].usd += usd; buckets["90d"].count++; }
    else if (days <= 365) { buckets["1y"].usd += usd; buckets["1y"].count++; }
    else { buckets.later.usd += usd; buckets.later.count++; }
  });

  return buckets;
}

/**
 * Upcoming payments — next 5 across all investors, with overdue flagged.
 */
export function buildUpcomingPayments(rows, limit = 5) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items = [];
  rows.forEach((r) => {
    if (!r.nextDate || !r.nextAmount) return;
    items.push({
      investorName: r.name,
      date: r.nextDate,
      amount: r.nextAmount,
      currency: r.currency || "USD",
      overdue: isBefore(r.nextDate, today),
    });
  });
  items.sort((a, b) => a.date - b.date);
  return items.slice(0, limit);
}

/**
 * Distributions: by frequency, by linked investment, by currency (USD), by status.
 */
export function buildDistributions(rows) {
  const byFrequency = {};
  const byLinked = {};
  const byCurrencyUsd = {};
  const byStatus = {};
  const totalUsd = rows.reduce((s, r) => s + toUsdInvestor(r), 0);

  rows.forEach((r) => {
    const usd = toUsdInvestor(r);

    const freq = r.payment_frequency || "—";
    byFrequency[freq] = byFrequency[freq] || { count: 0, usd: 0 };
    byFrequency[freq].count++;
    byFrequency[freq].usd += usd;

    const linked = r.linked_investment_name?.trim() || "ללא קישור";
    byLinked[linked] = byLinked[linked] || { count: 0, usd: 0 };
    byLinked[linked].count++;
    byLinked[linked].usd += usd;

    const cur = r.currency || "USD";
    byCurrencyUsd[cur] = (byCurrencyUsd[cur] || 0) + usd;

    const st = r.status || "—";
    byStatus[st] = (byStatus[st] || 0) + 1;
  });

  return { byFrequency, byLinked, byCurrencyUsd, byStatus, totalUsd };
}

/**
 * Concentration risk + portfolio extremes (in USD).
 */
export function buildConcentration(rows) {
  const totals = rows.map((r) => ({ name: r.name, currency: r.currency, principal: r.principal, usd: toUsdInvestor(r) }))
    .sort((a, b) => b.usd - a.usd);
  const totalUsd = totals.reduce((s, r) => s + r.usd, 0);
  const top1 = totals[0]?.usd || 0;
  const top3 = totals.slice(0, 3).reduce((s, r) => s + r.usd, 0);
  const largest = totals[0] || null;
  const smallest = totals[totals.length - 1] || null;
  const avgUsd = totals.length > 0 ? totalUsd / totals.length : 0;

  return {
    top1Pct: totalUsd > 0 ? (top1 / totalUsd) * 100 : 0,
    top3Pct: totalUsd > 0 ? (top3 / totalUsd) * 100 : 0,
    largest,
    smallest,
    avgUsd,
    totalUsd,
  };
}