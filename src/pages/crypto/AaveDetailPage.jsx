import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, TrendingDown, Edit2, Plus, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => v == null ? "0.00%" : `${(v * 100).toFixed(2)}%`;

// Global price reference
const TOKEN_PRICES = {
  ETH: 2165.35,
  WBTC: 70794.27,
  AAVE: 177
};

export default function AaveDetailPage() {
  const [collaterals, setCollaterals] = useState([]);
  const [borrow, setBorrow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddCollateral, setShowAddCollateral] = useState(false);
  const [newCollateral, setNewCollateral] = useState({ token: "", units: "", supply_apy: 0, liquidation_threshold: 0 });
  const [stressTest, setStressTest] = useState({ btcDrop: 0, ethDrop: 0 });

  const load = async () => {
    const [c, b] = await Promise.all([
      base44.entities.AaveCollateral.list(),
      base44.entities.AaveBorrow.list()
    ]);
    setCollaterals(c);
    setBorrow(b[0] || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Calculations
  const totalCollateralUsd = collaterals.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token] || 0;
    return s + (c.units * price);
  }, 0);

  const totalBorrowUsd = borrow?.borrowed_amount || 0;
  
  const healthFactor = collaterals.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token] || 0;
    return s + (c.units * price * (c.liquidation_threshold / 100));
  }, 0) / Math.max(totalBorrowUsd, 1);

  const borrowPowerUsed = Math.min(1, totalBorrowUsd / Math.max(collaterals.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token] || 0;
    return s + (c.units * price * (c.liquidation_threshold / 100));
  }, 0), 1));

  const netApy = collaterals.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token] || 0;
    return s + (c.units * price * (c.supply_apy / 100));
  }, 0) / Math.max(totalCollateralUsd, 1) - (borrow?.borrow_apy || 0) * (totalBorrowUsd / Math.max(totalCollateralUsd, 1));

  // Stress test
  const stressedCollateral = collaterals.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token] || 0;
    let stressedPrice = price;
    if (c.token === "BTC") stressedPrice *= (1 - stressTest.btcDrop / 100);
    if (c.token === "ETH") stressedPrice *= (1 - stressTest.ethDrop / 100);
    return s + (c.units * stressedPrice);
  }, 0);

  const stressedHealthFactor = collaterals.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token] || 0;
    let stressedPrice = price;
    if (c.token === "BTC") stressedPrice *= (1 - stressTest.btcDrop / 100);
    if (c.token === "ETH") stressedPrice *= (1 - stressTest.ethDrop / 100);
    return s + (stressedPrice * c.units * (c.liquidation_threshold / 100));
  }, 0) / Math.max(totalBorrowUsd, 1);

  const handleSaveCollateral = async (id, data) => {
    await base44.entities.AaveCollateral.update(id, {
      units: parseFloat(data.units),
      supply_apy: parseFloat(data.supply_apy),
      liquidation_threshold: parseFloat(data.liquidation_threshold),
      last_updated: new Date().toISOString().split("T")[0]
    });
    setEditingId(null);
    toast.success("Collateral updated");
    load();
  };

  const handleAddCollateral = async () => {
    if (!newCollateral.token || !newCollateral.units) {
      toast.error("Token and units required");
      return;
    }
    await base44.entities.AaveCollateral.create({
      token: newCollateral.token,
      units: parseFloat(newCollateral.units),
      supply_apy: parseFloat(newCollateral.supply_apy) || 0,
      liquidation_threshold: parseFloat(newCollateral.liquidation_threshold) || 80,
      is_collateral_enabled: true,
      last_updated: new Date().toISOString().split("T")[0]
    });
    setNewCollateral({ token: "", units: "", supply_apy: 0, liquidation_threshold: 0 });
    setShowAddCollateral(false);
    toast.success("Collateral added");
    load();
  };

  const handleSaveBorrow = async (data) => {
    if (borrow?.id) {
      await base44.entities.AaveBorrow.update(borrow.id, {
        borrowed_amount: parseFloat(data.borrowed_amount),
        borrow_apy: parseFloat(data.borrow_apy),
        last_updated: new Date().toISOString().split("T")[0]
      });
    } else {
      await base44.entities.AaveBorrow.create({
        borrowed_token: "USDC",
        borrowed_amount: parseFloat(data.borrowed_amount),
        borrow_apy: parseFloat(data.borrow_apy),
        e_mode: "Disabled",
        last_updated: new Date().toISOString().split("T")[0]
      });
    }
    setEditingId(null);
    toast.success("Borrow updated");
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  const hfColor = healthFactor > 2 ? "text-profit" : healthFactor > 1.5 ? "text-amber-400" : "text-loss";
  const hfBgColor = healthFactor > 2 ? "bg-profit/10" : healthFactor > 1.5 ? "bg-amber-400/10" : "bg-loss/10";

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">פוזיציית Aave</h1>
        <p className="text-xs text-muted-foreground mt-0.5">עדכן נתונים ודקום בתמידות</p>
      </div>

      {/* Health Overview */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`bg-card border border-border rounded-xl p-4 ${hfBgColor}`}>
          <p className="text-xs text-muted-foreground mb-1">Health Factor</p>
          <p className={`text-3xl font-bold ${hfColor}`}>{healthFactor.toFixed(2)}</p>
          <p className="text-xs mt-1">{healthFactor > 2 ? "✅ Safe" : healthFactor > 1.5 ? "⚠️ Caution" : "🚨 Risk"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Borrow Power Used</p>
          <p className="text-3xl font-bold font-mono text-foreground">{pct(borrowPowerUsed)}</p>
          <div className="w-full bg-muted rounded-full h-2 mt-2">
            <div className="h-2 bg-primary rounded-full" style={{ width: `${Math.min(100, borrowPowerUsed * 100)}%` }} />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Net Worth</p>
          <p className={`text-2xl font-bold font-mono ${totalCollateralUsd - totalBorrowUsd >= 0 ? "text-profit" : "text-loss"}`}>
            {fmt(totalCollateralUsd - totalBorrowUsd)}
          </p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Supplies */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">בטוחות שלך</h3>
            <Button size="sm" variant="outline" onClick={() => setShowAddCollateral(true)} className="gap-1">
              <Plus className="w-3 h-3" /> הוסף
            </Button>
          </div>
          <div className="space-y-2">
            {collaterals.map(c => {
              const price = TOKEN_PRICES[c.token] || 0;
              const value = c.units * price;
              return (
                <div key={c.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.token}</p>
                    <p className="text-xs text-muted-foreground">{c.units} units · {c.supply_apy}% APY</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{fmt(value)}</p>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(c.id); setEditForm(c); }} className="h-6 px-2">
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">סה"כ בטוחות: <span className="font-mono font-semibold text-foreground">{fmt(totalCollateralUsd)}</span></p>
        </div>

        {/* Borrows */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">הלוואות שלך</h3>
          {borrow && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium">USDC</p>
                  <p className="text-xs text-muted-foreground">{borrow.borrow_apy}% APY</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-loss">{fmt(borrow.borrowed_amount)}</p>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId("borrow"); setEditForm(borrow); }} className="h-6 px-2">
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground pt-2 border-t">
                <p>זמינה להשאלה: {fmt(Math.max(0, collaterals.reduce((s, c) => {
                  const price = TOKEN_PRICES[c.token] || 0;
                  return s + (c.units * price * (c.liquidation_threshold / 100));
                }, 0) - totalBorrowUsd))}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stress Test */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">🧪 בדיקת לחץ</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium">BTC יירד ב-{stressTest.btcDrop}%</label>
            <input type="range" min="0" max="80" value={stressTest.btcDrop} onChange={e => setStressTest({...stressTest, btcDrop: parseInt(e.target.value)})} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium">ETH יירד ב-{stressTest.ethDrop}%</label>
            <input type="range" min="0" max="80" value={stressTest.ethDrop} onChange={e => setStressTest({...stressTest, ethDrop: parseInt(e.target.value)})} className="w-full" />
          </div>
          <div className="bg-muted/50 p-3 rounded-lg space-y-1">
            <p className="text-xs"><span className="text-muted-foreground">Stressed Collateral:</span> <span className="font-mono font-semibold">{fmt(stressedCollateral)}</span></p>
            <p className={`text-xs font-semibold ${stressedHealthFactor > 1.5 ? "text-profit" : "text-loss"}`}>Health Factor: {stressedHealthFactor.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Edit Dialogs */}
      <Dialog open={editingId && editingId !== "borrow"} onOpenChange={() => setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>עדכן בטוחות</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Units</Label><Input type="number" value={editForm.units || ""} onChange={e => setEditForm({...editForm, units: e.target.value})} /></div>
            <div><Label>Supply APY (%)</Label><Input type="number" step="0.01" value={editForm.supply_apy || ""} onChange={e => setEditForm({...editForm, supply_apy: e.target.value})} /></div>
            <div><Label>Liquidation Threshold (%)</Label><Input type="number" step="0.01" value={editForm.liquidation_threshold || ""} onChange={e => setEditForm({...editForm, liquidation_threshold: e.target.value})} /></div>
            <Button onClick={() => handleSaveCollateral(editingId, editForm)} className="w-full">שמור</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingId === "borrow"} onOpenChange={() => setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>עדכן הלוואה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Borrowed Amount (USD)</Label><Input type="number" value={editForm.borrowed_amount || ""} onChange={e => setEditForm({...editForm, borrowed_amount: e.target.value})} /></div>
            <div><Label>Borrow APY (%)</Label><Input type="number" step="0.01" value={editForm.borrow_apy || ""} onChange={e => setEditForm({...editForm, borrow_apy: e.target.value})} /></div>
            <Button onClick={() => handleSaveBorrow(editForm)} className="w-full">שמור</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddCollateral} onOpenChange={setShowAddCollateral}>
        <DialogContent>
          <DialogHeader><DialogTitle>הוסף בטוחה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Token</Label><Input placeholder="ETH, WBTC, AAVE" value={newCollateral.token} onChange={e => setNewCollateral({...newCollateral, token: e.target.value})} /></div>
            <div><Label>Units</Label><Input type="number" value={newCollateral.units} onChange={e => setNewCollateral({...newCollateral, units: e.target.value})} /></div>
            <div><Label>Supply APY (%)</Label><Input type="number" step="0.01" value={newCollateral.supply_apy} onChange={e => setNewCollateral({...newCollateral, supply_apy: e.target.value})} /></div>
            <div><Label>Liquidation Threshold (%)</Label><Input type="number" step="0.01" value={newCollateral.liquidation_threshold} onChange={e => setNewCollateral({...newCollateral, liquidation_threshold: e.target.value})} /></div>
            <Button onClick={handleAddCollateral} className="w-full">הוסף</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}