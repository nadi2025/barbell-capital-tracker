import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PriceUpdateModal from "../../components/crypto/PriceUpdateModal";
import DashSection1 from "../../components/crypto/DashSection1";
import DashSection2 from "../../components/crypto/DashSection2";
import DashSection3 from "../../components/crypto/DashSection3";
import DashSection4 from "../../components/crypto/DashSection4";
import DashAlertsBar from "../../components/crypto/DashAlertsBar";

export default function CryptoDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    const [assets, loans, lending, leveraged, lpPositions, snapshots, interestPayments, aaveList, ryskPositions] = await Promise.all([
      base44.entities.CryptoAsset.list(),
      base44.entities.CryptoLoan.filter({ status: "Active" }),
      base44.entities.CryptoLending.filter({ status: "Active" }),
      base44.entities.LeveragedPosition.filter({ status: "Open" }),
      base44.entities.LpPosition.filter({ status: "Active" }),
      base44.entities.PortfolioSnapshot.list("-snapshot_date", 20),
      base44.entities.InterestPayment.list("-payment_date"),
      base44.entities.AavePosition.list("-last_updated", 1),
      base44.entities.RyskPosition.filter({ status: "Open" }),
    ]);
    const aavePosition = aaveList[0] || null;

    // Derive last updated from most recently updated asset
    const dates = assets.map(a => a.last_updated).filter(Boolean).sort().reverse();
    setLastUpdated(dates[0] || null);

    setData({ assets, loans, lending, leveraged, lpPositions, snapshots, interestPayments, aavePosition, ryskPositions });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const isStale = lastUpdated && (new Date() - new Date(lastUpdated)) / 86400000 > 1;

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">MAGAM DeFi — Oasis Project G</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last updated: {lastUpdated || "—"}
            {isStale && <span className="ml-2 text-amber-500 font-medium">⚠ Data may be stale</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setPriceModalOpen(true)}>
          <RefreshCw className="w-4 h-4" /> Update Prices
        </Button>
      </div>

      {isStale && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 flex items-center gap-2 text-amber-700 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Data may be stale — update prices to get accurate portfolio values
        </div>
      )}

      <DashSection1 {...data} />
      <DashSection2 loans={data.loans} interestPayments={data.interestPayments} onRefresh={load} />
      <DashSection3 aavePosition={data.aavePosition} assets={data.assets} />
      <DashSection4 leveraged={data.leveraged} assets={data.assets} ryskPositions={data.ryskPositions} lending={data.lending} lpPositions={data.lpPositions} />
      <DashAlertsBar loans={data.loans} aavePosition={data.aavePosition} assets={data.assets} ryskPositions={data.ryskPositions} />

      <PriceUpdateModal open={priceModalOpen} onClose={() => setPriceModalOpen(false)} onUpdated={load} />
    </div>
  );
}