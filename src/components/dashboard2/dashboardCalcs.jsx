// Central calculations shared across all dashboard sub-components

import { computeLeveragedDerived } from "@/lib/portfolioMath";

export const fmt = (v, d = 0) => {
  if (v == null || isNaN(v)) return "$0";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
};

export function calcDashboard(data) {
  const {
    options = [], stocks = [], deposits = [], snapshot,
    debts = [], cryptoAssets = [], cryptoLoans = [], cryptoLending = [],
    leveraged = [], cryptoOptions = [], openCryptoOptions = [],
    prices = [], aaveCollateral = [], aaveBorrowUsd = 0,
    healthFactor = 0, borrowPowerUsed = 0, lpPositions = [],
    offChainInvestors = [],
  } = data;

  // ── Price map ──
  const priceMap = {};
  prices.forEach(p => { priceMap[p.asset?.toUpperCase()] = p.price_usd; });
  const btcPrice = priceMap["BTC"] || 0;
  const ethPrice = priceMap["ETH"] || 0;
  const aavePrice = priceMap["AAVE"] || 0;

  // ── IB / Off-Chain ──
  // New formula: ibNav = cash + stocks_value + options_value (from latest snapshot,
  // with live fallbacks computed from current entity state)
  const holdingStocks = stocks.filter(s => ["Holding", "Partially Sold"].includes(s.status));
  const openOptions = options.filter(o => o.status === "Open");
  const closedOptions = options.filter(o => ["Closed", "Expired", "Assigned"].includes(o.status));

  // Live stocks value — sum of current_value on open positions
  const liveStocksValue = holdingStocks.reduce((s, x) => s + (x.current_value || 0), 0);

  // Live options value = unrealized P&L on open positions.
  // Positive number = shorts that decayed favorably; negative = positions moved against us.
  const liveOptionsValue = openOptions.reduce((s, o) => s + (o.pnl || 0), 0);

  // ibNav — priority-ordered fallback:
  //   1. Snapshot has cash field → use full breakdown (imported from IB CSV)
  //   2. Snapshot has only nav  → use that directly (legacy entry)
  //   3. No snapshot            → use live stocks + options only (cash unknown)
  const hasBreakdown = snapshot?.cash != null;
  const hasLegacyNav = !hasBreakdown && snapshot?.nav != null;
  let ibCash, ibStocksValue, ibOptionsValue, ibNav, ibNavSource;

  if (hasBreakdown) {
    ibCash = snapshot.cash;
    ibStocksValue = snapshot.stocks_value != null ? snapshot.stocks_value : liveStocksValue;
    ibOptionsValue = snapshot.options_value != null ? snapshot.options_value : liveOptionsValue;
    ibNav = ibCash + ibStocksValue + ibOptionsValue;
    ibNavSource = "breakdown";
  } else if (hasLegacyNav) {
    // Legacy snapshot only carries a single NAV number — trust it.
    ibNav = snapshot.nav;
    ibCash = null;
    ibStocksValue = liveStocksValue;
    ibOptionsValue = liveOptionsValue;
    ibNavSource = "legacy_nav";
  } else {
    ibCash = null;
    ibStocksValue = liveStocksValue;
    ibOptionsValue = liveOptionsValue;
    ibNav = liveStocksValue + liveOptionsValue;
    ibNavSource = "live_only";
  }

  // Total net flows through the Deposits ledger (includes both own equity AND
  // debt-funded transfers — kept for backward compatibility).
  const totalDeposited = deposits.reduce((s, d) => d.type === "Deposit" ? s + d.amount : s - d.amount, 0);

  // Own equity only — Deposit rows flagged as Equity Investment / Equity Cash Flow.
  const equityDeposits = deposits.filter((d) =>
    d.capital_source === "Equity Investment" || d.capital_source === "Equity Cash Flow"
  );
  const ownEquity = equityDeposits.reduce((s, d) => d.type === "Deposit" ? s + (d.amount || 0) : s - (d.amount || 0), 0);

  // Informational: which part of the Deposit ledger was funded by debt (should
  // roughly match OffChainInvestor principal, used to detect missing investor
  // records).
  const debtFundedDeposits = deposits
    .filter((d) => d.capital_source === "Debt Investment")
    .reduce((s, d) => s + (d.type === "Deposit" ? (d.amount || 0) : -(d.amount || 0)), 0);

  const ibPnl = ibNav - totalDeposited;

  const realizedPnl = closedOptions.reduce((s, o) => s + (o.pnl || 0), 0);
  const winRate = closedOptions.length > 0
    ? closedOptions.filter(o => (o.pnl || 0) > 0).length / closedOptions.length
    : 0;
  const premiumCollected = options.filter(o => o.type === "Sell")
    .reduce((s, o) => s + (o.fill_price || 0) * (o.quantity || 0) * 100, 0);

  const unrealizedPnl = holdingStocks.reduce((s, x) => s + (x.gain_loss || 0), 0);

  // Off-chain debt comes from two authoritative sources:
  //   1. OffChainInvestor entity — private investors (loan-like). Source of truth
  //      for things like עידו/טל/נעמה/אלינור.
  //   2. DebtFacility entity — bank loans and other institutional facilities.
  const offChainInvestorDebt = offChainInvestors
    .filter((inv) => inv.status === "Active")
    .reduce((s, inv) => s + (inv.principal_usd || 0), 0);
  const offChainFacilityDebt = debts
    .filter((d) => d.status === "Active")
    .reduce((s, d) => s + (d.outstanding_balance || 0), 0);
  const totalOffChainDebt = offChainInvestorDebt + offChainFacilityDebt;

  // ── On-Chain ──
  const aaveCollateralValue = aaveCollateral.reduce((s, c) => s + (c.value_usd || 0), 0);
  const aaveNetWorth = aaveCollateralValue - aaveBorrowUsd;
  const loansGivenValue = cryptoLending.reduce((s, l) => s + (l.amount_usd || 0), 0);
  const investorDebt = cryptoLoans.reduce((s, l) => s + (l.principal_usd || 0), 0);
  const stablecoinsValue = cryptoAssets.filter(a => a.asset_category === "Stablecoin")
    .reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const activeNotional = openCryptoOptions.reduce((s, o) => s + (o.notional_usd || 0), 0);
  const vaultValue = lpPositions.reduce((s, l) => s + (l.current_value_usd || 0), 0);

  const walletValue = cryptoAssets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
  // Enrich each HL position with live-price-derived values (mark_price, pnl_usd,
  // position_value_usd) instead of trusting the stored fields, which go stale
  // until the user clicks "Update Mark Prices". Same pattern OpenPositionsTab uses.
  const enrichedLev = leveraged.map(l => ({ ...l, ...computeLeveragedDerived(l, priceMap) }));
  const totalMargin = enrichedLev.reduce((s, l) => s + (l.margin_usd || 0), 0);
  const hlUnrealizedPnl = enrichedLev.reduce((s, l) => s + (l.pnl_usd || 0), 0);
  const hlEquity = totalMargin + hlUnrealizedPnl;

  const cryptoTotalAssets = walletValue + Math.max(0, hlEquity) + vaultValue + loansGivenValue + activeNotional;
  const cryptoTotalDebt = investorDebt + aaveBorrowUsd;
  const onChainNAV = aaveNetWorth + stablecoinsValue + loansGivenValue + activeNotional + Math.max(0, hlEquity) + vaultValue;

  // ── Totals ──
  const totalAssets = ibNav + cryptoTotalAssets;
  const totalDebt = totalOffChainDebt + cryptoTotalDebt;
  const totalNAV = totalAssets - totalDebt;
  const totalPnl = totalNAV - totalDeposited;

  // ── Allocation slices ──
  const btcCollVal = (aaveCollateral.find(c => c.asset_name === "BTC")?.value_usd || 0);
  const ethCollVal = (aaveCollateral.find(c => c.asset_name === "ETH")?.value_usd || 0);
  const aaveCollVal = (aaveCollateral.find(c => c.asset_name === "AAVE")?.value_usd || 0);

  const hlByAsset = {};
  enrichedLev.forEach(l => {
    const k = l.asset?.toUpperCase();
    const val = l.position_value_usd || 0;
    hlByAsset[k] = (hlByAsset[k] || 0) + Math.abs(val);
  });

  const allocationSlices = [
    { name: "BTC", val: btcCollVal + (hlByAsset["BTC"] || 0), color: "#f7931a" },
    { name: "ETH", val: ethCollVal + (hlByAsset["ETH"] || 0), color: "#627eea" },
    { name: "AAVE", val: aaveCollVal + (hlByAsset["AAVE"] || 0), color: "#b878e8" },
    { name: "IB Portfolio", val: ibNav, color: "#10b981" },
    { name: "Stablecoins", val: stablecoinsValue, color: "#64748b" },
    { name: "Lending", val: loansGivenValue, color: "#06b6d4" },
  ].filter(s => s.val > 500);

  // ── Performance bars ──
  const perfItems = [
    { label: "IB Options P&L (realized)", val: realizedPnl },
    { label: "IB Unrealized (stocks)", val: unrealizedPnl },
    { label: "HL Live P&L", val: hlUnrealizedPnl },
    { label: "Crypto Options", val: openCryptoOptions.reduce((s, o) => s + (o.income_usd || 0), 0) },
  ].filter(b => Math.abs(b.val) > 0);

  return {
    ibNav, ibCash, ibStocksValue, ibOptionsValue, ibNavSource,
    liveStocksValue, liveOptionsValue,
    totalDeposited, ownEquity, debtFundedDeposits, ibPnl,
    closedOptions, openOptions, realizedPnl, winRate, premiumCollected,
    holdingStocks, unrealizedPnl,
    totalOffChainDebt, offChainInvestorDebt, offChainFacilityDebt,
    aaveCollateralValue, aaveNetWorth, loansGivenValue, investorDebt,
    stablecoinsValue, activeNotional, vaultValue,
    cryptoTotalAssets, cryptoTotalDebt, onChainNAV,
    hlUnrealizedPnl, hlEquity, totalMargin,
    healthFactor, borrowPowerUsed, aaveBorrowUsd,
    totalAssets, totalDebt, totalNAV, totalPnl,
    allocationSlices, perfItems, priceMap, btcPrice, ethPrice, aavePrice,
    snapshot,
  };
}
