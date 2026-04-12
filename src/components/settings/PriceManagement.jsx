import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, Trash2, RefreshCw, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, differenceInHours } from "date-fns";

const fmt = (v) => v ? `$${parseFloat(v).toLocaleString()}` : "—";

export default function PriceManagement() {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editPrice, setEditPrice] = useState(null);
  const [form, setForm] = useState({ asset: "", price_usd: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const data = await base44.entities.Prices.list("-last_updated", 100);
    setPrices(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditPrice(null); setForm({ asset: "", price_usd: "" }); setDialog(true); };
  const openEdit = (p) => {
    setEditPrice(p);
    setForm({ asset: p.asset, price_usd: p.price_usd });
    setDialog(true);
  };

  const handleSave = async () => {
    if (!form.asset) { toast.error("נכס חובה"); return; }
    if (!form.price_usd) { toast.error("מחיר חובה"); return; }
    
    const data = {
      asset: form.asset.toUpperCase().trim(),
      price_usd: parseFloat(form.price_usd),
      last_updated: new Date().toISOString()
    };
    
    if (editPrice) {
      await base44.entities.Prices.update(editPrice.id, data);
      toast.success("מחיר עודכן");
    } else {
      await base44.entities.Prices.create(data);
      toast.success("מחיר נוסף");
    }
    setDialog(false);
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.Prices.delete(id);
    toast.success("מחיר נמחק");
    load();
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Trigger recalculation across all pages
      await base44.functions.invoke("recalculateAllPrices", {});
      toast.success("✓ מחירים עודכנו בהצלחה. כל הנתונים חושבו מחדש.");
      load();
    } catch (e) {
      toast.error("שגיאה: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const getStaleIndicator = (lastUpdated) => {
    if (!lastUpdated) return { color: "text-loss", icon: "🔴", label: "לא עודכן" };
    const hours = differenceInHours(new Date(), new Date(lastUpdated));
    if (hours < 12) return { color: "text-profit", icon: "🟢", label: `לפני ${hours}h` };
    if (hours < 48) return { color: "text-amber-400", icon: "🟡", label: `לפני ${Math.floor(hours / 24)}d` };
    return { color: "text-loss", icon: "🔴", label: "עודכן זה מכבר" };
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">ניהול מחירים</h2>
          <p className="text-xs text-muted-foreground mt-0.5">מקור מחירים אחד לכל האפליקציה</p>
        </div>
        <Button onClick={openAdd} className="gap-2" size="sm">
          <Plus className="w-3.5 h-3.5" /> הוסף נכס
        </Button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        <strong>מחירים מרכזיים:</strong> כל הדפים באפליקציה (Aave, HyperLiquid, Options, וכו') קוראים את המחירים מכאן. עדכן כאן וכל הנתונים יחושבו מחדש.
      </div>

      {/* Prices Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">נכס</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">מחיר (USD)</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">עדכון</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {prices.map((p, i) => {
              const stale = getStaleIndicator(p.last_updated);
              return (
                <tr key={p.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-4 py-3 font-mono font-bold text-sm">{p.asset}</td>
                  <td className="px-4 py-3 font-mono text-sm">{fmt(p.price_usd)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <span className={stale.color}>{stale.icon}</span>
                    <span className="ml-1">
                      {p.last_updated ? format(new Date(p.last_updated), "d.M HH:mm") : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Save All Button */}
      <Button onClick={handleSaveAll} disabled={saving} className="w-full gap-2 bg-profit hover:bg-profit/90">
        {saving ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            משדכן...
          </>
        ) : (
          <>
            <Check className="w-4 h-4" />
            שמור ועדכן הכל
          </>
        )}
      </Button>

      {/* Add/Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editPrice ? `עדכן מחיר — ${editPrice.asset}` : "הוסף מחיר"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label>נכס (סימול)</Label>
              <Input 
                value={form.asset} 
                onChange={e => set("asset", e.target.value.toUpperCase())} 
                placeholder="BTC, ETH, AAVE, MSTR..."
                disabled={!!editPrice}
                className="font-mono" 
              />
            </div>
            <div>
              <Label>מחיר (USD)</Label>
              <Input 
                type="number" 
                value={form.price_usd} 
                onChange={e => set("price_usd", e.target.value)} 
                placeholder="0"
                step="0.01"
                className="font-mono" 
              />
            </div>
            <Button onClick={handleSave} className="w-full">{editPrice ? "עדכן" : "הוסף"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}