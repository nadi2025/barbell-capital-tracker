import { useMemo } from "react";
import { useEntityList } from "@/hooks/useEntityQuery";

/**
 * useFxHedgeData — isolated data hook for the FX Hedging module.
 * Mirrors the shape of useDashboardData but reads ONLY the FxHedge* entities.
 */
export function useFxHedgeData() {
  const transactions = useEntityList("FxHedgeTransaction", { sort: "-trade_date" });
  const rates = useEntityList("FxHedgeRate", { sort: "-rate_date" });

  const allQueries = [transactions, rates];
  const isLoading = allQueries.some((q) => q.isLoading);
  const isFetching = allQueries.some((q) => q.isFetching);
  const refetchAll = () => allQueries.forEach((q) => q.refetch?.());

  const data = useMemo(
    () => ({
      transactions: transactions.data || [],
      rates: rates.data || [],
    }),
    [transactions.data, rates.data]
  );

  return { data, isLoading, isFetching, refetchAll };
}