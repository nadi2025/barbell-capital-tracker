import { useMemo } from "react";
import { useEntityList } from "./useEntityQuery";

/**
 * usePrivateData — isolated data hook for the Private Investments module.
 *
 * Mirrors the shape of `useDashboardData` but reads ONLY Private* entities, so
 * the main dashboard remains untouched. Consumes `useEntityList` from the
 * shared `useEntityQuery` infrastructure (read-only — does not modify it).
 */
export function usePrivateData() {
  const investments = useEntityList("PrivateInvestment");
  const valuations = useEntityList("PrivateInvestmentValuation", { sort: "-valuation_date" });
  const investors = useEntityList("PrivateDebtInvestor");
  const payments = useEntityList("PrivateInterestPayment", { sort: "-payment_date" });

  const allQueries = [investments, valuations, investors, payments];
  const isLoading = allQueries.some((q) => q.isLoading);
  const isFetching = allQueries.some((q) => q.isFetching);
  const error = allQueries.find((q) => q.error)?.error || null;
  const refetchAll = () => allQueries.forEach((q) => q.refetch?.());

  const data = useMemo(() => ({
    investments: investments.data || [],
    valuations: valuations.data || [],
    investors: investors.data || [],
    payments: payments.data || [],
  }), [investments.data, valuations.data, investors.data, payments.data]);

  return { data, isLoading, isFetching, error, refetchAll };
}
