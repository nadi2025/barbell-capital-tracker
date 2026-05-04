import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import MobileSelect from "@/components/ui/MobileSelect";

/**
 * Record-payment dialog. Pre-fills `amount` from the investor's accrued
 * interest for one period (rate * principal / periods-per-year). User can
 * override.
 */
const STATUSES = ["Scheduled", "Paid"];

function defaultPeriodAmount(investor) {
  if (!investor) return "";
  const rate = (Number(investor.interest_rate) || 0) / 100;
  const principal = Number(investor.principal) || 0;
  const periodsPerYear = investor.payment_frequency === "Monthly" ? 12
    : investor.payment_frequency === "Quarterly" ? 4
    : investor.payment_frequency === "Annual" ? 1
    : 0;
  if (!periodsPerYear) return "";
  return ((principal * rate) / periodsPerYear).toFixed(2);
}

export default function PrivatePaymentDialog({ open, onClose, investor, editPayment, onSaved }) {
  const queryClient = useQueryClient();
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [periodCovered, setPeriodCovered] = useState("");
  const [status, setStatus] = useState("Paid");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editPayment) {
      setPaymentDate(editPayment.payment_date || "");
      setAmount(editPayment.amount ?? "");
      setPeriodCovered(editPayment.period_covered || "");
      setStatus(editPayment.status || "Paid");
      setNotes(editPayment.notes || "");
    } else {
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setAmount(defaultPeriodAmount(investor));
      setPeriodCovered("");
      setStatus("Paid");
      setNotes("");
    }
  }, [open, editPayment, investor]);

  const handleSave = async () => {
    const subject = editPayment || investor;
    if (!subject) return;
    const investorId = editPayment?.investor_id || investor?.id;
    const investorName = editPayment?.investor_name || investor?.name;
    const a = parseFloat(amount);
    if (!paymentDate || isNaN(a)) {
      toast.error("Date + amount required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        investor_id: investorId,
        investor_name: investorName,
        payment_date: paymentDate,
        amount: a,
        currency: investor?.currency || editPayment?.currency || "USD",
        period_covered: periodCovered || undefined,
        status,
        notes: notes || undefined,
      };
      if (editPayment) {
        await base44.entities.PrivateInterestPayment.update(editPayment.id, data);
        toast.success("Payment עודכן");
      } else {
        await base44.entities.PrivateInterestPayment.create(data);
        toast.success("Payment נרשם");
      }
      queryClient.invalidateQueries({ queryKey: ["entity", "PrivateInterestPayment"] });
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error("שגיאה: " + e.message);
    }
    setSaving(false);
  };

  const title = editPayment ? "Edit Payment" : `Record Payment — ${investor?.name || ""}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <Label className="text-xs">Payment Date</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Period Covered</Label>
            <Input value={periodCovered} onChange={(e) => setPeriodCovered(e.target.value)} placeholder="Q1 2026 or Jan 2026" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Status</Label>
            <MobileSelect
              value={status}
              onValueChange={setStatus}
              placeholder="Status"
              options={STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editPayment ? "Update" : "Record Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
