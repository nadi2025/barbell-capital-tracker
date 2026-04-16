import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardHeader from "@/components/dashboard2/DashboardHeader";
import KpiRow from "@/components/dashboard2/KpiRow";
import AllocationSection from "@/components/dashboard2/AllocationSection";
import SegmentsSection from "@/components/dashboard2/SegmentsSection";
import AlertsSection from "@/components/dashboard2/AlertsSection";
import PriceUpdateModal from "@/components/crypto/PriceUpdateModal";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);

  const loadAll = useCallback(async () => {
    const [
      options, stocks, deposits, snaps, debts,
      cryptoAssets, cryptoLoans, cryptoLending,
      leveraged, cryptoOptions, offChainInvestors,
      prices, aaveRes, lpPositions, hlTrades
    ] = await Promise.all([
      base44.entities.OptionsTrade.list("-open_date"),
      base44.entities.StockPosition.list(),
      base44.entities.Deposit.list(),
      base44.entities.AccountSnapshot.list("-snapshot_date", 1),
      base44.entities.DebtFacility.list(),
      base44.entities.CryptoAsset.list(),
      base44.entities.CryptoLoan.filter({ status: "Active" }),
      base44.entities.CryptoLending.filter({ status: "Active" }),
      base44.entities.LeveragedPosition.filter({ status: "Open" }),
      base44.entities.CryptoOptionsPosition.list(),
      base44.entities.OffChainInvestor.filter({ status: "Active" }),
      base44.entities.Prices.list(),
      base44.functions.invoke("calculateAavePosition", {}),
      base44.entities.LpPosition.filter({ status: "Active" }),
      base44.entities.HLTrade.list("-trade_date", 500),
    ]);

    const aave = aaveRes?.data || {};

    setData({
      options, stocks, deposits,
      snapshot: snaps[0] || null,
      debts: debts || [],
      cryptoAssets, cryptoLoans, cryptoLending,
      leveraged, cryptoOptions,
      openCryptoOptions: (cryptoOptions || []).filter(o => o.status === "Open"),
      offChainInvestors, prices,
      aaveCollateral: aave.collateralDetails || [],
      aaveBorrowUsd: aave.borrowedAmount || 0,
      healthFactor: aave.healthFactor || 0,
      borrowPowerUsed: aave.borrowPowerUsed || 0,
      lpPositions: lpPositions || [],
      hlTrades: hlTrades || [],
    });
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleLiveRefresh = async () => {
    setRefreshing(true);
    try {
      await base44.functions.invoke("dailyFullUpdate", {});
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <DashboardHeader
          data={data}
          refreshing={refreshing}
          onLiveRefresh={handleLiveRefresh}
          onManualPrice={() => setPriceModalOpen(true)}
        />
        <KpiRow data={data} />
        <AllocationSection data={data} />
        <SegmentsSection data={data} />
        <AlertsSection data={data} />
      </div>
      <PriceUpdateModal
        open={priceModalOpen}
        onClose={() => setPriceModalOpen(false)}
        onUpdated={loadAll}
        prices={data.prices}
      />
    </div>
  );
}