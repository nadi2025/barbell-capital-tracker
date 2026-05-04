import { useMemo } from "react";
import { Lock, TrendingUp, TrendingDown, DollarSign, Target, Building2 } from "lucide-react";
import { usePrivateData } from "@/hooks/usePrivateData";
import {
  calcPrivateTotalValue, calcPrivateTotalCost, calcPrivateUnrealizedPnl,
  calcPrivateDebtOutstanding, fmtCurrency, toUsd,
} from "@/lib/privateMath";
import PrivateKpiCard from "@/components/private/PrivateKpiCard";
import PrivateAllocationChart from "@/components/private/PrivateAllocationChart";
import PrivateValueOverTimeChart from "@/components/private/PrivateValueOverTimeChart";
import PrivateUpcomingPaymentsPanel from "@/components/private/PrivateUpcomingPaymentsPanel";

export default function PrivateDashboard() {
  const { data, isLoading } = usePrivateData();

  const kpis = useMemo(() => {
    const totalValue = calcPrivateTotalValue(data.investments);
    const totalCost = calcPrivateTotalCost(data.investments);
    const pnl = calcPrivateUnrealizedPnl(data.investments);
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    const debt = calcPrivateDebtOutstanding(data.investors);
    return { totalValue, totalCost, pnl, pnlPct, debt };
  }, [data.investments, data.investors]);

  const activeInvestments = useMemo(
    () => data.investments.filter((i) => i.status === "Active"),
    [data.investments],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-purple-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Isolation banner */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-purple-300">
            🔒 תיק פרטי — נפרד מהתיק הראשי
          </p>
          <p className="text-xs text-purple-300/80 mt-1">
            נתונים ידניים בלבד · אינם משתתפים בחישוב NAV הראשי
          </p>
        </div>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Private Investments Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeInvestments.length} השקעות פעילות · {data.investors.filter((i) => i.status === "Active").length} משקיעי חוב
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PrivateKpiCard
          label="שווי תיק"
          value={fmtCurrency(kpis.totalValue, "USD")}
          sub={`עלות ${fmtCurrency(kpis.totalCost, "USD")}`}
          icon={DollarSign}
        />
        <PrivateKpiCard
          label="עלות בסיס"
          value={fmtCurrency(kpis.totalCost, "USD")}
          sub={`${activeInvestments.length} השקעות פעילות`}
          icon={Target}
        />
        <PrivateKpiCard
          label="P&L לא ממומש"
          value={fmtCurrency(kpis.pnl, "USD")}
          sub={`${kpis.pnlPct >= 0 ? "+" : ""}${kpis.pnlPct.toFixed(1)}% תשואה`}
          accent={kpis.pnl >= 0 ? "text-profit" : "text-loss"}
          icon={kpis.pnl >= 0 ? TrendingUp : TrendingDown}
        />
        <PrivateKpiCard
          label="חוב פתוח"
          value={fmtCurrency(kpis.debt, "USD")}
          sub={`${data.investors.filter((i) => i.status === "Active").length} משקיעי חוב פעילים`}
          icon={Building2}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PrivateAllocationChart investments={data.investments} groupBy="category" title="לפי קטגוריה" />
        <PrivateAllocationChart investments={data.investments} groupBy="funding_source" title="לפי מקור מימון" />
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <PrivateValueOverTimeChart valuations={data.valuations} />
        </div>
        <PrivateUpcomingPaymentsPanel payments={data.payments} daysAhead={90} />
      </div>

      {/* Active investments table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">השקעות פעילות</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Investment Date</th>
                <th className="text-right px-4 py-3 font-medium">Initial Cost</th>
                <th className="text-right px-4 py-3 font-medium">Current Value</th>
                <th className="text-right px-4 py-3 font-medium">P&L</th>
                <th className="text-left px-4 py-3 font-medium">Currency</th>
              </tr>
            </thead>
            <tbody>
              {activeInvestments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    אין השקעות פעילות — לחץ "+ הוסף" כדי להתחיל
                  </td>
                </tr>
              ) : activeInvestments.map((i) => {
                const initUsd = toUsd(i.initial_cost, i.currency);
                const valUsd = toUsd(i.current_value, i.currency);
                const pnl = valUsd - initUsd;
                return (
                  <tr key={i.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{i.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{i.category}</td>
                    <td className="px-4 py-3 font-mono text-xs">{i.investment_date}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtCurrency(i.initial_cost, i.currency)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtCurrency(i.current_value, i.currency)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${pnl >= 0 ? "text-profit" : "text-loss"}`}>
                      {pnl >= 0 ? "+" : ""}{fmtCurrency(pnl, "USD")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{i.currency}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
