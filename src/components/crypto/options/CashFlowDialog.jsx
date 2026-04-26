import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { useEntityMutation } from "@/hooks/useEntityQuery";

/**
 * CashFlowDialog — record a deposit or withdrawal against the Crypto Options
 * cash ledger. Writes a single CryptoCashFlow row; the cash balance is
 * derived (sum of signed amounts) by useCryptoOptionsCash, so there's
 * nothing else to update.
 *
 * Sign convention enforced here:
 *   Deposit    → +amount
 *   Withdrawal → −amount
 *
 * The user enters a positive number; we apply the sign on save based on the
 * selected type. This way amounts in the table always read as positive.
 */
export default function CashFlowDialog({ open, onClose, defaultType = "Deposit" }) {
  const createFlow = useEntityMutation("CryptoCashFlow", "create");
  const [form, setForm] = useState({ date: "", type: defaultType, amount: "", notes: "" });

  useEffect(() => {
    if (!open) return;
    setForm({
      date: new Date().toISOString().slice(0, 10),
      type: defaultType,
      amount: "",
      notes: "",
    });
  }, [open, defaultType]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error("הזן סכום חיובי");
      return;
    }
    const signedAmount = form.type === "Withdrawal" ? -amount : amount;
    await createFlow.mutateAsync({
      date: form.date,
      type: form.type,
      amount_usd: signedAmount,
      notes: form.notes || undefined,
    });
    toast.success(form.type === "Deposit" ? "הופקד" : "נמשך");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {form.type === "Deposit"
              ? <><ArrowDownToLine className="w-4 h-4 text-profit" /> הפקדה לארנק</>
              : <><ArrowUpFromLine className="w-4 h-4 text-loss" /> משיכה מהארנק</>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs">סוג</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Deposit">Deposit (הפקדה)</SelectItem>
                <SelectItem value="Withdrawal">Withdrawal (משיכה)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">תאריך</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">סכום (USD)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="0"
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              הזן ערך חיובי. ה-Withdrawal ייכתב כסכום שלילי בלוג.
            </p>
          </div>
          <div>
            <Label className="text-xs">הערות (אופציונלי)</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">בטל</Button>
            <Button onClick={handleSave} className="flex-1">שמור</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
