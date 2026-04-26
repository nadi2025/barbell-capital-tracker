import { useState } from "react";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRyskWallet } from "@/hooks/useRyskWallet";
import DepositWithdrawDialog from "./DepositWithdrawDialog";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d,
});

/**
 * RyskWalletCard — the canonical wallet+collateral header on the Crypto
 * Options page. Reads everything from useRyskWallet; opens
 * DepositWithdrawDialog for cash-flow records.
 *
 * States:
 *   isLoading  → skeleton
 *   !isReady   → setup banner (no Rysk wallet found)
 *   ready      → full card with 4 KPIs, optional crypto-holdings strip,
 *                optional reconciliation warning
 */
export default function RyskWalletCard() {
  const rysk = useRyskWallet();
  const [dialogMode, setDialogMode] = useState(null); // null | "Deposit" | "Withdrawal"

  if (rysk.isLoading) {
    return <div className="bg-card border border-border rounded-xl p-4 h-32 animate-pulse" />;
  }

  if (!rysk.isReady) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-400">לא נמצא ארנק Rysk</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            צור ארנק בשם "Rysk" ב-WalletsPage כדי להפעיל את מעקב המזומן והבטוחות.
          </p>
        </div>
      </div>
    );
  }

  const expectedUsdc = rysk.usdcBalance - rysk.reconciliation.diff;

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-500" />
            <p className="text-sm font-semibold">ארנק Rysk · מזומן ובטוחות</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogMode("Deposit")}>
              <ArrowDownToLine className="w-4 h-4 mr-1.5" /> הפקדה
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDialogMode("Withdrawal")}>
              <ArrowUpFromLine className="w-4 h-4 mr-1.5" /> משיכה
            </Button>
          </div>
        </div>

        {/* 4-column KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* 1. Net deposited */}
          <div>
            <p className="text-xs text-muted-foreground">סך הופקד נטו</p>
            <p className="text-xl font-bold font-mono mt-0.5">{fmt(rysk.totals.netDeposited)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              הפקדות {fmt(rysk.totals.totalDeposited)} · משיכות {fmt(rysk.totals.totalWithdrawn)}
            </p>
          </div>

          {/* 2. USDC in wallet */}
          <div>
            <p className="text-xs text-muted-foreground">USDC בארנק</p>
            <p className="text-xl font-bold font-mono mt-0.5">{fmt(rysk.usdcBalance)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              פרמיה ממתינה {fmt(rysk.pendingPremium, 2)}
            </p>
          </div>

          {/* 3. Locked collateral */}
          <div>
            <p className="text-xs text-muted-foreground">נעול בבטוחות</p>
            <p className="text-xl font-bold font-mono mt-0.5 text-amber-400">
              {fmt(rysk.collateral.usdcLocked)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              לפוזיציות פתוחות
            </p>
          </div>

          {/* 4. Free cash */}
          <div>
            <p className="text-xs text-muted-foreground">פנוי לשימוש</p>
            <p className={`text-xl font-bold font-mono mt-0.5 ${rysk.freeCash >= 0 ? "text-emerald-500" : "text-red-400"}`}>
              {fmt(rysk.freeCash)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              זמין למכירה של אופציה חדשה
            </p>
          </div>
        </div>

        {/* Crypto holdings strip — only if non-USDC assets exist */}
        {rysk.cryptoAssets.length > 0 && (
          <div className="border-t border-border/40 pt-3">
            <p className="text-xs text-muted-foreground mb-1.5">החזקות קריפטו בארנק (מ-assignments)</p>
            <div className="flex gap-3 flex-wrap text-xs">
              {rysk.cryptoAssets.map((a) => (
                <div key={a.id} className="bg-muted/50 px-2.5 py-1 rounded-md">
                  <span className="font-semibold">{a.token}</span>{" "}
                  <span className="font-mono">{Number(a.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
                  {a.average_cost_usd > 0 && (
                    <span className="text-muted-foreground ml-1">
                      @ {fmt(a.average_cost_usd, 2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reconciliation warning */}
        {rysk.reconciliation.hasMismatch && (
          <div className="border-t border-border/40 pt-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="text-amber-400 font-semibold">אי-התאמה בין הון לארנק</p>
              <p className="text-muted-foreground">
                לפי תזרים+פרמיות+settlements, הצפי ל-USDC היה{" "}
                <span className="font-mono">{fmt(expectedUsdc)}</span>.
                בפועל יש <span className="font-mono">{fmt(rysk.usdcBalance)}</span>.
                ייתכן שצריך לעדכן את ה-USDC ב-WalletsPage.
              </p>
            </div>
          </div>
        )}
      </div>

      <DepositWithdrawDialog
        open={dialogMode !== null}
        mode={dialogMode}
        onClose={() => setDialogMode(null)}
      />
    </>
  );
}
