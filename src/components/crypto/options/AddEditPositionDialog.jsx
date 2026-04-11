import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STRATEGIES = [
  { label: "Cash Secured Put", type: "Put", direction: "Sell" },
  { label: "Covered Call", type: "Call", direction: "Sell" },
  { label: "Naked Put", type: "Put", direction: "Sell" },
  { label: "Naked Call", type: "Call", direction: "Sell" },
];

const DEFAULT = {
  platform: "Rysk Finance",
  asset: "UETH",
  strategy: "Cash secured put",
  option_type: "Put",
  direction: "Sell",
  strike_price: "",
  current_price: "",
  apr_percent: "",
  income_usd: "",
  size: "",
  notional_usd: "",
  opened_date: new Date().toISOString().split("T")[0],
  maturity_date: "",
  status: "Open",
  notes: "",
};

export default function AddEditPositionDialog({ open, onClose, onSave, initialData, globalPrices }) {
  const [form, setForm] = useState(DEFAULT);
  const isEdit = !!initialData;

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({ ...DEFAULT, ...initialData });
      } else {
        const ethPrice = globalPrices?.ETH || "";
        setForm({ ...DEFAULT, current_price: String(ethPrice), opened_date: new Date().toISOString().split("T")[0] });
      }
    }
  }, [open, initialData]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStrategyChange = (label) => {
    const s = STRATEGIES.find(x => x.label === label);
    if (s) {
      const price = form.asset?.includes("BTC") ? (globalPrices?.BTC || "") : (globalPrices?.ETH || "");
      setForm(f => ({ ...f, strategy: label.toLowerCase(), option_type: s.type, direction: s.direction, current_price: String(price) }));
    }
  };

  const handleAssetChange = (asset) => {
    const price = asset.includes("BTC") ? (globalPrices?.BTC || "") : (globalPrices?.ETH || "");
    setForm(f => ({ ...f, asset, current_price: String(price) }));
  };

  const handleSave = () => {
    const data = {
      ...form,
      strike_price: parseFloat(form.strike_price) || null,
      current_price: parseFloat(form.current_price) || null,
      apr_percent: parseFloat(form.apr_percent) || 0,
      income_usd: parseFloat(form.income_usd) || 0,
      size: parseFloat(form.size) || 0,
      notional_usd: parseFloat(form.notional_usd) || 0,
    };
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Position" : "Add Option Position"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {/* Asset */}
          <div>
            <Label>Asset</Label>
            <select value={form.asset} onChange={e => handleAssetChange(e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-transparent">
              <option value="UETH">UETH</option>
              <option value="UBTC">UBTC</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Strategy */}
          <div>
            <Label>Strategy</Label>
            <select
              value={STRATEGIES.find(s => s.label.toLowerCase() === form.strategy)?.label || ""}
              onChange={e => handleStrategyChange(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-transparent"
            >
              {STRATEGIES.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Strike Price ($)</Label>
              <Input type="number" value={form.strike_price} onChange={e => setField("strike_price", e.target.value)} />
            </div>
            <div>
              <Label>Current Price ($)</Label>
              <Input type="number" value={form.current_price} onChange={e => setField("current_price", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Premium / Income ($)</Label>
              <Input type="number" step="0.01" value={form.income_usd} onChange={e => setField("income_usd", e.target.value)} />
            </div>
            <div>
              <Label>APR (%)</Label>
              <Input type="number" step="0.01" value={form.apr_percent} onChange={e => setField("apr_percent", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Size (Contracts)</Label>
              <Input type="number" value={form.size} onChange={e => setField("size", e.target.value)} />
            </div>
            <div>
              <Label>Notional (USD)</Label>
              <Input type="number" value={form.notional_usd} onChange={e => setField("notional_usd", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Opened Date</Label>
              <Input type="date" value={form.opened_date} onChange={e => setField("opened_date", e.target.value)} />
            </div>
            <div>
              <Label>Maturity Date</Label>
              <Input type="date" value={form.maturity_date} onChange={e => setField("maturity_date", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setField("notes", e.target.value)} />
          </div>

          <Button className="w-full" onClick={handleSave}>
            {isEdit ? "Save Changes" : "Add Position"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}