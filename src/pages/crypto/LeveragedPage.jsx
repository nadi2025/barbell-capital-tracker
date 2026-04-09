import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPrecise = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const emptyForm = { asset: "", platform: "HyperLiquid", leverage: "", size: "", margin_usd: "", position_value_usd: "", liquidation_price: "", direction: "Long", entry_price: "", mark_price: "", status: "Open", opened_date: "" };

// Calculate live PnL from mark_price, entry_price, size, direction
const calcPnl = (p) => {
  if (!p.mark_price || !p.entry_price || !p.size) return null;
  return p.direction === "Long"
    ? (p.mark_price - p.entry_price) * p.size
    : (p.entry_price - p.mark_price) * p.size;
};

const calcRoe = (p) => {
  const pnl = calcPnl(p);
  if (pnl == null || !p.margin_usd) return null;
  return (pnl / p.margin_usd) * 100;
};

export default function LeveragedPage() {
  const [positions, setPositions] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [markDialog, setMarkDialog] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("Open");
  const [markPrices, setMarkPrices] = useState({});

  const load = async () => {
    const data = await base44.entities.LeveragedPosition.list("-opened_date");
    setPositions(data);
    // Init mark prices from stored values
    const mp = {};
    data.forEach(p => { if (p.mark_price) mp[p.id] = p.mark_price; });
    setMarkPrices(mp);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data = { ...form, leverage: parseFloat(form.leverage) || null, size: parseFloat(form.size) || null, margin_usd: parseFloat(form.margin_usd) || null, position_value_usd: parseFloat(form.position_value_usd) || null, liquidation_price: parseFloat(form.liquidation_price) || null, entry_price: parseFloat(form.entry_price) || null, mark_price: parseFloat(form.mark_price) || null };
    if (editPos) await base44.entities.LeveragedPosition.update(editPos.id, data);
    else await base44.entities.LeveragedPosition.create(data);
    toast.success("Position saved"); setDialog(false); load();
  };

  const del = async (id) => {
    if (!confirm("Delete this position?")) return;
    await base44.entities.LeveragedPosition.delete(id);
    toast.success("Deleted"); load();
  };

  // Update mark prices for all open positions at once
  const saveMarkPrices = async () => {
    const openPositions = positions.filter(p => p.status === "Open");
    await Promise.all(openPositions.map(p => {
      const mp = parseFloat(markPrices[p.id]);
      if (mp && mp !== p.mark_price) return base44.entities.LeveragedPosition.update(p.id, { mark_price: mp });
      return Promise.resolve();
    }));
    toast.success("Mark prices updated"); setMarkDialog(false); load();
  };

  const liqWarning = (pos) => {
    if (!pos.liquidation_price || !pos.mark_price) return false;
    const dist = Math.abs((pos.mark_price - pos.liquidation_price) / pos.mark_price);
    return dist < 0.15;
  };

  const filtered = filter === "all" ? positions : positions.filter(p => p.status === filter);
  const open = positions.filter(p => p.status === "Open");
  const totalMargin = open.reduce((s, p) => s + (p.margin_usd || 0), 0);
  const totalNotional = open.reduce((s, p) => s + (p.position_value_usd || 0), 0);
  const avgLev = open.length > 0 ? open.reduce((s, p) => s + (p.leverage || 0), 0) / open.length : 0;
  const totalLivePnl = open.reduce((s, p) => s + (calcPnl(p) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
            <h1 className="text-2xl font-bold">Leveraged Positions</h1>
          </div>
        </div>
        <Button onClick={() => { setEditPos(null); setForm(emptyForm); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Position
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Margin</p>
          <p className="text-xl font-bold font-mono">{fmt(totalMargin)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Notional Value</p>
          <p className="text-xl font-bold font-mono">{fmt(totalNotional)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Avg Leverage</p>
          <p className="text-xl font-bold font-mono">{avgLev.toFixed(1)}x</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Live PnL</p>
          <p className={`text-xl font-bold font-mono ${totalLivePnl >= 0 ? "text-profit" : "text-loss"}`}>{totalLivePnl >= 0 ? "+" : ""}{fmtPrecise(totalLivePnl)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {["Open", "Closed", "all"].map(s => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
              {s === "all" ? "All" : s}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setMarkDialog(true)}>
          <RefreshCw className="w-3.5 h-3.5" /> Update Mark Prices
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3">Asset</th>
                <th className="text-left px-4 py-3">Size</th>
                <th className="text-left px-4 py-3">Position Value</th>
                <th className="text-left px-4 py-3">Entry Price</th>
                <th className="text-left px-4 py-3">Mark Price</th>
                <th className="text-left px-4 py-3">PnL (ROE %)</th>
                <th className="text-left px-4 py-3">Liq. Price</th>
                <th className="text-left px-4 py-3">Margin</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const livePnl = calcPnl(p);
                const roe = calcRoe(p);
                return (
                  <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 ${liqWarning(p) ? "bg-loss/5" : ""}`}>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-mono font-bold">{p.asset}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{p.leverage}x</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${p.direction === "Long" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{p.direction}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{p.size ? `${p.size.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${p.asset}` : "—"}</td>
                    <td className="px-4 py-3 font-mono">{fmt(p.position_value_usd)}</td>
                    <td className="px-4 py-3 font-mono">${(p.entry_price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                    <td className="px-4 py-3 font-mono">{p.mark_price ? `$${p.mark_price.toLocaleString(undefined, { maximumFractionDigits: 3 })}` : <span className="text-muted-foreground text-xs">—</span>}</td>
                    <td className="px-4 py-3">
                      {livePnl != null ? (
                        <div>
                          <span className={`font-mono font-semibold text-sm ${livePnl >= 0 ? "text-profit" : "text-loss"}`}>
                            {livePnl >= 0 ? "+" : ""}{fmtPrecise(livePnl)}
                          </span>
                          {roe != null && (
                            <span className={`ml-1 text-xs ${roe >= 0 ? "text-profit" : "text-loss"}`}>({roe >= 0 ? "+" : ""}{roe.toFixed(1)}%)</span>
                          )}
                        </div>
                      ) : <span className="text-muted-foreground text-xs">Update mark price</span>}
                    </td>
                    <td className={`px-4 py-3 font-mono ${liqWarning(p) ? "text-loss font-bold" : ""}`}>
                      {p.liquidation_price ? `$${p.liquidation_price.toLocaleString(undefined, { maximumFractionDigits: 3 })}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono">{fmt(p.margin_usd)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditPos(p); setForm({ asset: p.asset, platform: p.platform || "HyperLiquid", leverage: p.leverage || "", size: p.size || "", margin_usd: p.margin_usd || "", position_value_usd: p.position_value_usd || "", liquidation_price: p.liquidation_price || "", direction: p.direction, entry_price: p.entry_price || "", mark_price: p.mark_price || "", status: p.status, opened_date: p.opened_date || "" }); setDialog(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground text-sm">No positions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editPos ? "Edit Position" : "New Position"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[{ label: "Asset", key: "asset" }, { label: "Leverage", key: "leverage", type: "number" }, { label: "Size (amount)", key: "size", type: "number" }, { label: "Margin ($)", key: "margin_usd", type: "number" }, { label: "Position Value ($)", key: "position_value_usd", type: "number" }, { label: "Entry Price", key: "entry_price", type: "number" }, { label: "Mark Price", key: "mark_price", type: "number" }, { label: "Liquidation Price", key: "liquidation_price", type: "number" }, { label: "Opened Date", key: "opened_date", type: "date" }].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">Direction</Label>
              <Select value={form.direction} onValueChange={v => setForm(p => ({ ...p, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Long">Long</SelectItem>
                  <SelectItem value="Short">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full mt-2" onClick={save}>Save</Button>
        </DialogContent>
      </Dialog>

      {/* Mark Prices Update Dialog */}
      <Dialog open={markDialog} onOpenChange={setMarkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Mark Prices</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">Enter current market prices to recalculate live PnL.</p>
          <div className="space-y-3 pt-1">
            {positions.filter(p => p.status === "Open").map(p => (
              <div key={p.id}>
                <Label className="text-xs mb-1 block">{p.asset} {p.leverage}x (Entry: ${p.entry_price?.toLocaleString()})</Label>
                <Input type="number" placeholder={`Current ${p.asset} price`} value={markPrices[p.id] || ""} onChange={e => setMarkPrices(prev => ({ ...prev, [p.id]: e.target.value }))} />
              </div>
            ))}
            <Button className="w-full" onClick={saveMarkPrices}>Save Mark Prices</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}