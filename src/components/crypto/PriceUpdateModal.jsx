import { useState, useEffect } from "react";
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
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchLivePrices = async () => {
    setFetching(true);
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,aave&vs_currencies=usd");
      const data = await res.json();
      if (data.bitcoin?.usd) setBtcPrice(String(data.bitcoin.usd));
      if (data.ethereum?.usd) setEthPrice(String(data.ethereum.usd));
      if (data.aave?.usd) setAavePrice(String(data.aave.usd));
      toast.success("מחירים נשאבו בזמן אמת");
    } catch {
      toast.error("שגיאה בשליפת מחירים");
    }
    setFetching(false);
  };

  useEffect(() => {
    if (open) fetchLivePrices();
  }, [open]);

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

    toast.success("Prices updated and snapshot saved");
    setLoading(false);
    onUpdated && onUpdated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Prices</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={fetchLivePrices} disabled={fetching}>
            {fetching ? "Fetching..." : "Fetch Live Prices"}
          </Button>
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
          <p className="text-xs text-muted-foreground">Stablecoins remain at $1. A new portfolio snapshot will be created automatically.</p>
          <Button className="w-full" onClick={handleUpdate} disabled={loading}>
            {loading ? "Updating..." : "Update Prices"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}