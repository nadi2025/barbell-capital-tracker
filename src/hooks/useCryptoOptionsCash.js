import { useMemo } from "react";
import { useEntityList } from "./useEntityQuery";

/**
 * useCryptoOptionsCash — derives the live cash + collateral picture for the
 * Crypto Options account.
 *
 *   Available cash  =  Σ (CryptoCashFlow.amount_usd, signed)
 *                       Deposit / Premium / Collateral Release  → +
 *                       Withdrawal / Collateral Lock / Exercise → −
 *
 *   Locked collateral  =  Σ (open Sell Put: strike × size × multiplier)
 *                       This is cash temporarily set aside; it isn't
 *                       deducted from the cash ledger because Settle/Expire
 *                       reconciles it. Surfacing it separately just helps
 *                       the user see "true free cash".
 *
 *   Free cash  =  Available − Locked
 *
 *   Premium pending  =  Σ (open positions' income_usd)
 *                       — premium already received but not yet realized.
 *                       (Premium becomes locked-in P&L only at expiry.)
 *
 * Single-source-of-truth pattern: every cash event is a CryptoCashFlow row.
 * The hook adds them up; no other entity carries a cash balance field.
 *
 * Returns:
 *   { available, locked, free, premiumPending, cashFlows, isLoading, isFetching }
 */
const OPT_MULT = 100;

export function useCryptoOptionsCash() {
  const flowsQ = useEntityList("CryptoCashFlow", { sort: "-date" });
  const positionsQ = useEntityList("CryptoOptionsPosition");

  const flows = flowsQ.data || [];
  const positions = positionsQ.data || [];

  const stats = useMemo(() => {
    // Sum the signed amounts. We trust the writer to apply the right sign
    // per type (Deposit positive, Withdrawal negative, etc.).
    const available = flows.reduce((s, f) => s + (Number(f.amount_usd) || 0), 0);

    // Locked collateral = open Sell Puts. For Calls (covered) and bought
    // options, no cash collateral is set aside.
    const open = positions.filter((p) => p.status === "Open");
    const lockedFromPuts = open
      .filter((p) => p.option_type === "Put" && (p.direction || "Sell") === "Sell")
      .reduce((s, p) => s + ((p.strike_price || 0) * (p.size || 0) * OPT_MULT), 0);

    // Premium received but not yet locked in (still on open positions).
    const premiumPending = open.reduce((s, p) => s + (p.income_usd || 0), 0);

    return {
      available,
      locked: lockedFromPuts,
      free: available - lockedFromPuts,
      premiumPending,
    };
  }, [flows, positions]);

  return {
    ...stats,
    cashFlows: flows,
    isLoading: flowsQ.isLoading || positionsQ.isLoading,
    isFetching: flowsQ.isFetching || positionsQ.isFetching,
  };
}
