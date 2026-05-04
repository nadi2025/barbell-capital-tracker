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

const CATEGORIES = ["Real Estate", "Venture Capital", "Internal Product", "Other"];
const FUNDING_SOURCES = ["Company Equity", "Debt Investors", "Mixed"];
const STATUSES = ["Active", "Realized", "Written Off"];
const CURRENCIES = ["USD", "ILS"];

const blank = {
  name: "",
  category: "Real Estate",
  investment_date: "",
  initial_cost: "",
  current_value: "",
  last_valued_at: "",
  currency: "USD",
  ownership_percent: "",
  status: "Active",
  funding_source: "Company Equity",
  notes: "",
};

export default function PrivateInvestmentForm({ open, onClose, editInvestment, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editInvestment) {
      setForm({
        name: editInvestment.name || "",
        category: editInvestment.category || "Real Estate",
        investment_date: editInvestment.investment_date || "",
        initial_cost: editInvestment.initial_cost ?? "",
        current_value: editInvestment.current_value ?? "",
        last_valued_at: editInvestment.last_valued_at || "",
        currency: editInvestment.currency || "USD",
        ownership_percent: editInvestment.ownership_percent ?? "",
        status: editInvestment.status || "Active",
        funding_source: editInvestment.funding_source || "Company Equity",
        notes: editInvestment.notes || "",
      });
    } else {
      setForm(blank);
    }
  }, [editInvestment, open]);

  const handleSave = async () => {
    if (!form.name || !form.investment_date) {
      toast.error("Name + Investment Date are required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        category: form.category,
        investment_date: form.investment_date,
        initial_cost: parseFloat(form.initial_cost) || 0,
        current_value: parseFloat(form.current_value) || 0,
        last_valued_at: form.last_valued_at || undefined,
        currency: form.currency,
        ownership_percent: form.ownership_percent === "" ? undefined : parseFloat(form.ownership_percent),
        status: form.status,
        funding_source: form.funding_source,
        notes: form.notes || undefined,
      };
      if (editInvestment) {
        await base44.entities.PrivateInvestment.update(editInvestment.id, data);
        toast.success("השקעה עודכנה");
      } else {
        await base44.entities.PrivateInvestment.create(data);
        toast.success("השקעה נוספה");
      }
      queryClient.invalidateQueries({ queryKey: ["entity", "PrivateInvestment"] });
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
          <DialogTitle>{editInvestment ? "Edit Private Investment" : "New Private Investment"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="col-span-2">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Portugal Real Estate" />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <MobileSelect
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              placeholder="Category"
              options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <Label className="text-xs">Funding Source</Label>
            <MobileSelect
              value={form.funding_source}
              onValueChange={(v) => setForm((f) => ({ ...f, funding_source: v }))}
              placeholder="Funding"
              options={FUNDING_SOURCES.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <Label className="text-xs">Investment Date</Label>
            <Input type="date" value={form.investment_date} onChange={(e) => setForm((f) => ({ ...f, investment_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Last Valued At</Label>
            <Input type="date" value={form.last_valued_at} onChange={(e) => setForm((f) => ({ ...f, last_valued_at: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Initial Cost</Label>
            <Input type="number" step="0.01" value={form.initial_cost} onChange={(e) => setForm((f) => ({ ...f, initial_cost: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Current Value</Label>
            <Input type="number" step="0.01" value={form.current_value} onChange={(e) => setForm((f) => ({ ...f, current_value: e.target.value }))} />
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
            <Label className="text-xs">Ownership (%)</Label>
            <Input type="number" step="0.01" value={form.ownership_percent} onChange={(e) => setForm((f) => ({ ...f, ownership_percent: e.target.value }))} />
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
          <Button onClick={handleSave} disabled={saving || !form.name || !form.investment_date}>
            {saving ? "Saving..." : editInvestment ? "Update" : "Add Investment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
