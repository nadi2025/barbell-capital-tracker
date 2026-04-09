import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = [
  "hsl(160, 84%, 39%)",
  "hsl(199, 89%, 48%)",
  "hsl(45, 93%, 47%)",
  "hsl(262, 83%, 58%)",
  "hsl(12, 76%, 61%)",
  "hsl(180, 60%, 45%)",
  "hsl(330, 70%, 55%)",
];

export default function AllocationChart({ stocks, totalValue }) {
  const data = stocks.map((s) => ({
    name: s.ticker,
    value: s.current_value || 0,
    weight: totalValue > 0 ? ((s.current_value || 0) / totalValue * 100).toFixed(1) : 0,
  }));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-1">Portfolio Allocation</h3>
      <p className="text-xs text-muted-foreground mb-4">By ticker weight</p>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">No holdings</div>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={220}>
            <PieChart>
              <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(222, 47%, 10%)",
                  border: "1px solid hsl(222, 30%, 20%)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [`$${value.toLocaleString()}`, "Value"]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {data.map((item, i) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="font-mono font-medium">{item.name}</span>
                <span className="text-muted-foreground ml-auto">{item.weight}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}