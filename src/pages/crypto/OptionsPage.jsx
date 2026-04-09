import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", minimumFractionDigits: d, maximumFractionDigits: d });

export default function OptionsPage() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [newPosition, setNewPosition] = useState({
    platform: "Rysk Finance",
    asset: "",
    option_type: "Call",
    direction: "Sell",
    apr_percent: 0,
    income_usd: 0,
    size: 0,
    notional_usd: 0,
    current_price: 0,
    maturity_date: "",
    target_price: 0,
    status: "Active",
    created_date: new Date().toISOString().split("T")[0],
    notes: ""
  });
  const [filterStatus, setFilterStatus] = useState("Active");

  const load = async () => {
    const p = await base44.entities.CryptoOptionsPosition.list();
    setPositions(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const activePositions = positions.filter(p => p.status === "Active");
  const totalNotional = activePositions.reduce((s, p) => s + (p.notional_usd || 0), 0);
  const totalIncome = positions.reduce((s, p) => s + (p.income_usd || 0), 0);
  const avgApr = totalNotional > 0 ? activePositions.reduce((s, p) => s + (p.apr_percent * p.notional_usd), 0) / totalNotional : 0;

  const filteredPositions = filterStatus === "All" ? positions : positions.filter(p => p.status === filterStatus);

  const getDaysToExpiry = (date) => {
    const d = (new Date(date) - new Date()) / 86400000;
    return Math.ceil(d);
  };

  const getMoneyness = (pos) => {
    if (pos.option_type === "Call") return pos.current_price > pos.target_price ? "ITM" : "OTM";
    return pos.current_price < pos.target_price ? "ITM" : "OTM";
  };

  const handleSave = async (id, data) => {
    await base44.entities.CryptoOptionsPosition.update(id, data);
    setEditingId(null);
    toast.success("Position updated");
    load();
  };

  const handleAdd = async () => {
    if (!newPosition.asset || !newPosition.maturity_date) {
      toast.error("Asset and maturity date required");
      return;
    }
    await base44.entities.CryptoOptionsPosition.create(newPosition);
    setNewPosition({
      platform: "Rysk Finance",
      asset: "",
      option_type: "Call",
      direction: "Sell",
      apr_percent: 0,
      income_usd: 0,
      size: 0,
      notional_usd: 0,
      current_price: 0,
      maturity_date: "",
      target_price: 0,
      status: "Active",
      created_date: new Date().toISOString().split("T")[0],
      notes: ""
    });
    setShowAdd(false);
    toast.success("Position added");
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.CryptoOptionsPosition.delete(id);
    toast.success("Position deleted");
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">אופציות</h1>
          <p className="text-xs text-muted-foreground mt-0.5">ניהול פוזיציות אופציות Rysk Finance</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף אופציה
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Active Positions</p>
          <p className="text-2xl font-bold">{activePositions.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Notional</p>
          <p className="text-2xl font-bold font-mono">{fmt(totalNotional)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Income Earned</p>
          <p className="text-2xl font-bold font-mono text-profit">{fmt(totalIncome)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Weighted Avg APR</p>
          <p className="text-2xl font-bold">{avgApr.toFixed(2)}%</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {["Active", "Expired", "All"].map(tab => (
          <button key={tab} onClick={() => setFilterStatus(tab)} className={`px-3 py-1 text-sm rounded-lg border transition ${filterStatus === tab ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Position Cards */}
      <div className="grid grid-cols-2 gap-4">
        {filteredPositions.map(pos => {
          const daysLeft = getDaysToExpiry(pos.maturity_date);
          const moneyness = getMoneyness(pos);
          const isExpiring = daysLeft < 7;
          const isIminent = daysLeft < 1;

          return (
            <div key={pos.id} className={`bg-card border rounded-xl p-4 space-y-3 ${isIminent ? "border-loss bg-loss/5" : isExpiring ? "border-amber-400 bg-amber-400/5" : "border-border"}`}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold">{pos.asset}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pos.option_type === "Call" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>
                      {pos.option_type}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pos.direction === "Sell" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                      {pos.direction}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pos.status === "Active" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {pos.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(pos.id); setEditForm(pos); }}><Edit2 className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(pos.id)}><X className="w-4 h-4" /></Button>
                </div>
              </div>

              {/* Key Numbers */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Strike</p>
                  <p className="font-mono font-semibold">${pos.target_price?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Current</p>
                  <p className="font-mono font-semibold">${pos.current_price?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">APR</p>
                  <p className="font-mono font-semibold">{pos.apr_percent?.toFixed(2)}%</p>
                </div>
              </div>

              {/* Notional & Income */}
              <div className="grid grid-cols-3 gap-2 text-xs border-t pt-2">
                <div>
                  <p className="text-muted-foreground">Notional</p>
                  <p className="font-mono font-semibold">{fmt(pos.notional_usd)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Income</p>
                  <p className="font-mono font-semibold text-profit">{fmt(pos.income_usd)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Size</p>
                  <p className="font-mono font-semibold">{pos.size}</p>
                </div>
              </div>

              {/* Expiry */}
              <div className="border-t pt-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <p className="text-muted-foreground">{pos.maturity_date}</p>
                  <p className={`font-semibold ${daysLeft < 0 ? "text-loss" : daysLeft < 7 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {daysLeft < 0 ? "Expired" : `${daysLeft} days`}
                  </p>
                </div>
                <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                  <div className="h-1 bg-primary" style={{ width: `${Math.max(0, Math.min(100, (daysLeft / 60) * 100))}%` }} />
                </div>
              </div>

              {/* Status */}
              <div className="text-xs font-medium pt-2 border-t">
                <span className={moneyness === "ITM" ? "text-profit" : "text-loss"}>{moneyness}</span>
                {pos.notes && <p className="text-muted-foreground mt-1">{pos.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Position</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            <div><Label>Asset</Label><Input value={editForm.asset || ""} onChange={e => setEditForm({...editForm, asset: e.target.value})} /></div>
            <div><Label>Current Price</Label><Input type="number" value={editForm.current_price || ""} onChange={e => setEditForm({...editForm, current_price: e.target.value})} /></div>
            <div><Label>Strike Price</Label><Input type="number" value={editForm.target_price || ""} onChange={e => setEditForm({...editForm, target_price: e.target.value})} /></div>
            <div><Label>Notional (USD)</Label><Input type="number" value={editForm.notional_usd || ""} onChange={e => setEditForm({...editForm, notional_usd: e.target.value})} /></div>
            <div><Label>Income (USD)</Label><Input type="number" value={editForm.income_usd || ""} onChange={e => setEditForm({...editForm, income_usd: e.target.value})} /></div>
            <div><Label>APR %</Label><Input type="number" step="0.01" value={editForm.apr_percent || ""} onChange={e => setEditForm({...editForm, apr_percent: e.target.value})} /></div>
            <div><Label>Status</Label><select value={editForm.status || ""} onChange={e => setEditForm({...editForm, status: e.target.value})} className="w-full border rounded px-2 py-1"><option value="Active">Active</option><option value="Expired ITM">Expired ITM</option><option value="Expired OTM">Expired OTM</option><option value="Exercised">Exercised</option></select></div>
            <Button onClick={() => handleSave(editingId, editForm)} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Option Position</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            <div><Label>Asset</Label><Input placeholder="UETH, WBTC" value={newPosition.asset} onChange={e => setNewPosition({...newPosition, asset: e.target.value})} /></div>
            <div><Label>Type</Label><select value={newPosition.option_type} onChange={e => setNewPosition({...newPosition, option_type: e.target.value})} className="w-full border rounded px-2 py-1"><option>Call</option><option>Put</option></select></div>
            <div><Label>Direction</Label><select value={newPosition.direction} onChange={e => setNewPosition({...newPosition, direction: e.target.value})} className="w-full border rounded px-2 py-1"><option>Sell</option><option>Buy</option></select></div>
            <div><Label>Strike Price</Label><Input type="number" value={newPosition.target_price} onChange={e => setNewPosition({...newPosition, target_price: e.target.value})} /></div>
            <div><Label>Current Price</Label><Input type="number" value={newPosition.current_price} onChange={e => setNewPosition({...newPosition, current_price: e.target.value})} /></div>
            <div><Label>Size (Contracts)</Label><Input type="number" value={newPosition.size} onChange={e => setNewPosition({...newPosition, size: e.target.value})} /></div>
            <div><Label>Notional (USD)</Label><Input type="number" value={newPosition.notional_usd} onChange={e => setNewPosition({...newPosition, notional_usd: e.target.value})} /></div>
            <div><Label>Income/Premium (USD)</Label><Input type="number" value={newPosition.income_usd} onChange={e => setNewPosition({...newPosition, income_usd: e.target.value})} /></div>
            <div><Label>APR %</Label><Input type="number" step="0.01" value={newPosition.apr_percent} onChange={e => setNewPosition({...newPosition, apr_percent: e.target.value})} /></div>
            <div><Label>Maturity Date</Label><Input type="date" value={newPosition.maturity_date} onChange={e => setNewPosition({...newPosition, maturity_date: e.target.value})} /></div>
            <div><Label>Notes</Label><Input value={newPosition.notes} onChange={e => setNewPosition({...newPosition, notes: e.target.value})} /></div>
            <Button onClick={handleAdd} className="w-full">Add Position</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}