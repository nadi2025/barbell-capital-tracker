import { useState } from "react";
import { format, differenceInMonths, addMonths, differenceInDays } from "date-fns";
import { CalendarDays, MapPin, Edit2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fmtUSD = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtILS = (v) => v == null ? "₪0" : `₪${Math.abs(v).toLocaleString("he-IL")}`;

export default function MonthlyInvestorCard({ investor, payments, onRecordPayment, onEdit }) {
  const [showHistory, setShowHistory] = useState(false);

  const today = new Date();
  const start = new Date(investor.start_date);
  const maturity = new Date(investor.maturity_date);
  const isILS = investor.interest_currency === "ILS";

  const termMonths = differenceInMonths(maturity, start);
  const termYears = (termMonths / 12).toFixed(1);
  const monthsElapsed = differenceInMonths(today, start);
  const monthly = investor.monthly_payment || (investor.principal_usd * investor.interest_rate / 100 / 12);
  const grossUSD = investor.principal_usd * investor.interest_rate / 100 / 12;
  const totalInterest = investor.principal_usd * (investor.interest_rate / 100) * (termMonths / 12);
  const paidToDate = payments.length * grossUSD;
  const remaining = totalInterest - paidToDate;
  const remainingMonths = termMonths - payments.length;
  const progressPct = Math.min(100, (payments.length / termMonths) * 100);

  // Next payment date — use payment_day_of_month if set
  const payDay = investor.payment_day_of_month;
  let nextPaymentDate;
  if (payDay) {
    nextPaymentDate = new Date(today.getFullYear(), today.getMonth(), payDay);
    if (nextPaymentDate <= today) nextPaymentDate = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
  } else {
    nextPaymentDate = addMonths(start, payments.length + 1);
  }
  const daysUntilNext = differenceInDays(nextPaymentDate, today);

  const isOverdue = daysUntilNext < 0;
  const isDueSoon = daysUntilNext >= 0 && daysUntilNext <= 7;

  const sortedPayments = [...payments].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

  return (
    <div className={`bg-card border rounded-xl p-5 space-y-4 ${isOverdue ? "border-red-400" : isDueSoon ? "border-amber-400" : "border-border"}`}>
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(investor)}>
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Key terms */}
      <div className="grid grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Principal</p>
          <p className="font-bold text-sm">{fmtUSD(investor.principal_usd)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Rate</p>
          <p className="font-bold text-sm">{investor.interest_rate}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">Monthly Payment</p>
          <p className="font-bold text-sm text-emerald-600">{isILS ? fmtILS(monthly) : fmtUSD(monthly)}/mo</p>
          {isILS && investor.tax_withholding_percent && (
            <p className="text-xs text-muted-foreground">ברוטו {fmtUSD(grossUSD)} | {investor.tax_withholding_percent}% מס</p>
          )}
        </div>
        <div>
          <p className="text-muted-foreground">Currency</p>
          <p className="font-bold text-sm">{isILS ? "ILS (₪)" : "USD ($)"}</p>
          {payDay && <p className="text-xs text-muted-foreground">יום {payDay} לחודש</p>}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2 border-t border-border/40 pt-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Tracker</p>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Start: {format(start, "MMM d, yyyy")}</span>
          <span>Maturity: {format(maturity, "MMM d, yyyy")}</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Term: {termYears} years</span>
          <span>Elapsed: {payments.length} payments</span>
        </div>
        <div className="space-y-1">
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">{progressPct.toFixed(1)}% of term</p>
        </div>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-emerald-50 rounded-lg p-2.5">
          <p className="text-muted-foreground">Paid to date</p>
          <p className="font-bold text-emerald-700">{fmtUSD(paidToDate)}</p>
          <p className="text-muted-foreground">{payments.length} payments</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5">
          <p className="text-muted-foreground">Remaining</p>
          <p className="font-bold">{fmtUSD(remaining)}</p>
          <p className="text-muted-foreground">over {remainingMonths} months</p>
        </div>
      </div>

      {/* Next payment */}
      <div className={`rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 ${isOverdue ? "bg-red-50 text-red-700" : isDueSoon ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
        {isOverdue
          ? <span><strong>OVERDUE:</strong> Payment of {isILS ? fmtILS(monthly) : fmtUSD(monthly)} was expected on {format(nextPaymentDate, "MMM d, yyyy")} ({Math.abs(daysUntilNext)} days ago)</span>
          : <span>Next payment: <strong>{isILS ? fmtILS(monthly) : fmtUSD(monthly)}</strong> on {format(nextPaymentDate, "MMM d, yyyy")} (in {daysUntilNext} days)</span>
        }
      </div>

      {/* Recent payments */}
      {sortedPayments.length > 0 && (
        <div className="space-y-1.5 border-t border-border/40 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Recent payments</p>
            <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-primary hover:underline">
              {showHistory ? "Hide" : `View all (${sortedPayments.length})`}
            </button>
          </div>
          {(showHistory ? sortedPayments : sortedPayments.slice(0, 3)).map(p => (
            <div key={p.id} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span>
                <span className="text-muted-foreground">{format(new Date(p.payment_date), "MMM d")}</span>
              </div>
              <span className="font-mono font-medium">{fmtUSD(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 border-t border-border/40 pt-3">
        <Button size="sm" onClick={() => onRecordPayment(investor)} className="flex-1">
          Record Payment
        </Button>
        <Button variant="outline" size="sm" onClick={() => onEdit(investor)}>Edit</Button>
      </div>
    </div>
  );
}