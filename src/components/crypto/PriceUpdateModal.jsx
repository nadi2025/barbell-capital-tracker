import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";

const fmt = (v, d = 0) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

export default function PriceUpdateModal({ open, onClose, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) setResult(null);
  }, [open]);

  const handleUpdate = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('fetchLivePrices', {});
    setResult(res.data);
    setLoading(false);
    onUpdated && onUpdated();
  };

  const cryptoPrices = result?.crypto || {};
  const stockPrices = result?.stocks || {};

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            עדכון מחירים
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">לחץ על הכפתור כדי לשלוף מחירי קריפטו ומניות בזמן אמת ולעדכן את כל הנכסים אוטומטית.</p>
            <ul className="text-xs text-muted-foreground space-y-1 bg-muted/40 rounded-lg p-3">
              <li>₿ BTC, ETH, AAVE — מחיר שוק עדכני</li>
              <li>📈 מניות מ-IB — מחיר מניה עדכני</li>
              <li>💵 Stablecoins — נשאר $1</li>
              <li>📸 Snapshot אוטומטי יישמר</li>
            </ul>
            <Button className="w-full gap-2" onClick={handleUpdate} disabled={loading}>
              {loading
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> מעדכן מחירים...</>
                : <><RefreshCw className="w-4 h-4" /> עדכן מחירים עכשיו</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-profit">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold text-sm">עדכון הושלם בהצלחה!</span>
            </div>

            {/* Crypto prices */}
            {Object.keys(cryptoPrices).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">מחירי קריפטו</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(cryptoPrices).filter(([, v]) => v > 0).map(([token, price]) => (
                    <div key={token} className="bg-muted/40 rounded-lg p-2 text-center">
                      <p className="text-xs text-muted-foreground">{token}</p>
                      <p className="text-sm font-bold font-mono">{fmt(price, token === "AAVE" ? 2 : 0)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stock prices */}
            {Object.keys(stockPrices).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">מחירי מניות</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(stockPrices).map(([ticker, price]) => (
                    <div key={ticker} className="bg-muted/40 rounded-lg p-2 text-center">
                      <p className="text-xs text-muted-foreground">{ticker}</p>
                      <p className="text-sm font-bold font-mono">{fmt(price, 2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed tickers */}
            {result.tickers_failed?.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>לא עודכנו: {result.tickers_failed.join(", ")}</span>
              </div>
            )}

            <Button className="w-full" onClick={onClose}>סגור</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}