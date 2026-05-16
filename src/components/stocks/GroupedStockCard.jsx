import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "../StatusBadge";
import PnlBadge from "../PnlBadge";
import { differenceInDays } from "date-fns";
import {
  getStrategyDisplay, isCoveredCall, isProtectivePut,
  computeRealizedPL,
} from "@/lib/optionsHelpers";

const fmt = (v) =>
  v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmt2 = (v) =>
  v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function classifyOption(opt) {
  const strat = getStrategyDisplay(opt);
  if (strat) return strat;
  return { label: `${opt.type || ""} ${opt.category || ""}`.trim() || "—", tone: "muted" };
}

function toneClass(tone) {
  return {
    profit: "bg-profit/10 text-profit border-profit/20",
    loss: "bg-loss/10 text-loss border-loss/20",
    primary: "bg-primary/10 text-primary border-primary/20",
    muted: "bg-muted text-muted-foreground border-border",
  }[tone] || "bg-muted text-muted-foreground border-border";
}

/**
 * Grouped card — aggregates multiple StockPosition rows for the same ticker
 * into a single summary row. Click to expand and see each individual lot
 * (with its own source, entry date, cost basis, P&L, and edit/delete actions).
 */
export default function GroupedStockCard({ ticker, positions, optionsForTicker, totalValue, onEdit, onDelete, isReadOnly }) {
  const [expanded, setExpanded] = useState(false);

  // Weighted aggregate
  const totalShares = positions.reduce((s, p) => s + (p.shares || 0), 0);
  const totalCost = positions.reduce((s, p) => s + (p.invested_value || (p.shares || 0) * (p.average_cost || 0)), 0);
  const avgCost = totalShares > 0 ? totalCost / totalShares : 0;
  const currentPrice = positions.find((p) => p.current_price)?.current_price || 0;
  const currentValue = totalShares * currentPrice;
  const gainLoss = currentValue - totalCost;
  const weight = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;

  const open = optionsForTicker.filter((o) => o.status === "Open");
  const closed = optionsForTicker.filter((o) => ["Closed", "Expired", "Assigned", "Expired OTM"].includes(o.status));
  const coveredCalls = open.filter(isCoveredCall);
  const protectivePuts = open.filter(isProtectivePut);
  const optionsPremiumRealized = closed.reduce((s, o) => {
    const pl = computeRealizedPL(o);
    return s + (pl != null ? pl : (o.pnl || 0));
  }, 0);

  const hasAssignment = positions.some((p) => p.source === "Assignment" || (p.notes || "").toLowerCase().includes("assignment"));
  const dominantStatus = positions[0]?.status || "Holding";
  const lotCount = positions.length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors text-right"
      >
        <div className="flex-shrink-0 mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold text-base">{ticker}</span>
            {lotCount > 1 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {lotCount} פוזיציות
              </span>
            )}
            {hasAssignment && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                Assignment
              </span>
            )}
            {coveredCalls.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-profit/10 text-profit border border-profit/20">
                {coveredCalls.length} Covered Call{coveredCalls.length > 1 ? "s" : ""}
              </span>
            )}
            {protectivePuts.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {protectivePuts.length} Protective Put{protectivePuts.length > 1 ? "s" : ""}
              </span>
            )}
            <StatusBadge status={dominantStatus} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-2 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground">מניות</p>
              <p className="font-mono font-semibold">{totalShares.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">עלות ממוצעת{lotCount > 1 ? " (משוקללת)" : ""}</p>
              <p className="font-mono">${avgCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">מחיר נוכחי</p>
              <p className="font-mono">{currentPrice ? `$${currentPrice.toFixed(2)}` : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">שווי</p>
              <p className="font-mono font-semibold">{fmt(currentValue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">P&L לא ממומש</p>
              {currentPrice ? <PnlBadge value={gainLoss} /> : <span className="text-muted-foreground">—</span>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">משקל</p>
              <p className="font-mono text-muted-foreground">{weight.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        {!isReadOnly && lotCount === 1 && (
          <div className="flex flex-col gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-11 w-11 md:h-7 md:w-7" onClick={() => onEdit(positions[0])}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-11 w-11 md:h-7 md:w-7 text-destructive" onClick={() => onDelete(positions[0])}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </button>

      {/* Expanded drawer */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 px-4 py-4 space-y-4">
          {/* Individual lots */}
          {lotCount > 1 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">פירוט פוזיציות ({lotCount})</p>
              <div className="space-y-2">
                {positions.map((p) => {
                  const pCost = p.invested_value || (p.shares || 0) * (p.average_cost || 0);
                  const pValue = (p.shares || 0) * (p.current_price || currentPrice || 0);
                  const pGainLoss = pValue - pCost;
                  const fromAssignment = p.source === "Assignment" || (p.notes || "").toLowerCase().includes("assignment");
                  return (
                    <div key={p.id} className="bg-background rounded-lg px-3 py-2 border border-border/40">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {fromAssignment && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              Assignment
                            </span>
                          )}
                          <StatusBadge status={p.status} />
                          <span className="text-muted-foreground font-mono text-[11px]">{p.entry_date || "—"}</span>
                        </div>
                        {!isReadOnly && (
                          <div className="flex gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(p)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(p)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 text-xs">
                        <div>
                          <p className="text-[10px] text-muted-foreground">מניות</p>
                          <p className="font-mono font-semibold">{p.shares?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">עלות</p>
                          <p className="font-mono">${p.average_cost?.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">עלות כוללת</p>
                          <p className="font-mono">{fmt(pCost)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">שווי</p>
                          <p className="font-mono">{fmt(pValue)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">P&L</p>
                          {p.current_price || currentPrice ? <PnlBadge value={pGainLoss} /> : <span className="text-muted-foreground">—</span>}
                        </div>
                      </div>
                      {p.notes && (
                        <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/30">{p.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Single-lot expanded view: show same details as the multi-lot summary */}
          {lotCount === 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">עלות כוללת</p>
                <p className="text-sm font-mono font-semibold mt-0.5">{fmt(totalCost)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">מקור</p>
                <p className="text-sm mt-0.5">{positions[0].source || "Direct Buy"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">תאריך כניסה</p>
                <p className="text-sm font-mono mt-0.5">{positions[0].entry_date || "—"}</p>
              </div>
            </div>
          )}

          {/* Options summary (shared across all lots of this ticker) */}
          {(open.length > 0 || closed.length > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-border/50">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">פרמיה ממומשת (אופציות)</p>
                <p className={`text-sm font-mono font-semibold mt-0.5 ${optionsPremiumRealized >= 0 ? "text-profit" : "text-loss"}`}>
                  {fmt2(optionsPremiumRealized)}
                </p>
                <p className="text-[10px] text-muted-foreground">{closed.length} עסקאות</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">פוזיציות אופציה פתוחות</p>
                <p className="text-sm font-mono font-semibold mt-0.5">{open.length}</p>
                <p className="text-[10px] text-muted-foreground">CC / PP / CSP / וכו'</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">אפקטיבי על המניה</p>
                <p className={`text-sm font-mono font-semibold mt-0.5 ${gainLoss + optionsPremiumRealized >= 0 ? "text-profit" : "text-loss"}`}>
                  {fmt2(gainLoss + optionsPremiumRealized)}
                </p>
                <p className="text-[10px] text-muted-foreground">מניות + פרמיות</p>
              </div>
            </div>
          )}

          {/* Open options */}
          {open.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">אופציות פתוחות ({open.length})</p>
              <div className="space-y-1">
                {open
                  .slice()
                  .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))
                  .map((o) => {
                    const days = o.expiration_date ? differenceInDays(new Date(o.expiration_date), new Date()) : null;
                    const cls = classifyOption(o);
                    return (
                      <div key={o.id} className="flex flex-wrap items-center gap-2 text-xs bg-background rounded-lg px-3 py-2 border border-border/40">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${toneClass(cls.tone)}`}>
                          {cls.label}
                        </span>
                        <span className="font-mono">${o.strike} × {o.quantity}</span>
                        <span className="font-mono text-muted-foreground">{o.expiration_date}</span>
                        {days != null && days >= 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${days <= 7 ? "bg-red-500/10 text-red-500" : days <= 30 ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                            {days === 0 ? "היום" : `${days} ימים`}
                          </span>
                        )}
                        <span className="mr-auto text-muted-foreground">פרמיה {fmt2((o.fill_price || 0) * (o.quantity || 0) * 100)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Closed options (last 5) */}
          {closed.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                פעילות עבר ({closed.length})
              </p>
              <div className="space-y-1">
                {closed
                  .slice()
                  .sort((a, b) => (b.close_date || "").localeCompare(a.close_date || ""))
                  .slice(0, 5)
                  .map((o) => {
                    const cls = classifyOption(o);
                    return (
                      <div key={o.id} className="flex flex-wrap items-center gap-2 text-xs bg-background/40 rounded-lg px-3 py-1.5 border border-border/30">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${toneClass(cls.tone)}`}>
                          {cls.label}
                        </span>
                        <span className="font-mono">${o.strike} × {o.quantity}</span>
                        <span className="font-mono text-muted-foreground">{o.close_date || o.expiration_date}</span>
                        <span className="text-[10px] text-muted-foreground">{o.status}</span>
                        <span className="mr-auto">
                          {o.pnl != null ? <PnlBadge value={o.pnl} /> : "—"}
                        </span>
                      </div>
                    );
                  })}
                {closed.length > 5 && (
                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    ... ועוד {closed.length - 5} עסקאות
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}