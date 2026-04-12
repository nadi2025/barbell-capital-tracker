import { useAavePosition } from '../../hooks/useAavePosition';
import AaveSummaryBar from '../../components/aave/AaveSummaryBar';
import AaveSuppliesTable from '../../components/aave/AaveSuppliesTable';
import AaveBorrowsTable from '../../components/aave/AaveBorrowsTable';
import AaveStressTest from '../../components/aave/AaveStressTest';
import AaveActivityLog from '../../components/aave/AaveActivityLog';

export default function AaveAccountPage() {
  const { position, loading, error, refresh } = useAavePosition();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !position) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 text-sm">שגיאה בטעינת נתונים: {error?.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Aave Account</h1>
        <span className="text-xs bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded-full">On-Chain</span>
      </div>

      <AaveSummaryBar
        netWorth={position.netWorth}
        netApy={position.netApy}
        healthFactor={position.healthFactor}
        borrowPowerUsed={position.borrowPowerUsed}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AaveSuppliesTable
          collateralDetails={position.collateralDetails}
          totalCollateral={position.totalCollateral}
          supplyApy={position.supplyApy}
          onEdit={refresh}
        />
        <AaveBorrowsTable
          borrowedAmount={position.borrowedAmount}
          borrowApy={position.borrowApy}
          availableToBorrow={position.availableToBorrow}
          maxBorrowCapacity={position.maxBorrowCapacity}
          eMode={position.eMode}
          onEdit={refresh}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AaveStressTest />
        <AaveActivityLog />
      </div>

      {position.lastUpdated && (
        <div className="text-xs text-muted-foreground text-center py-4">
          Updated: {new Date(position.lastUpdated).toLocaleString('he-IL')}
        </div>
      )}
    </div>
  );
}