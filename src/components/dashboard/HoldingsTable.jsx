import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import PnlBadge from "../PnlBadge";

export default function HoldingsTable({ stocks, totalValue }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Stock Holdings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{stocks.length} positions · ${totalValue.toLocaleString()}</p>
        </div>
        <Link to="/stocks" className="flex items-center gap-1 text-xs text-primary hover:underline">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Ticker</th>
              <th className="text-right px-4 py-2.5 font-medium">Shares</th>
              <th className="text-right px-4 py-2.5 font-medium">Avg Cost</th>
              <th className="text-right px-4 py-2.5 font-medium">Current</th>
              <th className="text-right px-4 py-2.5 font-medium">Value</th>
              <th className="text-right px-4 py-2.5 font-medium">Unreal. P&L</th>
              <th className="text-right px-4 py-2.5 font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {stocks.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">No holdings</td></tr>
            ) : stocks.map((s) => {
              const weight = totalValue > 0 ? ((s.current_value || 0) / totalValue * 100).toFixed(1) : "0";
              const pct = s.gain_loss_pct ? (s.gain_loss_pct * 100).toFixed(1) : null;
              return (
                <tr key={s.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-semibold">{s.ticker}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{s.shares?.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">${s.average_cost?.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{s.current_price ? `$${s.current_price.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">${(s.current_value || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    {s.gain_loss != null ? (
                      <div className="flex flex-col items-end">
                        <PnlBadge value={s.gain_loss} showIcon={false} className="text-xs" />
                        {pct && <span className={`text-xs ${s.gain_loss_pct >= 0 ? 'text-profit' : 'text-loss'}`}>{s.gain_loss_pct >= 0 ? '+' : ''}{pct}%</span>}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{weight}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}