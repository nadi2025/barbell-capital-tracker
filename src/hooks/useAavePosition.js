import { useMemo } from "react";
import { useEntityList } from "./useEntityQuery";
import { usePrices } from "./usePrices";
import { computeAaveAggregate } from "@/lib/portfolioMath";

/**
 * useAavePosition — pure-client replacement for the calculateAavePosition
 * Deno function.
 *
 * Reads AaveCollateral, AaveBorrow, and Prices via React Query, runs them
 * through computeAaveAggregate (which mirrors the server function's math),
 * and returns the same shape consumers were already using:
 *
 *   { collateralDetails, totalCollateral, borrowedAmount, borrowApy,
 *     totalWeightedThreshold, healthFactor, borrowPowerUsed,
 *     availableToBorrow, maxBorrowCapacity, netWorth, supplyApy, netApy,
 *     eMode, lastUpdated }
 *
 * Plus { isLoading, isFetching, refetch } for callers that want loading
 * gates or imperative refresh.
 *
 * Backward-compat aliases: `position` (the aggregate object), `loading`,
 * `error` — kept so AaveAccountPage and similar code paths don't break in
 * Phase 2 before they're rewritten in Phase 3.
 *
 * Because everything is derived inside React Query's reactive pipeline, any
 * mutation to AaveCollateral / AaveBorrow / Prices invalidates the queries
 * and the derived aggregate updates immediately on every page that calls
 * this hook — no manual cache busting, no Deno round-trip.
 */
export function useAavePosition() {
  const collateralsQ = useEntityList("AaveCollateral");
  const borrowsQ = useEntityList("AaveBorrow");
  const { priceMap, isLoading: pricesLoading, isFetching: pricesFetching } = usePrices();

  const aggregate = useMemo(
    () => computeAaveAggregate(
      collateralsQ.data || [],
      borrowsQ.data || [],
      priceMap
    ),
    [collateralsQ.data, borrowsQ.data, priceMap]
  );

  const isLoading = collateralsQ.isLoading || borrowsQ.isLoading || pricesLoading;
  const isFetching = collateralsQ.isFetching || borrowsQ.isFetching || pricesFetching;
  const error = collateralsQ.error || borrowsQ.error || null;

  const refetch = () => {
    collateralsQ.refetch?.();
    borrowsQ.refetch?.();
  };

  return {
    // New canonical shape — top-level fields matching the server response.
    ...aggregate,
    isLoading,
    isFetching,
    refetch,
    // Backward-compat aliases (removed in Phase 3 when consumers migrate).
    position: aggregate,
    loading: isLoading,
    error,
    refresh: refetch,
  };
}
