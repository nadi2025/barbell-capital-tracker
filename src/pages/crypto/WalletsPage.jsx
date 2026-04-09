import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, Wallet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function WalletsPage() {
  const [wallets, setWallets] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [walletDialog, setWalletDialog] = useState(false);
  const [assetDialog, setAssetDialog] = useState(false);
  const [editWallet, setEditWallet] = useState(null);
  const [editAsset, setEditAsset] = useState(null);
  const [walletForm, setWalletForm] = useState({ name: "", type: "MetaMask", network: "Ethereum", address: "", notes: "" });
  const [assetForm, setAssetForm] = useState({ token: "", amount: "", current_price_usd: "", asset_category: "Spot" });

  const load = async () => {
    const [w, a] = await Promise.all([base44.entities.CryptoWallet.list(), base44.entities.CryptoAsset.list()]);
    setWallets(w); setAssets(a);
  };

  useEffect(() => { load(); }, []);

  const walletAssets = (walletId) => assets.filter(a => a.wallet_id === walletId);
  const walletValue = (walletId) => walletAssets(walletId).reduce((s, a) => s + (a.current_value_usd || 0), 0);

  const saveWallet = async () => {
    if (editWallet) await base44.entities.CryptoWallet.update(editWallet.id, walletForm);
    else await base44.entities.CryptoWallet.create(walletForm);
    toast.success("ארנק נשמר");
    setWalletDialog(false); load();
  };

  const deleteWallet = async (id) => {
    if (!confirm("למחוק ארנק זה?")) return;
    await base44.entities.CryptoWallet.delete(id);
    if (selectedWallet?.id === id) setSelectedWallet(null);
    toast.success("ארנק נמחק"); load();
  };

  const saveAsset = async () => {
    const price = parseFloat(assetForm.current_price_usd) || 0;
    const amount = parseFloat(assetForm.amount) || 0;
    const data = { ...assetForm, amount, current_price_usd: price, current_value_usd: price * amount, wallet_id: selectedWallet.id, wallet_name: selectedWallet.name, last_updated: new Date().toISOString().split("T")[0] };
    if (editAsset) await base44.entities.CryptoAsset.update(editAsset.id, data);
    else await base44.entities.CryptoAsset.create(data);
    toast.success("נכס נשמר"); setAssetDialog(false); load();
  };

  const deleteAsset = async (id) => {
    if (!confirm("למחוק נכס זה?")) return;
    await base44.entities.CryptoAsset.delete(id);
    toast.success("נכס נמחק"); load();
  };

  const isStale = (asset) => {
    if (!asset.last_updated) return true;
    return (new Date() - new Date(asset.last_updated)) / 86400000 > 7;
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
            <h1 className="text-2xl font-bold">ארנקים ונכסים</h1>
          </div>
        </div>
        <Button onClick={() => { setEditWallet(null); setWalletForm({ name: "", type: "MetaMask", network: "Ethereum", address: "", notes: "" }); setWalletDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> ארנק חדש
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Wallets list */}
        <div className="space-y-2">
          {wallets.map(w => (
            <div key={w.id}
              onClick={() => setSelectedWallet(w)}
              className={`bg-card border rounded-xl p-4 cursor-pointer transition-all ${selectedWallet?.id === w.id ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-muted-foreground/30"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-chart-2" />
                  <span className="font-medium text-sm">{w.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); setEditWallet(w); setWalletForm({ name: w.name, type: w.type, network: w.network || "Ethereum", address: w.address || "", notes: w.notes || "" }); setWalletDialog(true); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); deleteWallet(w.id); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{w.type} · {w.network}</p>
              <p className="text-lg font-bold font-mono text-profit mt-1">{fmt(walletValue(w.id))}</p>
              <p className="text-xs text-muted-foreground">{walletAssets(w.id).length} נכסים</p>
            </div>
          ))}
          {wallets.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">אין ארנקים עדיין</p>}
        </div>

        {/* Assets for selected wallet */}
        <div className="lg:col-span-2">
          {selectedWallet ? (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{selectedWallet.name} — נכסים</h2>
                <Button size="sm" onClick={() => { setEditAsset(null); setAssetForm({ token: "", amount: "", current_price_usd: "", asset_category: "Spot" }); setAssetDialog(true); }} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> נכס חדש
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-right pb-2 pr-2">טוקן</th>
                      <th className="text-right pb-2">קטגוריה</th>
                      <th className="text-right pb-2">כמות</th>
                      <th className="text-right pb-2">מחיר</th>
                      <th className="text-right pb-2">שווי</th>
                      <th className="text-right pb-2">עודכן</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {walletAssets(selectedWallet.id).map(a => (
                      <tr key={a.id} className={`border-b border-border/40 hover:bg-muted/20 ${isStale(a) ? "bg-amber-500/5" : ""}`}>
                        <td className="py-2 pr-2 font-mono font-medium">
                          {isStale(a) && <AlertCircle className="w-3 h-3 text-amber-500 inline ml-1" />}
                          {a.token}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">{a.asset_category}</td>
                        <td className="py-2 font-mono">{(a.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td className="py-2 font-mono">${(a.current_price_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="py-2 font-mono font-semibold">{fmt(a.current_value_usd)}</td>
                        <td className="py-2 text-xs text-muted-foreground">{a.last_updated || "—"}</td>
                        <td className="py-2">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditAsset(a); setAssetForm({ token: a.token, amount: a.amount, current_price_usd: a.current_price_usd, asset_category: a.asset_category }); setAssetDialog(true); }}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteAsset(a.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {walletAssets(selectedWallet.id).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">אין נכסים בארנק זה</p>}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground bg-card border border-border rounded-xl">
              בחר ארנק לצפייה בנכסים
            </div>
          )}
        </div>
      </div>

      {/* Wallet Dialog */}
      <Dialog open={walletDialog} onOpenChange={setWalletDialog}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>{editWallet ? "עריכת ארנק" : "ארנק חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            {[{ label: "שם", key: "name" }, { label: "כתובת", key: "address" }, { label: "הערות", key: "notes" }].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input value={walletForm[f.key]} onChange={e => setWalletForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">סוג</Label>
              <Select value={walletForm.type} onValueChange={v => setWalletForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Safe Multisig", "MetaMask", "Exchange", "Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">רשת</Label>
              <Select value={walletForm.network} onValueChange={v => setWalletForm(p => ({ ...p, network: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Ethereum", "Arbitrum", "Base", "Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={saveWallet}>שמור</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Asset Dialog */}
      <Dialog open={assetDialog} onOpenChange={setAssetDialog}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>{editAsset ? "עריכת נכס" : "נכס חדש"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs mb-1 block">טוקן</Label>
              <Input value={assetForm.token} onChange={e => setAssetForm(p => ({ ...p, token: e.target.value }))} placeholder="ETH, BTC, USDC..." />
            </div>
            <div>
              <Label className="text-xs mb-1 block">כמות</Label>
              <Input type="number" value={assetForm.amount} onChange={e => setAssetForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">מחיר נוכחי ($)</Label>
              <Input type="number" value={assetForm.current_price_usd} onChange={e => setAssetForm(p => ({ ...p, current_price_usd: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">קטגוריה</Label>
              <Select value={assetForm.asset_category} onValueChange={v => setAssetForm(p => ({ ...p, asset_category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Collateral on Aave", "Spot", "Stablecoin", "LP Token", "Vault", "Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={saveAsset}>שמור</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}