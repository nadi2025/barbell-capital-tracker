import PnlBadge from "../PnlBadge";

export default function HoldingsTable({ stocks, totalValue }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold">Current Holdings</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{stocks.length} positions</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Ticker</th>
              <th className="text-right px-4 py-3 font-medium">Shares</th>
              <th className="text-right px-4 py-3 font-medium">Avg Cost</th>
              <th className="text-right px-4 py-3 font-medium">Current</th>
              <th className="text-right px-4 py-3 font-medium">P&L</th>
              <th className="text-right px-4 py-3 font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {stocks.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-xs">No holdings</td></tr>
            ) : stocks.map((s) => {
              const weight = totalValue > 0 ? ((s.current_value || 0) / totalValue * 100).toFixed(1) : "0";
              return (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium">{s.ticker}</td>
                  <td className="px-4 py-3 text-right font-mono">{s.shares?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">${s.average_cost?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono">${s.current_price?.toFixed(2) || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <PnlBadge value={s.gain_loss || 0} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{weight}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}