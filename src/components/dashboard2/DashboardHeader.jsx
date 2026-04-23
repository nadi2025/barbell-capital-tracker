import { RefreshCw, Radio, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

function timeAgo(date) {
  if (!date) return null;
  const diff = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 15) return "זה עתה";
  if (diff < 60) return `לפני ${Math.round(diff)} שניות`;
  if (diff < 3600) return `לפני ${Math.round(diff / 60)} דקות`;
  if (diff < 86400) return `לפני ${Math.round(diff / 3600)} שעות`;
  return new Date(date).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Slim dashboard header — title + sync indicator + actions only.
 *
 * The giant aggregate Net Worth number used to live here, but it combined
 * investor debt with portfolio assets which produced a misleading negative.
 * The two SegmentCards (Off-Chain / On-Chain) below give the clear picture.
 */
export default function DashboardHeader({
  data,
  isFetching,
  lastSyncedAt,
  onOpenPriceHub,
  onSoftRefresh,
}) {
  const lastPrice = data.prices?.[0]?.last_updated;

  return (
    <div className="bg-gradient-to-br from-card via-card to-muted/30 border border-border rounded-3xl px-6 py-4 sm:py-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Title + sync status */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Radio className={`w-3 h-3 ${isFetching ? "text-primary animate-pulse" : "text-profit"}`} />
            {isFetching ? "מסתנכרן" : "חי"}
          </span>
          {lastSyncedAt && (
            <span className="text-[11px] text-muted-foreground">סנכרון: {timeAgo(lastSyncedAt)}</span>
          )}
          {lastPrice && (
            <span className="text-[11px] text-muted-foreground">· מחירים: {timeAgo(lastPrice)}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="default"
            size="sm"
            className="gap-2 text-xs"
            onClick={onOpenPriceHub}
          >
            <Zap className="w-3.5 h-3.5" />
            מרכז מחירים
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={onSoftRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            רענן
          </Button>
        </div>
      </div>
    </div>
  );
}
