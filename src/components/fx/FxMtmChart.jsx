import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, parseISO } from "date-fns";
import { fmtCurrency, buildMtmSeries } from "@/lib/fxMath";

export default function FxMtmChart({ transaction, rates }) {
  const series = buildMtmSeries(transaction, rates);

  if (series.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
        אין מספיק היסטוריית שערים כדי להציג גרף MTM. עדכן שערים כדי להתחיל לאסוף נתונים.
      </div>
    );
  }

  const data = series.map((p) => ({
    date: format(parseISO(p.date), "dd/MM"),
    pnl: p.pnl,
  }));

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-sm font-semibold mb-3">P&amp;L לאורך זמן (Mark-to-Market)</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => fmtCurrency(v, transaction?.quote_currency, 0)} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="pnl"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}