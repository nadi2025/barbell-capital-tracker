import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { toUsd, fmtCurrency } from "@/lib/privateMath";

const COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#f59e0b", "#f87171", "#94a3b8"];

/**
 * Pie breakdown of active investments by `groupBy` (default "category").
 * `groupBy` can be any string field on the investment object.
 */
export default function PrivateAllocationChart({ investments = [], groupBy = "category", title }) {
  const buckets = {};
  investments
    .filter((i) => i.status === "Active")
    .forEach((i) => {
      const key = i[groupBy] || "Other";
      const usd = toUsd(i.current_value, i.currency);
      buckets[key] = (buckets[key] || 0) + usd;
    });

  const data = Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const total = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col">
        {title && <p className="text-sm font-semibold mb-3">{title}</p>}
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          אין נתונים להצגה
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col">
      {title && <p className="text-sm font-semibold mb-3">{title}</p>}
      <div className="flex-1" style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={40}
              paddingAngle={2}
            >
              {data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => [fmtCurrency(v, "USD"), "Value"]}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{ fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[11px] text-muted-foreground text-center mt-1">
        סה"כ: {fmtCurrency(total, "USD")}
      </div>
    </div>
  );
}
