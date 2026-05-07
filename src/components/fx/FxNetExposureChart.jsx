import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtCurrency } from "@/lib/fxMath";

export default function FxNetExposureChart({ exposure }) {
  const data = Object.entries(exposure || {})
    .filter(([, v]) => Math.abs(v) > 0.01)
    .map(([currency, value]) => ({ currency, value }));

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
        אין חשיפה נטו פתוחה כרגע
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-sm font-semibold mb-3">חשיפה נטו לפי מטבע</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <XAxis dataKey="currency" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v, _, p) => fmtCurrency(v, p?.payload?.currency, 0)}
            cursor={{ fill: "hsl(var(--muted))" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}