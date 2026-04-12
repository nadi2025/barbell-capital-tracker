import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtP = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const calcPnl = (p) => {
  if (!p.mark_price || !p.entry_price || !p.size) return null;
  return p.direction === "Long" ? (p.mark_price - p.entry_price) * p.size : (p.entry_price - p.mark_price) * p.size;
};
const calcRoe = (p) => { const pnl = calcPnl(p); return (pnl == null || !p.margin_usd) ? null : (pnl / p.margin_usd) * 100; };
const distToLiq = (p) => {
  if (!p.liquidation_price || !p.mark_price) return null;
  return Math.abs((p.mark_price - p.liquidation_price) / p.mark_price) * 100;
};

const emptyForm = { asset: "", platform: "HyperLiquid", leverage: "", size: "", margin_usd: "", position_value_usd: "", liquidation_price: "", direction: "Long", entry_price: "", mark_price: "", status: "Open", opened_date: "" };

export default function OpenPositionsTab({ positions, onRefresh }) {
  const [dialog, setDialog] = useState(false);
  const [markDialog, setMarkDialog] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [markPrices, setMarkPrices] = useState({});
  const [filter, setFilter] = useState("Open");

  const open = positions.filter(p => p.status === "Open");
  const totalMargin = open.reduce((s, p) => s + (p.margin_usd || 0), 0);
  const totalNotional = open.reduce((s, p) => s + (p.position_value_usd || 0), 0);
  const avgLev = open.length > 0 ? open.reduce((s, p) => s + (p.leverage || 0), 0) / open.length : 0;
  const totalLivePnl = open.reduce((s, p) => s + (calcPnl(p) || 0), 0);
  const accountEquity = totalMargin + totalLivePnl;
  const equityPct = totalMargin > 0 ? (accountEquity / totalMargin) * 100 : 100;

  const filtered = filter === "all" ? positions : positions.filter(p => p.status === filter);

  const openMarkDialog = () => {
    const mp = {};
    open.forEach(p => { mp[p.id] = p.mark_price || ""; });
    setMarkPrices(mp);
    setMarkDialog(true);
  };

  const saveMarkPrices = async () => {
    const updates = open.map(p => {
      const mp = parseFloat(markPrices[p.id]);
      if (!mp || mp === p.mark_price) return Promise.resolve();
      const posVal = mp * (p.size || 0);
      return base44.entities.LeveragedPosition.update(p.id, { mark_price: mp, position_value_usd: posVal });
    });
    // Also update global Asset prices
    const assetPrices = {};
    open.forEach(p => { if (markPrices[p.id]) assetPrices[p.asset] = parseFloat(markPrices[p.id]); });
    const assetRecords = await base44.entities.Asset.list();
    const assetUpdates = assetRecords
      .filter(a => assetPrices[a.symbol])
      .map(a => base44.entities.Asset.update(a.id, { current_price_usd: assetPrices[a.symbol], last_updated: new Date().toISOString() }));
    await Promise.all([...updates, ...assetUpdates]);
    toast.success("Mark prices updated");
    setMarkDialog(false);
    onRefresh();
  };

  const save = async () => {
    const data = { ...form, leverage: parseFloat(form.leverage) || null, size: parseFloat(form.size) || null, margin_usd: parseFloat(form.margin_usd) || null, position_value_usd: parseFloat(form.position_value_usd) || null, liquidation_price: parseFloat(form.liquidation_price) || null, entry_price: parseFloat(form.entry_price) || null, mark_price: parseFloat(form.mark_price) || null };
    if (editPos) await base44.entities.LeveragedPosition.update(editPos.id, data);
    else await base44.entities.LeveragedPosition.create(data);
    toast.success("Saved"); setDialog(false); onRefresh();
  };

  const del = async (id) => {
    if (!confirm("Delete?")) return;
    await base44.entities.LeveragedPosition.delete(id);
    toast.success("Deleted"); onRefresh();
  };

  const distColor = (d) => {
    if (d == null) return "";
    if (d < 15) return "text-red-500 font-bold";
    if (d < 25) return "text-amber-500 font-semibold";
    return "text-emerald-500";
  };

  const rowBg = (p) => {
    const d = distToLiq(p);
    if (d != null && d < 15) return "bg-red-50 border-red-200";
    if (d != null && d < 25) return "bg-amber-50/50";
    return "";
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
          <p className={`text-xl font-bold font-mono ${totalLivePnl >= 0 ? "text-profit" : "text-loss"}`}>
            {totalLivePnl >= 0 ? "+" : ""}{fmtP(totalLivePnl)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Account Equity</p>
          <p className={`text-xl font-bold font-mono ${accountEquity >= 0 ? "" : "text-loss"}`}>{fmt(accountEquity)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{equityPct.toFixed(1)}% of deposited margin</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {["Open", "Closed", "all"].map(s => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
              {s === "all" ? "All" : s}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={openMarkDialog}>
            <RefreshCw className="w-3.5 h-3.5" /> Update Mark Prices
          </Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditPos(null); setForm(emptyForm); setDialog(true); }}>
            <Plus className="w-3.5 h-3.5" /> New Position
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground bg-muted/30">
                <th className="text-left px-4 py-3">Asset</th>
                <th className="text-left px-4 py-3">Size</th>
                <th className="text-right px-4 py-3">Pos. Value</th>
                <th className="text-right px-4 py-3">Entry</th>
                <th className="text-right px-4 py-3">Mark</th>
                <th className="text-right px-4 py-3">PnL (ROE%)</th>
                <th className="text-right px-4 py-3">Liq. Price</th>
                <th className="text-right px-4 py-3">Dist. Liq</th>
                <th className="text-right px-4 py-3">Margin</th>
                <th className="text-right px-4 py-3">% Port</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const livePnl = calcPnl(p);
                const roe = calcRoe(p);
                const dist = distToLiq(p);
                const portPct = totalMargin > 0 ? ((p.margin_usd || 0) / totalMargin * 100) : 0;
                return (
                  <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 ${rowBg(p)}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {dist != null && dist < 15 && <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" />}
                        <span className="font-mono font-bold">{p.asset}</span>
                        <span className="text-xs text-muted-foreground">{p.leverage}x</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${p.direction === "Long" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{p.direction}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{p.size?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                    <td className="px-4 py-3 font-mono text-right">{fmt(p.position_value_usd)}</td>
                    <td className="px-4 py-3 font-mono text-right">${(p.entry_price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                    <td className="px-4 py-3 font-mono text-right">{p.mark_price ? `$${p.mark_price.toLocaleString(undefined, { maximumFractionDigits: 3 })}` : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      {livePnl != null ? (
                        <div>
                          <span className={`font-mono font-semibold ${livePnl >= 0 ? "text-profit" : "text-loss"}`}>{livePnl >= 0 ? "+" : ""}{fmtP(livePnl)}</span>
                          {roe != null && <span className={`ml-1 text-xs ${roe >= 0 ? "text-profit" : "text-loss"}`}>({roe >= 0 ? "+" : ""}{roe.toFixed(1)}%)</span>}
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-right">{p.liquidation_price ? `$${p.liquidation_price.toLocaleString(undefined, { maximumFractionDigits: 3 })}` : "—"}</td>
                    <td className={`px-4 py-3 font-mono text-right ${distColor(dist)}`}>{dist != null ? `${dist.toFixed(1)}%` : "—"}</td>
                    <td className="px-4 py-3 font-mono text-right">{fmt(p.margin_usd)}</td>
                    <td className="px-4 py-3 font-mono text-right text-muted-foreground">{portPct.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          setEditPos(p);
                          setForm({ asset: p.asset, platform: p.platform || "HyperLiquid", leverage: p.leverage || "", size: p.size || "", margin_usd: p.margin_usd || "", position_value_usd: p.position_value_usd || "", liquidation_price: p.liquidation_price || "", direction: p.direction, entry_price: p.entry_price || "", mark_price: p.mark_price || "", status: p.status, opened_date: p.opened_date || "" });
                          setDialog(true);
                        }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground text-sm">No positions</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark Prices Dialog */}
      <Dialog open={markDialog} onOpenChange={setMarkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Update Mark Prices</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">מחירים אלו יעדכנו גם את מחירי הנכסים הגלובליים באפליקציה.</p>
          <table className="w-full text-sm mt-2">
            <thead><tr className="text-xs text-muted-foreground border-b border-border"><th className="text-right pb-2">נכס</th><th className="text-right pb-2">מחיר נוכחי</th><th className="text-right pb-2">מחיר חדש</th></tr></thead>
            <tbody>
              {open.map(p => (
                <tr key={p.id} className="border-b border-border/30">
                  <td className="py-2 font-mono font-bold">{p.asset}</td>
                  <td className="py-2 font-mono text-right text-muted-foreground">${(p.mark_price || 0).toLocaleString()}</td>
                  <td className="py-2 pl-3">
                    <Input type="number" value={markPrices[p.id] || ""} onChange={e => setMarkPrices(prev => ({ ...prev, [p.id]: e.target.value }))} className="h-8 text-sm font-mono" placeholder="0" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button className="w-full mt-3" onClick={saveMarkPrices}>שמור מחירים</Button>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editPos ? "Edit Position" : "New Position"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[{ label: "Asset", key: "asset" }, { label: "Leverage", key: "leverage", type: "number" }, { label: "Size", key: "size", type: "number" }, { label: "Margin ($)", key: "margin_usd", type: "number" }, { label: "Position Value ($)", key: "position_value_usd", type: "number" }, { label: "Entry Price", key: "entry_price", type: "number" }, { label: "Mark Price", key: "mark_price", type: "number" }, { label: "Liquidation Price", key: "liquidation_price", type: "number" }, { label: "Opened Date", key: "opened_date", type: "date" }].map(f => (
              <div key={f.key}><Label className="text-xs mb-1 block">{f.label}</Label><Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} /></div>
            ))}
            <div><Label className="text-xs mb-1 block">Direction</Label>
              <Select value={form.direction} onValueChange={v => setForm(p => ({ ...p, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Long">Long</SelectItem><SelectItem value="Short">Short</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Open">Open</SelectItem><SelectItem value="Closed">Closed</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full mt-2" onClick={save}>Save</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}