import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";

const fmt = (v, d = 0) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

export default function PriceUpdateModal({ open, onClose, onUpdated, prices = [] }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [manualPrices, setManualPrices] = useState({});

  useEffect(() => {
    if (open) {
      setResult(null);
      const initial = {};
      prices.forEach(p => { initial[p.asset] = p.price_usd || ''; });
      setManualPrices(initial);
    }
  }, [open, prices]);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      for (const [asset, price] of Object.entries(manualPrices)) {
        if (price) {
          const existing = prices.find(p => p.asset === asset);
          if (existing) {
            await base44.entities.Prices.update(existing.id, { price_usd: parseFloat(price), last_updated: new Date().toISOString() });
          } else {
            await base44.entities.Prices.create({ asset, price_usd: parseFloat(price), last_updated: new Date().toISOString() });
          }
        }
      }
      setResult({ success: true });
      setLoading(false);
      onUpdated && onUpdated();
    } catch (e) {
      setResult({ success: false, error: e.message });
      setLoading(false);
    }
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

        {!result ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">הזן מחירי קריפטו עדכניים:</p>
            <div className="space-y-2">
              {['BTC', 'ETH', 'AAVE', 'MSTR'].map(asset => (
                <div key={asset} className="flex items-center gap-2">
                  <label className="w-12 text-sm font-medium">{asset}</label>
                  <input 
                    type="number" 
                    value={manualPrices[asset] || ''} 
                    onChange={(e) => setManualPrices(p => ({ ...p, [asset]: e.target.value }))} 
                    className="flex-1 px-2 py-1 border border-border rounded text-sm font-mono" 
                    placeholder="0" 
                  />
                </div>
              ))}
            </div>
            <Button className="w-full gap-2" onClick={handleUpdate} disabled={loading}>
              {loading
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> משדכן...</>
                : <><RefreshCw className="w-4 h-4" /> עדכן מחירים</>
              }
            </Button>
          </div>
        ) : result.success ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-profit">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold text-sm">עדכון הושלם בהצלחה!</span>
            </div>
            <div className="bg-profit/10 rounded-lg p-3">
              <p className="text-xs text-profit">המחירים עודכנו בכל המערכת</p>
            </div>
            <Button className="w-full" onClick={onClose}>סגור</Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-loss">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold text-sm">שגיאה בעדכון</span>
            </div>
            <p className="text-xs text-loss">{result.error}</p>
            <Button className="w-full" onClick={onClose}>סגור</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}