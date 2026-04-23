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

/**
 * Unified Price Hub — single source of truth for all tracked asset prices.
 *
 * Auto mode: invokes dailyFullUpdate (fetches via LLM+internet, cascades to all entities).
 * Manual mode: user edits prices, we save to Prices entity AND cascade to
 *   CryptoAsset, LeveragedPosition, CryptoOptionsPosition, StockPosition.
 *
 * After any update: invalidate all TanStack queries so Dashboard / CryptoDashboard /
 * StocksPage / OptionsPage / LeveragedPage all refresh automatically.
 */
export default function PriceHub({ open, onClose }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("overview"); // overview | manual | fetching | saving | done | error
  const [error, setError] = useState(null);
  const [prices, setPrices] = useState([]);
  const [cryptoAssets, setCryptoAssets] = useState([]);
  const [leveraged, setLeveraged] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [manual, setManual] = useState({});

  // Load current prices whenever modal opens
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

  // Derive a unified list of all tracked symbols with their current price + freshness
  const tracked = useMemo(() => {
    const bySymbol = {};
    // Core crypto prices (BTC/ETH/AAVE/MSTR) from Prices entity
    prices.forEach((p) => {
      bySymbol[p.asset] = {
        symbol: p.asset,
        kind: "crypto",
        price: p.price_usd,
        updated: p.last_updated,
        source: "Prices",
      };
    });
    // Stock tickers from StockPosition
    stocks.forEach((s) => {
      if (!s.ticker) return;
      const sym = s.ticker.toUpperCase();
      if (bySymbol[sym]) {
        bySymbol[sym].kind = "stock";
        return;
      }
      bySymbol[sym] = {
        symbol: sym,
        kind: "stock",
        price: s.current_price,
        updated: s.last_updated || null,
        source: "StockPosition",
      };
    });
    // Any additional crypto asset symbols not already represented
    cryptoAssets.forEach((a) => {
      if (!a.token) return;
      const sym = a.token.toUpperCase();
      if (bySymbol[sym]) return;
      bySymbol[sym] = {
        symbol: sym,
        kind: "crypto",
        price: a.current_price_usd,
        updated: a.last_updated,
        source: "CryptoAsset",
      };
    });
    return Object.values(bySymbol).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [prices, stocks, cryptoAssets]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["entity"] });
    queryClient.invalidateQueries({ queryKey: ["function"] });
  };

  // ── AUTO fetch (uses existing Deno function) ──
  const handleAutoFetch = async () => {
    setMode("fetching");
    setError(null);
    try {
      const res = await base44.functions.invoke("dailyFullUpdate", {});
      if (res?.error) throw new Error(res.error);
      invalidateAll();
      setMode("done");
      toast.success("כל המחירים עודכנו");
    } catch (e) {
      setError(e.message || "שגיאה בעדכון אוטומטי");
      setMode("error");
    }
  };

  // ── MANUAL save — writes to Prices, CryptoAsset, LeveragedPosition, StockPosition ──
  const handleManualSave = async () => {
    setMode("saving");
    setError(null);
    try {
      const now = new Date().toISOString();

      // 1. Upsert Prices entity (BTC/ETH/AAVE/MSTR)
      for (const [asset, value] of Object.entries(manual)) {
        const price = parseFloat(value);
        if (!price || price <= 0) continue;
        const existing = prices.find((p) => p.asset === asset);
        if (existing) {
          await base44.entities.Prices.update(existing.id, { price_usd: price, last_updated: now });
        } else {
          await base44.entities.Prices.create({ asset, price_usd: price, last_updated: now });
        }
      }

      // Build lookup for cascade
      const priceMap = {};
      Object.entries(manual).forEach(([a, v]) => {
        const p = parseFloat(v);
        if (p > 0) priceMap[a.toUpperCase()] = p;
      });

      // 2. Cascade to LeveragedPosition (mark_price + position_value_usd)
      await Promise.all(
        leveraged
          .filter((l) => l.asset && priceMap[l.asset.toUpperCase()])
          .map((l) => {
            const p = priceMap[l.asset.toUpperCase()];
            return base44.entities.LeveragedPosition.update(l.id, {
              mark_price: p,
              position_value_usd: p * (l.size || 0),
            });
          })
      );

      // 3. Cascade to StockPosition (only for tickers we have prices for)
      await Promise.all(
        stocks
          .filter((s) => s.ticker && priceMap[s.ticker.toUpperCase()])
          .map((s) => {
            const p = priceMap[s.ticker.toUpperCase()];
            const current_value = p * (s.shares || 0);
            const invested = (s.invested_value) || ((s.average_cost || 0) * (s.shares || 0));
            const gain_loss = current_value - invested;
            const gain_loss_pct = invested > 0 ? gain_loss / invested : 0;
            return base44.entities.StockPosition.update(s.id, {
              current_price: p,
              current_value,
              gain_loss,
              gain_loss_pct,
            });
          })
      );

      // 4. Cascade to CryptoAsset (current_price_usd + current_value_usd + last_updated)
      const tokenPriceMap = {
        BTC: priceMap.BTC,
        WBTC: priceMap.BTC,
        AWBTC: priceMap.BTC,
        ETH: priceMap.ETH,
        WETH: priceMap.ETH,
        AETH: priceMap.ETH,
        AAVE: priceMap.AAVE,
        AAAVE: priceMap.AAVE,
        MSTR: priceMap.MSTR,
      };
      await Promise.all(
        cryptoAssets
          .filter((a) => a.token && tokenPriceMap[a.token.toUpperCase()])
          .map((a) => {
            const p = tokenPriceMap[a.token.toUpperCase()];
            return base44.entities.CryptoAsset.update(a.id, {
              current_price_usd: p,
              current_value_usd: p * (a.amount || 0),
              last_updated: now.slice(0, 10), // date format
            });
          })
      );

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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            מרכז מחירים
          </DialogTitle>
        </DialogHeader>

        {/* Overview — shows current state of all tracked prices */}
        {mode === "overview" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              בחר מקור עדכון. המחירים שיעודכנו יופצו אוטומטית לכל האפליקציה (דשבורדים, פוזיציות, מניות).
            </p>

            {/* Quick action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleAutoFetch} className="gap-2 h-auto py-3 flex-col items-start">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  <span className="font-semibold">עדכון אוטומטי</span>
                </div>
                <span className="text-[10px] opacity-80 font-normal text-right">
                  משיכת מחירים מהאינטרנט + עדכון כל הפוזיציות
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
                    <th className="text-right px-3 py-2 font-medium">מקור</th>
                  </tr>
                </thead>
                <tbody>
                  {tracked.map((t) => (
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
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t.source}</td>
                    </tr>
                  ))}
                  {tracked.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-muted-foreground text-xs">
                        אין נכסים להצגה
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Manual mode */}
        {mode === "manual" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              הזן את המחירים העדכניים. המחירים ייכתבו ל-Prices, CryptoAsset (כולל awBTC/aETH), LeveragedPosition ו-StockPosition.
            </p>
            <div className="space-y-2">
              {["BTC", "ETH", "AAVE", "MSTR"].map((asset) => {
                const existing = prices.find((p) => p.asset === asset);
                return (
                  <div key={asset} className="flex items-center gap-3">
                    <label className="w-16 text-sm font-semibold font-mono">{asset}</label>
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
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setMode("overview")} className="flex-1">
                חזרה
              </Button>
              <Button onClick={handleManualSave} className="flex-1">
                שמור והפיץ
              </Button>
            </div>
          </div>
        )}

        {mode === "fetching" && (
          <div className="py-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-semibold">מושך מחירים חיים מהאינטרנט</p>
            <p className="text-xs text-muted-foreground">ומעדכן את כל הפוזיציות...</p>
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
              כל הדשבורדים והפוזיציות משתמשים כעת במחירים החדשים
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
