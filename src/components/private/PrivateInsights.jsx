import { format } from "date-fns";
import { fmtMoney } from "./investorsSummaryMath";

const SYMBOL = { USD: "$", ILS: "₪", EUR: "€" };

function CardShell({ title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function Bar({ label, value, max, valueLabel, color = "bg-purple-500" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground">{valueLabel}</span>
      </div>
      <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PrivateInsights({ buckets, upcoming, distributions, concentration }) {
  const bucketMax = Math.max(...Object.values(buckets || {}).map((b) => b.usd), 1);
  const freqEntries = Object.entries(distributions?.byFrequency || {});
  const freqMax = Math.max(...freqEntries.map(([, v]) => v.usd), 1);
  const linkedEntries = Object.entries(distributions?.byLinked || {}).sort((a, b) => b[1].usd - a[1].usd);
  const linkedMax = Math.max(...linkedEntries.map(([, v]) => v.usd), 1);
  const currencyEntries = Object.entries(distributions?.byCurrencyUsd || {});
  const statusEntries = Object.entries(distributions?.byStatus || {});

  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight mb-3">תובנות וניתוח</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Maturity Timeline */}
        <CardShell title="לוח זמני פירעונות (קרן בדולרים)">
          <div className="space-y-2">
            {Object.entries(buckets || {}).map(([key, b]) => (
              <Bar
                key={key}
                label={`עד ${b.label}`}
                value={b.usd}
                max={bucketMax}
                valueLabel={`${fmtMoney(b.usd, "USD")} · ${b.count}`}
                color={key === "30d" ? "bg-amber-500" : key === "60d" ? "bg-amber-400" : "bg-purple-500"}
              />
            ))}
          </div>
        </CardShell>

        {/* Upcoming Payments */}
        <CardShell title="תשלומים קרובים">
          {upcoming?.length ? (
            <div className="space-y-2">
              {upcoming.map((p, i) => (
                <div key={i} className={`flex items-center justify-between text-xs ${p.overdue ? "text-red-500" : ""}`}>
                  <div className="flex flex-col">
                    <span className="font-medium">{p.investorName}</span>
                    <span className="text-[10px] opacity-70">{format(p.date, "yyyy-MM-dd")}</span>
                  </div>
                  <span className="font-mono">{fmtMoney(p.amount, p.currency)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">אין תשלומים מתוכננים</p>
          )}
        </CardShell>

        {/* Frequency breakdown */}
        <CardShell title="פילוח לפי תדירות תשלום">
          <div className="space-y-2">
            {freqEntries.length === 0 && <p className="text-xs text-muted-foreground">אין נתונים</p>}
            {freqEntries.map(([k, v]) => (
              <Bar
                key={k}
                label={`${k} (${v.count})`}
                value={v.usd}
                max={freqMax}
                valueLabel={fmtMoney(v.usd, "USD")}
              />
            ))}
          </div>
        </CardShell>

        {/* Linked Investments */}
        <CardShell title="פילוח לפי השקעה מקושרת">
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {linkedEntries.length === 0 && <p className="text-xs text-muted-foreground">אין נתונים</p>}
            {linkedEntries.map(([k, v]) => (
              <Bar
                key={k}
                label={`${k} (${v.count})`}
                value={v.usd}
                max={linkedMax}
                valueLabel={fmtMoney(v.usd, "USD")}
                color="bg-emerald-500"
              />
            ))}
          </div>
        </CardShell>

        {/* Currency distribution (USD) */}
        <CardShell title="פילוח לפי מטבע (ב-USD)">
          <div className="space-y-2">
            {currencyEntries.length === 0 && <p className="text-xs text-muted-foreground">אין נתונים</p>}
            {currencyEntries.map(([cur, usd]) => {
              const total = distributions?.totalUsd || 0;
              const pct = total > 0 ? (usd / total) * 100 : 0;
              return (
                <div key={cur} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{SYMBOL[cur] || ""} {cur}</span>
                    <span className="font-mono text-muted-foreground">{fmtMoney(usd, "USD")} · {pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardShell>

        {/* Status */}
        <CardShell title="פילוח לפי סטטוס">
          <div className="flex flex-wrap gap-2">
            {statusEntries.length === 0 && <p className="text-xs text-muted-foreground">אין נתונים</p>}
            {statusEntries.map(([st, count]) => (
              <div key={st} className={`px-3 py-2 rounded-lg border text-xs ${
                st === "Active" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : st === "Repaid" ? "bg-blue-500/10 border-blue-500/30 text-blue-600"
                    : "bg-red-500/10 border-red-500/30 text-red-600"
              }`}>
                <div className="font-medium">{st}</div>
                <div className="font-mono text-base">{count}</div>
              </div>
            ))}
          </div>
        </CardShell>

        {/* Concentration */}
        <CardShell title="ריכוזיות (USD)">
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">משקיע גדול ביותר</span>
              <span className="font-mono">{concentration?.top1Pct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">3 הגדולים</span>
              <span className="font-mono">{concentration?.top3Pct.toFixed(1)}%</span>
            </div>
            {concentration?.top1Pct > 30 && (
              <p className="text-[10px] text-amber-600 mt-2">⚠ ריכוזיות גבוהה במשקיע יחיד</p>
            )}
          </div>
        </CardShell>

        {/* Extremes */}
        <CardShell title="קצוות התיק">
          <div className="space-y-2 text-xs">
            {concentration?.largest && (
              <div>
                <div className="text-muted-foreground text-[10px]">הגדולה ביותר</div>
                <div className="flex items-center justify-between">
                  <span>{concentration.largest.name}</span>
                  <span className="font-mono">{fmtMoney(concentration.largest.usd, "USD")}</span>
                </div>
              </div>
            )}
            {concentration?.smallest && concentration.smallest !== concentration.largest && (
              <div>
                <div className="text-muted-foreground text-[10px]">הקטנה ביותר</div>
                <div className="flex items-center justify-between">
                  <span>{concentration.smallest.name}</span>
                  <span className="font-mono">{fmtMoney(concentration.smallest.usd, "USD")}</span>
                </div>
              </div>
            )}
            <div className="pt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">קרן ממוצעת</span>
                <span className="font-mono">{fmtMoney(concentration?.avgUsd || 0, "USD")}</span>
              </div>
            </div>
          </div>
        </CardShell>
      </div>
    </div>
  );
}