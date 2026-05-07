import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Edit2, X as XIcon, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { useFxHedgeData } from "@/hooks/useFxHedgeData";
import {
  deriveStatus,
  calcUnrealizedPnl,
  calcUnrealizedPnlPct,
  daysToMaturity,
  buildRatesMap,
  findLinkedTransaction,
  fmtCurrency,
  fmtRate,
} from "@/lib/fxMath";
import FxStatusBadge from "@/components/fx/FxStatusBadge";
import FxSwapIndicator from "@/components/fx/FxSwapIndicator";
import FxMtmChart from "@/components/fx/FxMtmChart";
import FxTransactionForm from "@/components/fx/FxTransactionForm";
import FxCloseDialog from "@/components/fx/FxCloseDialog";

function Field({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

export default function FxTransactionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useFxHedgeData();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);

  const tx = data.transactions.find((t) => t.id === id);
  const ratesMap = useMemo(() => buildRatesMap(data.rates), [data.rates]);
  const linked = useMemo(() => findLinkedTransaction(tx, data.transactions), [tx, data.transactions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-muted-foreground">העסקה לא נמצאה.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/fx/transactions")}>
          חזרה לרשימה
        </Button>
      </div>
    );
  }

  const today = new Date();
  const status = deriveStatus(tx, today);
  const pair = `${tx.base_currency}${tx.quote_currency}`;
  const currentRate = ratesMap[pair];
  const pnl = currentRate != null ? calcUnrealizedPnl(tx, currentRate) : null;
  const pnlPct = currentRate != null ? calcUnrealizedPnlPct(tx, currentRate) : null;
  const days = daysToMaturity(tx, today);

  // Swap aggregate P&L
  let swapPnl = null;
  let swapWarning = null;
  if (linked) {
    const linkedRate = ratesMap[`${linked.base_currency}${linked.quote_currency}`];
    if (currentRate != null && linkedRate != null) {
      const a = calcUnrealizedPnl(tx, currentRate);
      const b = calcUnrealizedPnl(linked, linkedRate);
      // We sum in the quote ccy of the original; naive but useful when both share the same quote
      if (tx.quote_currency === linked.quote_currency) {
        swapPnl = { value: a + b, currency: tx.quote_currency };
      }
    }
    if (linked.linked_to_reference !== tx.reference) {
      swapWarning = "העסקה המקושרת לא מצביעה חזרה — אסימטריה ב-Swap";
    }
  } else if (tx.linked_to_reference) {
    swapWarning = `אסמכתא מקושרת ${tx.linked_to_reference} לא נמצאה במערכת`;
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> חזרה
        </Button>
      </div>

      {/* Header card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold font-mono">{tx.reference}</h1>
              <FxStatusBadge status={status} />
              {tx.linked_to_reference && <FxSwapIndicator size={14} />}
              <span className="text-xs px-2 py-0.5 bg-muted rounded">{tx.transaction_type}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {tx.broker} · {tx.account}
              {tx.trader && ` · ${tx.trader}`}
              {tx.project && ` · ${tx.project}`}
            </p>
          </div>
          <div className="flex gap-2">
            {status === "OPEN" && (
              <Button variant="outline" onClick={() => setClosing(true)} className="gap-1.5">
                <XIcon className="w-4 h-4" /> סגור עסקה
              </Button>
            )}
            <Button onClick={() => setEditing(true)} className="gap-1.5">
              <Edit2 className="w-4 h-4" /> ערוך
            </Button>
          </div>
        </div>
      </div>

      {/* Key fields */}
      <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="זוג מטבע" value={`${tx.base_currency} / ${tx.quote_currency}`} mono />
        <Field label="כיוון" value={`${tx.direction} ${tx.base_currency}`} />
        <Field label="סכום בסיס" value={fmtCurrency(tx.base_amount, tx.base_currency, 2)} mono />
        <Field label="סכום ציטוט" value={fmtCurrency(tx.quote_amount, tx.quote_currency, 2)} mono />
        <Field label="שער ננעל" value={fmtRate(tx.locked_rate)} mono />
        <Field label="שער שוק נוכחי" value={currentRate != null ? fmtRate(currentRate) : "—"} mono />
        <Field label="תאריך ביצוע" value={tx.trade_date ? format(parseISO(tx.trade_date), "dd MMM yyyy") : "—"} />
        <Field label="יום ערך" value={tx.value_date ? format(parseISO(tx.value_date), "dd MMM yyyy") : "—"} />
        {tx.manual_close_date && (
          <Field label="נסגר ידנית בתאריך" value={format(parseISO(tx.manual_close_date), "dd MMM yyyy")} />
        )}
        {status === "OPEN" && days != null && (
          <Field label="ימים לפירעון" value={`${days} ימים`} />
        )}
      </div>

      {/* P&L card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-sm font-semibold mb-3">P&amp;L לא-ממומש</p>
        {currentRate == null ? (
          <p className="text-sm text-muted-foreground">
            אין שער נוכחי לזוג {pair}. עדכן שערים כדי לחשב P&amp;L.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field
              label={`P&L (${tx.quote_currency})`}
              value={
                <span className={pnl >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {fmtCurrency(pnl, tx.quote_currency, 2)}
                </span>
              }
              mono
            />
            <Field
              label="P&L %"
              value={
                <span className={pnl >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {pnlPct?.toFixed(2)}%
                </span>
              }
              mono
            />
            <Field
              label="הפרש שער"
              value={fmtRate(currentRate - tx.locked_rate)}
              mono
            />
          </div>
        )}
      </div>

      {/* Swap link */}
      {(linked || swapWarning) && (
        <div className="bg-cyan-50 border border-cyan-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowLeftRight className="w-4 h-4 text-cyan-700" />
            <p className="text-sm font-semibold text-cyan-900">חלק מ-Swap</p>
          </div>
          {linked && (
            <Link
              to={`/fx/transactions/${linked.id}`}
              className="text-sm text-cyan-800 hover:underline font-mono inline-block"
            >
              ← {linked.reference} ({linked.transaction_type} · {linked.direction} {linked.base_currency})
            </Link>
          )}
          {swapPnl && (
            <p className="text-sm mt-2">
              P&L מצרפי של ה-Swap:{" "}
              <span className={`font-mono font-bold ${swapPnl.value >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {fmtCurrency(swapPnl.value, swapPnl.currency, 2)}
              </span>
            </p>
          )}
          {swapWarning && (
            <p className="text-xs text-amber-700 mt-2">⚠️ {swapWarning}</p>
          )}
        </div>
      )}

      {/* MTM chart */}
      <FxMtmChart transaction={tx} rates={data.rates} />

      {/* Notes */}
      {tx.notes && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">הערות</p>
          <p className="text-sm whitespace-pre-wrap">{tx.notes}</p>
        </div>
      )}

      <FxTransactionForm
        open={editing}
        editTransaction={tx}
        onClose={() => setEditing(false)}
      />
      <FxCloseDialog
        open={closing}
        transaction={tx}
        onClose={() => setClosing(false)}
      />
    </div>
  );
}