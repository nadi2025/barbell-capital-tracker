import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins } from "lucide-react";
import { toast } from "sonner";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";

/**
 * AssignAssetDialog — when a Sell Put is marked "Exercised", the user
 * receives `size × multiplier` units of the underlying at strike. This
 * modal lets them pick which CryptoWallet should hold the asset and either
 * top up an existing CryptoAsset row of that token or create a new one.
 *
 * It does NOT do the cash-out side; that's a separate CryptoCashFlow row
 * (type "Exercise Buy") logged by the OptionsPage Settle handler.
 */
const OPT_MULT = 100;

export default function AssignAssetDialog({ open, position, onClose, onConfirm }) {
  const walletsQ = useEntityList("CryptoWallet");
  const assetsQ = useEntityList("CryptoAsset");
  const createAsset = useEntityMutation("CryptoAsset", "create");
  const updateAsset = useEntityMutation("CryptoAsset", "update");

  const [walletId, setWalletId] = useState("");
  const [mode, setMode] = useState("topup"); // topup | new
  const [targetAssetId, setTargetAssetId] = useState("");

  const wallets = walletsQ.data || [];
  const assets = assetsQ.data || [];

  // Units to assign — per options convention: 1 contract = 100 units.
  const units = (position?.size || 0) * OPT_MULT;
  const totalCost = (position?.strike_price || 0) * units;

  // Existing rows in the chosen wallet matching this position's asset symbol
  const matchingAssets = useMemo(() => {
    if (!walletId || !position?.asset) return [];
    const sym = position.asset.toUpperCase();
    return assets.filter((a) =>
      a.wallet_id === walletId &&
      (a.token || "").toUpperCase() === sym
    );
  }, [assets, walletId, position]);

  useEffect(() => {
    if (!open) return;
    setWalletId(wallets[0]?.id || "");
    setMode("topup");
    setTargetAssetId("");
  }, [open, wallets]);

  // Auto-pick the first matching asset when wallet changes (most common path)
  useEffect(() => {
    if (matchingAssets[0]?.id) {
      setTargetAssetId(matchingAssets[0].id);
      setMode("topup");
    } else {
      setTargetAssetId("");
      setMode("new");
    }
  }, [matchingAssets]);

  const handleConfirm = async () => {
    if (!walletId) { toast.error("בחר ארנק"); return; }
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;

    try {
      if (mode === "topup" && targetAssetId) {
        const target = assets.find((a) => a.id === targetAssetId);
        if (target) {
          const newAmount = (Number(target.amount) || 0) + units;
          await updateAsset.mutateAsync({
            id: target.id,
            data: {
              amount: newAmount,
              last_updated: new Date().toISOString().slice(0, 10),
            },
          });
        }
      } else {
        await createAsset.mutateAsync({
          token: position.asset,
          amount: units,
          asset_category: "Spot",
          wallet_id: walletId,
          wallet_name: wallet.name,
          last_updated: new Date().toISOString().slice(0, 10),
        });
      }
      toast.success(`${position.asset} × ${units} נוסף לארנק`);
      onConfirm?.({ walletId, units, totalCost });
      onClose();
    } catch (e) {
      toast.error(`שגיאה: ${e.message}`);
    }
  };

  if (!position) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-500" />
            ייבוא נכס מ-Exercise · {position.asset}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="bg-muted/30 border border-border/40 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">סוג</span><span>Sell Put @ strike ${position.strike_price}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">חוזים</span><span className="font-mono">{position.size}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">כמות {position.asset} שתתקבל</span><span className="font-mono font-semibold">{units}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">עלות כוללת (יוצא מהמזומן)</span><span className="font-mono font-semibold text-loss">${totalCost.toLocaleString()}</span></div>
          </div>

          <div>
            <Label className="text-xs">ארנק יעד</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="בחר ארנק" /></SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name} · {w.network}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {matchingAssets.length > 0 && (
            <div>
              <Label className="text-xs">פעולה</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="topup">הוסף ל-{position.asset} קיים בארנק</SelectItem>
                  <SelectItem value="new">צור CryptoAsset חדש</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "topup" && matchingAssets.length > 0 && (
            <div>
              <Label className="text-xs">בחר רשומת CryptoAsset לעדכון</Label>
              <Select value={targetAssetId} onValueChange={setTargetAssetId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {matchingAssets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.token} · {a.amount} · {a.asset_category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "new" && (
            <p className="text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded p-2">
              ייווצר CryptoAsset חדש: token={position.asset}, amount={units}, category=Spot.
              ניתן לערוך פרטים נוספים מאוחר יותר ב-Wallets.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">בטל</Button>
            <Button onClick={handleConfirm} className="flex-1">אשר ייבוא</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
