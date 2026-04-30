import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Plus, Pencil, Trash2, RefreshCw, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Shield, DollarSign, Layers, AlertTriangle,
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import PnlBadge from "../components/PnlBadge";
import StockPositionForm from "../components/StockPositionForm";
import { toast } from "sonner";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";
import { useQueryClient } from "@tanstack/react-query";
import { differenceInDays } from "date-fns";
import {
  getStrategyDisplay, isCoveredCall, isProtectivePut, isCashSecuredPut,
  computeRealizedPL,
} from "@/lib/optionsHelpers";

const MIGRATION_KEY = "stocks_migration_v1_done";

const fmt = (v) =>
  v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmt2 = (v) =>
  v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Classify an option trade relative to a stock holding. */
function classifyOption(opt) {
  // Use the canonical strategy display from optionsHelpers — handles both new
  // schema and legacy { type, category } combos.
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

/** One tile in the KPI strip at the top of the page. */
function Kpi({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 sm:p-4 min-h-[88px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground/50" />}
      </div>
      <div>
        <p className={`text-lg sm:text-xl font-bold font-mono leading-tight ${accent || ""}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * Expandable per-stock block. Shows summary line (compact on mobile) and on
 * expand a drawer with linked options (open first, closed after) and any
 * notes/cost-basis annotations the reconciler wrote in.
 */
function StockCard({ stock, optionsForTicker, totalValue, onEdit, onDelete, isReadOnly }) {
  const [expanded, setExpanded] = useState(false);

  const open = optionsForTicker.filter((o) => o.status === "Open");
  const closed = optionsForTicker.filter((o) => ["Closed", "Expired", "Assigned", "Expired OTM"].includes(o.status));
  const coveredCalls = open.filter(isCoveredCall);
  const protectivePuts = open.filter(isProtectivePut);
  const optionsPremiumRealized = closed.reduce((s, o) => {
    const pl = computeRealizedPL(o);
    return s + (pl != null ? pl : (o.pnl || 0));
  }, 0);
  // Open-position P&L is no longer computed (per spec — only on close).
  const optionsPremiumUnrealized = 0;

  const weight = totalValue > 0 ? ((stock.current_value || 0) / totalValue * 100) : 0;
  const hasCoveredCalls = coveredCalls.length > 0;
  const fromAssignment = stock.source === "Assignment" ||
    (stock.notes || "").toLowerCase().includes("assignment");

  // Extract realized P&L from notes (set by reconciler)
  const realizedMatch = (stock.notes || "").match(/realized P&L\s+\$?(-?[\d,.]+)/i);
  const stockRealizedPnl = realizedMatch ? parseFloat(realizedMatch[1].replace(/,/g, "")) : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Row — click to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors text-right"
      >
        <div className="flex-shrink-0 mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold text-base">{stock.ticker}</span>
            {fromAssignment && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                Assignment
              </span>
            )}
            {hasCoveredCalls && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-profit/10 text-profit border border-profit/20">
                {coveredCalls.length} Covered Call{coveredCalls.length > 1 ? "s" : ""}
              </span>
            )}
            {protectivePuts.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {protectivePuts.length} Protective Put{protectivePuts.length > 1 ? "s" : ""}
              </span>
            )}
            <StatusBadge status={stock.status} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-2 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground">מניות</p>
              <p className="font-mono font-semibold">{stock.shares?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">עלות ממוצעת</p>
              <p className="font-mono">${stock.average_cost?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">מחיר נוכחי</p>
              <p className="font-mono">{stock.current_price ? `$${stock.current_price.toFixed(2)}` : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">שווי</p>
              <p className="font-mono font-semibold">{fmt(stock.current_value)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">P&L לא ממומש</p>
              {stock.gain_loss != null ? <PnlBadge value={stock.gain_loss} /> : <span className="text-muted-foreground">—</span>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">משקל</p>
              <p className="font-mono text-muted-foreground">{weight.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        {!isReadOnly && (
          <div className="flex flex-col gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-11 w-11 md:h-7 md:w-7" onClick={() => onEdit(stock)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-11 w-11 md:h-7 md:w-7 text-destructive" onClick={() => onDelete(stock)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </button>

      {/* Expanded drawer */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 px-4 py-4 space-y-4">
          {/* Cost basis summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">עלות כוללת</p>
              <p className="text-sm font-mono font-semibold mt-0.5">{fmt(stock.invested_value)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">מקור</p>
              <p className="text-sm mt-0.5">{stock.source || "Direct Buy"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">תאריך כניסה</p>
              <p className="text-sm font-mono mt-0.5">{stock.entry_date || "—"}</p>
            </div>
            {stockRealizedPnl != null && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">P&L ממומש (מכירות)</p>
                <p className={`text-sm font-mono font-semibold mt-0.5 ${stockRealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
                  {fmt2(stockRealizedPnl)}
                </p>
              </div>
            )}
          </div>

          {/* Options summary */}
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">פרמיה לא ממומשת</p>
                <p className={`text-sm font-mono font-semibold mt-0.5 ${optionsPremiumUnrealized >= 0 ? "text-profit" : "text-loss"}`}>
                  {fmt2(optionsPremiumUnrealized)}
                </p>
                <p className="text-[10px] text-muted-foreground">{open.length} פתוחות</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">אפקטיבי על המניה</p>
                <p className={`text-sm font-mono font-semibold mt-0.5 ${(stock.gain_loss || 0) + optionsPremiumRealized >= 0 ? "text-profit" : "text-loss"}`}>
                  {fmt2((stock.gain_loss || 0) + optionsPremiumRealized)}
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  פעילות עבר ({closed.length})
                </p>
              </div>
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

          {/* Notes */}
          {stock.notes && (
            <div className="text-[11px] text-muted-foreground bg-muted/30 rounded px-3 py-2 border-r-2 border-primary/30">
              {stock.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StocksPage() {
  const { data: stocks = [], isLoading } = useEntityList("StockPosition", { sort: "-entry_date" });
  const { data: allOptions = [] } = useEntityList("OptionsTrade");
  const { data: pricesData = [] } = useEntityList("Prices");

  // Build live price map from Prices entity (same source as Dashboard/calcDashboard)
  const priceMap = useMemo(() => {
    const m = {};
    pricesData.forEach((p) => { if (p.asset) m[p.asset.toUpperCase()] = p.price_usd; });
    return m;
  }, [pricesData]);

  // Enrich each stock with live price from Prices entity (falls back to stored value).
  // Defensive baseline: if invested_value isn't stored on the row (legacy data
  // saved before the form started persisting it), fall back to shares × avg_cost
  // so P&L stays correct even before the migration below has run.
  const enrichedStocks = useMemo(() => {
    return stocks.map((s) => {
      const livePrice = priceMap[(s.ticker || "").toUpperCase()];
      if (!livePrice) return s;
      const currentValue = (s.shares || 0) * livePrice;
      const baseline = s.invested_value || ((s.shares || 0) * (s.average_cost || 0));
      const gainLoss = currentValue - baseline;
      const gainLossPct = baseline > 0 ? (gainLoss / baseline) * 100 : 0;
      return { ...s, current_price: livePrice, current_value: currentValue, gain_loss: gainLoss, gain_loss_pct: gainLossPct };
    });
  }, [stocks, priceMap]);
  const deleteStock = useEntityMutation("StockPosition", "delete");
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editStock, setEditStock] = useState(null);
  const [user, setUser] = useState(null);
  // PriceHub is mounted at the Layout level — open it from here via Outlet context.
  const { openPriceHub } = useOutletContext() || {};

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  // ── One-shot data migration ──
  // Two cleanups for legacy data created before the form persisted
  // invested_value and before the auto-merge logic existed:
  //   1. Backfill invested_value = shares × average_cost on rows missing it.
  //   2. Merge duplicate (Holding / Partially Sold) rows for the same ticker
  //      into one row with weighted-average cost; delete the extras.
  // Guarded by a localStorage flag so it runs at most once per browser. Idempotent
  // either way (a re-run finds nothing to do).
  useEffect(() => {
    if (isLoading || stocks.length === 0) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(MIGRATION_KEY) === "1") return;

    let cancelled = false;
    const run = async () => {
      try {
        let backfilled = 0;
        let mergedExtras = 0;

        // Pass 1 — backfill invested_value
        for (const s of stocks) {
          if (cancelled) return;
          const hasShares = (s.shares || 0) > 0;
          const hasCost = (s.average_cost || 0) > 0;
          if (!s.invested_value && hasShares && hasCost) {
            await base44.entities.StockPosition.update(s.id, {
              invested_value: s.shares * s.average_cost,
            });
            backfilled++;
          }
        }

        // Pass 2 — merge duplicate Holding / Partially Sold rows by ticker
        const open = stocks.filter(
          (s) => s.status === "Holding" || s.status === "Partially Sold"
        );
        const byTicker = {};
        for (const s of open) {
          const k = (s.ticker || "").toUpperCase();
          if (!k) continue;
          (byTicker[k] = byTicker[k] || []).push(s);
        }
        for (const ticker of Object.keys(byTicker)) {
          if (cancelled) return;
          const group = byTicker[ticker];
          if (group.length < 2) continue;
          // Keep the oldest row as the merge target (preserves entry_date).
          group.sort((a, b) => new Date(a.entry_date || 0) - new Date(b.entry_date || 0));
          const target = group[0];
          const extras = group.slice(1);

          const totalShares = group.reduce((s, x) => s + (x.shares || 0), 0);
          const totalCost = group.reduce(
            (s, x) => s + (x.shares || 0) * (x.average_cost || 0),
            0
          );
          const newAvg = totalShares > 0 ? totalCost / totalShares : 0;
          const newInvested = totalShares * newAvg;

          await base44.entities.StockPosition.update(target.id, {
            shares: totalShares,
            average_cost: newAvg,
            invested_value: newInvested,
          });
          for (const e of extras) {
            if (cancelled) return;
            await base44.entities.StockPosition.delete(e.id);
            mergedExtras++;
          }
        }

        localStorage.setItem(MIGRATION_KEY, "1");

        if (backfilled > 0 || mergedExtras > 0) {
          const parts = [];
          if (backfilled) parts.push(`עודכנו ${backfilled} שורות עם עלות`);
          if (mergedExtras) parts.push(`מוזגו ${mergedExtras} כפילויות`);
          toast.success(`נתוני מניות סודרו: ${parts.join(" · ")}`);
          queryClient.invalidateQueries({ queryKey: ["entity", "StockPosition"] });
        }
      } catch (e) {
        // Don't set the flag — we'll retry on next visit.
        console.error("Stocks migration failed:", e);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [isLoading, stocks, queryClient]);

  const isReadOnly = user?.role === "partner" || user?.role === "investor";

  // Use enriched stocks everywhere (live prices from Prices entity)
  const allStocks = enrichedStocks;

  // Index options by ticker so each card can render its own slice instantly
  const optionsByTicker = useMemo(() => {
    const m = {};
    for (const o of allOptions) {
      const t = (o.ticker || "").toUpperCase();
      if (!t) continue;
      if (!m[t]) m[t] = [];
      m[t].push(o);
    }
    return m;
  }, [allOptions]);

  // Per-page refresh button now opens PriceHub (the single price-update path
  // for the whole app). Stocks are derived from priceMap × position at render
  // time, so a Prices entity update flows here automatically — no per-stock
  // write loop, no fetchStockPrices Deno round-trip.

  const handleDelete = async (stock) => {
    if (!confirm(`Delete ${stock.ticker} position?`)) return;
    await deleteStock.mutateAsync(stock.id);
    toast.success("Position deleted");
  };

  const handleEdit = (stock) => {
    setEditStock(stock);
    setFormOpen(true);
  };

  // Aggregations for the KPI strip — computed on live-enriched stocks + options
  const kpis = useMemo(() => {
    const holding = allStocks.filter((s) => s.status !== "Closed");
    const totalValue = holding.reduce((s, x) => s + (x.current_value || 0), 0);
    const totalCost = holding.reduce((s, x) => s + (x.invested_value || 0), 0);
    const unrealizedPnl = holding.reduce((s, x) => s + (x.gain_loss || 0), 0);

    // Premium-related from ALL options (irrespective of whether we still hold the stock)
    const openOptions = allOptions.filter((o) => o.status === "Open");
    const closedOptions = allOptions.filter((o) => ["Closed", "Expired", "Assigned", "Expired OTM"].includes(o.status));
    const netPremiumRealized = closedOptions.reduce((s, o) => {
      const pl = computeRealizedPL(o);
      return s + (pl != null ? pl : (o.pnl || 0));
    }, 0);

    // Collateral tied up by open short puts (CSP / naked put) on any ticker.
    // Trust each trade's stored `collateral` (computed at save) rather than
    // re-deriving from strike — that way credit spreads et al. show their
    // proper net-risk collateral instead of the full short-strike value.
    const collateralLocked = openOptions
      .filter(isCashSecuredPut)
      .reduce((s, o) => s + (o.collateral || 0), 0);

    return { totalValue, totalCost, unrealizedPnl, netPremiumRealized, collateralLocked, holdingCount: holding.length };
  }, [stocks, allOptions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const visibleStocks = allStocks.filter((s) => s.status !== "Closed");
  const closedStocks = allStocks.filter((s) => s.status === "Closed");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Stock Positions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kpis.holdingCount} מניות פעילות · {closedStocks.length} נסגרו
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openPriceHub} className="gap-2 flex-1 sm:flex-initial">
            <RefreshCw className="w-4 h-4" />
            עדכן מחירים
          </Button>
          {!isReadOnly && (
            <Button size="sm" onClick={() => { setEditStock(null); setFormOpen(true); }} className="gap-2 flex-1 sm:flex-initial">
              <Plus className="w-4 h-4" /> New
            </Button>
          )}
        </div>
      </div>

      {/* KPI strip — responsive: 2 cols mobile, 5 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <Kpi
          label="שווי תיק המניות"
          value={fmt(kpis.totalValue)}
          sub={`עלות ${fmt(kpis.totalCost)}`}
          icon={DollarSign}
        />
        <Kpi
          label="P&L לא ממומש"
          value={fmt(kpis.unrealizedPnl)}
          accent={kpis.unrealizedPnl >= 0 ? "text-profit" : "text-loss"}
          sub="מחיר נוכחי פחות עלות"
          icon={kpis.unrealizedPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <Kpi
          label="פרמיה ממומשת"
          value={fmt(kpis.netPremiumRealized)}
          accent={kpis.netPremiumRealized >= 0 ? "text-profit" : "text-loss"}
          sub="כל האופציות שנסגרו"
          icon={Layers}
        />
        <Kpi
          label="Collateral נעול"
          value={fmt(kpis.collateralLocked)}
          sub="ב-Short Puts פתוחים"
          icon={Shield}
        />
        <Kpi
          label="סה״כ פעיל"
          value={`${kpis.holdingCount}`}
          sub="מניות בתיק"
        />
      </div>

      {/* Stocks list — expandable cards */}
      <div className="space-y-2">
        {visibleStocks.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            אין מניות פעילות. לחץ "New" או בצע IB Reconcile לייבוא מההיסטוריה.
          </div>
        )}
        {visibleStocks.map((s) => (
          <StockCard
            key={s.id}
            stock={s}
            optionsForTicker={optionsByTicker[(s.ticker || "").toUpperCase()] || []}
            totalValue={kpis.totalValue}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isReadOnly={isReadOnly}
          />
        ))}
      </div>

      {/* Closed positions (collapsed list) */}
      {closedStocks.length > 0 && (
        <details className="bg-card border border-border rounded-xl">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold flex items-center justify-between">
            <span>פוזיציות סגורות ({closedStocks.length})</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </summary>
          <div className="border-t border-border p-2 space-y-2">
            {closedStocks.map((s) => (
              <StockCard
                key={s.id}
                stock={s}
                optionsForTicker={optionsByTicker[(s.ticker || "").toUpperCase()] || []}
                totalValue={kpis.totalValue}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isReadOnly={isReadOnly}
              />
            ))}
          </div>
        </details>
      )}

      <StockPositionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editStock={editStock}
        onSaved={() => setFormOpen(false)}
      />
    </div>
  );
}