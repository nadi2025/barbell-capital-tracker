import { Link } from "react-router-dom";
import { ArrowUpRight, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { fmt, pct } from "./dashboardCalcs";

const calcLivePnl = (p) => {
  if (!p.mark_price || !p.entry_price || !p.size) return null;
  return p.direction === "Long"
    ? (p.mark_price - p.entry_price) * p.size
    : (p.entry_price - p.mark_price) * p.size;
};

const calcRoe = (p) => {
  const pnl = calcLivePnl(p);
  if (pnl == null || !p.margin_usd) return null;
  return (pnl / p.margin_usd) * 100;
};

const distToLiq = (p) => {
  if (!p.liquidation_price || !p.mark_price) return null;
  return Math.abs((p.mark_price - p.liquidation_price) / p.mark_price) * 100;
};

function distColor(d) {
  if (d == null) return "text-muted-foreground";
  if (d < 15) return "text-red-500 font-bold";
  if (d < 25) return "text-amber-500 font-semibold";
  return "text-profit";
}

function rowBg(d) {
  if (d == null) return "";
  if (d < 15) return "bg-red-500/5";
  if (d < 25) return "bg-amber-500/5";
  return "";
}

/**
 * Compact HL positions summary for the main dashboard.
 * Shows all open leveraged positions with live P&L, ROE, and liquidation distance.
 * Clicking any row navigates to the detailed LeveragedPage.
 */
export default function HLPositionsSection({ data }) {
  const positions = (data.leveraged || []).filter((p) => p.status !== "Closed");

  if (!positions.length) {
    return null;
  }

  const totalMargin = positions.reduce((s, p) => s + (p.margin_usd || 0), 0);
  const totalNotional = positions.reduce((s, p) => s + (p.position_value_usd || 0), 0);
  const totalLivePnl = positions.reduce((s, p) => s + (calcLivePnl(p) || 0), 0);
  const totalPnlPct = totalMargin > 0 ? (totalLivePnl / totalMargin) * 100 : 0;
  const accountEquity = totalMargin + totalLivePnl;

  // Sort by distance to liquidation (most risky first)
  const sorted = [...positions].sort((a, b) => {
    const da = distToLiq(a);
    const db = distToLiq(b);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header with summary */}
      <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              {totalLivePnl >= 0 ? (
                <TrendingUp className="w-4 h-4 text-white" />
              ) : (
                <TrendingDown className="w-4 h-4 text-white" />
              )}
            </div>
            <h3 className="text-sm font-bold">HyperLiquid · {positions.length} פוזיציות</h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">Margin: </span>
            <span className="font-mono font-semibold">{fmt(totalMargin, 0)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Notional: </span>
            <span className="font-mono font-semibold">{fmt(totalNotional, 0)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Live P&L: </span>
            <span className={`font-mono font-semibold ${totalLivePnl >= 0 ? "text-profit" : "text-loss"}`}>
              {fmt(totalLivePnl, 0)} ({pct(totalPnlPct)})
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Equity: </span>
            <span className="font-mono font-semibold">{fmt(accountEquity, 0)}</span>
          </div>
          <Link to="/crypto/leveraged" className="text-primary hover:underline flex items-center gap-1">
            פירוט מלא <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Compact positions table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/20">
              <th className="text-right px-4 py-2 font-medium">נכס</th>
              <th className="text-right px-4 py-2 font-medium">כיוון</th>
              <th className="text-right px-4 py-2 font-medium">Mark</th>
              <th className="text-right px-4 py-2 font-medium">Entry</th>
              <th className="text-right px-4 py-2 font-medium">P&L (ROE)</th>
              <th className="text-right px-4 py-2 font-medium">Notional</th>
              <th className="text-right px-4 py-2 font-medium">Margin</th>
              <th className="text-right px-4 py-2 font-medium">מרחק חיסול</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const pnl = calcLivePnl(p);
              const roe = calcRoe(p);
              const dist = distToLiq(p);
              return (
                <tr key={p.id} className={`border-t border-border/40 ${rowBg(dist)} hover:bg-muted/20 transition-colors`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {dist != null && dist < 15 && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                      )}
                      <span className="font-mono font-bold">{p.asset}</span>
                      <span className="text-[10px] text-muted-foreground">{p.leverage}x</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      p.direction === "Long" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"
                    }`}>
                      {p.direction === "Long" ? "▲ Long" : "▼ Short"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right">
                    {p.mark_price ? `$${p.mark_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right text-muted-foreground">
                    ${(p.entry_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {pnl != null ? (
                      <div>
                        <span className={`font-mono font-semibold text-xs ${pnl >= 0 ? "text-profit" : "text-loss"}`}>
                          {pnl >= 0 ? "+" : ""}{fmt(pnl, 0)}
                        </span>
                        {roe != null && (
                          <span className={`block text-[10px] ${roe >= 0 ? "text-profit" : "text-loss"}`}>
                            {roe >= 0 ? "+" : ""}{roe.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right text-xs">
                    {fmt(p.position_value_usd, 0)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right text-xs text-muted-foreground">
                    {fmt(p.margin_usd, 0)}
                  </td>
                  <td className={`px-4 py-2.5 font-mono text-right text-xs ${distColor(dist)}`}>
                    {dist != null ? `${dist.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
