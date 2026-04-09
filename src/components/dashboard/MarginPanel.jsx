import { AlertTriangle, Shield } from "lucide-react";

export default function MarginPanel({ snapshot }) {
  if (!snapshot) return null;

  const marginUsedPct = snapshot.initial_margin > 0
    ? (snapshot.initial_margin / (snapshot.nav + snapshot.initial_margin - snapshot.available_funds)) * 100
    : 0;

  const utilizationPct = snapshot.nav > 0
    ? Math.min(100, (snapshot.initial_margin / snapshot.nav) * 100)
    : 0;

  const isWarning = snapshot.available_funds < snapshot.nav * 0.05;
  const isDanger = snapshot.excess_liquidity < 15000;

  return (
    <div className={`bg-card border rounded-xl p-5 ${isDanger ? 'border-loss/50' : isWarning ? 'border-amber-500/30' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-4">
        {isDanger
          ? <AlertTriangle className="w-4 h-4 text-loss" />
          : <Shield className="w-4 h-4 text-primary" />}
        <h3 className="text-sm font-semibold">Margin & Liquidity</h3>
        {isDanger && <span className="ml-auto text-xs font-medium text-loss">⚠ Low Liquidity</span>}
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Margin Utilization</span>
            <span className={`font-mono font-medium ${utilizationPct > 80 ? 'text-loss' : utilizationPct > 60 ? 'text-amber-400' : 'text-profit'}`}>
              {utilizationPct.toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${utilizationPct > 80 ? 'bg-loss' : utilizationPct > 60 ? 'bg-amber-400' : 'bg-profit'}`}
              style={{ width: `${Math.min(100, utilizationPct)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          {[
            { label: "Available Funds", value: snapshot.available_funds, alert: snapshot.available_funds < 15000 },
            { label: "Excess Liquidity", value: snapshot.excess_liquidity, alert: snapshot.excess_liquidity < 15000 },
            { label: "Buying Power", value: snapshot.buying_power },
            { label: "Initial Margin", value: snapshot.initial_margin },
          ].map(({ label, value, alert }) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-sm font-mono font-semibold ${alert ? 'text-loss' : 'text-foreground'}`}>
                ${value?.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}