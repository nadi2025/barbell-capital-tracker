import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import MobileSelect from "@/components/ui/MobileSelect";

const FREQUENCIES = ["Monthly", "Quarterly", "Annual", "At Maturity"];
const STATUSES = ["Active", "Repaid", "Defaulted"];
const CURRENCIES = ["USD", "ILS"];

const blank = {
  name: "",
  principal: "",
  currency: "USD",
  interest_rate: "",
  payment_frequency: "Monthly",
  start_date: "",
  maturity_date: "",
  linked_investment_name: "",
  status: "Active",
  notes: "",
};

export default function PrivateInvestorForm({ open, onClose, editInvestor, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editInvestor) {
      setForm({
        name: editInvestor.name || "",
        principal: editInvestor.principal ?? "",
        currency: editInvestor.currency || "USD",
        interest_rate: editInvestor.interest_rate ?? "",
        payment_frequency: editInvestor.payment_frequency || "Monthly",
        start_date: editInvestor.start_date || "",
        maturity_date: editInvestor.maturity_date || "",
        linked_investment_name: editInvestor.linked_investment_name || "",
        status: editInvestor.status || "Active",
        notes: editInvestor.notes || "",
      });
    } else {
      setForm(blank);
    }
  }, [editInvestor, open]);

  const handleSave = async () => {
    if (!form.name || !form.start_date || !form.maturity_date) {
      toast.error("Name + Start Date + Maturity Date required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        principal: parseFloat(form.principal) || 0,
        currency: form.currency,
        interest_rate: parseFloat(form.interest_rate) || 0,
        payment_frequency: form.payment_frequency,
        start_date: form.start_date,
        maturity_date: form.maturity_date,
        linked_investment_name: form.linked_investment_name || undefined,
        status: form.status,
        notes: form.notes || undefined,
      };
      if (editInvestor) {
        await base44.entities.PrivateDebtInvestor.update(editInvestor.id, data);
        toast.success("משקיע עודכן");
      } else {
        await base44.entities.PrivateDebtInvestor.create(data);
        toast.success("משקיע נוסף");
      }
      queryClient.invalidateQueries({ queryKey: ["entity", "PrivateDebtInvestor"] });
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error("שגיאה: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>{editInvestor ? "Edit Private Debt Investor" : "New Private Debt Investor"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="col-span-2">
            <Label className="text-xs">Investor Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sigma Holdings" />
          </div>
          <div>
            <Label className="text-xs">Principal</Label>
            <Input type="number" step="0.01" value={form.principal} onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <MobileSelect
              value={form.currency}
              onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              placeholder="Currency"
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <Label className="text-xs">Interest Rate (% annual)</Label>
            <Input type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm((f) => ({ ...f, interest_rate: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Payment Frequency</Label>
            <MobileSelect
              value={form.payment_frequency}
              onValueChange={(v) => setForm((f) => ({ ...f, payment_frequency: v }))}
              placeholder="Frequency"
              options={FREQUENCIES.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Maturity Date</Label>
            <Input type="date" value={form.maturity_date} onChange={(e) => setForm((f) => ({ ...f, maturity_date: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Linked Investment (label, optional)</Label>
            <Input value={form.linked_investment_name} onChange={(e) => setForm((f) => ({ ...f, linked_investment_name: e.target.value }))} placeholder="Portugal Real Estate" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Status</Label>
            <MobileSelect
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              placeholder="Status"
              options={STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name || !form.start_date || !form.maturity_date}>
            {saving ? "Saving..." : editInvestor ? "Update" : "Add Investor"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
