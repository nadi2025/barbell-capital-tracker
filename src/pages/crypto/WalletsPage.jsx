import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Wallet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";
import { usePrices } from "@/hooks/usePrices";
import { computeCryptoAssetDerived } from "@/lib/portfolioMath";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * WalletsPage — crypto wallet ledger.
 *
 * Migrated to React Query: wallets and assets read via useEntityList, prices
 * via usePrices. Each row's display values (current_price_usd, current_value_usd)
 * are derived per render via computeCryptoAssetDerived(asset, priceMap),
 * which resolves stablecoins and aTokens through the alias map automatically.
 *
 * Asset save no longer writes derived fields (current_price_usd /
 * current_value_usd). Only structural fields are persisted: token, amount,
 * asset_category, wallet_id/wallet_name, last_updated. The displayed values
 * come from priceMap × amount.
 */
export default function WalletsPage() {
  const walletsQ = useEntityList("CryptoWallet");
  const assetsQ = useEntityList("CryptoAsset");
  const { priceMap } = usePrices();

  const wallets = walletsQ.data || [];
  const assets = assetsQ.data || [];

  const createWallet = useEntityMutation("CryptoWallet", "create");
  const updateWallet = useEntityMutation("CryptoWallet", "update");
  const deleteWalletM = useEntityMutation("CryptoWallet", "delete");
  const createAsset = useEntityMutation("CryptoAsset", "create");
  const updateAsset = useEntityMutation("CryptoAsset", "update");
  const deleteAssetM = useEntityMutation("CryptoAsset", "delete");

  const [selectedWallet, setSelectedWallet] = useState(null);
  const [walletDialog, setWalletDialog] = useState(false);
  const [assetDialog, setAssetDialog] = useState(false);
  const [editWallet, setEditWallet] = useState(null);
  const [editAsset, setEditAsset] = useState(null);
  const [walletForm, setWalletForm] = useState({ name: "", type: "MetaMask", network: "Ethereum", address: "", notes: "" });
  const [assetForm, setAssetForm] = useState({ token: "", amount: "", asset_category: "Spot" });

  // Enrich every asset with derived current_price_usd / current_value_usd
  const enrichedAssets = useMemo(
    () => assets.map((a) => ({ ...a, ...computeCryptoAssetDerived(a, priceMap) })),
    [assets, priceMap]
  );

  const walletAssets = (walletId) => enrichedAssets.filter((a) => a.wallet_id === walletId);
  const walletValue = (walletId) =>
    walletAssets(walletId).reduce((s, a) => s + (a.current_value_usd || 0), 0);

  const saveWallet = async () => {
    if (editWallet) await updateWallet.mutateAsync({ id: editWallet.id, data: walletForm });
    else await createWallet.mutateAsync(walletForm);
    toast.success("Wallet saved");
    setWalletDialog(false);
  };

  const deleteWallet = async (id) => {
    if (!confirm("Delete this wallet?")) return;
    await deleteWalletM.mutateAsync(id);
    if (selectedWallet?.id === id) setSelectedWallet(null);
    toast.success("Wallet deleted");
  };

  const saveAsset = async () => {
    const amount = parseFloat(assetForm.amount) || 0;
    // Only persist structural fields. current_price_usd / current_value_usd
    // are derived at render time from priceMap × amount.
    const data = {
      token: assetForm.token,
      amount,
      asset_category: assetForm.asset_category,
      wallet_id: selectedWallet.id,
      wallet_name: selectedWallet.name,
      last_updated: new Date().toISOString().split("T")[0],
    };
    if (editAsset) await updateAsset.mutateAsync({ id: editAsset.id, data });
    else await createAsset.mutateAsync(data);
    toast.success("Asset saved");
    setAssetDialog(false);
  };

  const deleteAsset = async (id) => {
    if (!confirm("Delete this asset?")) return;
    await deleteAssetM.mutateAsync(id);
    toast.success("Asset deleted");
  };

  const isStale = (asset) => {
    if (!asset.last_updated) return true;
    return (new Date() - new Date(asset.last_updated)) / 86400000 > 7;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
            <h1 className="text-2xl font-bold">Wallets & Assets</h1>
          </div>
        </div>
        <Button onClick={() => { setEditWallet(null); setWalletForm({ name: "", type: "MetaMask", network: "Ethereum", address: "", notes: "" }); setWalletDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Wallet
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          {wallets.map((w) => (
            <div key={w.id}
              onClick={() => setSelectedWallet(w)}
              className={`bg-card border rounded-xl p-4 cursor-pointer transition-all ${selectedWallet?.id === w.id ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-muted-foreground/30"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-chart-2" />
                  <span className="font-medium text-sm">{w.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setEditWallet(w); setWalletForm({ name: w.name, type: w.type, network: w.network || "Ethereum", address: w.address || "", notes: w.notes || "" }); setWalletDialog(true); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); deleteWallet(w.id); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{w.type} · {w.network}</p>
              <p className="text-lg font-bold font-mono text-profit mt-1">{fmt(walletValue(w.id))}</p>
              <p className="text-xs text-muted-foreground">{walletAssets(w.id).length} assets</p>
            </div>
          ))}
          {wallets.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No wallets yet</p>}
        </div>

        <div className="lg:col-span-2">
          {selectedWallet ? (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{selectedWallet.name} — Assets</h2>
                <Button size="sm" onClick={() => { setEditAsset(null); setAssetForm({ token: "", amount: "", asset_category: "Spot" }); setAssetDialog(true); }} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> New Asset
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left pb-2 pl-2">Token</th>
                      <th className="text-left pb-2">Category</th>
                      <th className="text-left pb-2">Amount</th>
                      <th className="text-left pb-2">Price</th>
                      <th className="text-left pb-2">Value</th>
                      <th className="text-left pb-2">Updated</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {walletAssets(selectedWallet.id).map((a) => (
                      <tr key={a.id} className={`border-b border-border/40 hover:bg-muted/20 ${isStale(a) ? "bg-amber-500/5" : ""}`}>
                        <td className="py-2 pl-2 font-mono font-medium">
                          {isStale(a) && <AlertCircle className="w-3 h-3 text-amber-500 inline mr-1" />}
                          {a.token}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">{a.asset_category}</td>
                        <td className="py-2 font-mono">{(a.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td className="py-2 font-mono">${(a.current_price_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="py-2 font-mono font-semibold">{fmt(a.current_value_usd)}</td>
                        <td className="py-2 text-xs text-muted-foreground">{a.last_updated || "—"}</td>
                        <td className="py-2">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditAsset(a); setAssetForm({ token: a.token, amount: a.amount, asset_category: a.asset_category }); setAssetDialog(true); }}>
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
                {walletAssets(selectedWallet.id).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No assets in this wallet</p>}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground bg-card border border-border rounded-xl">
              Select a wallet to view assets
            </div>
          )}
        </div>
      </div>

      <Dialog open={walletDialog} onOpenChange={setWalletDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editWallet ? "Edit Wallet" : "New Wallet"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            {[{ label: "Name", key: "name" }, { label: "Address", key: "address" }, { label: "Notes", key: "notes" }].map((f) => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input value={walletForm[f.key]} onChange={(e) => setWalletForm((p) => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">Type</Label>
              <Select value={walletForm.type} onValueChange={(v) => setWalletForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Safe Multisig", "MetaMask", "Exchange", "Other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Network</Label>
              <Select value={walletForm.network} onValueChange={(v) => setWalletForm((p) => ({ ...p, network: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Ethereum", "Arbitrum", "Base", "Other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={saveWallet}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assetDialog} onOpenChange={setAssetDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editAsset ? "Edit Asset" : "New Asset"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs mb-1 block">Token</Label>
              <Input value={assetForm.token} onChange={(e) => setAssetForm((p) => ({ ...p, token: e.target.value }))} placeholder="ETH, BTC, USDC..." />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Amount</Label>
              <Input type="number" value={assetForm.amount} onChange={(e) => setAssetForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Category</Label>
              <Select value={assetForm.asset_category} onValueChange={(v) => setAssetForm((p) => ({ ...p, asset_category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Collateral on Aave", "Spot", "Stablecoin", "LP Token", "Vault", "Other"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground">
              מחיר נגזר אוטומטית מ-Prices entity דרך מפת aliases (aWBTC → BTC, aETH → ETH וכו׳).
            </p>
            <Button className="w-full" onClick={saveAsset}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
