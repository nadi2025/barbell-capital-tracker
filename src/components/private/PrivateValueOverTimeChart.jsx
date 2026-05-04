import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";
import { toUsd, fmtCurrency } from "@/lib/privateMath";

/**
 * Aggregate valuations into one monthly series. For each month, take the
 * latest valuation per investment (so we sum the most up-to-date snapshot, not
 * a running total of all updates) and sum those across investments.
 */
function buildSeries(valuations) {
  if (!valuations.length) return [];
  const byInvestmentMonth = new Map(); // key: invId|YYYY-MM -> latest row
  for (const v of valuations) {
    if (!v.valuation_date || !v.investment_id) continue;
    const month = v.valuation_date.slice(0, 7);
    const key = `${v.investment_id}|${month}`;
    const existing = byInvestmentMonth.get(key);
    if (!existing || v.valuation_date > existing.valuation_date) {
      byInvestmentMonth.set(key, v);
    }
  }

  // Now collect each (month, investment_id) → value, summed by month.
  const totals = {};
  for (const v of byInvestmentMonth.values()) {
    const month = v.valuation_date.slice(0, 7);
    totals[month] = (totals[month] || 0) + toUsd(v.value, v.currency);
  }

  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      label: format(parseISO(`${month}-01`), "MMM yy"),
      value,
    }));
}

export default function PrivateValueOverTimeChart({ valuations = [] }) {
  const data = buildSeries(valuations);

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col">
        <p className="text-sm font-semibold mb-3">שווי תיק לאורך זמן</p>
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          אין נתוני valuation עדיין
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col">
      <p className="text-sm font-semibold mb-3">שווי תיק לאורך זמן</p>
      <div className="flex-1" style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
            <XAxis dataKey="label" stroke="#94a3b8" style={{ fontSize: 11 }} />
            <YAxis
              stroke="#94a3b8"
              style={{ fontSize: 11 }}
              tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
            />
            <Tooltip
              formatter={(v) => [fmtCurrency(v, "USD"), "שווי"]}
              contentStyle={{ fontSize: 11 }}
            />
            <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
