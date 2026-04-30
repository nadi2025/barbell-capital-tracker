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

export default function StockPositionForm({ open, onClose, editStock, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ticker: "", source: "Direct Buy", entry_date: "", shares: "",
    average_cost: "", current_price: "", status: "Holding", notes: "",
    high_52w: "", low_52w: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editStock) {
      setForm({
        ticker: editStock.ticker || "",
        source: editStock.source || "Direct Buy",
        entry_date: editStock.entry_date || "",
        shares: editStock.shares || "",
        average_cost: editStock.average_cost || "",
        current_price: editStock.current_price || "",
        status: editStock.status || "Holding",
        notes: editStock.notes || "",
        high_52w: editStock.high_52w || "",
        low_52w: editStock.low_52w || "",
      });
    } else {
      setForm({
        ticker: "", source: "Direct Buy", entry_date: "", shares: "",
        average_cost: "", current_price: "", status: "Holding", notes: "",
        high_52w: "", low_52w: "",
      });
    }
  }, [editStock, open]);

  const handleSave = async () => {
    setSaving(true);
    const shares = parseFloat(form.shares) || 0;
    const avgCost = parseFloat(form.average_cost) || 0;
    // invested_value is the cost-basis baseline that StocksPage's enrichedStocks
    // memo subtracts from current_value to get gain_loss. Without it, brand-new
    // positions show P&L = full position value.
    const invested_value = shares * avgCost;

    const data = {
      ticker: form.ticker.toUpperCase(),
      source: form.source,
      entry_date: form.entry_date,
      shares,
      average_cost: avgCost,
      invested_value,
      status: form.status,
      high_52w: parseFloat(form.high_52w) || undefined,
      low_52w: parseFloat(form.low_52w) || undefined,
      notes: form.notes || undefined,
    };

    if (editStock) {
      await base44.entities.StockPosition.update(editStock.id, data);
      toast.success("Position updated");
    } else {
      // Auto-merge: if an open (Holding / Partially Sold) position for this
      // ticker already exists, blend new shares into it with a weighted-average
      // cost basis instead of creating a duplicate row.
      const existing = await base44.entities.StockPosition.filter({
        ticker: data.ticker,
      });
      const mergeTarget = (existing || []).find(
        (s) => s.status === "Holding" || s.status === "Partially Sold"
      );

      if (mergeTarget) {
        const oldShares = mergeTarget.shares || 0;
        const oldAvg = mergeTarget.average_cost || 0;
        const newShares = oldShares + shares;
        const newAvg = newShares > 0
          ? (oldShares * oldAvg + shares * avgCost) / newShares
          : avgCost;
        const newInvested = newShares * newAvg;

        await base44.entities.StockPosition.update(mergeTarget.id, {
          shares: newShares,
          average_cost: newAvg,
          invested_value: newInvested,
        });
        toast.success(`Merged ${shares} shares into existing ${data.ticker} position (avg cost $${newAvg.toFixed(2)})`);
      } else {
        await base44.entities.StockPosition.create(data);
        toast.success("Position added");
      }
    }

    queryClient.invalidateQueries({ queryKey: ["entity", "StockPosition"] });
    queryClient.invalidateQueries({ queryKey: ["function"] });

    setSaving(false);
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>{editStock ? "Edit Position" : "New Stock Position"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <Label className="text-xs">Ticker</Label>
            <Input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="AAPL" />
          </div>
          <div>
            <Label className="text-xs">Source</Label>
            <MobileSelect
              value={form.source}
              onValueChange={v => setForm(f => ({ ...f, source: v }))}
              placeholder="Source"
              options={[
                { value: "Assignment", label: "Assignment" },
                { value: "Direct Buy", label: "Direct Buy" },
                { value: "SDI", label: "SDI" },
              ]}
            />
          </div>
          <div>
            <Label className="text-xs">Entry Date</Label>
            <Input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <MobileSelect
              value={form.status}
              onValueChange={v => setForm(f => ({ ...f, status: v }))}
              placeholder="Status"
              options={[
                { value: "Holding", label: "Holding" },
                { value: "Partially Sold", label: "Partially Sold" },
                { value: "Closed", label: "Closed" },
              ]}
            />
          </div>
          <div>
            <Label className="text-xs">Shares</Label>
            <Input type="number" value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Average Cost ($)</Label>
            <Input type="number" step="0.01" value={form.average_cost} onChange={e => setForm(f => ({ ...f, average_cost: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Current Price ($)</Label>
            <Input type="number" step="0.01" value={form.current_price} onChange={e => setForm(f => ({ ...f, current_price: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">52-Week High</Label>
            <Input type="number" step="0.01" value={form.high_52w} onChange={e => setForm(f => ({ ...f, high_52w: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">52-Week Low</Label>
            <Input type="number" step="0.01" value={form.low_52w} onChange={e => setForm(f => ({ ...f, low_52w: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.ticker || !form.entry_date}>
            {saving ? "Saving..." : editStock ? "Update" : "Add Position"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}