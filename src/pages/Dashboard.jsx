import { useOutletContext } from "react-router-dom";
import DashboardHeader from "@/components/dashboard2/DashboardHeader";
import CapitalStructureSection from "@/components/dashboard2/CapitalStructureSection";
import AllocationSection from "@/components/dashboard2/AllocationSection";
import SegmentsSection from "@/components/dashboard2/SegmentsSection";
import AlertsSection from "@/components/dashboard2/AlertsSection";
import HLPositionsSection from "@/components/dashboard2/HLPositionsSection";
import { useDashboardData } from "@/hooks/useDashboardData";
import ManualEntriesPanel from "@/components/dashboard2/ManualEntriesPanel";

export default function Dashboard() {
  const { data, isLoading, isFetching, refetchAll, lastSyncedAt } = useDashboardData();
  // PriceHub is mounted once at the Layout level; pages open it via context.
  const { openPriceHub } = useOutletContext() || {};

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
          isFetching={isFetching}
          lastSyncedAt={lastSyncedAt}
          onOpenPriceHub={openPriceHub}
          onSoftRefresh={refetchAll}
        />
        {/* Alerts surface high-priority items above the fold */}
        <AlertsSection data={data} />
        <CapitalStructureSection data={data} />
        <SegmentsSection data={data} />
        <HLPositionsSection data={data} />
        <AllocationSection data={data} />
        <ManualEntriesPanel />
      </div>
    </div>
  );
}