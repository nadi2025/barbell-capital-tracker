import { useState, useEffect, useMemo } from "react";
import AssignmentAnalysis from "../components/AssignmentAnalysis";
import ExpiryAlerts from "../components/ExpiryAlerts";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, RefreshCw, Layers, List, TrendingUp, TrendingDown, Target, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "../components/StatusBadge";
import PnlBadge from "../components/PnlBadge";
import OptionTradeForm from "../components/OptionTradeForm";
import { toast } from "sonner";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";

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
    const key = [
      t.ticker, t.category, t.strike, t.strike_2 || "",
      t.expiration_date, t.open_date, t.type, t.status,
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
    // Weighted average fill price, summed quantity / fees / pnl
    const totalQty = group.reduce((s, t) => s + (t.quantity || 0), 0);
    const weightedFill = totalQty > 0
      ? group.reduce((s, t) => s + (t.fill_price || 0) * (t.quantity || 0), 0) / totalQty
      : 0;
    const totalPnl = group.every((t) => t.pnl == null) ? null : group.reduce((s, t) => s + (t.pnl || 0), 0);
    const totalFee = group.reduce((s, t) => s + (t.fee || 0), 0);
    const totalCollateral = group.reduce((s, t) => s + (t.collateral || 0), 0);
    const closePrices = group.map((t) => t.close_price).filter((v) => v != null);
    const avgClose = closePrices.length > 0 ? closePrices.reduce((s, v) => s + v, 0) / closePrices.length : null;
    result.push({
      ...group[0],
      id: group[0].id, // keep first id as stable key; edit/delete on a consolidated row disables below
      _consolidated: true,
      _groupSize: group.length,
      _groupIds: group.map((t) => t.id),
      quantity: totalQty,
      fill_price: weightedFill,
      close_price: avgClose,
      pnl: totalPnl,
      fee: totalFee,
      collateral: totalCollateral,
    });
  }
  // Preserve original sort order (by open_date desc)
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
  const deleteTrade = useEntityMutation("OptionsTrade", "delete");
  const updateStock = useEntityMutation("StockPosition", "update");

  const [formOpen, setFormOpen] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  const [user, setUser] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTicker, setFilterTicker] = useState("all");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [consolidated, setConsolidated] = useState(true);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const loadData = () => {
    refetchTrades();
    refetchStocks();
  };

  const loading = loadingTrades;

  const refreshLivePrices = async () => {
    setRefreshingPrices(true);
    const holdingStocks = stocks.filter((s) => s.status === "Holding" || s.status === "Partially Sold");
    const tickers = [...new Set(holdingStocks.map((s) => s.ticker))];
    if (tickers.length === 0) { setRefreshingPrices(false); return; }
    const res = await base44.functions.invoke("fetchStockPrices", { tickers });
    const prices = res.data?.prices || {};
    await Promise.all(
      holdingStocks.map((s) => {
        const price = prices[s.ticker];
        if (price == null) return;
        const invested = (s.average_cost || 0) * (s.shares || 0);
        const currentVal = price * (s.shares || 0);
        return updateStock.mutateAsync({
          id: s.id,
          data: {
            current_price: price,
            current_value: currentVal,
            gain_loss: currentVal - invested,
            gain_loss_pct: invested > 0 ? (currentVal - invested) / invested : 0,
          },
        });
      })
    );
    setRefreshingPrices(false);
    toast.success("Live prices updated");
  };

  const isReadOnly = user?.role === "partner" || user?.role === "investor";

  const handleDelete = async (trade) => {
    if (!confirm(`Delete ${trade.ticker} ${trade.category} trade?`)) return;
    await deleteTrade.mutateAsync(trade.id);
    toast.success("Trade deleted");
  };

  // ── KPI summary (always computed from raw trades, not consolidated) ──
  const kpis = useMemo(() => {
    const open = trades.filter((t) => t.status === "Open");
    const closed = trades.filter((t) => ["Closed", "Expired", "Assigned"].includes(t.status));
    const realizedPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
    const unrealizedPnl = open.reduce((s, t) => s + (t.pnl || 0), 0);
    const totalPnl = realizedPnl + unrealizedPnl;
    const premiumCollected = trades
      .filter((t) => t.type === "Sell")
      .reduce((s, t) => s + (t.fill_price || 0) * (t.quantity || 0) * 100, 0);
    const premiumPaid = trades
      .filter((t) => t.type === "Buy")
      .reduce((s, t) => s + (t.fill_price || 0) * (t.quantity || 0) * 100, 0);
    const netPremium = premiumCollected - premiumPaid;
    const collateralOpen = open.reduce((s, t) => s + (t.collateral || 0), 0);
    return {
      open: open.length,
      closed: closed.length,
      realizedPnl,
      unrealizedPnl,
      totalPnl,
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
          <Button variant="outline" onClick={refreshLivePrices} disabled={refreshingPrices} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshingPrices ? "animate-spin" : ""}`} />
            {refreshingPrices ? "Updating..." : "Live Prices"}
          </Button>
          {!isReadOnly && (
            <Button onClick={() => { setEditTrade(null); setFormOpen(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> New Trade
            </Button>
          )}
        </div>
      </div>

      {/* Mini-dashboard KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          label="P&L כולל"
          value={fmt(kpis.totalPnl)}
          sub={`ממומש ${fmt(kpis.realizedPnl)}`}
          accent={kpis.totalPnl >= 0 ? "text-profit" : "text-loss"}
          icon={kpis.totalPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <KpiTile
          label="P&L ממומש"
          value={fmt(kpis.realizedPnl)}
          sub={`${kpis.closed} עסקאות סגורות`}
          accent={kpis.realizedPnl >= 0 ? "text-profit" : "text-loss"}
          icon={Target}
        />
        <KpiTile
          label="P&L לא ממומש"
          value={fmt(kpis.unrealizedPnl)}
          sub={`${kpis.open} פוזיציות פתוחות`}
          accent={kpis.unrealizedPnl >= 0 ? "text-profit" : "text-loss"}
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
        />
        <KpiTile
          label="סך עסקאות"
          value={`${trades.length}`}
          sub={`${kpis.open} פתוחות · ${kpis.closed} סגורות`}
        />
      </div>

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
                <th className="text-left px-4 py-3 font-medium">Type</th>
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
              {filteredTrades.map((t) => (
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
                  <td className="px-4 py-3 text-xs">{t.type}</td>
                  <td className="px-4 py-3 font-mono font-medium">
                    {t.ticker}
                    {t._consolidated && (
                      <span className="ml-1.5 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full" title={`מכיל ${t._groupSize} fills`}>
                        ×{t._groupSize}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{t.category}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    ${t.strike}{t.strike_2 ? `/$${t.strike_2}` : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{t.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">${t.fill_price?.toFixed(2) ?? t.fill_price}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {t.close_price != null ? `$${t.close_price.toFixed(2)}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    ${(t.collateral || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.pnl != null ? <PnlBadge value={t.pnl} /> : "-"}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={t.status} /></td>
                  {!isReadOnly && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={t._consolidated}
                          title={t._consolidated ? "עבור למצב גולמי לערוך שורה" : "ערוך"}
                          onClick={() => { setEditTrade(t); setFormOpen(true); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          disabled={t._consolidated}
                          title={t._consolidated ? "עבור למצב גולמי למחוק שורה" : "מחק"}
                          onClick={() => handleDelete(t)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
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
