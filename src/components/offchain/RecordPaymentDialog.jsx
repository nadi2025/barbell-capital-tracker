import { useState, useEffect } from "react";
import { format, addMonths, differenceInMonths } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RecordPaymentDialog({ open, investor, paymentsCount, onClose, onSave }) {
  const [form, setForm] = useState({ payment_date: "", amount: "", notes: "" });

  useEffect(() => {
    if (open && investor) {
      const nextDate = addMonths(new Date(investor.start_date), paymentsCount + 1);
      setForm({
        payment_date: format(nextDate, "yyyy-MM-dd"),
        amount: String(investor.monthly_payment || (investor.principal_usd * investor.interest_rate / 100 / 12).toFixed(0)),
        notes: "",
      });
    }
  }, [open, investor, paymentsCount]);

  const handleSave = () => {
    onSave({
      investor_id: investor.id,
      investor_name: investor.name,
      payment_date: form.payment_date,
      amount: parseFloat(form.amount),
      currency: investor.interest_currency || "USD",
      payment_type: "Monthly Interest",
      notes: form.notes,
    });
  };

  if (!investor) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment — {investor.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payment Date</Label>
            <Input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
          </div>
          <div>
            <Label>Amount ({investor.interest_currency || "USD"})</Label>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <Button className="w-full" onClick={handleSave}>Save Payment</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}