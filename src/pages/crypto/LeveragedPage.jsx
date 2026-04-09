import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, X, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v, d = 1) => v == null ? "0%" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const ASSET_OPTIONS = ["BTC", "ETH", "AAVE", "MSTR"];

function getAssetPrice(asset, cryptoAssets) {
  const a = asset?.toUpperCase();
  const BTC_TOKENS = ["awBTC", "wBTC", "BTC"];
  const ETH_TOKENS = ["aETH", "ETH", "WETH"];
  const AAVE_TOKENS = ["aAAVE", "AAVE"];
  const MSTR_TOKENS = ["MSTR"];

  let tokens = [];
  if (a === "BTC") tokens = BTC_TOKENS;
  else if (a === "ETH") tokens = ETH_TOKENS;
  else if (a === "AAVE") tokens = AAVE_TOKENS;
  else if (a === "MSTR") tokens = MSTR_TOKENS;

  const found = cryptoAssets.find(ca => tokens.includes(ca.token) && ca.current_price_usd > 0);
  return found?.current_price_usd || 0;
}

function calcPosition(pos, cryptoAssets) {
  const currentPrice = getAssetPrice(pos.asset, cryptoAssets);
  const size = pos.size_units || 0;
  const entry = pos.entry_price || 0;
  const liq = pos.liquidation_price || 0;
  const margin = pos.margin_usd || 0;

  const positionValue = size * currentPrice;
  const pnlUsd = positionValue - size * entry;
  const pnlPct = margin > 0 ? (pnlUsd / margin) * 100 : 0;
  const distToLiq = currentPrice > 0 ? ((currentPrice - liq) / currentPrice) * 100 : 100;

  return { currentPrice, positionValue, pnlUsd, pnlPct, distToLiq };
}

function LiqGauge({ distToLiq, liqPrice, currentPrice }) {
  const clampedDist = Math.max(0, Math.min(100, distToLiq));
  // Gauge: left=liq, right=safe. Marker position = distToLiq% from left
  const markerPct = Math.min(95, Math.max(5, clampedDist));
  const color = distToLiq < 10 ? "bg-red-500" : distToLiq < 20 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="mt-2">
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`absolute left-0 top-0 h-full rounded-full transition-all ${color}`} style={{ width: `${markerPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span className="text-red-500 font-mono">{fmt(liqPrice)} liq</span>
        <span className="font-mono font-medium">{fmt(currentPrice)} now</span>
      </div>
    </div>
  );
}

function PositionCard({ pos, cryptoAssets, onEdit, onClose }) {
  const calc = calcPosition(pos, cryptoAssets);
  const { currentPrice, positionValue, pnlUsd, pnlPct, distToLiq } = calc;
  const isProfit = pnlUsd >= 0;
  const isOpen = pos.status === "Open";

  const cardBg = !isOpen ? "bg-gray-50 border-gray-200 opacity-70" :
    distToLiq < 10 ? "bg-red-50 border-red-300" :
    distToLiq < 20 ? "bg-amber-50 border-amber-300" :
    "bg-card border-border";

  const pnlBg = isProfit ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200";
  const pnlBarWidth = Math.min(100, Math.abs(pnlPct)).toFixed(0);

  return (
    <div className={`rounded-2xl border p-4 space-y-3 transition-all ${cardBg} ${distToLiq < 10 && isOpen ? "animate-pulse" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{pos.asset}</span>
            <span className="text-xs font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{pos.leverage || 3}x</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pos.direction === "Long" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {pos.direction === "Long" ? "▲" : "▼"} {pos.direction?.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{pos.platform || "HyperLiquid"}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${isOpen ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
          {pos.status}
        </span>
      </div>

      {isOpen ? (
        <>
          {/* Data row */}
          <div className="grid grid-cols-4 gap-2 text-center bg-muted/40 rounded-xl p-3">
            {[
              { label: "Size", value: `${pos.size_units} ${pos.asset}` },
              { label: "Entry", value: fmt(pos.entry_price) },
              { label: "Current", value: currentPrice > 0 ? fmt(currentPrice) : "—" },
              { label: "Value", value: currentPrice > 0 ? fmt(positionValue) : "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-xs font-mono font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {/* PnL */}
          {currentPrice > 0 && (
            <div className={`rounded-xl border p-3 ${pnlBg}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium">PnL</span>
                <span className={`font-mono font-bold text-sm ${isProfit ? "text-emerald-700" : "text-red-700"}`}>
                  {fmt(pnlUsd)} ({fmtPct(pnlPct)} ROE)
                </span>
              </div>
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isProfit ? "bg-emerald-500" : "bg-red-500"}`}
                  style={{ width: `${pnlBarWidth}%` }}
                />
              </div>
            </div>
          )}

          {/* Liq gauge */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Margin: <span className="font-mono font-medium text-foreground">{fmt(pos.margin_usd)}</span></span>
              <span className={`font-medium ${distToLiq < 10 ? "text-red-600" : distToLiq < 20 ? "text-amber-600" : "text-emerald-600"}`}>
                {distToLiq > 0 ? `${distToLiq.toFixed(1)}% from liq` : "⚠ Near liquidation"}
              </span>
            </div>
            <LiqGauge distToLiq={distToLiq} liqPrice={pos.liquidation_price} currentPrice={currentPrice} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Opened: {pos.opened_date || "—"}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onEdit(pos)}>
                <Edit2 className="w-3 h-3" /> Edit
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => onClose(pos)}>
                <X className="w-3 h-3" /> Close
              </Button>
            </div>
          </div>
        </>
      ) : (
        /* Closed card */
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center bg-muted/30 rounded-xl p-3">
            <div><p className="text-[10px] text-muted-foreground">Size</p><p className="text-xs font-mono">{pos.size_units} {pos.asset}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Entry</p><p className="text-xs font-mono">{fmt(pos.entry_price)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Margin</p><p className="text-xs font-mono">{fmt(pos.margin_usd)}</p></div>
          </div>
          <div className={`rounded-xl p-3 text-center ${pos.closed_pnl >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
            <p className="text-xs text-muted-foreground mb-0.5">Final PnL</p>
            <p className={`font-bold font-mono text-lg ${pos.closed_pnl >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {fmt(pos.closed_pnl)}
            </p>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Opened: {pos.opened_date}</span>
            <span>Closed: {pos.closed_date}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = { asset: "BTC", direction: "Long", leverage: 3, size_units: "", entry_price: "", liquidation_price: "", margin_usd: "", opened_date: new Date().toISOString().split("T")[0], platform: "HyperLiquid", notes: "" };

export default function LeveragedPage() {
  const [positions, setPositions] = useState([]);
  const [cryptoAssets, setCryptoAssets] = useState([]);
  const [tab, setTab] = useState("open");
  const [formOpen, setFormOpen] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [closeModal, setCloseModal] = useState(null);
  const [closePrice, setClosePrice] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [pos, assets] = await Promise.all([
      base44.entities.LeveragedPosition.list("-margin_usd"),
      base44.entities.CryptoAsset.list(),
    ]);
    setPositions(pos);
    setCryptoAssets(assets);
  };

  useEffect(() => { load(); }, []);

  const openPositions = positions.filter(p => p.status === "Open");
  const closedPositions = positions.filter(p => p.status === "Closed");

  // Summary calculations
  const totalMargin = openPositions.reduce((s, p) => s + (p.margin_usd || 0), 0);
  const totalPnl = openPositions.reduce((s, p) => s + calcPosition(p, cryptoAssets).pnlUsd, 0);
  const totalAccountValue = totalMargin + totalPnl;
  const totalNotional = openPositions.reduce((s, p) => s + calcPosition(p, cryptoAssets).positionValue, 0);
  const avgLeverage = totalAccountValue > 0 ? totalNotional / totalAccountValue : 0;
  const pnlPctOfMargin = totalMargin > 0 ? (totalPnl / totalMargin) * 100 : 0;

  const handleEdit = (pos) => { setEditPos(pos); setForm({ ...pos }); setFormOpen(true); };
  const handleAdd = () => { setEditPos(null); setForm(EMPTY_FORM); setFormOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, leverage: Number(form.leverage), size_units: Number(form.size_units), entry_price: Number(form.entry_price), liquidation_price: Number(form.liquidation_price), margin_usd: Number(form.margin_usd), status: form.status || "Open" };
    if (editPos) await base44.entities.LeveragedPosition.update(editPos.id, data);
    else await base44.entities.LeveragedPosition.create(data);
    setSaving(false);
    setFormOpen(false);
    load();
    toast.success(editPos ? "Position updated" : "Position added");
  };

  const handleClose = async () => {
    const price = parseFloat(closePrice) || getAssetPrice(closeModal.asset, cryptoAssets);
    const finalPnl = (closeModal.size_units || 0) * price - (closeModal.size_units || 0) * (closeModal.entry_price || 0);
    await base44.entities.LeveragedPosition.update(closeModal.id, {
      status: "Closed",
      closed_date: new Date().toISOString().split("T")[0],
      closed_pnl: finalPnl,
    });
    await base44.entities.CryptoActivityLog.create({
      date: new Date().toISOString().split("T")[0],
      action_type: "Trade",
      description: `Closed ${closeModal.asset} ${closeModal.leverage}x ${closeModal.direction}: PnL ${fmt(finalPnl)}`,
      amount_usd: finalPnl,
    }).catch(() => {});
    setCloseModal(null);
    setClosePrice("");
    load();
    toast.success("Position closed");
    setTab("closed");
  };

  const summaryCards = [
    { label: "Total Account Value", value: fmt(totalAccountValue), sub: `${totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)} PnL`, subColor: totalPnl >= 0 ? "text-emerald-600" : "text-red-600" },
    { label: "Total Margin Deployed", value: fmt(totalMargin), sub: `${openPositions.length} open positions`, subColor: "text-muted-foreground" },
    { label: "Total Unrealized PnL", value: fmt(totalPnl), isLarge: true, sub: `${fmtPct(pnlPctOfMargin)} of margin`, subColor: totalPnl >= 0 ? "text-emerald-600" : "text-red-600", valueColor: totalPnl >= 0 ? "text-emerald-600" : "text-red-600" },
    { label: "Total Notional Exposure", value: fmt(totalNotional), sub: `Avg leverage: ${avgLeverage.toFixed(1)}x`, subColor: "text-muted-foreground" },
  ];

  const shownPositions = tab === "open"
    ? [...openPositions].sort((a, b) => calcPosition(b, cryptoAssets).positionValue - calcPosition(a, cryptoAssets).positionValue)
    : [...closedPositions].sort((a, b) => new Date(b.closed_date || 0) - new Date(a.closed_date || 0));

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">פוזיציות ממונפות</h1>
          <p className="text-xs text-muted-foreground">HyperLiquid — ערכים מחושבים ממחירי השוק הנוכחיים</p>
        </div>
        <Button size="sm" className="gap-2" onClick={handleAdd}>
          <Plus className="w-4 h-4" /> פוזיציה חדשה
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map(c => (
          <div key={c.label} className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className={`font-bold font-mono ${c.isLarge ? "text-2xl" : "text-xl"} ${c.valueColor || "text-foreground"}`}>{c.value}</p>
            <p className={`text-xs mt-1 font-mono ${c.subColor}`}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        {[{ key: "open", label: `פוזיציות פתוחות (${openPositions.length})` }, { key: "closed", label: `סגורות (${closedPositions.length})` }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Position Cards */}
      {shownPositions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין פוזיציות {tab === "open" ? "פתוחות" : "סגורות"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shownPositions.map(p => (
            <PositionCard
              key={p.id}
              pos={p}
              cryptoAssets={cryptoAssets}
              onEdit={handleEdit}
              onClose={(pos) => { setCloseModal(pos); setClosePrice(String(getAssetPrice(pos.asset, cryptoAssets) || "")); }}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPos ? "Edit Position" : "New Position"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {/* Asset + Direction */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Asset</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.asset}
                  onChange={e => setForm(f => ({ ...f, asset: e.target.value }))}
                >
                  {ASSET_OPTIONS.map(a => <option key={a}>{a}</option>)}
                  <option value="OTHER">Other...</option>
                </select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Direction</Label>
                <div className="flex gap-1 h-9">
                  {["Long", "Short"].map(d => (
                    <button
                      key={d}
                      onClick={() => setForm(f => ({ ...f, direction: d }))}
                      className={`flex-1 rounded-md text-sm font-medium transition-colors ${form.direction === d ? (d === "Long" ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-red-100 text-red-700 border border-red-300") : "border border-input hover:bg-muted"}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {[
              { label: "Leverage", field: "leverage", placeholder: "3" },
              { label: "Size (units)", field: "size_units", placeholder: "e.g. 1.78887" },
              { label: "Entry Price ($)", field: "entry_price", placeholder: "" },
              { label: "Liquidation Price ($)", field: "liquidation_price", placeholder: "" },
              { label: "Margin (USD)", field: "margin_usd", placeholder: "" },
              { label: "Platform", field: "platform", placeholder: "HyperLiquid" },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <Label className="text-xs mb-1 block">{label}</Label>
                <Input
                  type={field === "platform" ? "text" : "number"}
                  placeholder={placeholder}
                  value={form[field] || ""}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                />
              </div>
            ))}

            <div>
              <Label className="text-xs mb-1 block">Opened Date</Label>
              <Input type="date" value={form.opened_date || ""} onChange={e => setForm(f => ({ ...f, opened_date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Notes</Label>
              <Input value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editPos ? "Save Changes" : "Add Position"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Position Modal */}
      <Dialog open={!!closeModal} onOpenChange={() => setCloseModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close {closeModal?.asset} Position</DialogTitle>
          </DialogHeader>
          {closeModal && (() => {
            const price = parseFloat(closePrice) || 0;
            const finalPnl = price > 0 ? (closeModal.size_units || 0) * price - (closeModal.size_units || 0) * (closeModal.entry_price || 0) : null;
            return (
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs mb-1 block">Close Price ($)</Label>
                  <Input type="number" value={closePrice} onChange={e => setClosePrice(e.target.value)} placeholder="Enter close price" />
                </div>
                {finalPnl != null && (
                  <div className={`rounded-xl p-3 text-center ${finalPnl >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                    <p className="text-xs text-muted-foreground">Final PnL</p>
                    <p className={`text-2xl font-bold font-mono ${finalPnl >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(finalPnl)}</p>
                  </div>
                )}
                <Button className="w-full" variant="destructive" onClick={handleClose} disabled={!closePrice}>
                  Confirm Close
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}