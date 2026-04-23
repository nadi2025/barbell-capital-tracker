import { useMemo } from "react";
import { useEntityList, useFunction } from "./useEntityQuery";

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
  const prices = useEntityList("Prices");
  const lpPositions = useEntityList("LpPosition", { filter: { status: "Active" } });
  const hlTrades = useEntityList("HLTrade", { sort: "-trade_date", limit: 500 });
  const aave = useFunction("calculateAavePosition", {});

  const allQueries = [
    options, stocks, deposits, snapshots, debts,
    cryptoAssets, cryptoLoans, cryptoLending, leveraged, cryptoOptions,
    offChainInvestors, prices, lpPositions, hlTrades, aave,
  ];

  const isLoading = allQueries.some((q) => q.isLoading);
  const isFetching = allQueries.some((q) => q.isFetching);
  const error = allQueries.find((q) => q.error)?.error || null;

  const refetchAll = () => allQueries.forEach((q) => q.refetch?.());

  // Find the most recent "data freshness" timestamp (when ANY query last finished)
  const lastSyncedAt = useMemo(() => {
    const times = allQueries
      .map((q) => q.dataUpdatedAt)
      .filter(Boolean);
    return times.length ? new Date(Math.max(...times)) : null;
  }, [allQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const data = useMemo(() => {
    const aaveData = aave.data || {};
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
      prices: prices.data || [],
      aaveCollateral: aaveData.collateralDetails || [],
      aaveBorrowUsd: aaveData.borrowedAmount || 0,
      healthFactor: aaveData.healthFactor || 0,
      borrowPowerUsed: aaveData.borrowPowerUsed || 0,
      lpPositions: lpPositions.data || [],
      hlTrades: hlTrades.data || [],
    };
  }, [
    options.data, stocks.data, deposits.data, snapshots.data, debts.data,
    cryptoAssets.data, cryptoLoans.data, cryptoLending.data, leveraged.data,
    cryptoOptions.data, offChainInvestors.data, prices.data,
    lpPositions.data, hlTrades.data, aave.data,
  ]);

  return { data, isLoading, isFetching, error, refetchAll, lastSyncedAt };
}
