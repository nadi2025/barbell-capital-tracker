import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT = {
  name: "", principal_usd: "", principal_ils: "", interest_rate: "",
  interest_schedule: "At Maturity", interest_currency: "USD",
  monthly_payment: "", start_date: "", maturity_date: "",
  investment_location: "Interactive Brokers", status: "Active", notes: "",
};

export default function AddInvestorDialog({ open, onClose, onSave, initialData }) {
  const [form, setForm] = useState(DEFAULT);
  const isEdit = !!initialData;

  useEffect(() => {
    if (open) setForm(initialData ? { ...DEFAULT, ...initialData } : DEFAULT);
  }, [open, initialData]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    onSave({
      ...form,
      principal_usd: parseFloat(form.principal_usd) || 0,
      principal_ils: parseFloat(form.principal_ils) || null,
      interest_rate: parseFloat(form.interest_rate) || 0,
      monthly_payment: parseFloat(form.monthly_payment) || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Investor" : "Add Investor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <Label>Investor Name</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Principal (USD)</Label>
              <Input type="number" value={form.principal_usd} onChange={e => set("principal_usd", e.target.value)} />
            </div>
            <div>
              <Label>Principal (ILS, optional)</Label>
              <Input type="number" value={form.principal_ils} onChange={e => set("principal_ils", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Interest Rate (%)</Label>
              <Input type="number" step="0.1" value={form.interest_rate} onChange={e => set("interest_rate", e.target.value)} />
            </div>
            <div>
              <Label>Interest Schedule</Label>
              <select value={form.interest_schedule} onChange={e => set("interest_schedule", e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-transparent">
                <option value="Monthly">Monthly</option>
                <option value="At Maturity">At Maturity</option>
              </select>
            </div>
          </div>
          {form.interest_schedule === "Monthly" && (
            <div>
              <Label>Monthly Payment (USD)</Label>
              <Input type="number" value={form.monthly_payment} onChange={e => set("monthly_payment", e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Interest Currency</Label>
              <select value={form.interest_currency} onChange={e => set("interest_currency", e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-transparent">
                <option value="USD">USD</option>
                <option value="ILS">ILS</option>
              </select>
            </div>
            <div>
              <Label>Investment Location</Label>
              <select value={form.investment_location} onChange={e => set("investment_location", e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-transparent">
                <option value="Interactive Brokers">Interactive Brokers</option>
                <option value="Leumi Notes">Leumi Notes</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
            </div>
            <div>
              <Label>Maturity Date</Label>
              <Input type="date" value={form.maturity_date} onChange={e => set("maturity_date", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave}>{isEdit ? "Save Changes" : "Add Investor"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}