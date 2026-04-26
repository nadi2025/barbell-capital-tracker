import { useMemo } from "react";
import { useEntityList } from "./useEntityQuery";

/**
 * usePrices — single client-side accessor for the Prices entity.
 *
 * Returns:
 *   priceMap     — { BTC: 65000, ETH: 3500, MARA: 18.40, ... }
 *                  Keys are uppercased ticker/token symbols.
 *   prices       — the raw Prices rows (for components that need notes /
 *                  per-row last_updated).
 *   isLoading    — TanStack Query first-load flag.
 *   isFetching   — true whenever a refetch is in flight.
 *   lastSyncedAt — Date | null. Most recent last_updated across all rows.
 *   refetch      — fire-and-forget refetch trigger.
 *
 * Built on top of useEntityList so every consumer benefits from the same
 * cache + invalidations: a single mutation to a Prices row reflects on every
 * page in the app within one render cycle.
 */
export function usePrices() {
  const query = useEntityList("Prices");

  const prices = query.data || [];

  const priceMap = useMemo(() => {
    const m = {};
    for (const row of prices) {
      const sym = row?.asset;
      if (!sym) continue;
      m[String(sym).toUpperCase()] = Number(row.price_usd) || 0;
    }
    return m;
  }, [prices]);

  const lastSyncedAt = useMemo(() => {
    let max = 0;
    for (const row of prices) {
      const t = new Date(row?.last_updated || 0).getTime();
      if (t > max) max = t;
    }
    return max ? new Date(max) : null;
  }, [prices]);

  return {
    priceMap,
    prices,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    lastSyncedAt,
    refetch: query.refetch,
  };
}
