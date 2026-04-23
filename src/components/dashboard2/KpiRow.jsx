import { calcDashboard, fmt } from "./dashboardCalcs";
import { TrendingUp, TrendingDown, Shield, Landmark, Wallet } from "lucide-react";

function KpiCard({ label, value, sub, accent, icon: Icon, size = "md", tone }) {
  const sizeClass = size === "lg" ? "min-h-[140px]" : "min-h-[110px]";
  const valueClass = size === "lg" ? "text-3xl" : "text-2xl";
  const toneClass = {
    positive: "bg-gradient-to-br from-emerald-500/5 to-emerald-500/0 border-emerald-500/20",
    negative: "bg-gradient-to-br from-red-500/5 to-red-500/0 border-red-500/20",
    warning: "bg-gradient-to-br from-amber-500/5 to-amber-500/0 border-amber-500/20",
  }[tone] || "bg-card border-border";

  return (
    <div className={`${toneClass} border rounded-2xl p-5 flex flex-col justify-between ${sizeClass} hover:shadow-md hover:-translate-y-0.5 transition-all`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground/60" />}
      </div>
      <div>
        <p className={`${valueClass} font-bold font-mono leading-tight ${accent || "text-foreground"}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function KpiRow({ data }) {
  const c = calcDashboard(data);
  const pnlTone = c.totalPnl >= 0 ? "positive" : "negative";
  const hfTone = c.healthFactor === 0 ? null : c.healthFactor > 2 ? "positive" : c.healthFactor > 1.5 ? "warning" : "negative";

  return (
    <div className="space-y-3">
      {/* Primary KPIs — bigger, prominent */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          size="lg"
          label="סה״כ נכסים"
          value={fmt(c.totalAssets)}
          sub={`Off-Chain: ${fmt(c.ibNav, 0)} · On-Chain: ${fmt(c.cryptoTotalAssets, 0)}`}
          icon={Wallet}
        />
        <KpiCard
          size="lg"
          label="סה״כ חוב"
          value={fmt(c.totalDebt)}
          accent="text-loss"
          sub={`IB: ${fmt(c.totalOffChainDebt, 0)} · Crypto: ${fmt(c.cryptoTotalDebt, 0)}`}
          icon={Landmark}
        />
        <KpiCard
          size="lg"
          label="רווח / הפסד כולל"
          value={fmt(c.totalPnl)}
          accent={c.totalPnl >= 0 ? "text-profit" : "text-loss"}
          sub="נכסים פחות חוב פחות הון מופקד"
          icon={c.totalPnl >= 0 ? TrendingUp : TrendingDown}
          tone={pnlTone}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Aave Health"
          value={c.healthFactor > 0 ? c.healthFactor.toFixed(2) : "—"}
          accent={c.healthFactor > 2 ? "text-profit" : c.healthFactor > 1.5 ? "text-amber-500" : c.healthFactor > 0 ? "text-loss" : ""}
          sub={c.aaveBorrowUsd > 0 ? `Borrow: ${fmt(c.aaveBorrowUsd, 0)}` : "ללא חוב"}
          icon={Shield}
          tone={hfTone}
        />
        <KpiCard
          label="פרמיה שנגבתה (IB)"
          value={fmt(c.premiumCollected, 0)}
          accent="text-profit"
          sub={`${c.openOptions.length} אופציות פתוחות · ${c.closedOptions.length} נסגרו`}
          icon={TrendingUp}
        />
        <KpiCard
          label="HL Live P&L"
          value={fmt(c.hlUnrealizedPnl, 0)}
          accent={c.hlUnrealizedPnl >= 0 ? "text-profit" : "text-loss"}
          sub={`${data.leveraged?.length || 0} פוזיציות · Margin ${fmt(c.totalMargin, 0)}`}
          icon={c.hlUnrealizedPnl >= 0 ? TrendingUp : TrendingDown}
        />
      </div>
    </div>
  );
}
