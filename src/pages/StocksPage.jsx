import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import PnlBadge from "../components/PnlBadge";
import StockPositionForm from "../components/StockPositionForm";
import { toast } from "sonner";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";

export default function StocksPage() {
  const { data: stocks = [], isLoading, refetch } = useEntityList("StockPosition", { sort: "-entry_date" });
  const deleteStock = useEntityMutation("StockPosition", "delete");
  const updateStock = useEntityMutation("StockPosition", "update");

  const [formOpen, setFormOpen] = useState(false);
  const [editStock, setEditStock] = useState(null);
  const [user, setUser] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const handleRefreshPrices = async () => {
    const holdingStocks = stocks.filter((s) => s.status !== "Closed" && s.ticker);
    if (!holdingStocks.length) return;
    setRefreshing(true);
    try {
      const tickers = [...new Set(holdingStocks.map((s) => s.ticker))];
      const res = await base44.functions.invoke("fetchStockPrices", { tickers });
      const prices = res.data?.prices || {};
      await Promise.all(
        holdingStocks.map(async (s) => {
          const price = prices[s.ticker];
          if (!price) return;
          const current_value = price * s.shares;
          const gain_loss = current_value - (s.invested_value || 0);
          const gain_loss_pct = s.invested_value ? gain_loss / s.invested_value : 0;
          await updateStock.mutateAsync({
            id: s.id,
            data: { current_price: price, current_value, gain_loss, gain_loss_pct },
          });
        })
      );
      toast.success("מחירים עודכנו בהצלחה");
    } finally {
      setRefreshing(false);
    }
  };

  const isReadOnly = user?.role === "partner" || user?.role === "investor";

  const handleDelete = async (stock) => {
    if (!confirm(`Delete ${stock.ticker} position?`)) return;
    await deleteStock.mutateAsync(stock.id);
    toast.success("Position deleted");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalValue = stocks.reduce((sum, s) => sum + (s.current_value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Positions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stocks.length} positions · Total value: ${totalValue.toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefreshPrices} disabled={refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "מעדכן..." : "עדכן מחירים"}
          </Button>
          {!isReadOnly && (
            <Button onClick={() => { setEditStock(null); setFormOpen(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> New Position
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Ticker</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-right px-4 py-3 font-medium">Shares</th>
                <th className="text-right px-4 py-3 font-medium">Avg Cost</th>
                <th className="text-right px-4 py-3 font-medium">Current</th>
                <th className="text-right px-4 py-3 font-medium">Invested</th>
                <th className="text-right px-4 py-3 font-medium">Current Val</th>
                <th className="text-right px-4 py-3 font-medium">P&L</th>
                <th className="text-right px-4 py-3 font-medium">Return</th>
                <th className="text-right px-4 py-3 font-medium">Weight</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                {!isReadOnly && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => {
                const weight = totalValue > 0 ? ((s.current_value || 0) / totalValue * 100).toFixed(1) : "0";
                return (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium">{s.ticker}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.source}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.shares?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">${s.average_cost?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.current_price ? `$${s.current_price.toFixed(2)}` : "-"}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">${(s.invested_value || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">${(s.current_value || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {s.gain_loss !== null && s.gain_loss !== undefined ? <PnlBadge value={s.gain_loss} /> : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {s.gain_loss_pct !== null && s.gain_loss_pct !== undefined
                        ? <span className={s.gain_loss_pct >= 0 ? "text-profit" : "text-loss"}>
                            {(s.gain_loss_pct * 100).toFixed(1)}%
                          </span>
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{weight}%</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={s.status} /></td>
                    {!isReadOnly && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setEditStock(s); setFormOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(s)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <StockPositionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editStock={editStock}
        onSaved={refetch}
      />
    </div>
  );
}
