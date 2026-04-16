import { differenceInDays, format } from "date-fns";
import { AlertTriangle, Calendar, TrendingDown, Clock } from "lucide-react";
import { calcDashboard, fmt } from "./dashboardCalcs";

function buildAlerts(data, c) {
  const alerts = [];
  const today = new Date();

  // Options expiry
  const sorted = [...c.openOptions].sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
  const next = sorted[0];
  if (next?.expiration_date) {
    const d = differenceInDays(new Date(next.expiration_date), today);
    if (d <= 30) alerts.push({ urgency: d <= 7 ? "red" : "amber", icon: Calendar, text: `פקיעת ${next.ticker} $${next.strike} · ${format(new Date(next.expiration_date), "d.M.yy")} (${d} ימים)` });
  }

  // Crypto options expiry
  (data.openCryptoOptions || []).forEach(o => {
    if (!o.maturity_date) return;
    const d = differenceInDays(new Date(o.maturity_date), today);
    if (d >= 0 && d <= 14) alerts.push({ urgency: d <= 7 ? "red" : "amber", icon: Calendar, text: `${o.asset} ${o.option_type} (Crypto) — ${format(new Date(o.maturity_date), "d.M.yy")} (${d} ימים)` });
  });

  // Aave health
  if (c.healthFactor > 0 && c.healthFactor < 2) {
    alerts.push({ urgency: c.healthFactor < 1.5 ? "red" : "amber", icon: AlertTriangle, text: `Aave HF: ${c.healthFactor.toFixed(2)} ${c.healthFactor < 1.5 ? "— סכנת חיסול!" : "— שמור על מרחק"}` });
  }

  // HL liquidation distance
  (data.leveraged || []).forEach(l => {
    if (!l.mark_price || !l.liquidation_price) return;
    const dist = Math.abs((l.mark_price - l.liquidation_price) / l.mark_price) * 100;
    if (dist < 25) alerts.push({ urgency: dist < 15 ? "red" : "amber", icon: AlertTriangle, text: `HL ${l.asset} ${l.direction}: מרחק חיסול ${dist.toFixed(1)}%` });
  });

  // Investor payments
  (data.offChainInvestors || []).filter(inv => inv.interest_schedule === "Monthly" && inv.status === "Active").forEach(inv => {
    const payDay = inv.payment_day_of_month || 1;
    let next = new Date(today.getFullYear(), today.getMonth(), payDay);
    if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
    const d = differenceInDays(next, today);
    if (d <= 14) {
      const amount = inv.interest_currency === "ILS"
        ? `₪${Math.abs(inv.monthly_payment || 0).toLocaleString("he-IL")}`
        : fmt(inv.monthly_payment);
      alerts.push({ urgency: d <= 5 ? "red" : "amber", icon: Clock, text: `ריבית ${inv.name}: ${amount} — ${format(next, "d.M.yy")}` });
    }
  });

  // Big stock loss
  const bigLoss = (data.stocks || []).find(s => s.gain_loss_pct && s.gain_loss_pct < -0.3);
  if (bigLoss) {
    alerts.push({ urgency: "red", icon: TrendingDown, text: `${bigLoss.ticker}: ${(bigLoss.gain_loss_pct * 100).toFixed(1)}% (${fmt(bigLoss.gain_loss)})` });
  }

  return alerts;
}

const urgencyStyles = {
  red: "border-red-200 bg-red-50 text-red-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
};

export default function AlertsSection({ data }) {
  const c = calcDashboard(data);
  const alerts = buildAlerts(data, c);

  if (!alerts.length) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-4">
        התראות ({alerts.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {alerts.map((a, i) => (
          <span key={i} className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${urgencyStyles[a.urgency]}`}>
            <a.icon className="w-3.5 h-3.5 flex-shrink-0" />
            {a.text}
          </span>
        ))}
      </div>
    </div>
  );
}