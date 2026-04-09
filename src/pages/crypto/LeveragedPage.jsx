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
const fmtP = (v) => v == null ? "" : `${v >= 0 ? "+" : ""}${v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`;

// CoinGecko IDs for supported assets
const COINGECKO_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  AAVE: "aave",
  SOL: "solana",
  ARB: "arbitrum",
  LINK: "chainlink",
};

const emptyForm = {
  asset: "", platform: "HyperLiquid", leverage: "", size: "",
  margin_usd: "", position_value_usd: "", liquidation_price: "",
  direction: "Long", entry_price: "", mark_price: "", status: "Open",
  opened_date: "", pnl_usd: ""
};

// Compute live PnL: (mark - entry) * size * direction_sign
function computePnl(pos) {
  const mark = pos.mark_price;
  const entry = pos.entry_price;
  const size = pos.size;
  if (!mark || !entry || !size) return pos.pnl_usd ?? null;
  const sign = pos.direction === "Short" ? -1 : 1;
  return sign * (mark - entry) * size;
}

function computeRoe(pnl, margin) {
  if (!margin || pnl == null) return null;
  return (pnl / margin) * 100;
}

export default function LeveragedPage() {
  const [positions, setPositions] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("Open");
  const [fetching, setFetching] = useState(false);

  const load = async () => setPositions(await base44.entities.LeveragedPosition.list("-opened_date"));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data = {
      ...form,
      leverage: parseFloat(form.leverage) || null,
      size: parseFloat(form.size) || null,
      margin_usd: parseFloat(form.margin_usd) || null,
      position_value_usd: parseFloat(form.position_value_usd) || null,
      liquidation_price: parseFloat(form.liquidation_price) || null,
      entry_price: parseFloat(form.entry_price) || null,
      mark_price: parseFloat(form.mark_price) || null,
      pnl_usd: parseFloat(form.pnl_usd) || null,
    };
    if (editPos) await base44.entities.LeveragedPosition.update(editPos.id, data);
    else await base44.entities.LeveragedPosition.create(data);
    toast.success("Position saved"); setDialog(false); load();
  };

  const del = async (id) => {
    if (!confirm("Delete this position?")) return;
    await base44.entities.LeveragedPosition.delete(id);
    toast.success("Deleted"); load();
  };

  const fetchLivePrices = async () => {
    setFetching(true);
    const openPos = positions.filter(p => p.status === "Open");
    const ids = [...new Set(openPos.map(p => COINGECKO_IDS[p.asset?.toUpperCase()]).filter(Boolean))];
    if (ids.length === 0) { toast.info("No supported assets to fetch prices for"); setFetching(false); return; }
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`);
    const data = await res.json();
    // Build asset→price map
    const priceMap = {};
    for (const [asset, cgId] of Object.entries(COINGECKO_IDS)) {
      if (data[cgId]) priceMap[asset] = data[cgId].usd;
    }
    // Update each open position that has a supported price
    const updates = openPos.filter(p => priceMap[p.asset?.toUpperCase()]);
    await Promise.all(updates.map(p => {
      const mark = priceMap[p.asset.toUpperCase()];
      const pnl = computePnl({ ...p, mark_price: mark });
      return base44.entities.LeveragedPosition.update(p.id, { mark_price: mark, pnl_usd: pnl });
    }));
    toast.success(`Updated prices for ${updates.length} position(s)`);
    setFetching(false);
    load();
  };

  const filtered = filter === "all" ? positions : positions.filter(p => p.status === filter);
  const open = positions.filter(p => p.status === "Open");
  const totalMargin = open.reduce((s, p) => s + (p.margin_usd || 0), 0);
  const totalNotional = open.reduce((s, p) => s + (p.position_value_usd || 0), 0);
  const totalPnl = open.reduce((s, p) => s + (computePnl(p) ?? 0), 0);

  const liqWarning = (pos) => {
    if (!pos.liquidation_price || !pos.mark_price) return false;
    return Math.abs(pos.mark_price - pos.liquidation_price) / pos.mark_price < 0.15;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
          <h1 className="text-2xl font-bold">Leveraged Positions</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLivePrices} disabled={fetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "Fetching..." : "Fetch Live Prices"}
          </Button>
          <Button onClick={() => { setEditPos(null); setForm(emptyForm); setDialog(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> New Position
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Margin</p>
          <p className="text-xl font-bold font-mono text-foreground">{fmt(totalMargin)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Notional Value</p>
          <p className="text-xl font-bold font-mono text-foreground">{fmt(totalNotional)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Unrealized PnL</p>
          <p className={`text-xl font-bold font-mono ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(totalPnl)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Open Positions</p>
          <p className="text-xl font-bold font-mono text-foreground">{open.length}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {["Open", "Closed", "all"].map(s => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
            {s === "all" ? "All" : s}
          </Button>
        ))}
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
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const pnl = computePnl(p);
                const roe = computeRoe(pnl, p.margin_usd);
                return (
                  <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 ${liqWarning(p) ? "bg-loss/5" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold">{p.asset}</div>
                      <div className="text-xs text-muted-foreground">{p.platform} · {p.leverage}x {p.direction === "Long" ? "↑" : "↓"}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {p.size != null ? `${p.size.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${p.asset}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono">{fmt(p.position_value_usd)}</td>
                    <td className="px-4 py-3 font-mono">${(p.entry_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 font-mono">
                      {p.mark_price ? (
                        <span className={p.mark_price > (p.entry_price || 0) ? "text-profit" : "text-loss"}>
                          ${p.mark_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {pnl != null ? (
                        <div>
                          <span className={`font-mono font-semibold ${pnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(pnl)}</span>
                          {roe != null && (
                            <span className={`ml-1 text-xs ${roe >= 0 ? "text-profit" : "text-loss"}`}>({roe >= 0 ? "+" : ""}{roe.toFixed(1)}%)</span>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className={`px-4 py-3 font-mono ${liqWarning(p) ? "text-loss font-bold" : ""}`}>
                      ${(p.liquidation_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 font-mono">{fmt(p.margin_usd)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${p.status === "Open" ? "bg-profit/10 text-profit border-profit/20" : "bg-muted text-muted-foreground border-border"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          setEditPos(p);
                          setForm({ asset: p.asset, platform: p.platform || "HyperLiquid", leverage: p.leverage || "", size: p.size || "", margin_usd: p.margin_usd || "", position_value_usd: p.position_value_usd || "", liquidation_price: p.liquidation_price || "", direction: p.direction, entry_price: p.entry_price || "", mark_price: p.mark_price || "", status: p.status, opened_date: p.opened_date || "", pnl_usd: p.pnl_usd || "" });
                          setDialog(true);
                        }}>
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
                <tr><td colSpan={10} className="text-center py-8 text-muted-foreground text-sm">No positions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editPos ? "Edit Position" : "New Position"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { label: "Asset (BTC, ETH, AAVE...)", key: "asset" },
              { label: "Leverage", key: "leverage", type: "number" },
              { label: "Size (amount of coins)", key: "size", type: "number" },
              { label: "Margin ($)", key: "margin_usd", type: "number" },
              { label: "Position Value ($)", key: "position_value_usd", type: "number" },
              { label: "Entry Price", key: "entry_price", type: "number" },
              { label: "Mark Price", key: "mark_price", type: "number" },
              { label: "Liquidation Price", key: "liquidation_price", type: "number" },
              { label: "Opened Date", key: "opened_date", type: "date" },
            ].map(f => (
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
          <p className="text-xs text-muted-foreground mt-1">PnL is calculated automatically: (Mark − Entry) × Size. Funding costs ignored.</p>
          <Button className="w-full mt-2" onClick={save}>Save</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}