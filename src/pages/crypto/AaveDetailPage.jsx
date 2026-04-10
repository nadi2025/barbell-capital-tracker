import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Edit2, Plus, Settings, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
const fmtK = (v) => {
  if (v == null) return "$0";
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(2)}M`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(2)}K`;
  return fmt(v, 2);
};

const TOKEN_ICONS = { ETH: "Ξ", WBTC: "₿", AAVE: "👻", USDC: "$" };
const TOKEN_COLORS = { ETH: "bg-[#627eea]/20 text-[#627eea]", WBTC: "bg-[#f7931a]/20 text-[#f7931a]", AAVE: "bg-[#b6509e]/20 text-[#b6509e]", USDC: "bg-[#2775ca]/20 text-[#2775ca]" };

const DEFAULT_PRICES = { ETH: 2185, WBTC: 71771, AAVE: 90.5 };

export default function AaveDetailPage() {
  const [collaterals, setCollaterals] = useState([]);
  const [borrow, setBorrow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState(DEFAULT_PRICES);

  // Dialogs
  const [editCollateral, setEditCollateral] = useState(null);
  const [editBorrow, setEditBorrow] = useState(false);
  const [showAddCollateral, setShowAddCollateral] = useState(false);
  const [showPrices, setShowPrices] = useState(false);

  const [editForm, setEditForm] = useState({});
  const [newCollateral, setNewCollateral] = useState({ token: "", units: "", supply_apy: "", liquidation_threshold: "80" });
  const [priceForm, setPriceForm] = useState({ ...DEFAULT_PRICES });

  const load = async () => {
    const [c, b] = await Promise.all([
      base44.entities.AaveCollateral.list(),
      base44.entities.AaveBorrow.list()
    ]);
    setCollaterals(c);
    setBorrow(b[0] || null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Real-time subscriptions
    const unsub1 = base44.entities.AaveCollateral.subscribe((event) => {
      if (event.type === "create") setCollaterals(prev => [...prev, event.data]);
      else if (event.type === "update") setCollaterals(prev => prev.map(c => c.id === event.id ? event.data : c));
      else if (event.type === "delete") setCollaterals(prev => prev.filter(c => c.id !== event.id));
    });
    const unsub2 = base44.entities.AaveBorrow.subscribe((event) => {
      if (event.type === "create" || event.type === "update") setBorrow(event.data);
      else if (event.type === "delete") setBorrow(null);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  // Calculations
  const collatWithValues = collaterals.map(c => ({
    ...c,
    price: prices[c.token] || 0,
    usdValue: c.units * (prices[c.token] || 0),
  }));

  const totalSupplyUsd = collatWithValues.reduce((s, c) => s + c.usdValue, 0);
  const totalBorrowUsd = borrow?.borrowed_amount || 0;
  const netWorth = totalSupplyUsd - totalBorrowUsd;

  const weightedSupplyApy = totalSupplyUsd > 0
    ? collatWithValues.reduce((s, c) => s + c.usdValue * (c.supply_apy / 100), 0) / totalSupplyUsd
    : 0;
  const borrowCost = totalSupplyUsd > 0
    ? (borrow?.borrow_apy || 0) / 100 * (totalBorrowUsd / totalSupplyUsd)
    : 0;
  const netApy = (weightedSupplyApy - borrowCost) * 100;

  const maxBorrow = collatWithValues.reduce((s, c) => s + c.usdValue * ((c.liquidation_threshold || 80) / 100), 0);
  const healthFactor = totalBorrowUsd > 0 ? maxBorrow / totalBorrowUsd : 99;
  const borrowPowerUsed = maxBorrow > 0 ? totalBorrowUsd / maxBorrow : 0;

  const hfColor = healthFactor > 2.5 ? "text-emerald-400" : healthFactor > 1.5 ? "text-amber-400" : "text-red-400";
  const hfBg = healthFactor > 2.5 ? "bg-emerald-500" : healthFactor > 1.5 ? "bg-amber-500" : "bg-red-500";

  // Handlers
  const handleSaveCollateral = async () => {
    await base44.entities.AaveCollateral.update(editCollateral.id, {
      units: parseFloat(editForm.units),
      supply_apy: parseFloat(editForm.supply_apy),
      liquidation_threshold: parseFloat(editForm.liquidation_threshold),
      last_updated: new Date().toISOString().split("T")[0]
    });
    setEditCollateral(null);
    toast.success("Updated");
  };

  const handleDeleteCollateral = async (id) => {
    await base44.entities.AaveCollateral.delete(id);
    toast.success("Removed");
  };

  const handleAddCollateral = async () => {
    if (!newCollateral.token || !newCollateral.units) { toast.error("Token and units required"); return; }
    await base44.entities.AaveCollateral.create({
      token: newCollateral.token.toUpperCase(),
      units: parseFloat(newCollateral.units),
      supply_apy: parseFloat(newCollateral.supply_apy) || 0,
      liquidation_threshold: parseFloat(newCollateral.liquidation_threshold) || 80,
      is_collateral_enabled: true,
      last_updated: new Date().toISOString().split("T")[0]
    });
    setNewCollateral({ token: "", units: "", supply_apy: "", liquidation_threshold: "80" });
    setShowAddCollateral(false);
    toast.success("Added");
  };

  const handleSaveBorrow = async () => {
    const data = { borrowed_amount: parseFloat(editForm.borrowed_amount), borrow_apy: parseFloat(editForm.borrow_apy), last_updated: new Date().toISOString().split("T")[0] };
    if (borrow?.id) await base44.entities.AaveBorrow.update(borrow.id, data);
    else await base44.entities.AaveBorrow.create({ borrowed_token: "USDC", ...data, e_mode: "Disabled" });
    setEditBorrow(false);
    toast.success("Updated");
  };

  const handleSavePrices = () => {
    setPrices({ ETH: parseFloat(priceForm.ETH), WBTC: parseFloat(priceForm.WBTC), AAVE: parseFloat(priceForm.AAVE) });
    setShowPrices(false);
    toast.success("Prices updated");
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header — Core Instance style */}
      <div className="bg-[#1a1f36] border border-[#2d3555] rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#b6509e] flex items-center justify-center text-white font-bold text-sm">A</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold">Core Instance</h1>
                <span className="text-xs bg-[#2d3555] px-2 py-0.5 rounded font-mono">v3</span>
              </div>
              <p className="text-xs text-slate-400">Main Ethereum market</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setPriceForm({ ...prices }); setShowPrices(true); }} className="gap-1.5 text-slate-300 hover:text-white border border-[#2d3555]">
            <Settings className="w-3.5 h-3.5" /> עדכן מחירים
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Net worth</p>
            <p className="text-xl font-bold text-white">{fmtK(netWorth)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Net APY</p>
            <p className={`text-xl font-bold ${netApy >= 0 ? "text-emerald-400" : "text-red-400"}`}>{netApy.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Health factor</p>
            <p className={`text-xl font-bold ${hfColor}`}>{healthFactor > 99 ? "∞" : healthFactor.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Borrow power used</p>
            <div>
              <p className="text-xl font-bold text-white">{(borrowPowerUsed * 100).toFixed(1)}%</p>
              <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
                <div className={`h-1.5 rounded-full ${hfBg}`} style={{ width: `${Math.min(100, borrowPowerUsed * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* YOUR SUPPLIES */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold">Your supplies</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Balance <span className="font-mono font-semibold text-foreground">{fmtK(totalSupplyUsd)}</span>
                <span className="mx-2">·</span>
                APY <span className="font-mono font-semibold text-profit">{(weightedSupplyApy * 100).toFixed(2)}%</span>
                <span className="mx-2">·</span>
                Collateral <span className="font-mono font-semibold text-foreground">{fmtK(totalSupplyUsd)}</span>
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowAddCollateral(true)} className="gap-1 h-7 text-xs">
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs text-muted-foreground border-b border-border/50">
            <div className="col-span-4">Asset</div>
            <div className="col-span-3 text-right">Balance</div>
            <div className="col-span-2 text-right">APY</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>

          {collatWithValues.map(c => (
            <div key={c.id} className="grid grid-cols-12 gap-2 items-center px-5 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors last:border-0">
              <div className="col-span-4 flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${TOKEN_COLORS[c.token] || "bg-muted text-foreground"}`}>
                  {TOKEN_ICONS[c.token] || c.token[0]}
                </div>
                <span className="text-sm font-medium">{c.token}</span>
              </div>
              <div className="col-span-3 text-right">
                <p className="text-sm font-mono font-semibold">{c.units.toLocaleString("en-US", { maximumFractionDigits: 4 })}</p>
                <p className="text-xs text-muted-foreground">{fmtK(c.usdValue)}</p>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-mono text-profit">{c.supply_apy < 0.01 ? "<0.01" : c.supply_apy.toFixed(2)}%</span>
              </div>
              <div className="col-span-3 flex items-center justify-end gap-1">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                  onClick={() => { setEditCollateral(c); setEditForm({ units: c.units, supply_apy: c.supply_apy, liquidation_threshold: c.liquidation_threshold }); }}>
                  <Edit2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* YOUR BORROWS */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold">Your borrows</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Balance <span className="font-mono font-semibold text-foreground">{fmtK(totalBorrowUsd)}</span>
                <span className="mx-2">·</span>
                APY <span className="font-mono font-semibold text-loss">{borrow?.borrow_apy?.toFixed(2) || "0.00"}%</span>
                <span className="mx-2">·</span>
                Borrow power <span className="font-mono font-semibold">{(borrowPowerUsed * 100).toFixed(2)}%</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs text-muted-foreground border-b border-border/50">
            <div className="col-span-4">Asset</div>
            <div className="col-span-3 text-right">Debt</div>
            <div className="col-span-2 text-right">APY</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>

          {borrow ? (
            <div className="grid grid-cols-12 gap-2 items-center px-5 py-3 border-b border-border/30">
              <div className="col-span-4 flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${TOKEN_COLORS["USDC"]}`}>
                  {TOKEN_ICONS["USDC"]}
                </div>
                <span className="text-sm font-medium">{borrow.borrowed_token}</span>
              </div>
              <div className="col-span-3 text-right">
                <p className="text-sm font-mono font-semibold text-loss">{fmtK(borrow.borrowed_amount)}</p>
                <p className="text-xs text-muted-foreground">{fmtK(borrow.borrowed_amount)}</p>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-mono text-loss">{borrow.borrow_apy?.toFixed(2)}%</span>
              </div>
              <div className="col-span-3 flex items-center justify-end gap-1">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                  onClick={() => { setEditBorrow(true); setEditForm({ borrowed_amount: borrow.borrowed_amount, borrow_apy: borrow.borrow_apy }); }}>
                  <Edit2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">אין הלוואות פתוחות</div>
          )}

          {/* Available borrow capacity */}
          <div className="px-5 py-4 bg-muted/20">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Available to borrow</span>
              <span className="font-mono font-semibold">{fmtK(Math.max(0, maxBorrow - totalBorrowUsd))}</span>
            </div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Max borrow capacity</span>
              <span className="font-mono">{fmtK(maxBorrow)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">E-Mode</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${borrow?.e_mode === "Enabled" ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                {borrow?.e_mode || "DISABLED"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── DIALOGS ── */}

      {/* Edit Collateral */}
      <Dialog open={!!editCollateral} onOpenChange={() => setEditCollateral(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>עדכן {editCollateral?.token}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Units</Label><Input type="number" step="0.0001" value={editForm.units || ""} onChange={e => setEditForm({...editForm, units: e.target.value})} /></div>
            <div><Label>Supply APY (%)</Label><Input type="number" step="0.01" value={editForm.supply_apy || ""} onChange={e => setEditForm({...editForm, supply_apy: e.target.value})} /></div>
            <div><Label>Liquidation Threshold (%)</Label><Input type="number" step="0.1" value={editForm.liquidation_threshold || ""} onChange={e => setEditForm({...editForm, liquidation_threshold: e.target.value})} /></div>
            <div className="flex gap-2">
              <Button onClick={handleSaveCollateral} className="flex-1">שמור</Button>
              <Button variant="destructive" onClick={() => { handleDeleteCollateral(editCollateral.id); setEditCollateral(null); }}>מחק</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Borrow */}
      <Dialog open={editBorrow} onOpenChange={setEditBorrow}>
        <DialogContent>
          <DialogHeader><DialogTitle>עדכן הלוואה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Borrowed Amount (USD)</Label><Input type="number" value={editForm.borrowed_amount || ""} onChange={e => setEditForm({...editForm, borrowed_amount: e.target.value})} /></div>
            <div><Label>Borrow APY (%)</Label><Input type="number" step="0.01" value={editForm.borrow_apy || ""} onChange={e => setEditForm({...editForm, borrow_apy: e.target.value})} /></div>
            <Button onClick={handleSaveBorrow} className="w-full">שמור</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Collateral */}
      <Dialog open={showAddCollateral} onOpenChange={setShowAddCollateral}>
        <DialogContent>
          <DialogHeader><DialogTitle>הוסף בטוחה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Token</Label><Input placeholder="ETH / WBTC / AAVE" value={newCollateral.token} onChange={e => setNewCollateral({...newCollateral, token: e.target.value})} /></div>
            <div><Label>Units</Label><Input type="number" step="0.0001" value={newCollateral.units} onChange={e => setNewCollateral({...newCollateral, units: e.target.value})} /></div>
            <div><Label>Supply APY (%)</Label><Input type="number" step="0.01" value={newCollateral.supply_apy} onChange={e => setNewCollateral({...newCollateral, supply_apy: e.target.value})} /></div>
            <div><Label>Liquidation Threshold (%)</Label><Input type="number" step="0.1" value={newCollateral.liquidation_threshold} onChange={e => setNewCollateral({...newCollateral, liquidation_threshold: e.target.value})} /></div>
            <Button onClick={handleAddCollateral} className="w-full">הוסף</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Prices */}
      <Dialog open={showPrices} onOpenChange={setShowPrices}>
        <DialogContent>
          <DialogHeader><DialogTitle>עדכן מחירי אסטים</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>ETH ($)</Label><Input type="number" value={priceForm.ETH} onChange={e => setPriceForm({...priceForm, ETH: e.target.value})} /></div>
            <div><Label>WBTC ($)</Label><Input type="number" value={priceForm.WBTC} onChange={e => setPriceForm({...priceForm, WBTC: e.target.value})} /></div>
            <div><Label>AAVE ($)</Label><Input type="number" value={priceForm.AAVE} onChange={e => setPriceForm({...priceForm, AAVE: e.target.value})} /></div>
            <Button onClick={handleSavePrices} className="w-full">עדכן</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}