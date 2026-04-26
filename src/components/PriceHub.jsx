import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, RefreshCw, AlertTriangle, Zap, Edit3, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";
import { STABLECOINS, TOKEN_ALIAS_TO_BASE } from "@/lib/portfolioMath";
import { toast } from "sonner";

const fmtPrice = (v) => {
  if (v == null || v === "") return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 10 ? 4 : 2 });
};

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "זה עתה";
  if (diff < 3600) return `לפני ${Math.round(diff / 60)}ד׳`;
  if (diff < 86400) return `לפני ${Math.round(diff / 3600)}ש׳`;
  const days = Math.round(diff / 86400);
  return `לפני ${days} ימים`;
}

function freshnessTone(iso) {
  if (!iso) return "text-muted-foreground";
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hours < 1) return "text-profit";
  if (hours < 24) return "text-foreground";
  if (hours < 72) return "text-amber-500";
  return "text-loss";
}

/**
 * PriceHub — the single price-update entry point in the entire app.
 *
 * Architecture (post-Phase-4):
 *   1. Auto mode → invokes syncPrices and lets React Query invalidation
 *      do the rest. No cascade, no re-reads, no per-entity writes.
 *   2. Manual mode → upserts each typed price into the Prices entity via
 *      useEntityMutation. The same invalidation mechanism propagates the
 *      change to every consumer (usePrices, useAavePosition, dashboard
 *      hooks, every page using priceMap × entity).
 *
 * Constants (STABLECOINS, TOKEN_ALIAS_TO_BASE) come from portfolioMath so
 * there's a single source of truth shared with the compute functions.
 *
 * The overview table reads prices ONLY from the Prices entity now —
 * derived columns (current_price on stocks, current_price_usd on crypto
 * assets) are no longer consulted because they're computed at render time.
 */
export default function PriceHub({ open, onClose }) {
  const queryClient = useQueryClient();
  const pricesQ = useEntityList("Prices");
  const updatePrice = useEntityMutation("Prices", "update");
  const createPrice = useEntityMutation("Prices", "create");
  // We still want a ticker list of "everything we hold" so unmapped tokens
  // can prompt the user — those reads are entity reads, not price reads.
  const cryptoAssetsQ = useEntityList("CryptoAsset");
  const stocksQ = useEntityList("StockPosition", { filter: { status: "Holding" } });
  const leveragedQ = useEntityList("LeveragedPosition", { filter: { status: "Open" } });

  const [mode, setMode] = useState("overview");
  const [error, setError] = useState(null);
  const [manual, setManual] = useState({});
  const [manualExtras, setManualExtras] = useState({});

  const prices = pricesQ.data || [];
  const cryptoAssets = cryptoAssetsQ.data || [];
  const stocks = stocksQ.data || [];

  // Whenever the modal opens, refresh local state and reset to overview
  useEffect(() => {
    if (!open) return;
    setMode("overview");
    setError(null);
    const initial = {};
    prices.forEach((row) => { initial[row.asset] = row.price_usd || ""; });
    setManual(initial);
    setManualExtras({});
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Tracked symbols — used to drive the overview table and detect unmapped
  // tokens. Prices are read ONLY from the Prices entity.
  const tracked = useMemo(() => {
    const bySymbol = {};
    // 1. Every Prices row is a tracked symbol with its known price + freshness
    prices.forEach((p) => {
      bySymbol[p.asset] = {
        symbol: p.asset, kind: "crypto", price: p.price_usd, updated: p.last_updated, source: "Prices",
      };
    });
    // 2. Every held stock — even if Prices doesn't have a row, we want it surfaced
    stocks.forEach((s) => {
      if (!s.ticker) return;
      const sym = s.ticker.toUpperCase();
      if (!bySymbol[sym]) {
        bySymbol[sym] = { symbol: sym, kind: "stock", price: null, updated: null, source: "StockPosition" };
      } else {
        bySymbol[sym].kind = "stock";
      }
    });
    // 3. Every crypto asset token — same idea, no derived columns consulted
    cryptoAssets.forEach((a) => {
      if (!a.token) return;
      const sym = a.token.toUpperCase();
      if (bySymbol[sym]) return;
      bySymbol[sym] = { symbol: sym, kind: "crypto", price: null, updated: null, source: "CryptoAsset" };
    });
    // 4. Every open leveraged-position asset
    leveragedQ.data?.forEach((l) => {
      if (!l.asset) return;
      const sym = l.asset.toUpperCase();
      if (!bySymbol[sym]) {
        bySymbol[sym] = { symbol: sym, kind: "crypto", price: null, updated: null, source: "LeveragedPosition" };
      }
    });
    return Object.values(bySymbol).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [prices, stocks, cryptoAssets, leveragedQ.data]);

  const unmapped = useMemo(
    () => tracked.filter((t) => {
      const upper = t.symbol.toUpperCase();
      if (STABLECOINS.has(upper)) return false;
      if (TOKEN_ALIAS_TO_BASE[upper]) return false;
      return true;
    }),
    [tracked]
  );

  const staleCount = useMemo(
    () => tracked.filter((t) => {
      if (!t.updated) return true;
      const hours = (Date.now() - new Date(t.updated).getTime()) / 3600000;
      return hours > 48;
    }).length,
    [tracked]
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["entity"] });
    queryClient.invalidateQueries({ queryKey: ["function"] });
  };

  // ── AUTO fetch ──
  const handleAutoFetch = async () => {
    setMode("fetching");
    setError(null);
    try {
      const res = await base44.functions.invoke("syncPrices", {});
      if (res?.error) throw new Error(res.error);
      invalidateAll();
      setMode("done");
      toast.success("מחירים סונכרנו");
    } catch (e) {
      setError(e.message || "שגיאה בעדכון אוטומטי");
      setMode("error");
    }
  };

  // ── MANUAL save ──
  const handleManualSave = async () => {
    setMode("saving");
    setError(null);
    try {
      const now = new Date().toISOString();
      const allBase = {};
      Object.entries(manual).forEach(([k, v]) => {
        const p = parseFloat(v);
        if (p > 0) allBase[k.toUpperCase()] = p;
      });
      Object.entries(manualExtras).forEach(([k, v]) => {
        const p = parseFloat(v);
        if (p > 0) allBase[k.toUpperCase()] = p;
      });

      for (const [asset, price] of Object.entries(allBase)) {
        const existing = prices.find((p) => p.asset === asset);
        if (existing) {
          await updatePrice.mutateAsync({ id: existing.id, data: { price_usd: price, last_updated: now } });
        } else {
          await createPrice.mutateAsync({ asset, price_usd: price, last_updated: now });
        }
      }

      // useEntityMutation already invalidates the Prices cache; this is a
      // belt-and-suspenders broadcast in case any non-RQ consumer is still
      // listening (hooks like useAavePosition all rely on the Prices RQ
      // subscription so this is mostly redundant, but cheap).
      invalidateAll();
      setMode("done");
      toast.success("המחירים נשמרו");
    } catch (e) {
      setError(e.message || "שגיאה בשמירה");
      setMode("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            מרכז מחירים
          </DialogTitle>
        </DialogHeader>

        {mode === "overview" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              בחר מקור עדכון. שינוי מחיר ב-Prices מתעדכן אוטומטית בכל האפליקציה (דשבורדים, פוזיציות, מניות, aTokens — הכל מחושב on-the-fly).
            </p>

            {(staleCount > 0 || unmapped.length > 0) && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-1">
                {staleCount > 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{staleCount} מחירים ישנים (יותר מ-48 שעות). לחץ "עדכון אוטומטי" לרענון.</span>
                  </div>
                )}
                {unmapped.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      {unmapped.length} נכסים ללא מיפוי אוטומטי ({unmapped.map((u) => u.symbol).join(", ")}) — יש להזין מחיר ידני בלחיצה על "עדכון ידני".
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleAutoFetch} className="gap-2 h-auto py-3 flex-col items-start">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  <span className="font-semibold">עדכון אוטומטי</span>
                </div>
                <span className="text-[10px] opacity-80 font-normal text-right">
                  משיכת מחירים מהאינטרנט (BTC/ETH/AAVE + מניות) ושמירה ל-Prices
                </span>
              </Button>
              <Button variant="outline" onClick={() => setMode("manual")} className="gap-2 h-auto py-3 flex-col items-start">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  <span className="font-semibold">עדכון ידני</span>
                </div>
                <span className="text-[10px] opacity-80 font-normal text-right">
                  הזנת מחירים ידנית, כולל נכסים ללא מיפוי אוטומטי
                </span>
              </Button>
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-right px-3 py-2 font-medium">נכס</th>
                    <th className="text-right px-3 py-2 font-medium">מחיר נוכחי</th>
                    <th className="text-right px-3 py-2 font-medium">עדכון אחרון</th>
                    <th className="text-right px-3 py-2 font-medium">מיפוי</th>
                  </tr>
                </thead>
                <tbody>
                  {tracked.map((t) => {
                    const upper = t.symbol.toUpperCase();
                    const isStable = STABLECOINS.has(upper);
                    const base = TOKEN_ALIAS_TO_BASE[upper];
                    const isUnmapped = !isStable && !base;
                    return (
                      <tr key={t.symbol} className="border-b border-border/40">
                        <td className="px-3 py-2 font-mono font-semibold">
                          {t.symbol}
                          <span className="mr-1 text-[10px] text-muted-foreground font-normal">
                            {t.kind === "crypto" ? "crypto" : "stock"}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono">{fmtPrice(t.price)}</td>
                        <td className={`px-3 py-2 text-xs ${freshnessTone(t.updated)}`}>
                          <Clock className="w-3 h-3 inline ml-1 opacity-60" />
                          {timeAgo(t.updated)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {isStable && <span className="text-profit">stablecoin → $1</span>}
                          {base && base !== upper && <span className="text-muted-foreground">→ {base}</span>}
                          {base && base === upper && <span className="text-muted-foreground">base</span>}
                          {isUnmapped && <span className="text-amber-600">ידני נדרש</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {tracked.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-4 text-muted-foreground text-xs">אין נכסים</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Manual mode */}
        {mode === "manual" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              הזן מחירים עדכניים. השינויים נשמרים ל-Prices entity ומופיעים מיד בכל הדפים — derived values (current_value, mark_price וכו׳) מחושבים on-the-fly.
            </p>

            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">מחירי בסיס</p>
              {["BTC", "ETH", "AAVE", "MSTR"].map((asset) => {
                const existing = prices.find((p) => p.asset === asset);
                return (
                  <div key={asset} className="flex items-center gap-3">
                    <label className="w-20 text-sm font-semibold font-mono">{asset}</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={manual[asset] ?? ""}
                      onChange={(e) => setManual((p) => ({ ...p, [asset]: e.target.value }))}
                      className="flex-1 font-mono"
                      placeholder={existing?.price_usd?.toString() || "0"}
                    />
                    <span className="text-xs text-muted-foreground w-24 text-left">
                      {existing?.last_updated ? timeAgo(existing.last_updated) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            {unmapped.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                  נכסים ללא מיפוי — הזן מחיר ידני
                </p>
                {unmapped.map((t) => (
                  <div key={t.symbol} className="flex items-center gap-3">
                    <label className="w-20 text-sm font-semibold font-mono">{t.symbol}</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={manualExtras[t.symbol] ?? ""}
                      onChange={(e) => setManualExtras((p) => ({ ...p, [t.symbol]: e.target.value }))}
                      className="flex-1 font-mono"
                      placeholder={t.price?.toString() || "0"}
                    />
                    <span className="text-xs text-muted-foreground w-24 text-left">
                      {t.updated ? timeAgo(t.updated) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setMode("overview")} className="flex-1">חזרה</Button>
              <Button onClick={handleManualSave} className="flex-1">שמור</Button>
            </div>
          </div>
        )}

        {mode === "fetching" && (
          <div className="py-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-semibold">מושך מחירים חיים מהאינטרנט</p>
            <p className="text-xs text-muted-foreground">syncPrices רץ ברקע...</p>
          </div>
        )}

        {mode === "saving" && (
          <div className="py-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-semibold">שומר ל-Prices entity</p>
          </div>
        )}

        {mode === "done" && (
          <div className="py-6 space-y-4 text-center">
            <CheckCircle2 className="w-10 h-10 text-profit mx-auto" />
            <p className="font-semibold">המערכת עודכנה</p>
            <p className="text-xs text-muted-foreground">
              כל הדפים והדשבורדים השתמשו בעדכון מיידית.
            </p>
            <Button className="w-full" onClick={onClose}>סגור</Button>
          </div>
        )}

        {mode === "error" && (
          <div className="py-6 space-y-4 text-center">
            <AlertTriangle className="w-10 h-10 text-loss mx-auto" />
            <p className="font-semibold text-loss">שגיאה</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("overview")}>חזרה</Button>
              <Button className="flex-1" onClick={onClose}>סגור</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
