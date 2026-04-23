import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, Coins } from "lucide-react";
import { calcDashboard, fmt, pct } from "./dashboardCalcs";

function MetricLine({ label, value, accent, sub }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        {sub && <span className="text-[10px] text-muted-foreground/70">{sub}</span>}
      </div>
      <span className={`text-sm font-mono font-semibold ${accent || ""}`}>{value}</span>
    </div>
  );
}

function SegmentCard({ title, icon: Icon, accentColor, nav, navLabel, subNav, link, linkLabel, children }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${accentColor} flex items-center justify-center`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
        </div>
        <Link to={link} className="text-xs text-primary flex items-center gap-1 hover:underline">
          {linkLabel} <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="mb-4 pb-4 border-b border-border/50">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{navLabel}</p>
        <p className="text-3xl font-bold font-mono text-foreground leading-none">{nav}</p>
        {subNav && <p className="text-xs text-muted-foreground mt-1.5">{subNav}</p>}
      </div>

      <div className="divide-y divide-border/40 flex-1">
        {children}
      </div>
    </div>
  );
}

export default function SegmentsSection({ data }) {
  const c = calcDashboard(data);
  const equityPct = c.ibNav > 0 && c.totalOffChainDebt > 0
    ? `${((c.ibNav / (c.ibNav + c.totalOffChainDebt)) * 100).toFixed(0)}% Equity`
    : "100% Equity";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Off-Chain */}
      <SegmentCard
        title="Off-Chain · Interactive Brokers"
        icon={Building2}
        accentColor="bg-gradient-to-br from-blue-500 to-blue-600"
        navLabel="NAV"
        nav={fmt(c.ibNav)}
        subNav={`${pct(c.ibPnlPct)} · הופקד ${fmt(c.totalDeposited, 0)}`}
        link="/options"
        linkLabel="לפירוט IB"
      >
        <MetricLine label="הופקד" value={fmt(c.totalDeposited)} />
        <MetricLine label="P&L כולל" value={fmt(c.ibPnl)} accent={c.ibPnl >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="P&L ממומש" sub="אופציות" value={fmt(c.realizedPnl)} accent={c.realizedPnl >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="P&L לא ממומש" sub="מניות" value={fmt(c.unrealizedPnl)} accent={c.unrealizedPnl >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="Win Rate" value={`${(c.winRate * 100).toFixed(0)}%`} accent={c.winRate > 0.6 ? "text-profit" : ""} />
        <MetricLine label="מבנה הון" value={equityPct} />
      </SegmentCard>

      {/* On-Chain */}
      <SegmentCard
        title="On-Chain · DeFi"
        icon={Coins}
        accentColor="bg-gradient-to-br from-orange-500 to-amber-600"
        navLabel="On-Chain NAV"
        nav={fmt(c.onChainNAV)}
        subNav={`נכסים ${fmt(c.cryptoTotalAssets, 0)} · חוב ${fmt(c.cryptoTotalDebt, 0)}`}
        link="/crypto"
        linkLabel="לדשבורד קריפטו"
      >
        <MetricLine label="Aave (נטו)" value={fmt(c.aaveNetWorth)} accent={c.aaveNetWorth >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="הלוואות שנתנו" value={fmt(c.loansGivenValue)} />
        <MetricLine label="מזומן / יציב" value={fmt(c.stablecoinsValue)} />
        <MetricLine label="HL Live P&L" value={fmt(c.hlUnrealizedPnl)} accent={c.hlUnrealizedPnl >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="חוב משקיעים" value={fmt(c.investorDebt)} accent="text-loss" />
        <MetricLine label="Aave Borrow" value={fmt(c.aaveBorrowUsd)} accent={c.aaveBorrowUsd > 0 ? "text-loss" : ""} />
      </SegmentCard>
    </div>
  );
}
