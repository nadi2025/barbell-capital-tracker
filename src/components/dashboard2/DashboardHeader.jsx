import { RefreshCw, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calcDashboard, fmt, pct } from "./dashboardCalcs";

export default function DashboardHeader({ data, refreshing, onLiveRefresh, onManualPrice }) {
  const c = calcDashboard(data);
  const lastPrice = data.prices?.[0]?.last_updated;
  const lastStr = lastPrice
    ? new Date(lastPrice).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-[0.15em] font-medium mb-1">Total Net Worth</p>
        <p className="text-5xl font-bold font-mono tracking-tight text-foreground">{fmt(c.totalNAV)}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className={`text-sm font-mono font-semibold ${c.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
            {fmt(c.totalPnl)} ({pct(c.totalPnlPct)})
          </span>
          {lastStr && <span className="text-xs text-muted-foreground">עדכון אחרון: {lastStr}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onLiveRefresh} disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "מעדכן..." : "עדכון חי"}
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={onManualPrice}>
          <Edit3 className="w-3.5 h-3.5" /> ידני
        </Button>
      </div>
    </div>
  );
}