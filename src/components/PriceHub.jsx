import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, RefreshCw, AlertTriangle, Zap, Edit3, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
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

// Stablecoins — always pegged to $1
const STABLECOINS = new Set(["USDC", "USDT", "DAI", "BUSD", "TUSD", "FDUSD", "GUSD", "USDP"]);

// Each alias maps to its base asset symbol. The auto-fetch updates the BASE
// price, then this map cascades to every wrapped/aToken variant.
const TOKEN_ALIAS_TO_BASE = {
  BTC: "BTC", WBTC: "BTC", AWBTC: "BTC", CBBTC: "BTC",
  ETH: "ETH", WETH: "ETH", AETH: "ETH", AWETH: "ETH", STETH: "ETH", WSTETH: "ETH",
  AAVE: "AAVE", AAAVE: "AAVE",
  MSTR: "MSTR",
  MARA: "MARA",
  BMNR: "BMNR",
  SBET: "SBET",
  STRC: "STRC",
  UNI: "UNI", AUNI: "UNI",
};

function resolvePrice(token, baseMap, manualOverrides = {}) {
  if (!token) return { price: null, source: null };
  const upper = token.toUpperCase();
  if (STABLECOINS.has(upper)) return { price: 1, source: "stablecoin" };
  const base = TOKEN_ALIAS_TO_BASE[upper];
  if (base && baseMap[base] > 0) return { price: baseMap[base], source: `base:${base}` };
  if (manualOverrides[upper] != null) return { price: manualOverrides[upper], source: "manual" };
  if (baseMap[upper] > 0) return { price: baseMap[upper], source: "direct" };
  return { price: null, source: null };
}

/**
 * Unified Price Hub — single source of truth for all tracked asset prices.
 *
 * Auto mode:
 *   1. Invokes dailyFullUpdate (fetches via LLM+internet, updates Prices entity,
 *      LeveragedPosition, CryptoOptionsPosition, StockPosition)
 *   2. Re-reads Prices entity to get fresh prices
 *   3. Cascades to every CryptoAsset (including aTokens/wrapped) using the
 *      alias map + stablecoin constant. Updates current_price_usd, current_value_usd,
 *      last_updated on each.
 *
 * Manual mode:
 *   1. User enters prices for BTC/ETH/AAVE/MSTR plus any "unmapped" tokens the
 *      hub flagged (e.g. UNI)
 *   2. Writes to Prices entity + cascades to CryptoAsset/LeveragedPosition/StockPosition
 *
 * After any update: invalidate all TanStack queries so every dashboard
 * consumer refreshes immediately.
 */
export default function PriceHub({ open, onClose }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("overview");
  const [error, setError] = useState(null);
  const [prices, setPrices] = useState([]);
  const [cryptoAssets, setCryptoAssets] = useState([]);
  const [leveraged, setLeveraged] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [manual, setManual] = useState({});
  const [manualExtras, setManualExtras] = useState({}); // for UNMAPPED tokens (e.g. UNI)

  useEffect(() => {
    if (!open) return;
    setMode("overview");
    setError(null);
    (async () => {
      const [p, ca, lev, st] = await Promise.all([
        base44.entities.Prices.list(),
        base44.entities.CryptoAsset.list(),
        base44.entities.LeveragedPosition.filter({ status: "Open" }),
        base44.entities.StockPosition.filter({ status: "Holding" }),
      ]);
      setPrices(p || []);
      setCryptoAssets(ca || []);
      setLeveraged(lev || []);
      setStocks(st || []);
      const initial = {};
      (p || []).forEach((row) => { initial[row.asset] = row.price_usd || ""; });
      setManual(initial);
    })();
  }, [open]);

  // Current base-price map built from Prices entity
  const basePriceMap = useMemo(() => {
    const m = {};
    prices.forEach((row) => { m[row.asset?.toUpperCase()] = row.price_usd; });
    return m;
  }, [prices]);

  // All unique tokens in use across CryptoAsset / StockPosition — used to build
  // the "tracked" table and detect unmapped tokens.
  const tracked = useMemo(() => {
    const bySymbol = {};
    prices.forEach((p) => {
      bySymbol[p.asset] = {
        symbol: p.asset, kind: "crypto", price: p.price_usd, updated: p.last_updated, source: "Prices",
      };
    });
    stocks.forEach((s) => {
      if (!s.ticker) return;
      const sym = s.ticker.toUpperCase();
      if (!bySymbol[sym]) {
        bySymbol[sym] = { symbol: sym, kind: "stock", price: s.current_price, updated: s.last_updated, source: "StockPosition" };
      } else {
        bySymbol[sym].kind = "stock";
      }
    });
    cryptoAssets.forEach((a) => {
      if (!a.token) return;
      const sym = a.token.toUpperCase();
      if (bySymbol[sym]) return;
      bySymbol[sym] = { symbol: sym, kind: "crypto", price: a.current_price_usd, updated: a.last_updated, source: "CryptoAsset" };
    });
    return Object.values(bySymbol).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [prices, stocks, cryptoAssets]);

  // Tokens the Hub cannot resolve (not in alias map + not a stablecoin).
  // These need manual entry from the user.
  const unmapped = useMemo(() => {
    return tracked.filter((t) => {
      const upper = t.symbol.toUpperCase();
      if (STABLECOINS.has(upper)) return false;
      if (TOKEN_ALIAS_TO_BASE[upper]) return false;
      return true;
    });
  }, [tracked]);

  const staleCount = useMemo(() => {
    return tracked.filter((t) => {
      if (!t.updated) return true;
      const hours = (Date.now() - new Date(t.updated).getTime()) / 3600000;
      return hours > 48;
    }).length;
  }, [tracked]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["entity"] });
    queryClient.invalidateQueries({ queryKey: ["function"] });
  };

  /**
   * Cascade a base-price map to every CryptoAsset, LeveragedPosition,
   * StockPosition and Prices entity row that depends on it.
   */
  const cascade = async (baseMap, extras = {}) => {
    const now = new Date().toISOString();
    const nowDate = now.slice(0, 10);

    // 1. Upsert Prices entity for each base + any manual extras
    const allBase = { ...baseMap };
    Object.entries(extras).forEach(([k, v]) => {
      const p = parseFloat(v);
      if (p > 0) allBase[k.toUpperCase()] = p;
    });
    for (const [asset, price] of Object.entries(allBase)) {
      if (!(price > 0)) continue;
      // Only persist BTC/ETH/AAVE/MSTR in Prices entity (per schema enum)
      if (!["BTC", "ETH", "AAVE", "MSTR"].includes(asset)) continue;
      const existing = prices.find((p) => p.asset === asset);
      if (existing) {
        await base44.entities.Prices.update(existing.id, { price_usd: price, last_updated: now });
      } else {
        await base44.entities.Prices.create({ asset, price_usd: price, last_updated: now });
      }
    }

    // 2. CryptoAsset cascade — walks every row and resolves via alias/stablecoin/extras
    let caUpdated = 0, caSkipped = 0;
    for (const a of cryptoAssets) {
      const { price } = resolvePrice(a.token, allBase, extras);
      if (price == null || !(price > 0)) { caSkipped++; continue; }
      await base44.entities.CryptoAsset.update(a.id, {
        current_price_usd: price,
        current_value_usd: price * (a.amount || 0),
        last_updated: nowDate,
      });
      caUpdated++;
    }

    // 3. LeveragedPosition cascade (by asset symbol)
    for (const l of leveraged) {
      if (!l.asset) continue;
      const { price } = resolvePrice(l.asset, allBase, extras);
      if (price == null || !(price > 0)) continue;
      await base44.entities.LeveragedPosition.update(l.id, {
        mark_price: price,
        position_value_usd: price * (l.size || 0),
      });
    }

    // 4. StockPosition cascade (by ticker)
    for (const s of stocks) {
      if (!s.ticker) continue;
      const { price } = resolvePrice(s.ticker, allBase, extras);
      if (price == null || !(price > 0)) continue;
      const current_value = price * (s.shares || 0);
      const invested = (s.invested_value) || ((s.average_cost || 0) * (s.shares || 0));
      const gain_loss = current_value - invested;
      const gain_loss_pct = invested > 0 ? gain_loss / invested : 0;
      await base44.entities.StockPosition.update(s.id, {
        current_price: price, current_value, gain_loss, gain_loss_pct,
      });
    }

    return { cryptoAssetsUpdated: caUpdated, cryptoAssetsSkipped: caSkipped };
  };

  // ── AUTO fetch ──
  const handleAutoFetch = async () => {
    setMode("fetching");
    setError(null);
    try {
      const res = await base44.functions.invoke("dailyFullUpdate", {});
      if (res?.error) throw new Error(res.error);

      // Re-read Prices entity to get fresh data before cascading
      const freshPrices = await base44.entities.Prices.list();
      const baseMap = {};
      freshPrices.forEach((p) => { baseMap[p.asset?.toUpperCase()] = p.price_usd; });
      // Also re-read stocks (dailyFullUpdate may have updated them, but we want
      // the current_price to feed the stocks alias map — but stocks are
      // already used directly, so only care about Prices for cascade base)

      const cas = await base44.entities.CryptoAsset.list();
      const lev = await base44.entities.LeveragedPosition.filter({ status: "Open" });
      const st = await base44.entities.StockPosition.filter({ status: "Holding" });
      setCryptoAssets(cas);
      setLeveraged(lev);
      setStocks(st);

      const cascadeRes = await cascade(baseMap, manualExtras);

      invalidateAll();
      setMode("done");
      toast.success(`מחירים עודכנו · ${cascadeRes.cryptoAssetsUpdated} נכסי קריפטו סונכרנו${cascadeRes.cryptoAssetsSkipped ? ` · ${cascadeRes.cryptoAssetsSkipped} דורשים מחיר ידני` : ""}`);
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
      const baseMap = {};
      Object.entries(manual).forEach(([a, v]) => {
        const p = parseFloat(v);
        if (p > 0) baseMap[a.toUpperCase()] = p;
      });

      await cascade(baseMap, manualExtras);
      invalidateAll();
      setMode("done");
      toast.success("המחירים נשמרו והופצו לכל האפליקציה");
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
              בחר מקור עדכון. המחירים שיעודכנו יופצו אוטומטית לכל האפליקציה (דשבורדים, פוזיציות, מניות, כולל aToken).
            </p>

            {/* Stale warning banner */}
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

            {/* Quick action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleAutoFetch} className="gap-2 h-auto py-3 flex-col items-start">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  <span className="font-semibold">עדכון אוטומטי</span>
                </div>
                <span className="text-[10px] opacity-80 font-normal text-right">
                  משיכת מחירים מהאינטרנט + עדכון כל הפוזיציות + cascade ל-CryptoAsset
                </span>
              </Button>
              <Button variant="outline" onClick={() => setMode("manual")} className="gap-2 h-auto py-3 flex-col items-start">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  <span className="font-semibold">עדכון ידני</span>
                </div>
                <span className="text-[10px] opacity-80 font-normal text-right">
                  הזנת מחירים ידנית + הפצה אוטומטית
                </span>
              </Button>
            </div>

            {/* Current state table */}
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
              הזן מחירים עדכניים. המערכת תפיץ אוטומטית לכל הנגזרות (aAAVE מ-AAVE, aETH מ-ETH וכו׳) ותעדכן סטבליים ל-$1.
            </p>

            {/* Base prices */}
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

            {/* Unmapped tokens — need manual entry */}
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
              <Button onClick={handleManualSave} className="flex-1">שמור והפיץ</Button>
            </div>
          </div>
        )}

        {mode === "fetching" && (
          <div className="py-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-semibold">מושך מחירים חיים מהאינטרנט</p>
            <p className="text-xs text-muted-foreground">מעדכן פוזיציות + מפיץ ל-CryptoAsset...</p>
          </div>
        )}

        {mode === "saving" && (
          <div className="py-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-semibold">שומר ומפיץ לכל האפליקציה</p>
          </div>
        )}

        {mode === "done" && (
          <div className="py-6 space-y-4 text-center">
            <CheckCircle2 className="w-10 h-10 text-profit mx-auto" />
            <p className="font-semibold">המערכת עודכנה בהצלחה</p>
            <p className="text-xs text-muted-foreground">
              כל הדשבורדים והפוזיציות משתמשים כעת במחירים החדשים.
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
