import { useState } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, differenceInHours } from "date-fns";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";

const fmt = (v) => v ? `$${parseFloat(v).toLocaleString()}` : "—";

/**
 * PriceManagement — manual editor over the canonical Prices entity.
 *
 * Migrated to React Query: each individual mutation invalidates the Prices
 * cache, which automatically cascades to every consumer (dashboard hooks,
 * usePrices, useAavePosition, etc.) without a separate "save all" step.
 *
 * The "שמור ועדכן הכל" button was removed (Phase 4 plan): it called the
 * deleted recalculateAllPrices Deno function, which is unnecessary now
 * that derived values are computed on-the-fly. Bulk price updates go
 * through PriceHub at the top of the app.
 */
export default function PriceManagement() {
  const pricesQ = useEntityList("Prices", { sort: "-last_updated", limit: 100 });
  const prices = pricesQ.data || [];
  const createPrice = useEntityMutation("Prices", "create");
  const updatePrice = useEntityMutation("Prices", "update");
  const deletePriceM = useEntityMutation("Prices", "delete");

  const [dialog, setDialog] = useState(false);
  const [editPrice, setEditPrice] = useState(null);
  const [form, setForm] = useState({ asset: "", price_usd: "" });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
      last_updated: new Date().toISOString(),
    };

    if (editPrice) {
      await updatePrice.mutateAsync({ id: editPrice.id, data });
      toast.success("מחיר עודכן");
    } else {
      await createPrice.mutateAsync(data);
      toast.success("מחיר נוסף");
    }
    setDialog(false);
  };

  const handleDelete = async (id) => {
    await deletePriceM.mutateAsync(id);
    toast.success("מחיר נמחק");
  };

  const getStaleIndicator = (lastUpdated) => {
    if (!lastUpdated) return { color: "text-loss", icon: "🔴", label: "לא עודכן" };
    const hours = differenceInHours(new Date(), new Date(lastUpdated));
    if (hours < 12) return { color: "text-profit", icon: "🟢", label: `לפני ${hours}h` };
    if (hours < 48) return { color: "text-amber-400", icon: "🟡", label: `לפני ${Math.floor(hours / 24)}d` };
    return { color: "text-loss", icon: "🔴", label: "עודכן זה מכבר" };
  };

  if (pricesQ.isLoading) return (
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
        <strong>מחירים מרכזיים:</strong> כל הדפים באפליקציה (Aave, HyperLiquid, Options, וכו') קוראים את המחירים מכאן. עדכון של רשומה גורם לכל הדפים להתעדכן מיד.
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
                onChange={(e) => set("asset", e.target.value.toUpperCase())}
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
                onChange={(e) => set("price_usd", e.target.value)}
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
