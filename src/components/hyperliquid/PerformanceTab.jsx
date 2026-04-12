import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from "recharts";
import { format } from "date-fns";

const fmtP = (v) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const calcPnl = (p) => {
  if (!p.mark_price || !p.entry_price || !p.size) return 0;
  return p.direction === "Long" ? (p.mark_price - p.entry_price) * p.size : (p.entry_price - p.mark_price) * p.size;
};

export default function PerformanceTab({ trades, positions }) {
  const closeTrades = trades.filter(t => t.direction?.toLowerCase().includes("close"));
  const openPositions = positions.filter(p => p.status === "Open");

  const totalRealizedPnl = closeTrades.reduce((s, t) => s + (t.closed_pnl || 0), 0);
  const totalUnrealizedPnl = openPositions.reduce((s, p) => s + calcPnl(p), 0);
  const totalPnl = totalRealizedPnl + totalUnrealizedPnl;
  const totalFees = trades.reduce((s, t) => s + (t.fee_usd || 0), 0);

  // P&L by asset
  const assetStats = useMemo(() => {
    const map = {};
    trades.forEach(t => {
      if (!map[t.asset]) map[t.asset] = { asset: t.asset, realized: 0, fees: 0, count: 0 };
      if (t.direction?.toLowerCase().includes("close")) map[t.asset].realized += (t.closed_pnl || 0);
      map[t.asset].fees += (t.fee_usd || 0);
      map[t.asset].count++;
    });
    openPositions.forEach(p => {
      if (!map[p.asset]) map[p.asset] = { asset: p.asset, realized: 0, fees: 0, count: 0 };
      map[p.asset].unrealized = calcPnl(p);
    });
    return Object.values(map).map(a => ({
      ...a,
      unrealized: a.unrealized || 0,
      total: a.realized + (a.unrealized || 0),
    })).sort((a, b) => a.total - b.total);
  }, [trades, openPositions]);

  // Cumulative P&L timeline
  const timeline = useMemo(() => {
    const sorted = [...closeTrades].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
    let cum = 0;
    const points = sorted.map(t => {
      cum += (t.closed_pnl || 0);
      return { date: format(new Date(t.trade_date), "d.M.yy"), cumPnl: cum };
    });
    // Add current point with unrealized
    if (points.length > 0) points.push({ date: "כעת", cumPnl: cum + totalUnrealizedPnl });
    return points;
  }, [closeTrades, totalUnrealizedPnl]);

  // Key metrics
  const firstTrade = trades.length > 0 ? new Date(trades.reduce((min, t) => t.trade_date < min ? t.trade_date : min, trades[0].trade_date)) : null;
  const tradingDays = firstTrade ? Math.floor((new Date() - firstTrade) / (1000 * 60 * 60 * 24)) : 0;
  const wins = closeTrades.filter(t => (t.closed_pnl || 0) > 0).length;
  const winRate = closeTrades.length > 0 ? (wins / closeTrades.length * 100).toFixed(0) : 0;
  const avgLoss = closeTrades.length > 0 ? totalRealizedPnl / closeTrades.length : 0;
  const worstAsset = assetStats.length > 0 ? assetStats[0] : null;
  const bestAsset = assetStats.length > 0 ? assetStats[assetStats.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Realized P&L</p>
          <p className={`text-xl font-bold font-mono ${totalRealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(totalRealizedPnl)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{closeTrades.length} עסקאות סגורות</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Unrealized P&L</p>
          <p className={`text-xl font-bold font-mono ${totalUnrealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(totalUnrealizedPnl)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{openPositions.length} פוזיציות פתוחות</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total P&L</p>
          <p className={`text-xl font-bold font-mono ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(totalPnl)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{firstTrade ? `מאז ${format(firstTrade, "M/yyyy")}` : ""}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Fees</p>
          <p className="text-xl font-bold font-mono text-muted-foreground">{fmtP(totalFees)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">עמלות מסחר</p>
        </div>
      </div>

      {/* P&L by Asset */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">P&L לפי נכס</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-5">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-right pb-2">נכס</th>
                <th className="text-right pb-2">P&L ממומש</th>
                <th className="text-right pb-2">P&L לא ממומש</th>
                <th className="text-right pb-2">P&L כולל</th>
                <th className="text-right pb-2">עמלות</th>
                <th className="text-right pb-2"># עסקאות</th>
              </tr>
            </thead>
            <tbody>
              {assetStats.map(a => (
                <tr key={a.asset} className="border-b border-border/30">
                  <td className="py-2 font-mono font-bold">{a.asset}</td>
                  <td className={`py-2 font-mono text-right ${a.realized >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(a.realized)}</td>
                  <td className={`py-2 font-mono text-right ${a.unrealized >= 0 ? "text-profit" : "text-loss"}`}>{a.unrealized !== 0 ? fmtP(a.unrealized) : <span className="text-muted-foreground">—</span>}</td>
                  <td className={`py-2 font-mono text-right font-semibold ${a.total >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(a.total)}</td>
                  <td className="py-2 font-mono text-right text-muted-foreground">{fmtP(a.fees)}</td>
                  <td className="py-2 font-mono text-right text-muted-foreground">{a.count}</td>
                </tr>
              ))}
              <tr className="font-semibold border-t-2 border-border">
                <td className="py-2">סה״כ</td>
                <td className={`py-2 font-mono text-right ${totalRealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(totalRealizedPnl)}</td>
                <td className={`py-2 font-mono text-right ${totalUnrealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(totalUnrealizedPnl)}</td>
                <td className={`py-2 font-mono text-right ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtP(totalPnl)}</td>
                <td className="py-2 font-mono text-right text-muted-foreground">{fmtP(totalFees)}</td>
                <td className="py-2 font-mono text-right text-muted-foreground">{trades.length}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={assetStats} layout="vertical" margin={{ left: 10, right: 30 }}>
            <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="asset" tick={{ fontSize: 12, fontFamily: "monospace" }} width={45} />
            <Tooltip formatter={v => fmtP(v)} />
            <ReferenceLine x={0} stroke="#888" />
            <Bar dataKey="total" fill="#ef4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative P&L timeline */}
      {timeline.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">P&L מצטבר לאורך זמן</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeline}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmtP(v)} />
              <ReferenceLine y={0} stroke="#888" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="cumPnl" stroke="#ef4444" dot={{ r: 4 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Key Metrics */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">מדדי ביצועים</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ["תאריך תחילת מסחר", firstTrade ? format(firstTrade, "d.M.yyyy") : "—"],
            ["ימי מסחר", `${tradingDays} ימים`],
            ["סה״כ עסקאות", trades.length],
            ["עסקאות סגורות", closeTrades.length],
            ["Win Rate (סגורות)", `${winRate}% (${wins}/${closeTrades.length})`],
            ["ממוצע P&L לעסקה סגורה", fmtP(avgLoss)],
            ["עמלות כוללות", fmtP(totalFees)],
            ["נכס הכי מרוויח", bestAsset?.total > 0 ? bestAsset.asset : "—"],
            ["נכס הכי מפסיד", worstAsset ? `${worstAsset.asset} (${fmtP(worstAsset.total)})` : "—"],
          ].map(([label, val]) => (
            <div key={label} className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold mt-0.5">{val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}