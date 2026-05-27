import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectedMaturityValue, projectedTotalInterest } from "@/lib/offChainInterest";

const DEFAULT = {
  name: "", principal_usd: "", principal_ils: "", interest_rate: "",
  interest_schedule: "At Maturity", interest_type: "Simple", compound_frequency: "Annual",
  interest_currency: "USD",
  monthly_payment: "", start_date: "", maturity_date: "",
  investment_location: "Interactive Brokers", status: "Active", notes: "",
};

const fmtUSD = (v) => (v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));

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

  // Live preview of maturity value (only meaningful for "At Maturity" schedule)
  const preview = useMemo(() => {
    const inv = {
      ...form,
      principal_usd: parseFloat(form.principal_usd) || 0,
      interest_rate: parseFloat(form.interest_rate) || 0,
    };
    if (inv.interest_schedule !== "At Maturity" || !inv.principal_usd || !inv.interest_rate || !inv.start_date || !inv.maturity_date) {
      return null;
    }
    return {
      value: projectedMaturityValue(inv),
      interest: projectedTotalInterest(inv),
    };
  }, [form]);

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

          {form.interest_schedule === "At Maturity" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Interest Type</Label>
                <select value={form.interest_type} onChange={e => set("interest_type", e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-transparent">
                  <option value="Simple">Simple</option>
                  <option value="Compound">Compound (ריבית דריבית)</option>
                </select>
              </div>
              {form.interest_type === "Compound" && (
                <div>
                  <Label>Compounding Frequency</Label>
                  <select value={form.compound_frequency} onChange={e => set("compound_frequency", e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-transparent">
                    <option value="Annual">Annual</option>
                    <option value="Semi-Annual">Semi-Annual</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              )}
            </div>
          )}

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

          {preview && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ערך לפדיון (משוער)</span>
                <span className="font-mono font-semibold">{fmtUSD(preview.value)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">סך ריבית צבורה</span>
                <span className="font-mono text-emerald-600">+{fmtUSD(preview.interest)}</span>
              </div>
            </div>
          )}

          <Button className="w-full" onClick={handleSave}>{isEdit ? "Save Changes" : "Add Investor"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}