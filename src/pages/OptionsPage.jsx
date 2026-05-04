import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import AssignmentAnalysis from "../components/AssignmentAnalysis";
import ExpiryAlerts from "../components/ExpiryAlerts";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, RefreshCw, Layers, List, TrendingUp, TrendingDown, Target, DollarSign, Save } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "../components/StatusBadge";
import PnlBadge from "../components/PnlBadge";
import OptionTradeForm from "../components/OptionTradeForm";
import { toast } from "sonner";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";
import { useQueryClient } from "@tanstack/react-query";
import {
  getCanonicalCategory, getDirection, isCredit,
  getLongStrike, getShortStrike,
  computeRealizedPL, formatStrike,
  CATEGORY_LABELS,
} from "@/lib/optionsHelpers";

const fmt = (v) =>
  v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Group trades that share the same (ticker, category, strike, expiration_date,
 * open_date, type, status). When IB executes a single order across several
 * partial fills seconds apart at near-identical prices, Base44 ends up with
 * many near-duplicate rows — this folds them back into one logical trade with
 * a weighted-average fill_price, total quantity, and summed fees/pnl.
 */
function consolidateTrades(trades) {
  const buckets = new Map();
  for (const t of trades) {
    const cat = getCanonicalCategory(t) || t.category;
    const long = getLongStrike(t);
    const short = getShortStrike(t);
    const key = [
      t.ticker, cat, long ?? "", short ?? "",
      t.expiration_date, t.open_date, getDirection(t) || "", t.status,
    ].join("|");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const result = [];
  for (const group of buckets.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const totalQty = group.reduce((s, t) => s + (t.quantity || 0), 0);
    const weightedFill = totalQty > 0
      ? group.reduce((s, t) => s + (t.fill_price || 0) * (t.quantity || 0), 0) / totalQty
      : 0;
    // Realized P&L only summed for closed groups; open groups are null.
    const realized = group.map((t) => computeRealizedPL(t));
    const totalRealized = realized.every((v) => v == null) ? null : realized.reduce((s, v) => s + (v || 0), 0);
    const totalFee = group.reduce((s, t) => s + (t.fee || 0), 0);
    const totalCollateral = group.reduce((s, t) => s + (t.collateral || 0), 0);
    const closePrices = group.map((t) => t.close_price).filter((v) => v != null);
    const avgClose = closePrices.length > 0 ? closePrices.reduce((s, v) => s + v, 0) / closePrices.length : null;
    result.push({
      ...group[0],
      id: group[0].id,
      _consolidated: true,
      _groupSize: group.length,
      _groupIds: group.map((t) => t.id),
      quantity: totalQty,
      fill_price: weightedFill,
      close_price: avgClose,
      realized_pl: totalRealized,
      pnl: totalRealized, // legacy mirror
      fee: totalFee,
      collateral: totalCollateral,
    });
  }
  return result.sort((a, b) => new Date(b.open_date) - new Date(a.open_date));
}

function KpiTile({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between min-h-[92px]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground/50" />}
      </div>
      <div>
        <p className={`text-xl font-bold font-mono leading-tight ${accent || ""}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function OptionsPage() {
  const { data: trades = [], isLoading: loadingTrades, refetch: refetchTrades } =
    useEntityList("OptionsTrade", { sort: "-open_date" });
  const { data: stocks = [], refetch: refetchStocks } = useEntityList("StockPosition");
  const { data: snapshots = [] } = useEntityList("AccountSnapshot", { sort: "-snapshot_date", limit: 1 });
  const deleteTrade = useEntityMutation("OptionsTrade", "delete");
  const queryClient = useQueryClient();

  // PriceHub mounted at the Layout level — open it from here via Outlet context.
  const { openPriceHub } = useOutletContext() || {};

  const [formOpen, setFormOpen] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  const [user, setUser] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTicker, setFilterTicker] = useState("all");
  const [consolidated, setConsolidated] = useState(true);
  const [optionsValueInput, setOptionsValueInput] = useState("");
  const [savingOptionsValue, setSavingOptionsValue] = useState(false);

  const latestSnapshot = snapshots[0];

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  // Pre-fill input with current snapshot value when snapshot loads
  useEffect(() => {
    if (latestSnapshot?.options_value != null) {
      setOptionsValueInput(String(latestSnapshot.options_value));
    }
  }, [latestSnapshot?.id]);

  const handleSaveOptionsValue = async () => {
    const val = parseFloat(optionsValueInput);
    if (isNaN(val)) { toast.error("ערך לא תקין"); return; }
    setSavingOptionsValue(true);
    try {
      if (latestSnapshot?.id) {
        await base44.entities.AccountSnapshot.update(latestSnapshot.id, { options_value: val });
        toast.success("שווי אופציות עודכן בהצלחה");
        queryClient.invalidateQueries({ queryKey: ["entity", "AccountSnapshot"] });
      } else {
        toast.error("לא נמצא snapshot — יש לייבא CSV תחילה");
      }
    } finally {
      setSavingOptionsValue(false);
    }
  };

  const loadData = () => {
    refetchTrades();
    refetchStocks();
  };

  const loading = loadingTrades;

  // "Live Prices" button now opens PriceHub. Stocks pull live values from
  // priceMap × shares at render time, so a single Prices update propagates
  // automatically — no per-stock write loop, no fetchStockPrices round-trip.

  const isReadOnly = user?.role === "partner" || user?.role === "investor";

  const handleDelete = async (trade) => {
    // For consolidated rows, delete ALL underlying trades in the group
    const cat = getCanonicalCategory(trade);
    const catLabel = CATEGORY_LABELS[cat] || trade.category;
    const strikeStr = formatStrike(trade);
    if (trade._consolidated && trade._groupIds?.length > 1) {
      const n = trade._groupIds.length;
      if (!confirm(`למחוק את כל ${n} העסקאות המאוחדות של ${trade.ticker} ${catLabel} ${strikeStr}?\nהפעולה הזו תמחק ${n} רשומות מה-DB.`)) return;
      for (const id of trade._groupIds) {
        await deleteTrade.mutateAsync(id);
      }
      toast.success(`${n} עסקאות נמחקו`);
      return;
    }
    if (!confirm(`Delete ${trade.ticker} ${catLabel} trade?`)) return;
    await deleteTrade.mutateAsync(trade.id);
    toast.success("Trade deleted");
  };

  // ── KPI summary (always computed from raw trades, not consolidated) ──
  // P&L is only realized — open positions show no P&L per the new spec.
  const kpis = useMemo(() => {
    const open = trades.filter((t) => t.status === "Open");
    const closed = trades.filter((t) => ["Closed", "Expired", "Assigned"].includes(t.status));
    const realizedPnl = closed.reduce((s, t) => {
      const pl = computeRealizedPL(t);
      return s + (pl != null ? pl : (t.pnl || 0));
    }, 0);
    const premiumCollected = trades
      .filter((t) => isCredit(t))
      .reduce((s, t) => s + (t.fill_price || 0) * (t.quantity || 0) * 100, 0);
    const premiumPaid = trades
      .filter((t) => getDirection(t) === "debit")
      .reduce((s, t) => s + (t.fill_price || 0) * (t.quantity || 0) * 100, 0);
    const netPremium = premiumCollected - premiumPaid;
    const collateralOpen = open.reduce((s, t) => s + (t.collateral || 0), 0);
    return {
      open: open.length,
      closed: closed.length,
      realizedPnl,
      premiumCollected,
      premiumPaid,
      netPremium,
      collateralOpen,
    };
  }, [trades]);

  const uniqueTickers = useMemo(() => [...new Set(trades.map((t) => t.ticker))].sort(), [trades]);

  const filteredTrades = useMemo(() => {
    const list = trades.filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterTicker !== "all" && t.ticker !== filterTicker) return false;
      return true;
    });
    return consolidated ? consolidateTrades(list) : list;
  }, [trades, filterStatus, filterTicker, consolidated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Options Trades</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredTrades.length} / {trades.length} trades · {consolidated ? "מוצג מאוחד" : "מוצג גולמי"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openPriceHub} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Live Prices
          </Button>
          {!isReadOnly && (
            <Button onClick={() => { setEditTrade(null); setFormOpen(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> New Trade
            </Button>
          )}
        </div>
      </div>

      {/* Mini-dashboard KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile
          label="P&L ממומש"
          value={fmt(kpis.realizedPnl)}
          sub={`${kpis.closed} עסקאות סגורות`}
          accent={kpis.realizedPnl >= 0 ? "text-profit" : "text-loss"}
          icon={kpis.realizedPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <KpiTile
          label="פרמיה נטו"
          value={fmt(kpis.netPremium)}
          sub={`נגבתה ${fmt(kpis.premiumCollected)} · שולמה ${fmt(kpis.premiumPaid)}`}
          accent={kpis.netPremium >= 0 ? "text-profit" : "text-loss"}
          icon={DollarSign}
        />
        <KpiTile
          label="Collateral פתוח"
          value={fmt(kpis.collateralOpen)}
          sub="אחוד בפוזיציות פתוחות"
          icon={Target}
        />
        <KpiTile
          label="פוזיציות פתוחות"
          value={`${kpis.open}`}
          sub="P&L יוצג בעת סגירה"
        />
        <KpiTile
          label="סך עסקאות"
          value={`${trades.length}`}
          sub={`${kpis.open} פתוחות · ${kpis.closed} סגורות`}
        />
      </div>

      {/* Manual open options value override */}
      {!isReadOnly && (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold text-foreground">עדכון ידני — שווי אופציות פתוחות (IB)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              הזן את השווי הנוכחי מ-IB (options_value). ישתקף בדשבורד הראשי.
              {latestSnapshot?.snapshot_date && (
                <span className="mr-1">· snapshot: {latestSnapshot.snapshot_date}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={optionsValueInput}
              onChange={(e) => setOptionsValueInput(e.target.value)}
              placeholder="לדוגמה: -3200"
              className="w-40 font-mono text-sm"
            />
            <Button
              size="sm"
              onClick={handleSaveOptionsValue}
              disabled={savingOptionsValue}
              className="gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {savingOptionsValue ? "שומר..." : "שמור"}
            </Button>
          </div>
        </div>
      )}

      <ExpiryAlerts trades={trades} />

      {/* Filters + Consolidate toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Open">Open</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
            <SelectItem value="Assigned">Assigned</SelectItem>
            <SelectItem value="Expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTicker} onValueChange={setFilterTicker}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Ticker" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickers</SelectItem>
            {uniqueTickers.map((tk) => (
              <SelectItem key={tk} value={tk}>{tk}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setConsolidated(true)}
            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${consolidated ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <Layers className="w-3.5 h-3.5" /> מאוחד
          </button>
          <button
            onClick={() => setConsolidated(false)}
            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${!consolidated ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <List className="w-3.5 h-3.5" /> גולמי
          </button>
        </div>
      </div>

      {(filterStatus !== "all" || filterTicker !== "all") && (
        <AssignmentAnalysis trades={filteredTrades} stocks={stocks} />
      )}

      {/* Trades table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Open Date</th>
                <th className="text-left px-4 py-3 font-medium">Expiry</th>
                <th className="text-left px-4 py-3 font-medium">Direction</th>
                <th className="text-left px-4 py-3 font-medium">Ticker</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-right px-4 py-3 font-medium">Strike</th>
                <th className="text-right px-4 py-3 font-medium">Qty</th>
                <th className="text-right px-4 py-3 font-medium">Fill $</th>
                <th className="text-right px-4 py-3 font-medium">Close $</th>
                <th className="text-right px-4 py-3 font-medium">Collateral</th>
                <th className="text-right px-4 py-3 font-medium">P&L</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                {!isReadOnly && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t) => {
                const dir = getDirection(t);
                const cat = getCanonicalCategory(t);
                const catLabel = CATEGORY_LABELS[cat] || t.category || "—";
                const isOpen = t.status === "Open";
                const realized = computeRealizedPL(t);
                return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{t.open_date}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {t.expiration_date ? (
                      <span className={`${new Date(t.expiration_date) < new Date() ? "text-muted-foreground" : "text-amber-600 font-semibold"}`}>
                        {t.expiration_date}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {dir ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        dir === "credit" ? "bg-emerald-500/15 text-emerald-600" : "bg-blue-500/15 text-blue-600"
                      }`}>
                        {dir === "credit" ? "Credit" : "Debit"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium">
                    {t.ticker}
                    {t._consolidated && (
                      <span className="ml-1.5 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full" title={`מכיל ${t._groupSize} fills`}>
                        ×{t._groupSize}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{catLabel}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatStrike(t)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{t.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">${t.fill_price?.toFixed(2) ?? t.fill_price}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {t.close_price != null ? `$${t.close_price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {isOpen ? `$${(t.collateral || 0).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isOpen ? <span className="text-muted-foreground">—</span>
                      : (realized != null ? <PnlBadge value={realized} /> : (t.pnl != null ? <PnlBadge value={t.pnl} /> : "—"))}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={t.status} /></td>
                  {!isReadOnly && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 md:h-7 md:w-7"
                          disabled={t._consolidated}
                          title={t._consolidated ? "עבור למצב גולמי לערוך שורה בודדת" : "ערוך"}
                          onClick={() => { setEditTrade(t); setFormOpen(true); }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 md:h-7 md:w-7 text-destructive"
                          title={t._consolidated ? `מחק את כל ${t._groupSize} העסקאות המאוחדות` : "מחק"}
                          onClick={() => handleDelete(t)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );})}
              {filteredTrades.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center py-8 text-muted-foreground text-sm">אין עסקאות</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <OptionTradeForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editTrade={editTrade}
        onSaved={loadData}
      />
    </div>
  );
}