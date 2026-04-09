import { Clock, AlertTriangle } from "lucide-react";
import moment from "moment";

export default function ExpiringOptionsPanel({ options }) {
  const today = moment();

  const expiring = options
    .filter(t => t.status === "Open" && t.expiration_date)
    .map(t => ({ ...t, daysLeft: moment(t.expiration_date).diff(today, "days") }))
    .filter(t => t.daysLeft >= 0 && t.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const urgency = (days) => {
    if (days <= 3) return { badge: "bg-loss/10 text-loss border-loss/20", dot: "bg-loss" };
    if (days <= 7) return { badge: "bg-amber-500/10 text-amber-600 border-amber-500/20", dot: "bg-amber-400" };
    return { badge: "bg-primary/10 text-primary border-primary/20", dot: "bg-primary" };
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Expiring in 30 Days</h3>
        {expiring.length > 0 && (
          <span className="ml-auto text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
            {expiring.length} options
          </span>
        )}
      </div>

      {expiring.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <div className="w-8 h-8 rounded-full bg-profit/10 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-4 h-4 text-profit" />
            </div>
            <p className="text-xs text-muted-foreground">No options expiring in the next 30 days</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {expiring.map(t => {
            const u = urgency(t.daysLeft);
            const premium = (t.fill_price || 0) * (t.quantity || 0) * 100;
            return (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${u.dot}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm">{t.ticker}</span>
                      <span className="text-xs text-muted-foreground">{t.category} ${t.strike}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{t.expiration_date} · Premium: <span className="text-profit font-medium">${premium.toLocaleString()}</span></div>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ml-2 ${u.badge}`}>
                  {t.daysLeft === 0 ? "Today!" : `${t.daysLeft}d`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}