import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function FxCloseDialog({ open, onClose, transaction }) {
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setDate(new Date().toISOString().slice(0, 10));
  }, [open]);

  const handleClose = async () => {
    if (!transaction || !date) return;
    setSaving(true);
    try {
      await base44.entities.FxHedgeTransaction.update(transaction.id, {
        status: "SETTLED",
        manual_close_date: date,
      });
      queryClient.invalidateQueries({ queryKey: ["entity", "FxHedgeTransaction"] });
      toast.success("העסקה סומנה כסגורה");
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>סגירת עסקה ידנית</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            עסקה <span className="font-mono font-semibold">{transaction?.reference}</span> תסומן כ-SETTLED.
          </p>
          <div>
            <Label className="text-xs">תאריך סגירה</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>בטל</Button>
          <Button onClick={handleClose} disabled={saving}>{saving ? "סוגר…" : "סגור עסקה"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}