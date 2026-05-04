import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Update-valuation dialog. On save: creates a PrivateInvestmentValuation row
 * AND updates current_value + last_valued_at on the parent PrivateInvestment.
 */
export default function PrivateValuationDialog({ open, onClose, investment, onSaved }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [valuationDate, setValuationDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(investment?.current_value ?? "");
      setValuationDate(new Date().toISOString().slice(0, 10));
      setNotes("");
    }
  }, [open, investment]);

  const handleSave = async () => {
    if (!investment?.id) return;
    const v = parseFloat(value);
    if (!valuationDate || isNaN(v)) {
      toast.error("תאריך + שווי נדרשים");
      return;
    }
    setSaving(true);
    try {
      // Create history row first.
      await base44.entities.PrivateInvestmentValuation.create({
        investment_id: investment.id,
        valuation_date: valuationDate,
        value: v,
        currency: investment.currency || "USD",
        notes: notes || undefined,
      });
      // Then update the parent investment with the latest value.
      await base44.entities.PrivateInvestment.update(investment.id, {
        current_value: v,
        last_valued_at: valuationDate,
      });
      toast.success("Valuation עודכן");
      queryClient.invalidateQueries({ queryKey: ["entity", "PrivateInvestment"] });
      queryClient.invalidateQueries({ queryKey: ["entity", "PrivateInvestmentValuation"] });
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error("שגיאה: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle>Update Valuation — {investment?.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <Label className="text-xs">Valuation Date</Label>
            <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Value ({investment?.currency || "USD"})</Label>
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Q4 valuation update from sponsor" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Valuation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
