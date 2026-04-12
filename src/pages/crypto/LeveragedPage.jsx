import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import OpenPositionsTab from "@/components/hyperliquid/OpenPositionsTab";
import TradeHistoryTab from "@/components/hyperliquid/TradeHistoryTab";
import PerformanceTab from "@/components/hyperliquid/PerformanceTab";

const TABS = [
  { id: "positions", label: "פוזיציות פתוחות" },
  { id: "history", label: "היסטוריית עסקאות" },
  { id: "performance", label: "ניתוח ביצועים" },
];

export default function LeveragedPage() {
  const [tab, setTab] = useState("positions");
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [pos, trd] = await Promise.all([
      base44.entities.LeveragedPosition.list("-opened_date"),
      base44.entities.HLTrade.list("-trade_date", 500),
    ]);
    setPositions(pos);
    setTrades(trd);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
        <h1 className="text-2xl font-bold">HyperLiquid</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border" dir="rtl">
        {TABS.map(t => (
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

      {/* Tab content */}
      {tab === "positions" && <OpenPositionsTab positions={positions} onRefresh={load} />}
      {tab === "history" && <TradeHistoryTab trades={trades} onRefresh={load} />}
      {tab === "performance" && <PerformanceTab trades={trades} positions={positions} />}
    </div>
  );
}