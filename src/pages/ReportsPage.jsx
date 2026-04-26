import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import PnlBadge from "../components/PnlBadge";
import moment from "moment";
import { useEntityList } from "@/hooks/useEntityQuery";

/**
 * ReportsPage — period-filtered options performance analytics.
 *
 * Migrated to React Query — all three entity reads (OptionsTrade,
 * StockPosition, Deposit) come through useEntityList. The page only
 * derives, never writes; new mutations elsewhere (closing a trade in
 * OptionsPage, recording a deposit) refresh the analytics automatically.
 */
export default function ReportsPage() {
  const optionsQ = useEntityList("OptionsTrade", { sort: "-close_date" });
  const stocksQ = useEntityList("StockPosition");
  const depositsQ = useEntityList("Deposit");
  const options = optionsQ.data || [];
  const loading = optionsQ.isLoading || stocksQ.isLoading || depositsQ.isLoading;

  const [period, setPeriod] = useState("all");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Filter by period
  const filterByPeriod = (items, dateField) => {
    if (period === "all") return items;
    const now = moment();
    let start;
    if (period === "month") start = moment().startOf("month");
    else if (period === "quarter") start = moment().startOf("quarter");
    else if (period === "year") start = moment().startOf("year");
    return items.filter(i => i[dateField] && moment(i[dateField]).isSameOrAfter(start));
  };

  const closedOptions = filterByPeriod(
    options.filter(o => o.status === "Closed" || o.status === "Expired"),
    "close_date"
  );

  const optionsPnl = closedOptions.reduce((s, o) => s + (o.pnl || 0), 0);
  const premiumCollected = filterByPeriod(options.filter(o => o.type === "Sell"), "open_date")
    .reduce((s, o) => s + (o.fill_price || 0) * (o.quantity || 0) * 100, 0);

  // P&L by ticker
  const tickerPnl = {};
  closedOptions.forEach(o => {
    if (!tickerPnl[o.ticker]) tickerPnl[o.ticker] = 0;
    tickerPnl[o.ticker] += o.pnl || 0;
  });
  const tickerPnlData = Object.entries(tickerPnl)
    .map(([ticker, pnl]) => ({ ticker, pnl: Math.round(pnl) }))
    .sort((a, b) => b.pnl - a.pnl);

  // Top winners and losers
  const sorted = [...closedOptions].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  const topWinners = sorted.filter(o => (o.pnl || 0) > 0).slice(0, 5);
  const topLosers = sorted.filter(o => (o.pnl || 0) < 0).slice(-5).reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance analysis</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">This Quarter</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Options P&L</p>
          <p className={`text-xl font-bold mt-1 ${optionsPnl >= 0 ? "text-profit" : "text-loss"}`}>
            ${optionsPnl.toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Premium Collected</p>
          <p className="text-xl font-bold text-profit mt-1">${premiumCollected.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Trades Closed</p>
          <p className="text-xl font-bold mt-1">{closedOptions.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Win Rate</p>
          <p className="text-xl font-bold mt-1">
            {closedOptions.length > 0
              ? `${(closedOptions.filter(o => (o.pnl || 0) > 0).length / closedOptions.length * 100).toFixed(0)}%`
              : "N/A"}
          </p>
        </div>
      </div>

      {/* P&L by Ticker chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">Options P&L by Ticker</h3>
        {tickerPnlData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={tickerPnlData}>
              <XAxis dataKey="ticker" tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${v.toLocaleString()}`} />
              <Tooltip
                contentStyle={{
                  background: "hsl(222, 47%, 10%)",
                  border: "1px solid hsl(222, 30%, 20%)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [`$${value.toLocaleString()}`, "P&L"]}
              />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}
                fill="hsl(160, 84%, 39%)"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top winners / losers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-profit">Top Winners</h3>
          </div>
          <div className="divide-y divide-border/50">
            {topWinners.length === 0 ? (
              <p className="px-5 py-4 text-xs text-muted-foreground">No winning trades</p>
            ) : topWinners.map(t => (
              <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="font-mono font-medium text-sm">{t.ticker}</span>
                  <span className="text-xs text-muted-foreground ml-2">{t.category} · {t.close_date}</span>
                </div>
                <PnlBadge value={t.pnl} />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-loss">Top Losers</h3>
          </div>
          <div className="divide-y divide-border/50">
            {topLosers.length === 0 ? (
              <p className="px-5 py-4 text-xs text-muted-foreground">No losing trades</p>
            ) : topLosers.map(t => (
              <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="font-mono font-medium text-sm">{t.ticker}</span>
                  <span className="text-xs text-muted-foreground ml-2">{t.category} · {t.close_date}</span>
                </div>
                <PnlBadge value={t.pnl} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}