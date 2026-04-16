// Central calculations shared across all dashboard sub-components

export const fmt = (v, d = 0) => {
  if (v == null || isNaN(v)) return "$0";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
};

export const pct = (v, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

export function calcDashboard(data) {
  const {
    options = [], stocks = [], deposits = [], snapshot,
    debts = [], cryptoAssets = [], cryptoLoans = [], cryptoLending = [],
    leveraged = [], cryptoOptions = [], openCryptoOptions = [],
    prices = [], aaveCollateral = [], aaveBorrowUsd = 0,
    healthFactor = 0, borrowPowerUsed = 0, lpPositions = [],
  } = data;

  // ── Price map ──
  const priceMap = {};
  prices.forEach(p => { priceMap[p.asset?.toUpperCase()] = p.price_usd; });
  const btcPrice = priceMap["BTC"] || 0;
  const ethPrice = priceMap["ETH"] || 0;
  const aavePrice = priceMap["AAVE"] || 0;

  // ── IB / Off-Chain ──
  const ibNav = snapshot?.nav || 0;
  const totalDeposited = deposits.reduce((s, d) => d.type === "Deposit" ? s + d.amount : s - d.amount, 0);
  const ibPnl = ibNav - totalDeposited;
  const ibPnlPct = totalDeposited > 0 ? (ibPnl / totalDeposited) * 100 : 0;

  const closedOptions = options.filter(o => ["Closed", "Expired"].includes(o.status));
  const openOptions = options.filter(o => o.status === "Open");
  const realizedPnl = closedOptions.reduce((s, o) => s + (o.pnl || 0), 0);
  const winRate = closedOptions.length > 0
    ? closedOptions.filter(o => (o.pnl || 0) > 0).length / closedOptions.length
    : 0;
  const premiumCollected = options.filter(o => o.type === "Sell")
    .reduce((s, o) => s + (o.fill_price || 0) * (o.quantity || 0) * 100, 0);

  const holdingStocks = stocks.filter(s => ["Holding", "Partially Sold"].includes(s.status));
  const unrealizedPnl = holdingStocks.reduce((s, x) => s + (x.gain_loss || 0), 0);
  const totalOffChainDebt = debts.filter(d => d.status === "Active").reduce((s, d) => s + (d.outstanding_balance || 0), 0);

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
  const totalMargin = leveraged.reduce((s, l) => s + (l.margin_usd || 0), 0);
  const cryptoTotalAssets = walletValue + Math.max(0, totalMargin) + vaultValue + loansGivenValue + activeNotional;
  const cryptoTotalDebt = investorDebt + aaveBorrowUsd;
  const onChainNAV = aaveNetWorth + stablecoinsValue + loansGivenValue + activeNotional;

  // HL unrealized
  const hlUnrealizedPnl = leveraged.reduce((s, l) => {
    if (!l.mark_price || !l.entry_price || !l.size) return s;
    return s + (l.direction === "Long"
      ? (l.mark_price - l.entry_price) * l.size
      : (l.entry_price - l.mark_price) * l.size);
  }, 0);

  // ── Totals ──
  const totalAssets = ibNav + cryptoTotalAssets;
  const totalDebt = totalOffChainDebt + cryptoTotalDebt;
  const totalNAV = totalAssets - totalDebt;
  const totalInvested = totalDeposited + investorDebt + aaveBorrowUsd;
  const totalPnl = totalNAV - totalDeposited;
  const totalPnlPct = totalDeposited > 0 ? (totalPnl / totalDeposited) * 100 : 0;

  // ── Allocation slices ──
  const btcCollVal = (aaveCollateral.find(c => c.asset_name === "BTC")?.value_usd || 0);
  const ethCollVal = (aaveCollateral.find(c => c.asset_name === "ETH")?.value_usd || 0);
  const aaveCollVal = (aaveCollateral.find(c => c.asset_name === "AAVE")?.value_usd || 0);

  const hlByAsset = {};
  leveraged.forEach(l => {
    const k = l.asset?.toUpperCase();
    const val = l.position_value_usd || (l.size * (priceMap[k] || 0)) || 0;
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
    { label: "IB Options P&L", val: realizedPnl },
    { label: "IB Unrealized", val: unrealizedPnl },
    { label: "HL Live P&L", val: hlUnrealizedPnl },
    { label: "Crypto Options", val: openCryptoOptions.reduce((s, o) => s + (o.income_usd || 0), 0) },
  ].filter(b => Math.abs(b.val) > 0);

  return {
    ibNav, totalDeposited, ibPnl, ibPnlPct,
    closedOptions, openOptions, realizedPnl, winRate, premiumCollected,
    holdingStocks, unrealizedPnl, totalOffChainDebt,
    aaveCollateralValue, aaveNetWorth, loansGivenValue, investorDebt,
    stablecoinsValue, activeNotional, vaultValue,
    cryptoTotalAssets, cryptoTotalDebt, onChainNAV,
    hlUnrealizedPnl, healthFactor, borrowPowerUsed, aaveBorrowUsd,
    totalAssets, totalDebt, totalNAV, totalInvested, totalPnl, totalPnlPct,
    allocationSlices, perfItems, priceMap, btcPrice, ethPrice, aavePrice,
    openOptions, openCryptoOptions,
  };
}