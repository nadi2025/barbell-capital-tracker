import { useMemo } from "react";
import { useEntityList } from "./useEntityQuery";

const fmtUsd = (v) => v == null ? 0 : Number(v);

/**
 * useRyskWallet — encapsulates everything the Crypto Options page needs to
 * know about the Rysk-specific cash + collateral picture.
 *
 * Identification:
 *   The user creates one CryptoWallet record with a name containing "rysk"
 *   (case-insensitive). All Rysk-tagged state lives in that wallet's
 *   CryptoAsset rows + Deposit rows tagged with platform="Rysk".
 *
 * USDC balance:
 *   The CryptoAsset whose token === "USDC" inside the Rysk wallet IS the
 *   live cash balance. Deposits/Withdrawals to Rysk are accounting-side
 *   records (Deposit entity, platform="Rysk"); they do NOT auto-mutate
 *   the USDC asset. The user maintains the USDC amount manually in
 *   WalletsPage. The reconciliation field below surfaces drift.
 *
 * Locked collateral:
 *   pos.size on a Sell Put represents USD collateral (e.g. UBTC put at
 *   strike $75,000 with size $3,750 corresponds to 0.05 BTC). For Sell
 *   Calls, the same field still represents USD-equivalent (used to derive
 *   underlying units = size / strike).
 *
 * Returns a single object — see JSDoc above each block for shape.
 */
export function useRyskWallet() {
  const { data: wallets = [], isLoading: walletsLoading } = useEntityList("CryptoWallet");
  const { data: assets = [], isLoading: assetsLoading } = useEntityList("CryptoAsset");
  const { data: deposits = [], isLoading: depositsLoading } = useEntityList("Deposit");
  const { data: positions = [], isLoading: posLoading } = useEntityList("CryptoOptionsPosition");

  return useMemo(() => {
    const isLoading = walletsLoading || assetsLoading || depositsLoading || posLoading;

    // Find Rysk wallet by name (case-insensitive contains "rysk")
    const wallet = wallets.find((w) =>
      w.name && w.name.toLowerCase().includes("rysk")
    ) || null;

    if (!wallet) {
      return {
        isLoading,
        isReady: false,
        wallet: null,
        usdcAsset: null,
        cryptoAssets: [],
        usdcBalance: 0,
        totals: { totalDeposited: 0, totalWithdrawn: 0, netDeposited: 0 },
        collateral: { usdcLocked: 0, cryptoLocked: {} },
        freeCash: 0,
        pendingPremium: 0,
        reconciliation: { diff: null, hasMismatch: false },
      };
    }

    // Assets that live in the Rysk wallet
    const ryskAssets = assets.filter((a) => a.wallet_id === wallet.id);
    const usdcAsset = ryskAssets.find((a) =>
      (a.token || "").toUpperCase() === "USDC"
    ) || null;
    const cryptoAssets = ryskAssets.filter((a) =>
      (a.token || "").toUpperCase() !== "USDC"
    );

    const usdcBalance = fmtUsd(usdcAsset?.amount);

    // Deposits/Withdrawals tagged for Rysk
    const ryskDeposits = deposits.filter((d) => d.platform === "Rysk");
    const totalDeposited = ryskDeposits
      .filter((d) => d.type === "Deposit")
      .reduce((s, d) => s + fmtUsd(d.amount), 0);
    const totalWithdrawn = ryskDeposits
      .filter((d) => d.type === "Withdrawal")
      .reduce((s, d) => s + fmtUsd(d.amount), 0);
    const netDeposited = totalDeposited - totalWithdrawn;

    // Open (and not-past-maturity) positions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const openPositions = positions.filter((p) =>
      p.status === "Open" && (!p.maturity_date || new Date(p.maturity_date) >= today)
    );

    // USDC locked = sum of size for Open Sell Puts
    const usdcLocked = openPositions
      .filter((p) => p.option_type === "Put" && p.direction !== "Buy")
      .reduce((s, p) => s + fmtUsd(p.size), 0);

    // Crypto locked = underlying units per asset for Open Sell Calls.
    // units = size / strike_price (USD collateral / strike)
    const cryptoLocked = {};
    for (const p of openPositions) {
      if (p.option_type === "Call" && p.direction !== "Buy" && p.strike_price > 0) {
        const units = fmtUsd(p.size) / p.strike_price;
        const key = (p.asset || "").toUpperCase();
        cryptoLocked[key] = (cryptoLocked[key] || 0) + units;
      }
    }

    const freeCash = usdcBalance - usdcLocked;

    const pendingPremium = openPositions.reduce((s, p) => s + fmtUsd(p.income_usd), 0);

    // Reconciliation: expected USDC vs live USDC.
    //   expected = netDeposited
    //            + Σ premium_received (all positions ever opened)
    //            − Σ usdc_paid_on_put_assignments
    //            + Σ usdc_received_on_call_assignments
    //
    // Approximation: usdc_change_from_assignments looks at settled positions
    //   Put Expired ITM / Exercised → cash out: −size
    //   Call Expired ITM / Exercised → cash in:  +size
    // Buy-side options (we don't run those today) are skipped.
    const settledItm = positions.filter((p) =>
      p.status === "Expired ITM" || p.status === "Exercised"
    );
    const totalPremium = positions.reduce((s, p) => s + fmtUsd(p.income_usd), 0);
    const usdcFromAssignments = settledItm.reduce((s, p) => {
      if (p.direction === "Buy") return s; // we only sell options
      if (p.option_type === "Put") return s - fmtUsd(p.size);
      if (p.option_type === "Call") return s + fmtUsd(p.size);
      return s;
    }, 0);

    const expectedUsdc = netDeposited + totalPremium + usdcFromAssignments;
    const diff = usdcBalance - expectedUsdc;
    // Tolerance of $1 — rounding from premium fractions etc. shouldn't trip.
    const hasMismatch = Math.abs(diff) > 1;

    return {
      isLoading,
      isReady: true,
      wallet,
      usdcAsset,
      cryptoAssets,
      usdcBalance,
      totals: { totalDeposited, totalWithdrawn, netDeposited },
      collateral: { usdcLocked, cryptoLocked },
      freeCash,
      pendingPremium,
      reconciliation: { diff, hasMismatch },
    };
  }, [wallets, assets, deposits, positions, walletsLoading, assetsLoading, depositsLoading, posLoading]);
}
