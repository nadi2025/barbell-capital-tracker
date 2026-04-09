import { useState, useEffect } from "react";
import AssignmentAnalysis from "../components/AssignmentAnalysis";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "../components/StatusBadge";
import PnlBadge from "../components/PnlBadge";
import OptionTradeForm from "../components/OptionTradeForm";
import { toast } from "sonner";

export default function OptionsPage() {
  const [trades, setTrades] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  const [user, setUser] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTicker, setFilterTicker] = useState("all");
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  const loadData = async () => {
    const [t, u, s] = await Promise.all([
      base44.entities.OptionsTrade.list("-open_date"),
      base44.auth.me(),
      base44.entities.StockPosition.list(),
    ]);
    setTrades(t);
    setUser(u);
    setStocks(s);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const refreshLivePrices = async () => {
    setRefreshingPrices(true);
    const holdingStocks = stocks.filter(s => s.status === "Holding" || s.status === "Partially Sold");
    const tickers = [...new Set(holdingStocks.map(s => s.ticker))];
    if (tickers.length === 0) { setRefreshingPrices(false); return; }
    const res = await base44.functions.invoke("fetchStockPrices", { tickers });
    const prices = res.data?.prices || {};
    await Promise.all(
      holdingStocks.map(s => {
        const price = prices[s.ticker];
        if (price == null) return;
        const invested = (s.average_cost || 0) * (s.shares || 0);
        const currentVal = price * (s.shares || 0);
        return base44.entities.StockPosition.update(s.id, {
          current_price: price,
          current_value: currentVal,
          gain_loss: currentVal - invested,
          gain_loss_pct: invested > 0 ? (currentVal - invested) / invested : 0,
        });
      })
    );
    await loadData();
    setRefreshingPrices(false);
    toast.success("Live prices updated");
  };

  const isReadOnly = user?.role === "partner" || user?.role === "investor";

  const handleDelete = async (trade) => {
    if (!confirm(`Delete ${trade.ticker} ${trade.category} trade?`)) return;
    await base44.entities.OptionsTrade.delete(trade.id);
    toast.success("Trade deleted");
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const uniqueTickers = [...new Set(trades.map(t => t.ticker))].sort();
  const filteredTrades = trades.filter(t => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterTicker !== "all" && t.ticker !== filterTicker) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Options Trades</h1>
          <p className="text-sm text-muted-foreground mt-1">{filteredTrades.length} / {trades.length} trades</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshLivePrices} disabled={refreshingPrices} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshingPrices ? 'animate-spin' : ''}`} />
            {refreshingPrices ? "Updating..." : "Live Prices"}
          </Button>
          {!isReadOnly && (
            <Button onClick={() => { setEditTrade(null); setFormOpen(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> New Trade
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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
            {uniqueTickers.map(tk => (
              <SelectItem key={tk} value={tk}>{tk}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(filterStatus !== "all" || filterTicker !== "all") && (
        <AssignmentAnalysis trades={filteredTrades} stocks={stocks} />
      )}

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
                <th className="text-right px-4 py-3 font-medium">ROC</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                {!isReadOnly && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((t) => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{t.open_date}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {t.expiration_date
                      ? <span className={`${new Date(t.expiration_date) < new Date() ? 'text-muted-foreground' : 'text-amber-600 font-semibold'}`}>{t.expiration_date}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">{t.type}</td>
                  <td className="px-4 py-3 font-mono font-medium">{t.ticker}</td>
                  <td className="px-4 py-3 text-xs">{t.category}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    ${t.strike}{t.strike_2 ? `/$${t.strike_2}` : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{t.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">${t.fill_price}</td>
                  <td className="px-4 py-3 text-right font-mono">{t.close_price !== null && t.close_price !== undefined ? `$${t.close_price}` : "-"}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">${(t.collateral || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    {t.pnl !== null && t.pnl !== undefined ? <PnlBadge value={t.pnl} /> : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {t.roc !== null && t.roc !== undefined ? `${(t.roc * 100).toFixed(1)}%` : "-"}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={t.status} /></td>
                  {!isReadOnly && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditTrade(t); setFormOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(t)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
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