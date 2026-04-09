import { useState, useEffect } from "react";
import moment from "moment";
import { AlertTriangle, Bell, CheckCircle2, X } from "lucide-react";

function getUpcomingPayments(debts, days = 30) {
  const today = moment();
  const horizon = moment().add(days, "days");
  const results = [];

  debts.filter(d => d.status === "Active").forEach(debt => {
    // Maturity alert
    if (debt.maturity_date) {
      const mat = moment(debt.maturity_date);
      if (mat.isBetween(today, horizon, "day", "[]")) {
        results.push({
          id: `maturity-${debt.id}`,
          type: "maturity",
          label: `פירעון קרוב: ${debt.name}`,
          sublabel: debt.lender ? `מלווה: ${debt.lender}` : null,
          date: debt.maturity_date,
          amount: debt.outstanding_balance,
          daysAway: mat.diff(today, "days"),
          urgency: mat.diff(today, "days") <= 7 ? "high" : "medium",
        });
      }
    }

    // Interest payment alerts
    if (!debt.start_date || !debt.maturity_date || !debt.interest_rate_pct) return;
    const freq = debt.payment_frequency || "Monthly";
    const intervalMap = { Monthly: [1, "month"], Quarterly: [3, "month"], "Semi-Annual": [6, "month"], Annual: [1, "year"], Bullet: null };
    const interval = intervalMap[freq];
    if (!interval) return;

    const [num, unit] = interval;
    const paymentsPerYear = { Monthly: 12, Quarterly: 4, "Semi-Annual": 2, Annual: 1 }[freq] || 1;
    const paymentAmount = (debt.outstanding_balance * (debt.interest_rate_pct / 100)) / paymentsPerYear;

    let cur = moment(debt.start_date).add(num, unit);
    const end = moment(debt.maturity_date);
    while (cur.isSameOrBefore(end, "day")) {
      if (cur.isBetween(today, horizon, "day", "[]")) {
        results.push({
          id: `interest-${debt.id}-${cur.format("YYYY-MM-DD")}`,
          type: "interest",
          label: `תשלום ריבית: ${debt.name}`,
          sublabel: debt.lender ? `מלווה: ${debt.lender}` : null,
          date: cur.format("YYYY-MM-DD"),
          amount: paymentAmount,
          daysAway: cur.diff(today, "days"),
          urgency: cur.diff(today, "days") <= 7 ? "high" : "low",
        });
        break; // one alert per facility per window
      }
      cur = cur.add(num, unit);
    }
  });

  return results.sort((a, b) => a.daysAway - b.daysAway);
}

const STORAGE_KEY = "debt_alerts_done";

export default function DebtAlerts({ debts }) {
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  });
  const [dismissed, setDismissed] = useState([]);

  const alerts = getUpcomingPayments(debts, 30).filter(a => !dismissed.includes(a.id));
  const visible = alerts.filter(a => !done.includes(a.id));

  const markDone = (id) => {
    const next = [...done, id];
    setDone(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const dismiss = (id) => setDismissed(d => [...d, id]);

  if (alerts.length === 0) return null;

  const urgencyStyle = {
    high: "border-loss/40 bg-loss/5",
    medium: "border-amber-500/40 bg-amber-500/5",
    low: "border-primary/30 bg-primary/5",
  };
  const urgencyIcon = {
    high: "text-loss",
    medium: "text-amber-400",
    low: "text-primary",
  };
  const urgencyBadge = {
    high: "bg-loss/10 text-loss border-loss/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-primary/10 text-primary border-primary/20",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold">התראות חוב ותשלומים</span>
        <span className="text-xs bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-full">
          {alerts.length}
        </span>
      </div>
      {alerts.map(a => (
        <div key={a.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-opacity ${urgencyStyle[a.urgency]} ${done.includes(a.id) ? 'opacity-50' : ''}`}>
          <AlertTriangle className={`w-4 h-4 shrink-0 ${urgencyIcon[a.urgency]}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{a.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${urgencyBadge[a.urgency]}`}>
                {a.daysAway === 0 ? "היום" : `בעוד ${a.daysAway} ימים`}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                {a.type === "maturity" ? "פירעון" : "ריבית"}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground">{a.date}</span>
              {a.sublabel && <span className="text-xs text-muted-foreground">{a.sublabel}</span>}
              <span className="text-xs font-mono font-semibold text-foreground">
                ${(a.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!done.includes(a.id) && (
              <button
                onClick={() => markDone(a.id)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> בוצע
              </button>
            )}
            <button onClick={() => dismiss(a.id)} className="text-muted-foreground hover:text-foreground p-1 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}