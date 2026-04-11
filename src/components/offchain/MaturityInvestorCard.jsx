import { format, differenceInDays } from "date-fns";
import { MapPin, Edit2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fmtUSD = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const ILS_RATE = 3.27; // approximate

export default function MaturityInvestorCard({ investor, onEdit }) {
  const today = new Date();
  const start = new Date(investor.start_date);
  const maturity = new Date(investor.maturity_date);

  const termDays = differenceInDays(maturity, start);
  const termYears = termDays / 365;
  const daysElapsed = differenceInDays(today, start);
  const daysRemaining = differenceInDays(maturity, today);
  const progressPct = Math.min(100, Math.max(0, (daysElapsed / termDays) * 100));

  const totalInterest = investor.principal_usd * (investor.interest_rate / 100) * termYears;
  const accrued = investor.principal_usd * (investor.interest_rate / 100) * (daysElapsed / 365);
  const totalDueAtMaturity = investor.principal_usd + totalInterest;

  const hasILS = !!investor.principal_ils;
  const ilsRate = hasILS ? investor.principal_ils / investor.principal_usd : ILS_RATE;

  const isMaturitySoon = daysRemaining <= 365;
  const isMaturityUrgent = daysRemaining <= 90;

  return (
    <div className={`bg-card border rounded-xl p-5 space-y-4 ${isMaturityUrgent ? "border-red-400" : isMaturitySoon ? "border-amber-400" : "border-border"}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">{investor.name}</h3>
            <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-xs">Active</Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{investor.investment_location}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onEdit(investor)}>
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Key terms */}
      <div className="grid grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Principal</p>
          <p className="font-bold text-sm">{fmtUSD(investor.principal_usd)}</p>
          {hasILS && <p className="text-muted-foreground">₪{investor.principal_ils?.toLocaleString()}</p>}
        </div>
        <div>
          <p className="text-muted-foreground">Rate</p>
          <p className="font-bold text-sm">{investor.interest_rate}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">Schedule</p>
          <p className="font-bold text-sm">At Maturity</p>
        </div>
        <div>
          <p className="text-muted-foreground">Currency</p>
          <p className="font-bold text-sm">{investor.interest_currency === "ILS" ? "ILS (₪)" : "USD ($)"}</p>
        </div>
      </div>

      {/* Maturity countdown */}
      <div className="space-y-2 border-t border-border/40 pt-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Maturity Countdown</p>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Start: {format(start, "MMM d, yyyy")}</span>
          <span>Maturity: {format(maturity, "MMM d, yyyy")}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Term: {termYears.toFixed(1)} years
        </div>
        <div className="space-y-1">
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">{progressPct.toFixed(1)}% of term elapsed</p>
        </div>
      </div>

      {/* Accrual summary */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-blue-50 rounded-lg p-2.5">
          <p className="text-muted-foreground">Accrued so far</p>
          <p className="font-bold text-blue-700">~{fmtUSD(accrued)}</p>
          {hasILS && <p className="text-muted-foreground">~₪{Math.round(accrued * ilsRate).toLocaleString()}</p>}
        </div>
        <div className="bg-orange-50 rounded-lg p-2.5">
          <p className="text-muted-foreground">Total due at maturity</p>
          <p className="font-bold text-orange-700">{fmtUSD(totalDueAtMaturity)}</p>
          <p className="text-muted-foreground text-xs">{fmtUSD(investor.principal_usd)} + {fmtUSD(totalInterest)} interest</p>
        </div>
      </div>

      {/* Days remaining */}
      <div className={`rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 ${isMaturityUrgent ? "bg-red-50 text-red-700" : isMaturitySoon ? "bg-amber-50 text-amber-700" : "bg-muted/60 text-muted-foreground"}`}>
        {(isMaturitySoon || isMaturityUrgent) && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
        <span>
          {daysRemaining > 0
            ? <><strong>{daysRemaining} days</strong> until maturity ({(daysRemaining / 365).toFixed(1)} years) — No payments due until {format(maturity, "MMM yyyy")}</>
            : <><strong>MATURED</strong> — {Math.abs(daysRemaining)} days overdue</>
          }
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-border/40 pt-3">
        <Button variant="outline" size="sm" onClick={() => onEdit(investor)} className="flex-1">Edit</Button>
      </div>
    </div>
  );
}