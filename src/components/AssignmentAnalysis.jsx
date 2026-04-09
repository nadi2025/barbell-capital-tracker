import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";

function fmt(v, dec = 0) {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function AssignmentAnalysis({ trades, stocks }) {
  const [open, setOpen] = useState(true);

  // Find assigned trades + expired trades that have a linked stock ("failed" options where stock was bought anyway)
  const assigned = trades.filter(t => t.status === "Assigned");

  // Group by ticker — for each assigned trade, find the matching stock position
  const rows = assigned.map(t => {
    // Premium collected (for Sell trades)
    const premiumCollected = t.type === "Sell"
      ? (t.fill_price || 0) * (t.quantity || 0) * 100
      : -(t.fill_price || 0) * (t.quantity || 0) * 100;

    // Find linked stock position
    const linkedStock = stocks.find(s =>
      (t.linked_stock_id && s.id === t.linked_stock_id) ||
      (t.status === "Assigned" && s.ticker === t.ticker && s.source === "Assignment")
    );

    const strikeValue = (t.strike || 0) * (t.quantity || 0) * 100;
    const currentStockPrice = linkedStock?.current_price;
    const shares = linkedStock?.shares || (t.quantity || 0) * 100;
    const currentValue = currentStockPrice ? currentStockPrice * shares : null;
    const costBasis = t.strike ? t.strike * shares : null;
    const unrealizedFromStock = currentValue != null && costBasis != null ? currentValue - costBasis : null;

    // True total: premium + stock unrealized
    const trueTotal = unrealizedFromStock != null ? premiumCollected + unrealizedFromStock : null;

    return { trade: t, premiumCollected, linkedStock, currentStockPrice, shares, currentValue, costBasis, unrealizedFromStock, trueTotal };
  });

  // Also include expired trades that have a matching stock position (manual analysis of "failed" options)
  const expiredWithStock = trades
    .filter(t => t.status === "Expired")
    .filter(t => stocks.some(s =>
      (t.linked_stock_id && s.id === t.linked_stock_id) ||
      s.ticker === t.ticker
    ));

  const expiredRows = expiredWithStock.map(t => {
    const premiumCollected = t.type === "Sell"
      ? (t.fill_price || 0) * (t.quantity || 0) * 100
      : -(t.fill_price || 0) * (t.quantity || 0) * 100;
    const linkedStock = stocks.find(s =>
      (t.linked_stock_id && s.id === t.linked_stock_id) ||
      s.ticker === t.ticker
    );
    const shares = linkedStock?.shares || (t.quantity || 0) * 100;
    const currentStockPrice = linkedStock?.current_price;
    const avgCost = linkedStock?.average_cost || t.strike;
    const currentValue = currentStockPrice ? currentStockPrice * shares : null;
    const costBasis = avgCost ? avgCost * shares : null;
    const unrealizedFromStock = currentValue != null && costBasis != null ? currentValue - costBasis : null;
    const trueTotal = unrealizedFromStock != null ? premiumCollected + unrealizedFromStock : null;
    return { trade: t, premiumCollected, linkedStock, currentStockPrice, shares, currentValue, costBasis, unrealizedFromStock, trueTotal, isExpiredAnalysis: true };
  });

  const assignedRows = rows.filter(r => r.trade.status === "Assigned");
  const allAnalysisRows = [...assignedRows, ...expiredRows];
  if (allAnalysisRows.length === 0) return null;

  const totalPremium = allAnalysisRows.reduce((s, r) => s + r.premiumCollected, 0);
  const totalUnrealized = allAnalysisRows.filter(r => r.unrealizedFromStock != null).reduce((s, r) => s + (r.unrealizedFromStock || 0), 0);
  const totalTrue = allAnalysisRows.filter(r => r.trueTotal != null).reduce((s, r) => s + (r.trueTotal || 0), 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 border-b border-border hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="text-left">
          <h3 className="text-sm font-semibold">Assignment Analysis — True P&L</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Premium collected + current stock value vs strike
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Premium Collected</p>
            <p className="text-sm font-mono font-semibold text-profit">{fmt(totalPremium)}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Stock Unrealized</p>
            <p className={`text-sm font-mono font-semibold ${totalUnrealized >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(totalUnrealized)}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">True Total</p>
            <p className={`text-sm font-mono font-semibold ${totalTrue >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(totalTrue)}</p>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground bg-muted/20">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Ticker</th>
                <th className="text-right px-4 py-2.5 font-medium">Strike</th>
                <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                <th className="text-right px-4 py-2.5 font-medium">Fill Price</th>
                <th className="text-right px-4 py-2.5 font-medium">Premium In</th>
                <th className="text-right px-4 py-2.5 font-medium">Shares</th>
                <th className="text-right px-4 py-2.5 font-medium">Cur. Price</th>
                <th className="text-right px-4 py-2.5 font-medium">Cost Basis</th>
                <th className="text-right px-4 py-2.5 font-medium">Cur. Value</th>
                <th className="text-right px-4 py-2.5 font-medium">Stock P&L</th>
                <th className="text-right px-4 py-2.5 font-medium font-semibold">True Total</th>
              </tr>
            </thead>
            <tbody>
              {allAnalysisRows.map(({ trade: t, premiumCollected, linkedStock, currentStockPrice, shares, currentValue, costBasis, unrealizedFromStock, trueTotal, isExpiredAnalysis }) => {
                const isPos = trueTotal != null && trueTotal >= 0;
                const TIcon = trueTotal != null ? (isPos ? TrendingUp : TrendingDown) : null;
                return (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.open_date}</td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      {t.ticker}
                      {isExpiredAnalysis && <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded">Expired+Stock</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">${t.strike}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{t.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">${t.fill_price}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-profit font-semibold">{fmt(premiumCollected)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{shares?.toLocaleString() || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {currentStockPrice ? `$${currentStockPrice.toFixed(2)}` : <span className="text-muted-foreground text-xs">update stock</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{fmt(costBasis)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmt(currentValue)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {unrealizedFromStock != null ? (
                        <span className={unrealizedFromStock >= 0 ? 'text-profit' : 'text-loss'}>
                          {unrealizedFromStock >= 0 ? '+' : ''}{fmt(unrealizedFromStock)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trueTotal != null ? (
                        <div className={`flex items-center justify-end gap-1 font-mono font-semibold text-sm ${isPos ? 'text-profit' : 'text-loss'}`}>
                          {TIcon && <TIcon className="w-3.5 h-3.5" />}
                          {trueTotal >= 0 ? '+' : ''}{fmt(trueTotal)}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">update price</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 border-t border-border font-semibold text-sm">
                <td colSpan={5} className="px-4 py-3 text-xs text-muted-foreground">TOTAL</td>
                <td className="px-4 py-3 text-right font-mono text-profit">{fmt(totalPremium)}</td>
                <td colSpan={4} />
                <td className={`px-4 py-3 text-right font-mono ${totalUnrealized >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(totalUnrealized)}</td>
                <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${totalTrue >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {totalTrue >= 0 ? '+' : ''}{fmt(totalTrue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}