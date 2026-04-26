import { useState } from "react";
import OpenPositionsTab from "@/components/hyperliquid/OpenPositionsTab";
import TradeHistoryTab from "@/components/hyperliquid/TradeHistoryTab";
import PerformanceTab from "@/components/hyperliquid/PerformanceTab";
import { useEntityList } from "@/hooks/useEntityQuery";

const TABS = [
  { id: "positions", label: "פוזיציות פתוחות" },
  { id: "history", label: "היסטוריית עסקאות" },
  { id: "performance", label: "ניתוח ביצועים" },
];

/**
 * LeveragedPage — HyperLiquid leveraged trading.
 *
 * Migrated to React Query: positions and trades come from useEntityList.
 * Any mutation (mark price update, position edit, trade import) invalidates
 * the matching entity cache and the page rerenders automatically — no
 * imperative `load()` callback chain required.
 *
 * The old "עדכן מחירים" button (which called the deleted dailyFullUpdate
 * Deno function) was removed; price refresh now happens exclusively through
 * PriceHub at the top of the app (Phase 4 wiring redirects all such buttons
 * there). LeveragedPosition rows pick up new prices instantly via the
 * computed-on-the-fly architecture.
 */
export default function LeveragedPage() {
  const [tab, setTab] = useState("positions");
  const positionsQ = useEntityList("LeveragedPosition", { sort: "-opened_date" });
  const tradesQ = useEntityList("HLTrade", { sort: "-trade_date", limit: 500 });

  const positions = positionsQ.data || [];
  const trades = tradesQ.data || [];
  const loading = positionsQ.isLoading || tradesQ.isLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
          <h1 className="text-2xl font-bold">HyperLiquid</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border" dir="rtl">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
              ${tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — onRefresh kept as a no-op; child mutations invalidate
          their own caches via useEntityMutation, so there's nothing to do here. */}
      {tab === "positions" && <OpenPositionsTab positions={positions} onRefresh={() => {}} />}
      {tab === "history" && <TradeHistoryTab trades={trades} onRefresh={() => {}} />}
      {tab === "performance" && <PerformanceTab trades={trades} positions={positions} />}
    </div>
  );
}
