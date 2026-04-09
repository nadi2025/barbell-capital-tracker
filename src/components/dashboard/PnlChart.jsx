import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import moment from "moment";

export default function PnlChart({ options }) {
  // Sort by close date and calculate cumulative P&L
  const sorted = [...options]
    .filter(o => o.close_date && o.pnl !== null && o.pnl !== undefined)
    .sort((a, b) => new Date(a.close_date) - new Date(b.close_date));

  let cumulative = 0;
  const data = sorted.map(o => {
    cumulative += o.pnl || 0;
    return {
      date: moment(o.close_date).format("MMM DD"),
      pnl: cumulative,
      trade: `${o.ticker} ${o.category}`,
    };
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-1">Cumulative P&L</h3>
      <p className="text-xs text-muted-foreground mb-4">Options closed trades over time</p>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">No closed trades yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }} axisLine={false} tickLine={false}
              tickFormatter={v => `$${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{
                background: "hsl(222, 47%, 10%)",
                border: "1px solid hsl(222, 30%, 20%)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [`$${value.toLocaleString()}`, "Cumulative P&L"]}
            />
            <Area type="monotone" dataKey="pnl" stroke="hsl(160, 84%, 39%)" fill="url(#pnlGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}