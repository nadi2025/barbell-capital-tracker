import { useState } from "react";
import { base44 } from "@/api/base44Client";
import DashboardHeader from "@/components/dashboard2/DashboardHeader";
import KpiRow from "@/components/dashboard2/KpiRow";
import AllocationSection from "@/components/dashboard2/AllocationSection";
import SegmentsSection from "@/components/dashboard2/SegmentsSection";
import AlertsSection from "@/components/dashboard2/AlertsSection";
import PriceUpdateModal from "@/components/crypto/PriceUpdateModal";
import { useDashboardData } from "@/hooks/useDashboardData";

export default function Dashboard() {
  const { data, isLoading, isFetching, refetchAll, lastSyncedAt } = useDashboardData();
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);

  const handleLiveRefresh = async () => {
    setLiveRefreshing(true);
    try {
      await base44.functions.invoke("dailyFullUpdate", {});
      refetchAll();
    } finally {
      setLiveRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <DashboardHeader
          data={data}
          refreshing={liveRefreshing}
          isFetching={isFetching}
          lastSyncedAt={lastSyncedAt}
          onLiveRefresh={handleLiveRefresh}
          onSoftRefresh={refetchAll}
          onManualPrice={() => setPriceModalOpen(true)}
        />
        {/* Alerts surface high-priority items above the fold */}
        <AlertsSection data={data} />
        <KpiRow data={data} />
        <SegmentsSection data={data} />
        <AllocationSection data={data} />
      </div>
      <PriceUpdateModal
        open={priceModalOpen}
        onClose={() => setPriceModalOpen(false)}
        onUpdated={refetchAll}
        prices={data.prices}
      />
    </div>
  );
}
