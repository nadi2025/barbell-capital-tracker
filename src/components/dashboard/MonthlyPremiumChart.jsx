import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import moment from "moment";

export default function MonthlyPremiumChart({ options }) {
  const sellTrades = options.filter(o => o.type === "Sell" && o.open_date);

  const monthly = {};
  sellTrades.forEach(o => {
    const month = moment(o.open_date).format("YYYY-MM");
    if (!monthly[month]) monthly[month] = 0;
    monthly[month] += (o.fill_price || 0) * (o.quantity || 0) * 100;
  });

  const data = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, premium]) => ({
      month: moment(month, "YYYY-MM").format("MMM 'YY"),
      premium: Math.round(premium),
    }));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-1">Monthly Premium Income</h3>
      <p className="text-xs text-muted-foreground mb-4">Premium collected from selling options</p>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">No data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }} axisLine={false} tickLine={false}
              tickFormatter={v => `$${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{
                background: "hsl(222, 47%, 10%)",
                border: "1px solid hsl(222, 30%, 20%)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [`$${value.toLocaleString()}`, "Premium"]}
            />
            <Bar dataKey="premium" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}