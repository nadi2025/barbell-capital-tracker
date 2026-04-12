import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

const TYPE_COLORS = {
  Crypto: "bg-orange-100 text-orange-700 border-orange-200",
  Stock: "bg-blue-100 text-blue-700 border-blue-200",
  Other: "bg-muted text-muted-foreground",
};

const EMPTY_FORM = { symbol: "", name: "", current_price_usd: "", coingecko_id: "", asset_type: "Crypto", notes: "" };

export default function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    const data = await base44.entities.Asset.list("symbol", 100);
    setAssets(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditAsset(null); setForm(EMPTY_FORM); setDialog(true); };
  const openEdit = (a) => {
    setEditAsset(a);
    setForm({ symbol: a.symbol, name: a.name || "", current_price_usd: a.current_price_usd || "", coingecko_id: a.coingecko_id || "", asset_type: a.asset_type || "Crypto", notes: a.notes || "" });
    setDialog(true);
  };

  const handleSave = async () => {
    if (!form.symbol) { toast.error("Symbol is required"); return; }
    const data = {
      symbol: form.symbol.toUpperCase().trim(),
      name: form.name,
      current_price_usd: form.current_price_usd ? parseFloat(form.current_price_usd) : null,
      coingecko_id: form.coingecko_id,
      asset_type: form.asset_type,
      notes: form.notes,
      last_updated: form.current_price_usd ? new Date().toISOString() : null,
    };
    if (editAsset) {
      await base44.entities.Asset.update(editAsset.id, data);
      toast.success("נכס עודכן");
    } else {
      await base44.entities.Asset.create(data);
      toast.success("נכס נוסף");
    }
    setDialog(false);
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.Asset.delete(id);
    toast.success("נכס נמחק");
    load();
  };

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    try {
      await base44.functions.invoke("fetchLivePrices", {});
      toast.success("מחירים עודכנו");
      load();
    } catch (e) {
      toast.error("שגיאה בעדכון: " + e.message);
    }
    setRefreshing(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const cryptoAssets = assets.filter(a => a.asset_type === "Crypto");
  const stockAssets = assets.filter(a => a.asset_type === "Stock");
  const otherAssets = assets.filter(a => a.asset_type === "Other");

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ניהול נכסים</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Asset Management · הגדרת נכסים לשימוש בכל האפליקציה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefreshPrices} disabled={refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "מעדכן..." : "עדכן מחירים"}
          </Button>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" /> הוסף נכס
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>נכסים מנוהלים:</strong> הנכסים שתגדיר כאן ישמשו כמקור האמת לכל הנתונים באפליקציה — מחירים, הקצאות ועוד. לחץ "עדכן מחירים" כדי לעדכן מחירים חיים מהאינטרנט.
      </div>

      {/* Asset Groups */}
      {[{ label: "קריפטו", list: cryptoAssets }, { label: "מניות", list: stockAssets }, { label: "אחר", list: otherAssets }]
        .filter(g => g.list.length > 0)
        .map(({ label, list }) => (
          <div key={label}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</h2>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Symbol</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">שם</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">מחיר נוכחי</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">עדכון אחרון</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">סוג</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((a, i) => (
                    <tr key={a.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                      <td className="px-4 py-3 font-mono font-bold text-sm">{a.symbol}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{a.name || "—"}</td>
                      <td className="px-4 py-3 font-mono text-sm">
                        {a.current_price_usd ? `$${a.current_price_usd.toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {a.last_updated ? format(new Date(a.last_updated), "d.M.yy HH:mm") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={TYPE_COLORS[a.asset_type] || TYPE_COLORS.Other}>
                          {a.asset_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(a)}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(a.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {assets.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-16 text-center text-muted-foreground text-sm">
          אין נכסים מוגדרים. לחץ "הוסף נכס" כדי להתחיל.
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editAsset ? `עדכן נכס — ${editAsset.symbol}` : "הוסף נכס חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Symbol *</Label>
                <Input value={form.symbol} onChange={e => set("symbol", e.target.value)} placeholder="BTC" className="font-mono" />
              </div>
              <div>
                <Label>סוג</Label>
                <select value={form.asset_type} onChange={e => set("asset_type", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="Crypto">Crypto</option>
                  <option value="Stock">Stock</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <Label>שם</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Bitcoin" />
            </div>
            <div>
              <Label>מחיר נוכחי (USD)</Label>
              <Input type="number" value={form.current_price_usd} onChange={e => set("current_price_usd", e.target.value)} placeholder="0" className="font-mono" />
            </div>
            <div>
              <Label>CoinGecko ID (לעדכון אוטומטי)</Label>
              <Input value={form.coingecko_id} onChange={e => set("coingecko_id", e.target.value)} placeholder="bitcoin" />
            </div>
            <div>
              <Label>הערות</Label>
              <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="(אופציונלי)" />
            </div>
            <Button onClick={handleSave} className="w-full">{editAsset ? "שמור" : "הוסף"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}