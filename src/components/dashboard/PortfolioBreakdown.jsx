export default function PortfolioBreakdown({ snapshot, totalDeposited }) {
  if (!snapshot) return null;

  const totalReturn = snapshot.nav - totalDeposited;
  const totalReturnPct = totalDeposited > 0 ? totalReturn / totalDeposited : 0;

  const items = [
    { label: "Stocks (Long)", value: snapshot.stocks_value, color: "bg-chart-2" },
    { label: "Options (Short)", value: snapshot.options_value, color: "bg-loss" },
    { label: "Cash", value: snapshot.cash, color: "bg-chart-3" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">NAV (Portfolio Value)</p>
          <p className="text-3xl font-bold text-foreground mt-1">
            ${snapshot.nav.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className={`text-xs mt-1 font-medium ${totalReturn >= 0 ? 'text-profit' : 'text-loss'}`}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
            {' '}({(totalReturnPct * 100).toFixed(1)}%) vs deposited
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Deposited</p>
          <p className="text-sm font-mono font-medium">${totalDeposited.toLocaleString()}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {items.map(({ label, value, color }) => {
          const abs = Math.abs(value);
          const pct = snapshot.long_value > 0 ? (abs / snapshot.long_value) * 100 : 0;
          return (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} />
              <span className="text-xs text-muted-foreground w-32">{label}</span>
              <div className="flex-1 bg-muted rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <span className={`text-xs font-mono font-medium w-28 text-right ${value < 0 ? 'text-loss' : 'text-foreground'}`}>
                {value < 0 ? '-' : ''}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}