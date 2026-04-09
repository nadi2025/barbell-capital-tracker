import { useState } from "react";
import moment from "moment";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";

function getPaymentDates(debt) {
  if (!debt.start_date || !debt.maturity_date || !debt.outstanding_balance || !debt.interest_rate_pct) return [];
  const freq = debt.payment_frequency || "Monthly";
  const intervalMap = { Monthly: [1, "month"], Quarterly: [3, "month"], "Semi-Annual": [6, "month"], Annual: [1, "year"], Bullet: null };
  const interval = intervalMap[freq];

  if (!interval) {
    // Bullet — single payment at maturity
    const totalInterest = debt.outstanding_balance * (debt.interest_rate_pct / 100) *
      (moment(debt.maturity_date).diff(moment(debt.start_date), "days") / 365);
    return [{ date: debt.maturity_date, amount: totalInterest, type: "Bullet" }];
  }

  const [num, unit] = interval;
  const annualInterest = debt.outstanding_balance * (debt.interest_rate_pct / 100);
  const paymentsPerYear = { Monthly: 12, Quarterly: 4, "Semi-Annual": 2, Annual: 1 }[freq];
  const paymentAmount = annualInterest / paymentsPerYear;

  const dates = [];
  let cur = moment(debt.start_date).add(num, unit);
  const end = moment(debt.maturity_date);
  while (cur.isSameOrBefore(end, "day")) {
    dates.push({ date: cur.format("YYYY-MM-DD"), amount: paymentAmount, type: freq });
    cur = cur.add(num, unit);
  }
  return dates;
}

export default function InterestSchedule({ debts }) {
  const [open, setOpen] = useState(true);
  const [filterLender, setFilterLender] = useState("All");

  const activeDebts = debts.filter(d => d.status === "Active");
  const lenders = ["All", ...new Set(activeDebts.map(d => d.lender || d.name).filter(Boolean))];

  // Build all upcoming payments
  const today = moment();
  const allPayments = activeDebts.flatMap(debt => {
    const dates = getPaymentDates(debt);
    return dates.map(p => ({ ...p, debtName: debt.name, lender: debt.lender || debt.name, debtId: debt.id }));
  })
    .filter(p => moment(p.date).isSameOrAfter(today, "day"))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 36); // next 36 payments max

  const filtered = filterLender === "All" ? allPayments : allPayments.filter(p => p.lender === filterLender || p.debtName === filterLender);

  const totalUpcoming = filtered.reduce((s, p) => s + p.amount, 0);
  const next12m = filtered.filter(p => moment(p.date).isBefore(moment().add(12, "months"))).reduce((s, p) => s + p.amount, 0);

  const isOverdue = (date) => moment(date).isBefore(today, "day");
  const isNear = (date) => moment(date).diff(today, "days") <= 30 && !isOverdue(date);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 border-b border-border hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <div className="text-left">
            <h3 className="text-sm font-semibold">Interest Payment Schedule</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Upcoming interest payments per facility & lender</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Next 12 Months</p>
            <p className="text-sm font-mono font-semibold text-amber-400">${next12m.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Total Upcoming</p>
            <p className="text-sm font-mono font-semibold text-loss">${totalUpcoming.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div>
          {/* Filter bar */}
          <div className="flex gap-2 px-5 py-3 border-b border-border flex-wrap">
            {lenders.map(l => (
              <button
                key={l}
                onClick={() => setFilterLender(l)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filterLender === l
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted-foreground text-sm">
              No upcoming payments — add active debt facilities with maturity dates.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground bg-muted/10">
                    <th className="text-left px-4 py-2.5 font-medium">Payment Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Facility</th>
                    <th className="text-left px-4 py-2.5 font-medium">Lender</th>
                    <th className="text-left px-4 py-2.5 font-medium">Type</th>
                    <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                    <th className="text-right px-4 py-2.5 font-medium">Days Away</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const daysAway = moment(p.date).diff(today, "days");
                    return (
                      <tr key={i} className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${isNear(p.date) ? 'bg-amber-500/5' : ''}`}>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          <span className={isNear(p.date) ? 'text-amber-400 font-semibold' : ''}>{p.date}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium">{p.debtName}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.lender}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p.type}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-400 font-semibold">
                          ${p.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs ${daysAway <= 30 ? 'text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                          {daysAway}d
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20 border-t border-border font-semibold">
                    <td colSpan={4} className="px-4 py-3 text-xs text-muted-foreground">TOTAL</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-amber-400">
                      ${totalUpcoming.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}