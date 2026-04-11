import { CheckCircle2, XCircle } from "lucide-react";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

const STRATEGY_NAMES = {
  "Cash secured put": "Cash Secured Put",
  "Covered call": "Covered Call",
  "Naked put": "Naked Put",
  "Naked call": "Naked Call",
};

export default function ClosedPositionCard({ pos }) {
  const isOtm = pos.status === "Expired OTM";
  const isItm = pos.status === "Expired ITM";
  const strategyLabel = pos.strategy ? (STRATEGY_NAMES[pos.strategy] || pos.strategy) : (pos.option_type === "Put" ? "Cash Secured Put" : "Covered Call");

  const openDate = pos.opened_date ? new Date(pos.opened_date) : null;
  const closeDate = pos.maturity_date ? new Date(pos.maturity_date) : null;
  const durationDays = openDate && closeDate ? Math.ceil((closeDate - openDate) / 86400000) : null;

  const netPnl = pos.net_pnl ?? (isOtm ? pos.income_usd : null);
  const assignmentCost = isItm && pos.net_pnl != null ? pos.net_pnl - pos.income_usd : null;

  return (
    <div className={`bg-card border rounded-xl p-4 space-y-3 ${isOtm ? "border-emerald-500/30" : isItm ? "border-red-400/30" : "border-border"}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-bold">{pos.asset}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">{strategyLabel}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">{pos.direction || "Sell"}</span>
        </div>
        <div>
          {isOtm && (
            <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">OTM ✓</span>
            </div>
          )}
          {isItm && (
            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1">
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-semibold text-red-400">ITM ✗</span>
            </div>
          )}
        </div>
      </div>

      {/* Strike / Settlement */}
      <div className="flex gap-4 text-xs">
        <div>
          <p className="text-muted-foreground">Strike</p>
          <p className="font-mono font-semibold">{pos.strike_price ? fmt(pos.strike_price) : "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Expired at</p>
          <p className="font-mono font-semibold">{pos.settlement_price ? fmt(pos.settlement_price) : (pos.current_price ? fmt(pos.current_price) : "—")}</p>
        </div>
      </div>

      {/* P&L section */}
      <div className={`rounded-lg p-3 ${isOtm ? "bg-emerald-500/5 border border-emerald-500/20" : isItm ? "bg-red-500/5 border border-red-500/20" : "bg-muted/40"}`}>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground mb-0.5">Premium Collected</p>
            <p className="font-mono font-semibold text-emerald-500">{fmt(pos.income_usd, 2)}</p>
          </div>
          {isItm && assignmentCost != null && (
            <div>
              <p className="text-muted-foreground mb-0.5">Assignment Cost</p>
              <p className="font-mono font-semibold text-red-400">{fmt(assignmentCost, 2)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground mb-0.5">Net P&L</p>
            {netPnl != null ? (
              <p className={`font-mono font-bold text-sm ${netPnl >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                {netPnl >= 0 ? "+" : ""}{fmt(netPnl, 2)}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">—</p>
            )}
          </div>
        </div>
        {isOtm && <p className="text-xs text-emerald-400/70 mt-1.5">✓ full premium kept</p>}
        {isItm && pos.settlement_result && <p className="text-xs text-muted-foreground mt-1.5">{pos.settlement_result}</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2">
        <span>
          {pos.opened_date || "—"} → {pos.maturity_date}
          {durationDays && <span className="ml-1.5 bg-muted px-1.5 py-0.5 rounded">{durationDays}d</span>}
        </span>
        <span className="font-mono">APR {pos.apr_percent?.toFixed(2)}% · Size {pos.size?.toLocaleString()}</span>
      </div>
    </div>
  );
}