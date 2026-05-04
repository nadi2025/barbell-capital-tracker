import { Clock } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { getUpcomingPayments, fmtCurrency } from "@/lib/privateMath";

export default function PrivateUpcomingPaymentsPanel({ payments = [], daysAhead = 90 }) {
  const upcoming = getUpcomingPayments(payments, daysAhead);
  const today = new Date();

  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-purple-400" />
        <p className="text-sm font-semibold">תשלומים קרובים ({daysAhead} יום)</p>
        {upcoming.length > 0 && (
          <span className="ml-auto text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full">
            {upcoming.length}
          </span>
        )}
      </div>
      {upcoming.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          אין תשלומים מתוזמנים
        </div>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {upcoming.map((p) => {
            const date = parseISO(p.payment_date);
            const days = Math.max(0, differenceInDays(date, today));
            const urgencyClass = days <= 7 ? "text-red-400" : days <= 30 ? "text-amber-400" : "text-muted-foreground";
            return (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.investor_name || "—"}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {format(date, "d.M.yy")}
                    {p.period_covered ? ` · ${p.period_covered}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-mono font-semibold">{fmtCurrency(p.amount, p.currency)}</p>
                  <p className={`text-[10px] ${urgencyClass}`}>{days === 0 ? "היום" : `${days} ימים`}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
