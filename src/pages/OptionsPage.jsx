import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import PnlBadge from "../components/PnlBadge";
import OptionTradeForm from "../components/OptionTradeForm";
import { toast } from "sonner";

export default function OptionsPage() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  const [user, setUser] = useState(null);

  const loadData = async () => {
    const [t, u] = await Promise.all([
      base44.entities.OptionsTrade.list("-open_date"),
      base44.auth.me(),
    ]);
    setTrades(t);
    setUser(u);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Options Trades</h1>
          <p className="text-sm text-muted-foreground mt-1">{trades.length} total trades</p>
        </div>
        {!isReadOnly && (
          <Button onClick={() => { setEditTrade(null); setFormOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> New Trade
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Date</th>
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
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{t.open_date}</td>
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