import { Users, Wallet, Percent, TrendingUp, CheckCircle2, Clock, Coins } from "lucide-react";
import { fmtMoney } from "./investorsSummaryMath";

function Card({ icon: Icon, label, value, sub, accent = "text-foreground" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </div>
      <div className={`text-xl font-semibold tracking-tight ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

const SYMBOL = { USD: "$", ILS: "₪", EUR: "€" };

export default function PrivateGlobalSummary({ summary, filtered }) {
  if (!summary) return null;
  const breakdown = Object.entries(summary.byCurrency)
    .filter(([, v]) => v > 0)
    .map(([c, v]) => `${SYMBOL[c] || ""}${Math.round(v).toLocaleString("en-US")}`)
    .join(" · ");

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold tracking-tight">סיכום כולל (USD)</h2>
        {filtered && <span className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">מוצג מסונן</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Card
          icon={Wallet}
          label="סך החוב שגויס"
          value={fmtMoney(summary.totalPrincipalUsd, "USD")}
          sub={breakdown}
        />
        <Card icon={Users} label="מספר משקיעים" value={summary.uniqueInvestors} sub={`${summary.positions} פוזיציות`} />
        <Card icon={CheckCircle2} label="פוזיציות פעילות" value={summary.activeCount} />
        <Card icon={Percent} label="ריבית שנתית ממוצעת (משוקללת)" value={`${summary.weightedRate.toFixed(2)}%`} />
        <Card icon={TrendingUp} label="סך ריבית צפויה" value={<span className="text-emerald-600">{fmtMoney(summary.projectedUsd, "USD")}</span>} />
        <Card icon={Coins} label="ריבית ששולמה" value={<span className="text-emerald-600">{fmtMoney(summary.paidUsd, "USD")}</span>} />
        <Card icon={Clock} label="ריבית שנותרה לתשלום" value={<span className="text-emerald-600">{fmtMoney(summary.remainingUsd, "USD")}</span>} />
      </div>
    </div>
  );
}