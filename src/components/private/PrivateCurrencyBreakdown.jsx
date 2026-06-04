import { fmtMoney } from "./investorsSummaryMath";

const SYMBOL = { USD: "$", ILS: "₪", EUR: "€" };

function Row({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${accent || ""}`}>{value}</span>
    </div>
  );
}

export default function PrivateCurrencyBreakdown({ groups }) {
  if (!groups?.length) return null;

  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight mb-3">פילוח לפי מטבע</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => (
          <div key={g.currency} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-display font-light">{SYMBOL[g.currency] || g.currency}</span>
                <span className="text-sm font-medium">{g.currency}</span>
              </div>
              <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">{g.positions} פוזיציות</span>
            </div>
            <div className="text-xl font-semibold tracking-tight mb-3">{fmtMoney(g.totalPrincipal, g.currency)}</div>
            <div className="space-y-1.5 pt-3 border-t border-border/60">
              <Row label="משקיעים" value={g.uniqueInvestors} />
              <Row label="ריבית שנתית ממוצעת" value={`${g.weightedRate.toFixed(2)}%`} />
              <Row label="ריבית צפויה" value={fmtMoney(g.projected, g.currency)} accent="text-emerald-600" />
              <Row label="ריבית ששולמה" value={fmtMoney(g.paid, g.currency)} accent="text-emerald-600" />
              <Row label="נותר לתשלום" value={fmtMoney(g.remaining, g.currency)} accent="text-emerald-600" />
              <Row label="קרן ממוצעת" value={fmtMoney(g.avgPrincipal, g.currency)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}