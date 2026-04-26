import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * DepositWithdrawDialog — small modal that records a Rysk-tagged cash flow
 * by writing to the Deposit entity with platform="Rysk".
 *
 * Important: this dialog does NOT mutate the USDC CryptoAsset in the Rysk
 * wallet. Cash balance is the responsibility of WalletsPage; the deposit
 * record is the accounting-side note. The reconciliation hint on the
 * RyskWalletCard surfaces drift if the two diverge.
 */
export default function DepositWithdrawDialog({ open, mode, onClose }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [capitalSource, setCapitalSource] = useState("Equity Cash Flow");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setCapitalSource("Equity Cash Flow");
      setNotes("");
    }
  }, [open]);

  if (!mode) return null;

  const isDeposit = mode === "Deposit";
  const titleHe = isDeposit ? "הפקדה ל-Rysk" : "משיכה מ-Rysk";

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error("הזן סכום חיובי");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Deposit.create({
        date,
        type: mode,
        amount: amt,
        platform: "Rysk",
        capital_source: capitalSource,
        notes: notes || undefined,
      });
      toast.success(isDeposit ? "הפקדה נרשמה" : "משיכה נרשמה");
      // Invalidate so RyskWalletCard rerenders with new totals
      queryClient.invalidateQueries({ queryKey: ["entity", "Deposit"] });
      onClose();
    } catch (e) {
      toast.error("שגיאה: " + (e?.message || "לא ידוע"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleHe}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>סכום (USD)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>תאריך</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {isDeposit && (
            <div>
              <Label>מקור הון</Label>
              <Select value={capitalSource} onValueChange={setCapitalSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Equity Investment">Equity Investment</SelectItem>
                  <SelectItem value="Equity Cash Flow">Equity Cash Flow</SelectItem>
                  <SelectItem value="Debt Investment">Debt Investment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>הערות</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Reconciliation reminder */}
          <div className="bg-muted/50 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {isDeposit
                ? "פעולה זו רושמת את ההפקדה כתזרים הון. עדכן בנפרד את היתרת USDC בארנק Rysk ב-WalletsPage."
                : "פעולה זו רושמת את המשיכה כתזרים הון. עדכן בנפרד את היתרת USDC בארנק Rysk ב-WalletsPage."}
            </p>
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "שומר..." : (isDeposit ? "אשר הפקדה" : "אשר משיכה")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
