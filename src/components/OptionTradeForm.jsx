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

export default function OptionTradeForm({ open, onClose, editTrade, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    type: "Sell", category: "Put", open_date: "", expiration_date: "",
    close_date: "", ticker: "", strike: "", strike_2: "", quantity: "",
    fill_price: "", close_price: "", fee: "", status: "Open", notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editTrade) {
      setForm({
        type: editTrade.type || "Sell",
        category: editTrade.category || "Put",
        open_date: editTrade.open_date || "",
        expiration_date: editTrade.expiration_date || "",
        close_date: editTrade.close_date || "",
        ticker: editTrade.ticker || "",
        strike: editTrade.strike || "",
        strike_2: editTrade.strike_2 || "",
        quantity: editTrade.quantity || "",
        fill_price: editTrade.fill_price || "",
        close_price: editTrade.close_price ?? "",
        fee: editTrade.fee || "",
        status: editTrade.status || "Open",
        notes: editTrade.notes || "",
      });
    } else {
      setForm({
        type: "Sell", category: "Put", open_date: "", expiration_date: "",
        close_date: "", ticker: "", strike: "", strike_2: "", quantity: "",
        fill_price: "", close_price: "", fee: "", status: "Open", notes: "",
      });
    }
  }, [editTrade, open]);

  const handleSave = async () => {
    setSaving(true);
    const qty = parseFloat(form.quantity) || 0;
    const strike = parseFloat(form.strike) || 0;
    const strike2 = parseFloat(form.strike_2) || 0;
    const fill = parseFloat(form.fill_price) || 0;
    const close = parseFloat(form.close_price) || 0;
    const fee = parseFloat(form.fee) || 0;

    // Calculate collateral
    let collateral = strike * qty * 100;
    if ((form.category === "PCS" || form.category === "CCS") && strike2) {
      collateral = Math.abs(strike - strike2) * qty * 100;
    }

    // Calculate P&L for closed trades
    let pnl = null;
    let daysHeld = null;
    let ppd = null;
    let roc = null;
    let annualizedRoc = null;

    if (form.status === "Closed" || form.status === "Expired") {
      if (form.type === "Sell") {
        pnl = (fill - close) * qty * 100 - fee;
      } else if (form.type === "Buy") {
        pnl = (close - fill) * qty * 100 - fee;
      }

      if (form.open_date && form.close_date) {
        daysHeld = Math.ceil((new Date(form.close_date) - new Date(form.open_date)) / (1000 * 60 * 60 * 24));
        if (daysHeld > 0 && pnl !== null) {
          ppd = pnl / daysHeld;
          if (collateral > 0) {
            roc = pnl / collateral;
            annualizedRoc = roc * (365 / daysHeld);
          }
        }
      }
    }

    const data = {
      type: form.type,
      category: form.category,
      open_date: form.open_date,
      expiration_date: form.expiration_date || undefined,
      close_date: form.close_date || undefined,
      ticker: form.ticker.toUpperCase(),
      strike,
      strike_2: strike2 || undefined,
      quantity: qty,
      fill_price: fill,
      close_price: close,
      fee: fee || undefined,
      status: form.status,
      collateral,
      pnl,
      days_held: daysHeld,
      ppd,
      roc,
      annualized_roc: annualizedRoc,
      notes: form.notes || undefined,
    };

    if (editTrade) {
      await base44.entities.OptionsTrade.update(editTrade.id, data);
      toast.success("Trade updated");
    } else {
      const created = await base44.entities.OptionsTrade.create(data);

      // Auto-create stock position for Assigned trades
      if (form.status === "Assigned") {
        const stockData = {
          ticker: form.ticker.toUpperCase(),
          source: "Assignment",
          entry_date: form.close_date || form.expiration_date || form.open_date,
          shares: qty * 100,
          average_cost: strike,
          status: "Holding",
          invested_value: strike * qty * 100,
          linked_option_id: created.id,
          notes: `Assigned from ${form.category} option`,
        };
        const stockPos = await base44.entities.StockPosition.create(stockData);
        await base44.entities.OptionsTrade.update(created.id, { linked_stock_id: stockPos.id });
      }

      toast.success("Trade added");
    }

    // Invalidate cached queries so the Dashboard (and any other page) refetches
    queryClient.invalidateQueries({ queryKey: ["entity", "OptionsTrade"] });
    queryClient.invalidateQueries({ queryKey: ["entity", "StockPosition"] });
    queryClient.invalidateQueries({ queryKey: ["function"] });

    setSaving(false);
    onSaved?.();
    onClose();
  };

  const isSpread = form.category === "PCS" || form.category === "CCS";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>{editTrade ? "Edit Trade" : "New Options Trade"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <Label className="text-xs">Type</Label>
            <MobileSelect
              value={form.type}
              onValueChange={v => setForm(f => ({ ...f, type: v }))}
              placeholder="Type"
              options={[
                { value: "Sell", label: "Sell" },
                { value: "Buy", label: "Buy" },
                { value: "Ass", label: "Assigned" },
              ]}
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <MobileSelect
              value={form.category}
              onValueChange={v => setForm(f => ({ ...f, category: v }))}
              placeholder="Category"
              options={[
                { value: "Put", label: "Put" },
                { value: "Call", label: "Call" },
                { value: "PCS", label: "Put Credit Spread" },
                { value: "CCS", label: "Call Credit Spread" },
              ]}
            />
          </div>
          <div>
            <Label className="text-xs">Ticker</Label>
            <Input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="AAPL" />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <MobileSelect
              value={form.status}
              onValueChange={v => setForm(f => ({ ...f, status: v }))}
              placeholder="Status"
              options={[
                { value: "Open", label: "Open" },
                { value: "Closed", label: "Closed" },
                { value: "Assigned", label: "Assigned" },
                { value: "Expired", label: "Expired" },
              ]}
            />
          </div>
          <div>
            <Label className="text-xs">Open Date</Label>
            <Input type="date" value={form.open_date} onChange={e => setForm(f => ({ ...f, open_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Expiration Date</Label>
            <Input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Close Date</Label>
            <Input type="date" value={form.close_date} onChange={e => setForm(f => ({ ...f, close_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Strike</Label>
            <Input type="number" step="0.01" value={form.strike} onChange={e => setForm(f => ({ ...f, strike: e.target.value }))} />
          </div>
          {isSpread && (
            <div>
              <Label className="text-xs">Strike 2</Label>
              <Input type="number" step="0.01" value={form.strike_2} onChange={e => setForm(f => ({ ...f, strike_2: e.target.value }))} />
            </div>
          )}
          <div>
            <Label className="text-xs">Quantity</Label>
            <Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Fill Price ($)</Label>
            <Input type="number" step="0.01" value={form.fill_price} onChange={e => setForm(f => ({ ...f, fill_price: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Close Price ($)</Label>
            <Input type="number" step="0.01" value={form.close_price} onChange={e => setForm(f => ({ ...f, close_price: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Fee ($)</Label>
            <Input type="number" step="0.01" value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.ticker || !form.open_date}>
            {saving ? "Saving..." : editTrade ? "Update" : "Add Trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}