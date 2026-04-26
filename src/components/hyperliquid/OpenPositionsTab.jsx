import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityMutation } from "@/hooks/useEntityQuery";
import { usePrices } from "@/hooks/usePrices";
import { computeLeveragedDerived } from "@/lib/portfolioMath";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtP = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const emptyForm = { asset: "", platform: "HyperLiquid", leverage: "", size: "", margin_usd: "", position_value_usd: "", liquidation_price: "", direction: "Long", entry_price: "", mark_price: "", status: "Open", opened_date: "" };

/**
 * OpenPositionsTab — HyperLiquid open positions with per-row enrichment.
 *
 * Live values (mark_price, position_value_usd, pnl_usd, roe_pct, dist_to_liq)
 * are derived per render from `priceMap × position` via computeLeveragedDerived.
 * The local calcPnl/calcRoe/distToLiq helpers were removed — single source of
 * truth in portfolioMath.
 *
 * Mark Prices dialog rewires: instead of writing to the deleted Asset entity
 * and dead-caching mark_price on LeveragedPosition, it upserts each typed
 * price to the canonical Prices entity. Cascade is automatic: every consumer
 * of usePrices/priceMap rerenders and sees the new mark_price → fresh PnL
 * within the same React tick. (Phase 4-aligned per spec.)
 */
export default function OpenPositionsTab({ positions, onRefresh }) {
  const queryClient = useQueryClient();
  const { priceMap, prices } = usePrices();
  const updatePrice = useEntityMutation("Prices", "update");
  const createPrice = useEntityMutation("Prices", "create");

  const [dialog, setDialog] = useState(false);
  const [markDialog, setMarkDialog] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [markPrices, setMarkPrices] = useState({});
  const [filter, setFilter] = useState("Open");

  // Enrich each position with derived values (mark/pnl/roe/dist) from priceMap
  const enriched = useMemo(
    () => positions.map((p) => ({ ...p, ...computeLeveragedDerived(p, priceMap) })),
    [positions, priceMap]
  );

  const open = useMemo(() => enriched.filter((p) => p.status === "Open"), [enriched]);
  const filtered = useMemo(
    () => (filter === "all" ? enriched : enriched.filter((p) => p.status === filter)),
    [enriched, filter]
  );

  // Aggregates over the derived (live) values
  const aggregates = useMemo(() => {
    const totalMargin = open.reduce((s, p) => s + (p.margin_usd || 0), 0);
    const totalNotional = open.reduce((s, p) => s + (p.position_value_usd || 0), 0);
    const avgLev = open.length > 0
      ? open.reduce((s, p) => s + (p.leverage || 0), 0) / open.length
      : 0;
    const totalLivePnl = open.reduce((s, p) => s + (p.pnl_usd || 0), 0);
    const accountEquity = totalMargin + totalLivePnl;
    const equityPct = totalMargin > 0 ? (accountEquity / totalMargin) * 100 : 100;
    return { totalMargin, totalNotional, avgLev, totalLivePnl, accountEquity, equityPct };
  }, [open]);

  const openMarkDialog = () => {
    const mp = {};
    open.forEach((p) => { mp[p.id] = p.mark_price || ""; });
    setMarkPrices(mp);
    setMarkDialog(true);
  };

  const saveMarkPrices = async () => {
    // Collect unique (asset → price) tuples — multiple positions on the same
    // asset should write a single Prices row, not duplicate.
    const upserts = {};
    for (const p of open) {
      const raw = markPrices[p.id];
      const price = parseFloat(raw);
      if (!price || price <= 0) continue;
      const sym = String(p.asset || "").toUpperCase();
      if (!sym) continue;
      // Last-write-wins if multiple positions on same asset have different
      // prices typed in — user can adjust before saving.
      upserts[sym] = price;
    }

    const now = new Date().toISOString();
    for (const [asset, price] of Object.entries(upserts)) {
      const existing = prices.find((row) => row.asset === asset);
      if (existing) {
        await updatePrice.mutateAsync({
          id: existing.id,
          data: { price_usd: price, last_updated: now },
        });
      } else {
        await createPrice.mutateAsync({ asset, price_usd: price, last_updated: now });
      }
    }

    // useEntityMutation already invalidates ["entity", "Prices"] which
    // cascades to every consumer of usePrices in the app.
    toast.success("Mark prices updated");
    setMarkDialog(false);
    onRefresh?.();
  };

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
      // Stamp every save so ManualEntriesPanel knows when this position was
      // last touched (drives the staleness traffic light).
      last_updated: new Date().toISOString(),
    };
    if (editPos) await base44.entities.LeveragedPosition.update(editPos.id, data);
    else await base44.entities.LeveragedPosition.create(data);
    queryClient.invalidateQueries({ queryKey: ["entity", "LeveragedPosition"] });
    toast.success("Saved");
    setDialog(false);
    onRefresh?.();
  };

  const del = async (id) => {
    if (!confirm("Delete?")) return;
    await base44.entities.LeveragedPosition.delete(id);
    queryClient.invalidateQueries({ queryKey: ["entity", "LeveragedPosition"] });
    toast.success("Deleted");
    onRefresh?.();
  };

  const distColor = (d) => {
    if (d == null) return "";
    if (d < 15) return "text-red-500 font-bold";
    if (d < 25) return "text-amber-500 font-semibold";
    return "text-emerald-500";
  };

  const rowBg = (d) => {
    if (d == null) return "";
    if (d < 15) return "bg-red-50 border-red-200";
    if (d < 25) return "bg-amber-50/50";
    return "";
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Margin</p>
          <p className="text-xl font-bold font-mono">{fmt(aggregates.totalMargin)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Notional Value</p>
          <p className="text-xl font-bold font-mono">{fmt(aggregates.totalNotional)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Avg Leverage</p>
          <p className="text-xl font-bold font-mono">{aggregates.avgLev.toFixed(1)}x</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Live PnL</p>
          <p className={`text-xl font-bold font-mono ${aggregates.totalLivePnl >= 0 ? "text-profit" : "text-loss"}`}>
            {aggregates.totalLivePnl >= 0 ? "+" : ""}{fmtP(aggregates.totalLivePnl)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Account Equity</p>
          <p className={`text-xl font-bold font-mono ${aggregates.accountEquity >= 0 ? "" : "text-loss"}`}>{fmt(aggregates.accountEquity)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{aggregates.equityPct.toFixed(1)}% of deposited margin</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {["Open", "Closed", "all"].map((s) => (
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
              {filtered.map((p) => {
                const dist = p.distance_to_liq_pct;
                const portPct = aggregates.totalMargin > 0
                  ? ((p.margin_usd || 0) / aggregates.totalMargin * 100)
                  : 0;
                return (
                  <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 ${rowBg(dist)}`}>
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
                    {/* Mark price comes from priceMap[asset] when available; falls back to
                        the stored mark_price when the asset is not in Prices. The dot
                        indicates which: green = live, amber = stored fallback. */}
                    <td className="px-4 py-3 font-mono text-right">
                      {p.mark_price ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${p.priceMissing ? "bg-amber-500" : "bg-profit"}`}
                            title={p.priceMissing ? "מחיר מאוחסן (אין ערך חי ב-Prices)" : "מחיר חי מ-Prices entity"}
                          />
                          ${p.mark_price.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.pnl_usd != null ? (
                        <div>
                          <span className={`font-mono font-semibold ${p.pnl_usd >= 0 ? "text-profit" : "text-loss"}`}>{p.pnl_usd >= 0 ? "+" : ""}{fmtP(p.pnl_usd)}</span>
                          {p.roe_pct != null && <span className={`ml-1 text-xs ${p.roe_pct >= 0 ? "text-profit" : "text-loss"}`}>({p.roe_pct >= 0 ? "+" : ""}{p.roe_pct.toFixed(1)}%)</span>}
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
              {open.map((p) => (
                <tr key={p.id} className="border-b border-border/30">
                  <td className="py-2 font-mono font-bold">{p.asset}</td>
                  <td className="py-2 font-mono text-right text-muted-foreground">${(p.mark_price || 0).toLocaleString()}</td>
                  <td className="py-2 pl-3">
                    <Input type="number" value={markPrices[p.id] || ""} onChange={(e) => setMarkPrices((prev) => ({ ...prev, [p.id]: e.target.value }))} className="h-8 text-sm font-mono" placeholder="0" />
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
          <p className="text-[11px] text-muted-foreground bg-muted/30 border border-border/40 rounded p-2">
            <strong>Mark Price</strong> מתעדכן אוטומטית מ-priceMap (size × מחיר חי = שווי + PnL מחושבים בזמן אמת).
            Liquidation ו-Margin הם ידניים — עדכן בכל שבוע או לאחר שינוי משמעותי.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[{ label: "Asset", key: "asset" }, { label: "Leverage", key: "leverage", type: "number" }, { label: "Size", key: "size", type: "number" }, { label: "Margin ($)", key: "margin_usd", type: "number" }, { label: "Position Value ($)", key: "position_value_usd", type: "number" }, { label: "Entry Price", key: "entry_price", type: "number" }, { label: "Mark Price", key: "mark_price", type: "number" }, { label: "Liquidation Price", key: "liquidation_price", type: "number" }, { label: "Opened Date", key: "opened_date", type: "date" }].map((f) => (
              <div key={f.key}><Label className="text-xs mb-1 block">{f.label}</Label><Input type={f.type || "text"} value={form[f.key]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} /></div>
            ))}
            <div><Label className="text-xs mb-1 block">Direction</Label>
              <Select value={form.direction} onValueChange={(v) => setForm((p) => ({ ...p, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Long">Long</SelectItem><SelectItem value="Short">Short</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
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
