import { useMemo } from "react";
import { useEntityList } from "./useEntityQuery";
import { useAavePosition } from "./useAavePosition";

/**
 * Central hook for the main Dashboard.
 *
 * Instead of a single fragile Promise.all that fails if any one entity is slow
 * or broken, each entity is its own query. This means:
 *   - Partial data renders immediately (dashboard doesn't block on slowest query)
 *   - Any mutation in any page that invalidates an entity will refresh ONLY that slice
 *   - Auto-refresh (30s stale / 60s interval / on-focus) applies per-entity
 *
 * Returns a single `data` object shaped identically to the old Promise.all payload,
 * plus `isLoading` (first load) and `isFetching` (any background refresh) + refetchAll.
 */
export function useDashboardData() {
  const options = useEntityList("OptionsTrade", { sort: "-open_date" });
  const stocks = useEntityList("StockPosition");
  const deposits = useEntityList("Deposit");
  const snapshots = useEntityList("AccountSnapshot", { sort: "-snapshot_date", limit: 1 });
  const debts = useEntityList("DebtFacility");
  const cryptoAssets = useEntityList("CryptoAsset");
  const cryptoLoans = useEntityList("CryptoLoan", { filter: { status: "Active" } });
  const cryptoLending = useEntityList("CryptoLending", { filter: { status: "Active" } });
  const leveraged = useEntityList("LeveragedPosition", { filter: { status: "Open" } });
  const cryptoOptions = useEntityList("CryptoOptionsPosition");
  const offChainInvestors = useEntityList("OffChainInvestor", { filter: { status: "Active" } });
  const investorPayments = useEntityList("InvestorPayment", { sort: "-payment_date", limit: 500 });
  const prices = useEntityList("Prices");
  const lpPositions = useEntityList("LpPosition", { filter: { status: "Active" } });
  const hlTrades = useEntityList("HLTrade", { sort: "-trade_date", limit: 500 });
  // Aave aggregation is now derived on the client from AaveCollateral +
  // AaveBorrow + Prices via portfolioMath, instead of round-tripping to the
  // calculateAavePosition Deno function. Same return shape, instant cache
  // invalidation through React Query.
  const aave = useAavePosition();

  const allQueries = [
    options, stocks, deposits, snapshots, debts,
    cryptoAssets, cryptoLoans, cryptoLending, leveraged, cryptoOptions,
    offChainInvestors, investorPayments, prices, lpPositions, hlTrades,
  ];

  // aave is derived (not a real query) but it does wrap real queries
  // (AaveCollateral, AaveBorrow, Prices) — its loading/fetching flags reflect
  // those, so they need to be folded into the dashboard's overall loading state.
  const isLoading = allQueries.some((q) => q.isLoading) || aave.isLoading;
  const isFetching = allQueries.some((q) => q.isFetching) || aave.isFetching;
  const error = allQueries.find((q) => q.error)?.error || aave.error || null;

  const refetchAll = () => {
    allQueries.forEach((q) => q.refetch?.());
    aave.refetch?.();
  };

  // Find the most recent "data freshness" timestamp (when ANY query last finished)
  const lastSyncedAt = useMemo(() => {
    const times = allQueries
      .map((q) => q.dataUpdatedAt)
      .filter(Boolean);
    return times.length ? new Date(Math.max(...times)) : null;
  }, [allQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const data = useMemo(() => {
    // useAavePosition now returns the aggregate at top level (not wrapped in
    // .data) — it's a derived object from React Query data, not a query itself.
    const cryptoOpts = cryptoOptions.data || [];
    return {
      options: options.data || [],
      stocks: stocks.data || [],
      deposits: deposits.data || [],
      snapshot: (snapshots.data || [])[0] || null,
      debts: debts.data || [],
      cryptoAssets: cryptoAssets.data || [],
      cryptoLoans: cryptoLoans.data || [],
      cryptoLending: cryptoLending.data || [],
      leveraged: leveraged.data || [],
      cryptoOptions: cryptoOpts,
      openCryptoOptions: cryptoOpts.filter((o) => o.status === "Open"),
      offChainInvestors: offChainInvestors.data || [],
      investorPayments: investorPayments.data || [],
      prices: prices.data || [],
      aaveCollateral: aave.collateralDetails || [],
      aaveBorrowUsd: aave.borrowedAmount || 0,
      healthFactor: aave.healthFactor || 0,
      borrowPowerUsed: aave.borrowPowerUsed || 0,
      lpPositions: lpPositions.data || [],
      hlTrades: hlTrades.data || [],
    };
  }, [
    options.data, stocks.data, deposits.data, snapshots.data, debts.data,
    cryptoAssets.data, cryptoLoans.data, cryptoLending.data, leveraged.data,
    cryptoOptions.data, offChainInvestors.data, investorPayments.data, prices.data,
    lpPositions.data, hlTrades.data,
    aave.collateralDetails, aave.borrowedAmount, aave.healthFactor, aave.borrowPowerUsed,
  ]);

  return { data, isLoading, isFetching, error, refetchAll, lastSyncedAt };
}