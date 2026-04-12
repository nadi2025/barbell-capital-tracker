import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw, TrendingUp, Bitcoin, Coins } from "lucide-react";

const BTC_TOKENS = ["awBTC", "wBTC", "BTC"];
const ETH_TOKENS = ["aETH", "ETH"];
const AAVE_TOKENS = ["aAAVE", "AAVE"];
const STABLE_TOKENS = ["USDC", "USDT", "DAI", "aUSDC"];

const fmt = (v, d = 0) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

export default function PriceUpdateModal({ open, onClose, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null); // null = form view, object = results view

  useEffect(() => {
    if (open) setSummary(null);
  }, [open]);

  const handleUpdate = async () => {
    setLoading(true);
    // Fetch live prices via backend function
    const res = await base44.functions.invoke('fetchLivePrices', {});
    const livePrices = res.data;
    const btc = livePrices?.crypto?.BTC || 0;
    const eth = livePrices?.crypto?.ETH || 0;
    const aave = livePrices?.crypto?.AAVE || 0;
    const stockPrices = livePrices?.stocks || {};

    const assets = await base44.entities.CryptoAsset.list();
    const today = new Date().toISOString().split("T")[0];
    const updatedAssets = [];

    await Promise.all(assets.map(async asset => {
      let price = null;
      if (BTC_TOKENS.includes(asset.token) && btc > 0) price = btc;
      else if (ETH_TOKENS.includes(asset.token) && eth > 0) price = eth;
      else if (AAVE_TOKENS.includes(asset.token) && aave > 0) price = aave;
      else if (STABLE_TOKENS.includes(asset.token)) price = 1;
      if (price === null) return;
      const current_value_usd = (asset.amount || 0) * price;
      await base44.entities.CryptoAsset.update(asset.id, { current_price_usd: price, current_value_usd, last_updated: today });
      updatedAssets.push({ token: asset.token, amount: asset.amount, newPrice: price, newValue: current_value_usd });
    }));

    // Update stock positions
    const stocks = await base44.entities.StockPosition.list();
    const updatedStocks = [];
    await Promise.all(stocks.filter(s => s.status !== "Closed").map(async stock => {
      const p = stockPrices[stock.ticker];
      if (!p) return;
      const current_value = (stock.shares || 0) * p;
      const invested = stock.invested_value || (stock.shares || 0) * (stock.average_cost || 0);
      await base44.entities.StockPosition.update(stock.id, {
        current_price: p,
        current_value,
        gain_loss: current_value - invested,
        gain_loss_pct: invested > 0 ? (current_value - invested) / invested : 0,
      });
      updatedStocks.push({ ticker: stock.ticker, shares: stock.shares, newPrice: p, newValue: current_value });
    }));

    // Snapshot
    const allAssets = await base44.entities.CryptoAsset.list();
    const totalAssets = allAssets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
    const loans = await base44.entities.CryptoLoan.filter({ status: "Active" });
    const totalDebt = loans.reduce((s, l) => s + (l.principal_usd || 0), 0);
    await base44.entities.PortfolioSnapshot.create({
      snapshot_date: today, total_assets_usd: totalAssets, total_debt_usd: totalDebt,
      net_value_usd: totalAssets - totalDebt, btc_price: btc || null, eth_price: eth || null, aave_price: aave || null,
    });

    setSummary({ cryptoPrices: { BTC: btc, ETH: eth, AAVE: aave }, updatedAssets, updatedStocks, totalAssets, totalDebt });
    setLoading(false);
    onUpdated && onUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            עדכון מחירים
          </DialogTitle>
        </DialogHeader>

        {!summary ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">לחץ על הכפתור כדי לשלוף מחירי קריפטו ומניות בזמן אמת ולעדכן את כל הנכסים אוטומטית.</p>
            <ul className="text-xs text-muted-foreground space-y-1 bg-muted/40 rounded-lg p-3">
              <li>₿ BTC, ETH, AAVE — מחיר שוק עדכני</li>
              <li>📈 MSTR, MARA, SBET, BMNR, STRC — מחיר מניה</li>
              <li>💵 Stablecoins — נשאר $1</li>
              <li>📸 Snapshot אוטומטי יישמר</li>
            </ul>
            <Button className="w-full gap-2" onClick={handleUpdate} disabled={loading}>
              {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> מעדכן מחירים...</> : <><RefreshCw className="w-4 h-4" /> עדכן מחירים עכשיו</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-profit">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold text-sm">עדכון הושלם בהצלחה!</span>
            </div>

            {/* Crypto prices */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">מחירי קריפטו</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(summary.cryptoPrices).filter(([, v]) => v > 0).map(([token, price]) => (
                  <div key={token} className="bg-muted/40 rounded-lg p-2 text-center">
                    <p className="text-xs text-muted-foreground">{token}</p>
                    <p className="text-sm font-bold font-mono">{fmt(price)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Updated crypto assets */}
            {summary.updatedAssets.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">נכסי קריפטו שעודכנו ({summary.updatedAssets.length})</p>
                <div className="space-y-1.5">
                  {summary.updatedAssets.map((a, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <Coins className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-sm font-medium">{a.token}</span>
                        <span className="text-xs text-muted-foreground">{a.amount?.toFixed(4)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">{fmt(a.newPrice, 2)} → </span>
                        <span className="text-sm font-mono font-semibold">{fmt(a.newValue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Updated stocks */}
            {summary.updatedStocks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">מניות שעודכנו ({summary.updatedStocks.length})</p>
                <div className="space-y-1.5">
                  {summary.updatedStocks.map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-primary" />
                        <span className="text-sm font-medium">{s.ticker}</span>
                        <span className="text-xs text-muted-foreground">{s.shares} מניות</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">{fmt(s.newPrice, 2)}/מניה → </span>
                        <span className="text-sm font-mono font-semibold">{fmt(s.newValue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Snapshot summary */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-primary mb-1">📸 Snapshot נשמר</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">סה״כ נכסי קריפטו</span>
                <span className="font-mono font-semibold">{fmt(summary.totalAssets)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">סה״כ חוב קריפטו</span>
                <span className="font-mono font-semibold text-loss">{fmt(summary.totalDebt)}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-border/40 mt-1 pt-1">
                <span className="text-muted-foreground font-semibold">NAV קריפטו</span>
                <span className={`font-mono font-bold ${summary.totalAssets - summary.totalDebt >= 0 ? "text-profit" : "text-loss"}`}>{fmt(summary.totalAssets - summary.totalDebt)}</span>
              </div>
            </div>

            <Button className="w-full" onClick={onClose}>סגור</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}