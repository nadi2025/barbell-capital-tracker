import { AlertTriangle, Clock, Shield } from "lucide-react";
import moment from "moment";

export default function AlertsPanel({ borrowPowerUsed, liquidationAlerts, staleAssets, loans }) {
  const alerts = [];

  if (borrowPowerUsed > 0.7) {
    alerts.push({ type: "danger", msg: `Borrow Power high: ${(borrowPowerUsed * 100).toFixed(0)}% — above 70%` });
  }

  loans.forEach(loan => {
    if (!loan.next_payment_date) return;
    const days = moment(loan.next_payment_date).diff(moment(), "days");
    if (days <= 30 && days >= 0) {
      alerts.push({ type: "warning", msg: `Interest payment due in ${days} days — ${moment(loan.next_payment_date).format("DD/MM/YYYY")}` });
    } else if (days < 0) {
      alerts.push({ type: "danger", msg: `Interest payment overdue! (${moment(loan.next_payment_date).format("DD/MM/YYYY")})` });
    }
  });

  liquidationAlerts.forEach(l => {
    alerts.push({ type: "danger", msg: `${l.asset} position near liquidation! Liquidation price: $${l.liquidation_price?.toLocaleString()}` });
  });

  if (staleAssets.length > 0) {
    alerts.push({ type: "warning", msg: `${staleAssets.length} assets not updated in over 7 days` });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm
          ${a.type === "danger" ? "bg-loss/10 border-loss/30 text-loss" : "bg-amber-500/10 border-amber-500/30 text-amber-600"}`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{a.msg}</span>
        </div>
      ))}
    </div>
  );
}