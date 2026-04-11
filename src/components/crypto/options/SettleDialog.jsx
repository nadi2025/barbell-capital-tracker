import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const fmt = (v, d = 2) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

export default function SettleDialog({ pos, open, onClose, onConfirm }) {
  const [settlementPrice, setSettlementPrice] = useState("");
  const [settlementResult, setSettlementResult] = useState("");
  const [netPnl, setNetPnl] = useState("");

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

  // Auto-calc PnL for OTM
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
              onChange={e => setSettlementPrice(e.target.value)}
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

          {autoIsItm && (
            <>
              <div>
                <Label>Settlement Result (text)</Label>
                <Input
                  value={settlementResult}
                  onChange={e => setSettlementResult(e.target.value)}
                  placeholder={pos.option_type === "Put" ? `Received ${pos.asset} at ${fmt(strike)}` : `Delivered ${pos.asset} at ${fmt(strike)}`}
                />
              </div>
              <div>
                <Label>Net P&L (override)</Label>
                <Input
                  type="number"
                  value={netPnl}
                  onChange={e => setNetPnl(e.target.value)}
                  placeholder={autoItmPnl != null ? String(autoItmPnl.toFixed(2)) : ""}
                />
              </div>
            </>
          )}

          <Button className="w-full" onClick={handleConfirm}>
            {autoIsItm ? "Confirm ITM Settlement" : "Confirm OTM — Keep Premium"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}