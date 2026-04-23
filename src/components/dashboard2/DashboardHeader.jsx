import { RefreshCw, Radio, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calcDashboard, fmt } from "./dashboardCalcs";

function timeAgo(date) {
  if (!date) return null;
  const diff = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 15) return "זה עתה";
  if (diff < 60) return `לפני ${Math.round(diff)} שניות`;
  if (diff < 3600) return `לפני ${Math.round(diff / 60)} דקות`;
  if (diff < 86400) return `לפני ${Math.round(diff / 3600)} שעות`;
  return new Date(date).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DashboardHeader({
  data,
  isFetching,
  lastSyncedAt,
  onOpenPriceHub,
  onSoftRefresh,
}) {
  const c = calcDashboard(data);
  const lastPrice = data.prices?.[0]?.last_updated;

  return (
    <div className="bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-3xl p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
        {/* Hero: Net Worth */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-semibold">
              Total Net Worth
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Radio className={`w-3 h-3 ${isFetching ? "text-primary animate-pulse" : "text-profit"}`} />
              {isFetching ? "מסתנכרן" : "חי"}
            </span>
          </div>
          <p className="text-4xl sm:text-5xl lg:text-6xl font-bold font-mono tracking-tight text-foreground leading-none">
            {fmt(c.totalNAV)}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
            {lastSyncedAt && (
              <span className="text-xs text-muted-foreground">
                סנכרון: {timeAgo(lastSyncedAt)}
              </span>
            )}
            {lastPrice && (
              <span className="text-xs text-muted-foreground">
                · מחירים: {timeAgo(lastPrice)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <Button
            variant="default"
            size="sm"
            className="gap-2 text-xs w-full sm:w-auto"
            onClick={onOpenPriceHub}
          >
            <Zap className="w-3.5 h-3.5" />
            מרכז מחירים
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs w-full sm:w-auto"
            onClick={onSoftRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            רענן נתונים
          </Button>
        </div>
      </div>
    </div>
  );
}
