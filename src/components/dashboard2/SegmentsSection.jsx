import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { calcDashboard, fmt, pct } from "./dashboardCalcs";

function MetricLine({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-mono font-semibold ${accent || ""}`}>{value}</span>
    </div>
  );
}

function SegmentCard({ title, dotColor, nav, navLabel, link, linkLabel, children }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-0.5">{navLabel}</p>
        <p className="text-3xl font-bold font-mono text-foreground">{nav}</p>
      </div>
      <div className="divide-y divide-border/40 flex-1">
        {children}
      </div>
      <Link to={link} className="mt-5 text-xs text-primary flex items-center gap-1 hover:underline">
        {linkLabel} <ArrowUpRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

export default function SegmentsSection({ data }) {
  const c = calcDashboard(data);
  const equityPct = c.ibNav > 0 && c.totalOffChainDebt > 0
    ? ((c.ibNav / (c.ibNav + c.totalOffChainDebt)) * 100).toFixed(0) + "% Equity"
    : "100% Equity";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Off-Chain */}
      <SegmentCard
        title="Off-Chain · Interactive Brokers"
        dotColor="bg-primary"
        navLabel="NAV"
        nav={fmt(c.ibNav)}
        link="/options"
        linkLabel="לפירוט IB"
      >
        <MetricLine label="הופקד" value={fmt(c.totalDeposited)} />
        <MetricLine label="P&L" value={fmt(c.ibPnl)} accent={c.ibPnl >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="P&L ממומש (אופציות)" value={fmt(c.realizedPnl)} accent={c.realizedPnl >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="P&L לא ממומש (מניות)" value={fmt(c.unrealizedPnl)} accent={c.unrealizedPnl >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="Win Rate" value={`${(c.winRate * 100).toFixed(0)}%`} accent={c.winRate > 0.6 ? "text-profit" : ""} />
        <MetricLine label="מבנה הון" value={equityPct} />
      </SegmentCard>

      {/* On-Chain */}
      <SegmentCard
        title="On-Chain · DeFi"
        dotColor="bg-orange-400"
        navLabel="On-Chain NAV"
        nav={fmt(c.onChainNAV)}
        link="/crypto"
        linkLabel="לדשבורד קריפטו"
      >
        <MetricLine label="Aave (נטו)" value={fmt(c.aaveNetWorth)} accent={c.aaveNetWorth >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="הלוואות שנתנו" value={fmt(c.loansGivenValue)} />
        <MetricLine label="מזומן / יציב" value={fmt(c.stablecoinsValue)} />
        <MetricLine label="HL Live P&L" value={fmt(c.hlUnrealizedPnl)} accent={c.hlUnrealizedPnl >= 0 ? "text-profit" : "text-loss"} />
        <MetricLine label="חוב S&T" value={fmt(c.investorDebt)} accent="text-loss" />
        <MetricLine label="Aave Borrow" value={fmt(c.aaveBorrowUsd)} accent="text-loss" />
      </SegmentCard>
    </div>
  );
}