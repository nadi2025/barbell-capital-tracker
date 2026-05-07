import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Edit2, Trash2, X as XIcon, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FxStatusBadge from "./FxStatusBadge";
import FxSwapIndicator from "./FxSwapIndicator";
import {
  deriveStatus,
  calcUnrealizedPnl,
  calcUnrealizedPnlPct,
  daysToMaturity,
  fmtCurrency,
  fmtRate,
} from "@/lib/fxMath";
import { format, parseISO } from "date-fns";

export default function FxTransactionTable({ transactions, ratesMap, onEdit, onDelete, onClose, compact = false }) {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [pairFilter, setPairFilter] = useState("");
  const [sortKey, setSortKey] = useState("trade_date");
  const [sortDir, setSortDir] = useState("desc");

  const today = new Date();

  const enriched = useMemo(() => {
    return (transactions || []).map((tx) => {
      const status = deriveStatus(tx, today);
      const pair = `${tx.base_currency}${tx.quote_currency}`;
      const currentRate = ratesMap?.[pair];
      const pnl = currentRate != null ? calcUnrealizedPnl(tx, currentRate) : null;
      const pnlPct = currentRate != null ? calcUnrealizedPnlPct(tx, currentRate) : null;
      return {
        ...tx,
        _status: status,
        _pair: pair,
        _currentRate: currentRate,
        _pnl: pnl,
        _pnlPct: pnlPct,
        _days: daysToMaturity(tx, today),
      };
    });
  }, [transactions, ratesMap]);

  const filtered = useMemo(() => {
    return enriched.filter((tx) => {
      if (statusFilter !== "ALL" && tx._status !== statusFilter) return false;
      if (typeFilter !== "ALL" && tx.transaction_type !== typeFilter) return false;
      if (pairFilter && !tx._pair.toLowerCase().includes(pairFilter.toLowerCase())) return false;
      return true;
    });
  }, [enriched, statusFilter, typeFilter, pairFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SortHeader = ({ k, children, className = "" }) => (
    <th className={`px-3 py-2 font-medium cursor-pointer select-none ${className}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  return (
    <div className="bg-card border border-border rounded-xl">
      {!compact && (
        <div className="p-3 flex flex-wrap gap-2 border-b border-border">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">כל הסטטוסים</SelectItem>
              <SelectItem value="OPEN">פתוח</SelectItem>
              <SelectItem value="SETTLED">נסגר</SelectItem>
              <SelectItem value="CANCELLED">בוטל</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">כל הסוגים</SelectItem>
              <SelectItem value="SPOT">SPOT</SelectItem>
              <SelectItem value="FORWARD">FORWARD</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={pairFilter}
            onChange={(e) => setPairFilter(e.target.value)}
            placeholder="סנן זוג מטבע (EURUSD…)"
            className="w-44 h-8 text-xs"
          />
          <span className="ml-auto text-xs text-muted-foreground self-center">{sorted.length} עסקאות</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground border-b border-border">
            <tr className="text-right">
              <SortHeader k="reference" className="text-left">אסמכתא</SortHeader>
              <SortHeader k="transaction_type">סוג</SortHeader>
              <SortHeader k="_pair">זוג</SortHeader>
              <SortHeader k="direction">כיוון</SortHeader>
              <SortHeader k="base_amount">סכום בסיס</SortHeader>
              <SortHeader k="locked_rate">שער ננעל</SortHeader>
              <SortHeader k="_currentRate">שער שוק</SortHeader>
              <SortHeader k="_pnl">P&amp;L</SortHeader>
              <SortHeader k="value_date">פירעון</SortHeader>
              <SortHeader k="_status">סטטוס</SortHeader>
              {!compact && <th className="px-3 py-2 font-medium">פעולות</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={compact ? 10 : 11} className="text-center py-8 text-muted-foreground">
                  אין עסקאות התואמות את הסינון
                </td>
              </tr>
            )}
            {sorted.map((tx) => (
              <tr key={tx.id} className="border-b border-border/40 hover:bg-muted/30">
                <td className="px-3 py-2 font-mono">
                  <Link to={`/fx/transactions/${tx.id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                    {tx.reference}
                    {tx.linked_to_reference && <FxSwapIndicator />}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">{tx.transaction_type}</td>
                <td className="px-3 py-2 text-right font-mono">{tx._pair}</td>
                <td className="px-3 py-2 text-right">
                  <span className={tx.direction === "BUY" ? "text-emerald-600" : "text-orange-600"}>
                    {tx.direction}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtCurrency(tx.base_amount, tx.base_currency, 0)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtRate(tx.locked_rate)}</td>
                <td className="px-3 py-2 text-right font-mono">{tx._currentRate != null ? fmtRate(tx._currentRate) : "—"}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {tx._status === "OPEN" && tx._pnl != null ? (
                    <span className={tx._pnl >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {fmtCurrency(tx._pnl, tx.quote_currency, 0)}
                      <span className="text-[10px] block">({tx._pnlPct?.toFixed(2)}%)</span>
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {tx.value_date && format(parseISO(tx.value_date), "dd/MM/yy")}
                  {tx._status === "OPEN" && tx._days != null && (
                    <span className="block text-[10px] text-muted-foreground">{tx._days} ימים</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right"><FxStatusBadge status={tx._status} /></td>
                {!compact && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      {tx._status === "OPEN" && onClose && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onClose(tx)}>
                          סגור
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(tx)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(tx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}