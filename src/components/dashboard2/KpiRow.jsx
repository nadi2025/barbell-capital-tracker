import { calcDashboard, fmt, pct } from "./dashboardCalcs";
import { TrendingUp, TrendingDown, Shield, Landmark, Wallet } from "lucide-react";

function KpiCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between min-h-[120px] hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground/50" />}
      </div>
      <p className={`text-2xl font-bold font-mono ${accent || "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function KpiRow({ data }) {
  const c = calcDashboard(data);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <KpiCard
        label="סה״כ נכסים"
        value={fmt(c.totalAssets)}
        sub={`Off: ${fmt(c.ibNav, 0)} · On: ${fmt(c.cryptoTotalAssets, 0)}`}
        icon={Wallet}
      />
      <KpiCard
        label="סה״כ חוב"
        value={fmt(c.totalDebt)}
        accent="text-loss"
        sub={`IB: ${fmt(c.totalOffChainDebt, 0)} · Crypto: ${fmt(c.cryptoTotalDebt, 0)}`}
        icon={Landmark}
      />
      <KpiCard
        label="רווח / הפסד"
        value={fmt(c.totalPnl)}
        accent={c.totalPnl >= 0 ? "text-profit" : "text-loss"}
        sub={pct(c.totalPnlPct)}
        icon={c.totalPnl >= 0 ? TrendingUp : TrendingDown}
      />
      <KpiCard
        label="Aave Health"
        value={c.healthFactor > 0 ? c.healthFactor.toFixed(2) : "—"}
        accent={c.healthFactor > 2 ? "text-profit" : c.healthFactor > 1.5 ? "text-amber-500" : "text-loss"}
        sub={`Borrow: ${(c.borrowPowerUsed).toFixed(0)}%`}
        icon={Shield}
      />
      <KpiCard
        label="IB Win Rate"
        value={`${(c.winRate * 100).toFixed(0)}%`}
        accent={c.winRate > 0.6 ? "text-profit" : "text-foreground"}
        sub={`${c.closedOptions.length} עסקאות סגורות`}
      />
    </div>
  );
}