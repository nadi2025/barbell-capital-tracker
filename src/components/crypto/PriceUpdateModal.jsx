import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BTC_TOKENS = ["awBTC", "wBTC", "BTC"];
const ETH_TOKENS = ["aETH", "ETH"];
const AAVE_TOKENS = ["aAAVE", "AAVE"];
const STABLE_TOKENS = ["USDC", "USDT", "DAI", "aUSDC"];

export default function PriceUpdateModal({ open, onClose, onUpdated }) {
  const [btcPrice, setBtcPrice] = useState("");
  const [ethPrice, setEthPrice] = useState("");
  const [aavePrice, setAavePrice] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    const btc = parseFloat(btcPrice) || 0;
    const eth = parseFloat(ethPrice) || 0;
    const aave = parseFloat(aavePrice) || 0;

    const assets = await base44.entities.CryptoAsset.list();
    const today = new Date().toISOString().split("T")[0];

    await Promise.all(assets.map(asset => {
      let price = null;
      if (BTC_TOKENS.includes(asset.token) && btc > 0) price = btc;
      else if (ETH_TOKENS.includes(asset.token) && eth > 0) price = eth;
      else if (AAVE_TOKENS.includes(asset.token) && aave > 0) price = aave;
      else if (STABLE_TOKENS.includes(asset.token)) price = 1;

      if (price === null) return null;
      const current_value_usd = (asset.amount || 0) * price;
      return base44.entities.CryptoAsset.update(asset.id, {
        current_price_usd: price,
        current_value_usd,
        last_updated: today,
      });
    }));

    // Take snapshot
    const updatedAssets = await base44.entities.CryptoAsset.list();
    const totalAssets = updatedAssets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
    const loans = await base44.entities.CryptoLoan.filter({ status: "Active" });
    const totalDebt = loans.reduce((s, l) => s + (l.principal_usd || 0), 0);

    await base44.entities.PortfolioSnapshot.create({
      snapshot_date: today,
      total_assets_usd: totalAssets,
      total_debt_usd: totalDebt,
      net_value_usd: totalAssets - totalDebt,
      btc_price: btc || null,
      eth_price: eth || null,
      aave_price: aave || null,
    });

    toast.success("מחירים עודכנו ותמונת מצב נשמרה");
    setLoading(false);
    onUpdated && onUpdated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>עדכון מחירים</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {[
            { label: "BTC Price ($)", value: btcPrice, set: setBtcPrice, placeholder: "70,000" },
            { label: "ETH Price ($)", value: ethPrice, set: setEthPrice, placeholder: "2,500" },
            { label: "AAVE Price ($)", value: aavePrice, set: setAavePrice, placeholder: "175" },
          ].map(f => (
            <div key={f.label}>
              <Label className="text-xs text-muted-foreground mb-1 block">{f.label}</Label>
              <Input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} type="number" />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Stablecoins יישארו על $1. תמונת מצב חדשה תיווצר אוטומטית.</p>
          <Button className="w-full" onClick={handleUpdate} disabled={loading}>
            {loading ? "מעדכן..." : "עדכן מחירים"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}