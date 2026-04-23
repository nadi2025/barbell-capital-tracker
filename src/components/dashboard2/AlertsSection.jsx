import { useState } from "react";
import { differenceInDays, format } from "date-fns";
import { AlertTriangle, Calendar, TrendingDown, Clock, ChevronDown, CheckCircle2 } from "lucide-react";
import { calcDashboard, fmt } from "./dashboardCalcs";

function buildAlerts(data, c) {
  const alerts = [];
  const today = new Date();

  // Options expiry
  const sorted = [...c.openOptions].sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
  const next = sorted[0];
  if (next?.expiration_date) {
    const d = differenceInDays(new Date(next.expiration_date), today);
    if (d <= 30) {
      alerts.push({
        urgency: d <= 7 ? "red" : "amber",
        icon: Calendar,
        title: `פקיעת ${next.ticker} $${next.strike}`,
        text: `${format(new Date(next.expiration_date), "d.M.yy")} · ${d} ימים`,
      });
    }
  }

  // Crypto options expiry
  (data.openCryptoOptions || []).forEach((o) => {
    if (!o.maturity_date) return;
    const d = differenceInDays(new Date(o.maturity_date), today);
    if (d >= 0 && d <= 14) {
      alerts.push({
        urgency: d <= 7 ? "red" : "amber",
        icon: Calendar,
        title: `${o.asset} ${o.option_type} (Crypto)`,
        text: `${format(new Date(o.maturity_date), "d.M.yy")} · ${d} ימים`,
      });
    }
  });

  // Aave health
  if (c.healthFactor > 0 && c.healthFactor < 2) {
    alerts.push({
      urgency: c.healthFactor < 1.5 ? "red" : "amber",
      icon: AlertTriangle,
      title: `Aave Health Factor`,
      text: `${c.healthFactor.toFixed(2)} ${c.healthFactor < 1.5 ? "· סכנת חיסול!" : "· שמור על מרחק"}`,
    });
  }

  // HL liquidation distance
  (data.leveraged || []).forEach((l) => {
    if (!l.mark_price || !l.liquidation_price) return;
    const dist = Math.abs((l.mark_price - l.liquidation_price) / l.mark_price) * 100;
    if (dist < 25) {
      alerts.push({
        urgency: dist < 15 ? "red" : "amber",
        icon: AlertTriangle,
        title: `HL ${l.asset} ${l.direction}`,
        text: `מרחק חיסול ${dist.toFixed(1)}%`,
      });
    }
  });

  // Investor payments
  (data.offChainInvestors || [])
    .filter((inv) => inv.interest_schedule === "Monthly" && inv.status === "Active")
    .forEach((inv) => {
      const payDay = inv.payment_day_of_month || 1;
      let next = new Date(today.getFullYear(), today.getMonth(), payDay);
      if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
      const d = differenceInDays(next, today);
      if (d <= 14) {
        const amount = inv.interest_currency === "ILS"
          ? `₪${Math.abs(inv.monthly_payment || 0).toLocaleString("he-IL")}`
          : fmt(inv.monthly_payment);
        alerts.push({
          urgency: d <= 5 ? "red" : "amber",
          icon: Clock,
          title: `ריבית ${inv.name}`,
          text: `${amount} · ${format(next, "d.M.yy")}`,
        });
      }
    });

  // Big stock loss
  const bigLoss = (data.stocks || []).find((s) => s.gain_loss_pct && s.gain_loss_pct < -0.3);
  if (bigLoss) {
    alerts.push({
      urgency: "red",
      icon: TrendingDown,
      title: bigLoss.ticker,
      text: `${(bigLoss.gain_loss_pct * 100).toFixed(1)}% (${fmt(bigLoss.gain_loss)})`,
    });
  }

  // Sort by urgency: red first
  return alerts.sort((a, b) => (a.urgency === "red" ? -1 : 1) - (b.urgency === "red" ? -1 : 1));
}

const urgencyStyles = {
  red: "border-red-500/30 bg-red-500/10 text-red-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

export default function AlertsSection({ data }) {
  const [expanded, setExpanded] = useState(true);
  const c = calcDashboard(data);
  const alerts = buildAlerts(data, c);
  const redCount = alerts.filter((a) => a.urgency === "red").length;

  if (!alerts.length) {
    return (
      <div className="bg-card border border-border rounded-2xl px-5 py-3 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-profit" />
        <span className="text-xs text-muted-foreground">אין התראות פעילות</span>
      </div>
    );
  }

  const accentBorder = redCount > 0 ? "border-red-500/40" : "border-amber-500/40";

  return (
    <div className={`bg-card border ${accentBorder} rounded-2xl overflow-hidden`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${redCount > 0 ? "text-red-400" : "text-amber-400"}`} />
          <span className="text-sm font-semibold">
            {alerts.length} התראות
          </span>
          {redCount > 0 && (
            <span className="text-[10px] uppercase tracking-wide font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
              {redCount} דחוף
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="px-5 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-2.5 text-xs px-3 py-2 rounded-lg border ${urgencyStyles[a.urgency]}`}>
              <a.icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold truncate">{a.title}</p>
                <p className="opacity-80 truncate">{a.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
