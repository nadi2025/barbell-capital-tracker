import { Button } from "@/components/ui/button";
import { Edit2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

const STRATEGY_NAMES = {
  "Cash secured put": "Cash Secured Put",
  "Covered call": "Covered Call",
  "Naked put": "Naked Put",
  "Naked call": "Naked Call",
};

export default function OpenPositionCard({ pos, onEdit, onSettle }) {
  const today = new Date();
  const maturity = new Date(pos.maturity_date);
  const opened = pos.opened_date ? new Date(pos.opened_date) : null;
  const totalDays = opened ? Math.max(1, Math.ceil((maturity - opened) / 86400000)) : 60;
  const daysLeft = Math.ceil((maturity - today) / 86400000);
  const elapsed = Math.max(0, totalDays - Math.max(0, daysLeft));
  const progressPct = Math.min(100, (elapsed / totalDays) * 100);
  const isExpired = daysLeft < 0;
  const isImminent = daysLeft <= 3 && daysLeft >= 0;

  const strike = pos.strike_price || 0;
  const current = pos.current_price || 0;

  // Cushion logic
  let cushion = 0;
  let isItm = false;
  if (pos.option_type === "Put") {
    cushion = current - strike; // positive = OTM (safe)
    isItm = current < strike;
  } else {
    cushion = strike - current; // positive = OTM (safe)
    isItm = current > strike;
  }
  const cushionPct = strike > 0 ? (Math.abs(cushion) / strike) * 100 : 0;
  const isAtm = Math.abs(cushionPct) < 2;

  let cardBg = "border-border";
  if (isExpired) cardBg = "border-red-500 bg-red-500/5";
  else if (isItm) cardBg = "border-red-400 bg-red-400/5";
  else if (cushionPct < 5) cardBg = "border-amber-400 bg-amber-400/5";

  const strategyLabel = pos.strategy ? (STRATEGY_NAMES[pos.strategy] || pos.strategy) : (pos.option_type === "Put" ? "Cash Secured Put" : "Covered Call");

  return (
    <div className={`bg-card border rounded-xl p-4 space-y-3 ${cardBg}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold">{pos.asset}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">{strategyLabel}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">{pos.direction || "Sell"}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(pos)}><Edit2 className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onSettle(pos)}>Settle</Button>
        </div>
      </div>

      {/* Expired banner */}
      {isExpired && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-red-400">EXPIRED — יש לסגור פוזיציה זו</span>
        </div>
      )}

      {/* Price section */}
      <div className="bg-muted/40 rounded-lg p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Strike</p>
            <p className="text-sm font-mono font-bold">{strike > 0 ? fmt(strike) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Current</p>
            <p className="text-sm font-mono font-bold">{current > 0 ? fmt(current) : "—"}</p>
          </div>
          <div className="text-right">
            {isAtm ? (
              <div className="flex items-center justify-end gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-amber-400">ATM</span>
              </div>
            ) : isItm ? (
              <div className="flex items-center justify-end gap-1">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-bold text-red-400">ITM ✗</span>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">OTM ✓</span>
              </div>
            )}
          </div>
        </div>
        {strike > 0 && current > 0 && (
          <div className={`text-xs ${isItm ? "text-red-400" : cushionPct < 5 ? "text-amber-400" : "text-emerald-400"}`}>
            {isItm ? "▲" : "▼"} Cushion: {fmt(Math.abs(cushion))} ({cushionPct.toFixed(1)}%)
            <span className="text-muted-foreground ml-1">
              {pos.option_type === "Put"
                ? (isItm ? "מחיר מתחת לסטרייק!" : "מחיר צריך לרדת עד לסטרייק")
                : (isItm ? "מחיר מעל הסטרייק!" : "מחיר צריך לעלות עד לסטרייק")}
            </span>
          </div>
        )}
      </div>

      {/* Financials */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Premium</p>
          <p className="font-mono font-semibold text-emerald-500">{fmt(pos.income_usd, 2)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">APR</p>
          <p className="font-mono font-semibold">{pos.apr_percent?.toFixed(2)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">Size</p>
          <p className="font-mono font-semibold">{pos.size?.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Notional</p>
          <p className="font-mono font-semibold">{fmt(pos.notional_usd)}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="border-t border-border/40 pt-2 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Opened: {pos.opened_date || "—"} → Expires: {pos.maturity_date}
          </span>
          <span className={`font-semibold flex items-center gap-1 ${isExpired ? "text-red-400" : isImminent ? "text-amber-400" : "text-muted-foreground"}`}>
            <Clock className="w-3 h-3" />
            {isExpired ? "Expired" : `${daysLeft}d left`}
          </span>
        </div>
        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${isExpired ? "bg-red-400" : isImminent ? "bg-amber-400" : "bg-primary"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}