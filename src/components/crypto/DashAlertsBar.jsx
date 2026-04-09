// Section 5: Alerts bar (sticky bottom)
import { AlertTriangle, Clock, Shield, Database } from "lucide-react";

export default function DashAlertsBar({ loans = [], aavePosition, assets = [], ryskPositions = [] }) {
  const alerts = [];
  const today = new Date();
  const in90 = new Date(); in90.setDate(today.getDate() + 90);
  const thisMonth = today.toISOString().slice(0, 7);

  // Interest payment alerts
  loans.filter(l => l.next_payment_date).forEach(l => {
    const nd = new Date(l.next_payment_date);
    if (nd <= in90) {
      const days = Math.ceil((nd - today) / 86400000);
      alerts.push({ icon: Clock, color: "text-amber-600", bg: "bg-amber-50", text: `${l.lender} interest payment in ${days} days (${l.next_payment_date})` });
    }
  });

  // Aave alerts
  if (aavePosition) {
    if (aavePosition.health_factor < 1.5) alerts.push({ icon: Shield, color: "text-loss", bg: "bg-red-50", text: `URGENT: Aave HF ${aavePosition.health_factor.toFixed(2)} — liquidation risk!` });
    else if (aavePosition.health_factor < 2.0) alerts.push({ icon: Shield, color: "text-amber-600", bg: "bg-amber-50", text: `Aave Health Factor ${aavePosition.health_factor.toFixed(2)} — monitor closely` });
    if (aavePosition.borrow_power_used > 75) alerts.push({ icon: AlertTriangle, color: "text-loss", bg: "bg-red-50", text: `Aave Borrow Power ${aavePosition.borrow_power_used.toFixed(1)}% — critical level` });
  }

  // Options expiring this month
  const expiringOptions = ryskPositions.filter(p => p.status === "Open" && p.maturity_date?.startsWith(thisMonth));
  if (expiringOptions.length > 0) alerts.push({ icon: Clock, color: "text-amber-600", bg: "bg-amber-50", text: `${expiringOptions.length} options position(s) expiring this month` });

  // Stale data
  const stale = assets.filter(a => {
    if (!a.last_updated) return true;
    return (new Date() - new Date(a.last_updated)) / 86400000 > 7;
  });
  if (stale.length > 0) alerts.push({ icon: Database, color: "text-muted-foreground", bg: "bg-muted/40", text: `${stale.length} asset(s) not updated in 7+ days` });

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 shadow-lg overflow-x-auto">
      {alerts.map((a, i) => {
        const Icon = a.icon;
        return (
          <div key={i} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <Icon className={`w-3.5 h-3.5 ${a.color}`} />
            <span className={a.color}>{a.text}</span>
          </div>
        );
      })}
    </div>
  );
}