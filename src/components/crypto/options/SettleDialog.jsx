import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { useRyskWallet } from "@/hooks/useRyskWallet";

const fmt = (v, d = 2) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * blendAvgCost — weighted average of an existing position's avg cost with
 * a new tranche being added. Used when a Sell Put exercises into an asset
 * we already hold some of: the new shares come in at strike, we average.
 */
function blendAvgCost(existingAmount, existingAvg, addedAmount, addedAvg) {
  const totalCost = (existingAmount || 0) * (existingAvg || 0) + (addedAmount || 0) * (addedAvg || 0);
  const totalAmount = (existingAmount || 0) + (addedAmount || 0);
  return totalAmount > 0 ? totalCost / totalAmount : addedAvg;
}

/**
 * SettleDialog — settles an option position. Two paths:
 *
 *   OTM win → confirm button "Confirm OTM — Keep Premium". Just closes
 *             the position; no wallet movement.
 *
 *   ITM     → shows an additional Assignment panel that previews the
 *             USDC ↔ crypto delta and offers ONE-CLICK execution that:
 *               1. Updates Rysk USDC amount (−size for Put, +size for Call)
 *               2. Updates or creates the underlying CryptoAsset
 *                  (avg cost blended for Puts, untouched for Calls)
 *               3. Marks the position Exercised + writes settlement_result
 *               4. Logs to CryptoActivityLog
 *             Plus a fallback "סגור בלי עדכון ארנק" for when the user
 *             wants to handle the wallet manually.
 *
 * pos.size semantics: USD collateral (e.g. UBTC put strike $75k size $3,750
 * → 0.05 BTC underlying). units = size / strike.
 */
export default function SettleDialog({ pos, open, onClose, onConfirm }) {
  const [settlementPrice, setSettlementPrice] = useState("");
  const [settlementResult, setSettlementResult] = useState("");
  const [netPnl, setNetPnl] = useState("");
  const [executing, setExecuting] = useState(false);

  const rysk = useRyskWallet();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!pos) return;
    setSettlementPrice(pos.current_price || "");
    setSettlementResult("");
    setNetPnl("");
  }, [pos]);

  if (!pos) return null;

  const strike = pos.strike_price || 0;
  const sp = parseFloat(settlementPrice) || pos.current_price || 0;

  let autoIsItm = false;
  if (pos.option_type === "Put") autoIsItm = sp < strike;
  else autoIsItm = sp > strike;

  // Auto-calc PnL for OTM (premium kept)
  const otmPnl = pos.income_usd || 0;

  // Auto-calc PnL for ITM
  let autoItmPnl = null;
  if (autoIsItm && strike > 0 && sp > 0) {
    if (pos.option_type === "Put") {
      autoItmPnl = (pos.income_usd || 0) - (strike - sp) * (pos.size || 0);
    } else {
      autoItmPnl = (pos.income_usd || 0) - (sp - strike) * (pos.size || 0);
    }
  }

  const finalPnl = autoIsItm
    ? (parseFloat(netPnl) || autoItmPnl || 0)
    : otmPnl;

  // ── Assignment math ──
  // pos.size is USD collateral. underlying units = size / strike.
  const units = strike > 0 ? (pos.size || 0) / strike : 0;
  const usdcDelta = pos.option_type === "Put" ? -(pos.size || 0) : +(pos.size || 0);
  const cryptoDelta = pos.option_type === "Put" ? +units : -units;
  const cryptoAvgCost = strike;

  const existingCryptoAsset = rysk.isReady
    ? rysk.cryptoAssets.find((a) => (a.token || "").toUpperCase() === (pos.asset || "").toUpperCase())
    : null;

  const projectedUsdc = (rysk.usdcBalance || 0) + usdcDelta;
  const projectedCryptoAmount = (existingCryptoAsset?.amount || 0) + cryptoDelta;

  // Fallback close path (no wallet adjustments) — preserves the original
  // SettleDialog behavior so the user can always opt out.
  const handleConfirm = () => {
    const data = {
      status: autoIsItm ? "Expired ITM" : "Expired OTM",
      settlement_price: parseFloat(settlementPrice) || sp,
      net_pnl: finalPnl,
      settlement_result: autoIsItm
        ? (settlementResult || (pos.option_type === "Put" ? `Received ${pos.asset} at ${fmt(strike)}` : `Delivered ${pos.asset} at ${fmt(strike)}`))
        : `Kept ${fmt(pos.income_usd, 2)} premium`,
    };
    onConfirm(pos.id, data);
  };

  // The assignment-execute path: atomic-ish wallet + position update.
  const handleAssignmentExecute = async () => {
    if (!rysk.isReady || !rysk.usdcAsset) {
      toast.error("ארנק Rysk לא מוכן. ודא שיש ארנק 'Rysk' ובו USDC.");
      return;
    }
    setExecuting(true);
    try {
      // 1. Update USDC amount in Rysk wallet
      const newUsdcAmount = (rysk.usdcBalance || 0) + usdcDelta;
      await base44.entities.CryptoAsset.update(rysk.usdcAsset.id, {
        amount: newUsdcAmount,
        current_value_usd: newUsdcAmount, // USDC is $1 by definition
        last_updated: new Date().toISOString().split("T")[0],
      });

      // 2. Update or create the underlying crypto asset
      if (existingCryptoAsset) {
        const newAmount = (existingCryptoAsset.amount || 0) + cryptoDelta;
        // For Put assignment we're adding; for Call we're reducing — only
        // blend the avg cost when adding (Put). When reducing (Call) the
        // remaining basis stays the same per typical inventory accounting.
        const newAvgCost = (pos.option_type === "Put" && newAmount > 0)
          ? blendAvgCost(
              existingCryptoAsset.amount || 0,
              existingCryptoAsset.average_cost_usd || 0,
              cryptoDelta,
              cryptoAvgCost
            )
          : existingCryptoAsset.average_cost_usd;
        await base44.entities.CryptoAsset.update(existingCryptoAsset.id, {
          amount: newAmount,
          average_cost_usd: newAvgCost,
          last_updated: new Date().toISOString().split("T")[0],
        });
      } else if (pos.option_type === "Put") {
        // First-time receiving this underlying via assignment
        await base44.entities.CryptoAsset.create({
          wallet_id: rysk.wallet.id,
          wallet_name: rysk.wallet.name,
          token: pos.asset,
          amount: cryptoDelta,
          average_cost_usd: cryptoAvgCost,
          asset_category: "Spot",
          last_updated: new Date().toISOString().split("T")[0],
        });
      }
      // Call assignment with no existing asset → we proceed; the user has
      // already been warned by the validation banner that the balance will
      // dip below zero.

      // 3. Mark the option Exercised + write settlement details
      await base44.entities.CryptoOptionsPosition.update(pos.id, {
        status: "Exercised",
        settlement_price: parseFloat(settlementPrice) || sp,
        net_pnl: autoItmPnl ?? 0,
        settlement_result: pos.option_type === "Put"
          ? `Assigned: bought ${units.toFixed(6)} ${pos.asset} at ${fmt(strike)} (paid ${fmt(Math.abs(usdcDelta))} USDC)`
          : `Assigned: sold ${units.toFixed(6)} ${pos.asset} at ${fmt(strike)} (received ${fmt(usdcDelta)} USDC)`,
      });

      // 4. Activity log
      await base44.entities.CryptoActivityLog.create({
        date: new Date().toISOString().split("T")[0],
        action_type: "Trade",
        description: pos.option_type === "Put"
          ? `Put assigned: bought ${units.toFixed(6)} ${pos.asset} at strike ${fmt(strike)} for ${fmt(Math.abs(usdcDelta))}`
          : `Call assigned: sold ${units.toFixed(6)} ${pos.asset} at strike ${fmt(strike)} for ${fmt(usdcDelta)}`,
        amount_usd: usdcDelta,
        related_entity: `CryptoOptionsPosition:${pos.id}`,
      });

      toast.success("Assignment בוצע. הארנק עודכן.");
      queryClient.invalidateQueries({ queryKey: ["entity"] });
      onClose();
    } catch (e) {
      toast.error("שגיאה: " + (e?.message || "לא ידוע"));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settle Position — {pos.asset} {pos.option_type} ${strike}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Price at Settlement / Expiry</Label>
            <Input
              type="number"
              value={settlementPrice}
              onChange={(e) => setSettlementPrice(e.target.value)}
              placeholder={String(pos.current_price || "")}
            />
          </div>

          {/* Auto-detected outcome */}
          <div className={`rounded-lg p-3 border ${autoIsItm ? "border-red-400/40 bg-red-400/5" : "border-emerald-400/40 bg-emerald-400/5"}`}>
            {autoIsItm ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-400">
                  <p className="font-semibold">ITM — הוגדרה</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pos.option_type === "Put"
                      ? `המחיר (${fmt(sp)}) מתחת לסטרייק (${fmt(strike)}) — Assignment`
                      : `המחיר (${fmt(sp)}) מעל הסטרייק (${fmt(strike)}) — Assignment`}
                  </p>
                  {autoItmPnl != null && (
                    <p className="text-xs mt-1 font-mono">Auto P&L: {autoItmPnl >= 0 ? "+" : ""}{fmt(autoItmPnl, 2)}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-400">
                  <p className="font-semibold">OTM — ניצחון</p>
                  <p className="text-xs text-muted-foreground mt-0.5">האופציה פקעה OTM. נשמרת פרמיה מלאה: {fmt(otmPnl, 2)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Assignment panel — only when ITM and the Rysk wallet is configured */}
          {autoIsItm && rysk.isReady && (
            <div className="rounded-lg p-3 border border-amber-400/40 bg-amber-400/5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-amber-400">⚙ Assignment — מהלך אוטומטי</span>
              </div>

              <div className="text-xs text-muted-foreground">
                סטרייק: {fmt(strike)} · מחיר settlement: {fmt(sp)}
              </div>
              <div className="text-xs">
                גודל בחוזים: <span className="font-mono font-semibold">
                  {units.toLocaleString("en-US", { maximumFractionDigits: 6 })} {pos.asset}
                </span>{" "}
                <span className="text-muted-foreground">(מ-size {fmt(pos.size, 0)} ÷ strike)</span>
              </div>

              <div className="border-t border-amber-400/20 pt-2 space-y-1 text-xs">
                <p className="font-semibold mb-1">אחרי הביצוע:</p>
                <p>
                  • USDC בארנק Rysk: <span className="font-mono">{fmt(rysk.usdcBalance)}</span>
                  {" → "}<span className="font-mono">{fmt(projectedUsdc)}</span>{" "}
                  <span className={usdcDelta >= 0 ? "text-emerald-400" : "text-red-400"}>
                    ({usdcDelta >= 0 ? "+" : ""}{fmt(usdcDelta)})
                  </span>
                </p>
                <p>
                  • {pos.asset} בארנק Rysk: <span className="font-mono">
                    {(existingCryptoAsset?.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </span>
                  {" → "}<span className="font-mono">
                    {projectedCryptoAmount.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </span>{" "}
                  <span className={cryptoDelta >= 0 ? "text-emerald-400" : "text-red-400"}>
                    ({cryptoDelta >= 0 ? "+" : ""}{cryptoDelta.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                    {pos.option_type === "Put" && ` @ avg cost ${fmt(strike)}`})
                  </span>
                </p>
                {autoItmPnl != null && (
                  <p>
                    • Realized P&L: <span className={`font-mono ${autoItmPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {autoItmPnl >= 0 ? "+" : ""}{fmt(autoItmPnl, 2)}
                    </span>
                  </p>
                )}
              </div>

              {/* Validation warnings */}
              {pos.option_type === "Call" && projectedCryptoAmount < 0 && (
                <p className="text-xs text-red-400 border-t border-red-400/30 pt-2">
                  ⚠ אזהרה: אין מספיק {pos.asset} בארנק. נדרש {units.toLocaleString("en-US", { maximumFractionDigits: 6 })},{" "}
                  קיים {(existingCryptoAsset?.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 6 })}.
                  ניתן לבצע, אבל ה-amount יירד מתחת לאפס.
                </p>
              )}
              {pos.option_type === "Put" && projectedUsdc < 0 && (
                <p className="text-xs text-red-400 border-t border-red-400/30 pt-2">
                  ⚠ אזהרה: אין מספיק USDC בארנק. נדרש {fmt(Math.abs(usdcDelta))}, קיים {fmt(rysk.usdcBalance)}.
                </p>
              )}

              <Button
                className="w-full mt-2"
                onClick={handleAssignmentExecute}
                disabled={executing}
              >
                {executing ? "מבצע..." : "צור פוזיציית קריפטו וסגור את האופציה"}
              </Button>
            </div>
          )}

          {/* Manual override fields (kept for the "סגור בלי עדכון ארנק" path) */}
          {autoIsItm && (
            <>
              <div>
                <Label>Settlement Result (text)</Label>
                <Input
                  value={settlementResult}
                  onChange={(e) => setSettlementResult(e.target.value)}
                  placeholder={pos.option_type === "Put" ? `Received ${pos.asset} at ${fmt(strike)}` : `Delivered ${pos.asset} at ${fmt(strike)}`}
                />
              </div>
              <div>
                <Label>Net P&L (override)</Label>
                <Input
                  type="number"
                  value={netPnl}
                  onChange={(e) => setNetPnl(e.target.value)}
                  placeholder={autoItmPnl != null ? String(autoItmPnl.toFixed(2)) : ""}
                />
              </div>
            </>
          )}

          <Button className="w-full" variant={autoIsItm ? "outline" : "default"} onClick={handleConfirm}>
            {autoIsItm ? "סגור בלי עדכון ארנק" : "Confirm OTM — Keep Premium"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
