import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, TrendingDown, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

export default function AavePage() {
  const [aaveData, setAaveData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    collateral_usd: 0,
    borrow_usd: 0,
    health_factor: 0,
    collateral_ratio: 0,
    liquidation_threshold: 80,
    net_apy: 0,
    notes: ""
  });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const data = await base44.entities.AaveAccount.list();
    if (data.length > 0) {
      setAaveData(data[0]);
      setFormData(data[0]);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async () => {
    if (aaveData) {
      await base44.entities.AaveAccount.update(aaveData.id, formData);
    } else {
      await base44.entities.AaveAccount.create(formData);
    }
    await loadData();
    setEditing(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const borrowingPower = formData.collateral_usd * (formData.collateral_ratio / 100) || 0;
  const availableBorrow = borrowingPower - formData.borrow_usd;
  const isAtRisk = formData.health_factor < 1.5;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aave Account</h1>
          <p className="text-xs text-muted-foreground mt-0.5">ניהול Collateral, Borrow ו-Health Factor</p>
        </div>
        <Button onClick={() => setEditing(!editing)} variant={editing ? "destructive" : "default"}>
          {editing ? "בטל" : "ערוך"}
        </Button>
      </div>

      {/* Alerts */}
      {isAtRisk && (
        <div className="bg-loss/10 border border-loss/30 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-loss flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-loss">Health Factor בסיכון</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Health Factor שלך הוא {formData.health_factor.toFixed(2)}. סף הנקוביות הוא 1.0.
            </p>
          </div>
        </div>
      )}

      {/* Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Collateral Total</p>
          <p className="text-2xl font-bold font-mono text-foreground">{fmt(formData.collateral_usd)}</p>
          <p className="text-xs text-muted-foreground mt-1">{formData.collateral_ratio.toFixed(1)}% יחס</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">סכום השכלה</p>
          <p className="text-2xl font-bold font-mono text-loss">{fmt(formData.borrow_usd)}</p>
          <p className="text-xs text-muted-foreground mt-1">APY: {formData.net_apy?.toFixed(2) || 0}%</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Health Factor</p>
          <p className={`text-2xl font-bold font-mono ${formData.health_factor < 1 ? "text-loss" : formData.health_factor < 1.5 ? "text-amber-400" : "text-profit"}`}>
            {formData.health_factor.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">סף נקוביות: 1.0</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">זמין ללוות</p>
          <p className="text-2xl font-bold font-mono text-foreground">{fmt(Math.max(0, availableBorrow))}</p>
          <p className="text-xs text-muted-foreground mt-1">מכוח: {fmt(borrowingPower)}</p>
        </div>
      </div>

      {/* Edit Form */}
      {editing && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Collateral (USD)</label>
              <input
                type="number"
                value={formData.collateral_usd}
                onChange={(e) => setFormData({ ...formData, collateral_usd: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-input rounded-md font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">בורו (USD)</label>
              <input
                type="number"
                value={formData.borrow_usd}
                onChange={(e) => setFormData({ ...formData, borrow_usd: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-input rounded-md font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Health Factor</label>
              <input
                type="number"
                step="0.01"
                value={formData.health_factor}
                onChange={(e) => setFormData({ ...formData, health_factor: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-input rounded-md font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">יחס Collateral (%)</label>
              <input
                type="number"
                step="0.1"
                value={formData.collateral_ratio}
                onChange={(e) => setFormData({ ...formData, collateral_ratio: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-input rounded-md font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Net APY (%)</label>
              <input
                type="number"
                step="0.01"
                value={formData.net_apy}
                onChange={(e) => setFormData({ ...formData, net_apy: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-input rounded-md font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">סף Liquidation (%)</label>
              <input
                type="number"
                step="0.1"
                value={formData.liquidation_threshold}
                onChange={(e) => setFormData({ ...formData, liquidation_threshold: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-input rounded-md font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">הערות</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-md font-mono text-sm h-20"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1">שמור</Button>
            <Button onClick={() => setEditing(false)} variant="outline" className="flex-1">בטל</Button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex gap-2 mb-2">
          <Shield className="w-4 h-4 text-muted-foreground mt-0.5" />
          <p className="text-sm font-semibold">מידע Aave</p>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Health Factor: מדד לבריאות החשבון שלך. ערך נמוך מ-1.0 פירושו נקוביות.</p>
          <p>• Collateral Ratio: אחוז ההערכה של ה-Collateral שלך שניתן ללוות נגדו.</p>
          <p>• Net APY: הרווח/הפסד הנקי מהריבית.</p>
          {formData.notes && <p className="mt-2 text-foreground">הערות: {formData.notes}</p>}
        </div>
      </div>
    </div>
  );
}