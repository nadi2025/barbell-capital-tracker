import { useAavePosition } from '../../hooks/useAavePosition';
import AaveSummaryBar from '../../components/aave/AaveSummaryBar';
import AaveSuppliesTable from '../../components/aave/AaveSuppliesTable';
import AaveBorrowsTable from '../../components/aave/AaveBorrowsTable';
import AaveStressTest from '../../components/aave/AaveStressTest';
import AaveActivityLog from '../../components/aave/AaveActivityLog';

/**
 * AaveAccountPage — Aave dashboard page.
 *
 * Migrated to use the new useAavePosition shape (top-level aggregate fields).
 * Underneath, the hook reads AaveCollateral, AaveBorrow, and Prices via
 * React Query and runs them through computeAaveAggregate from portfolioMath,
 * so any mutation on those entities reflects on screen instantly without
 * round-tripping a Deno function.
 */
export default function AaveAccountPage() {
  const {
    netWorth,
    netApy,
    healthFactor,
    borrowPowerUsed,
    collateralDetails,
    totalCollateral,
    supplyApy,
    borrowedAmount,
    borrowApy,
    availableToBorrow,
    maxBorrowCapacity,
    eMode,
    lastUpdated,
    isLoading,
    error,
    refetch,
  } = useAavePosition();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
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
        netWorth={netWorth}
        netApy={netApy}
        healthFactor={healthFactor}
        borrowPowerUsed={borrowPowerUsed}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AaveSuppliesTable
          collateralDetails={collateralDetails}
          totalCollateral={totalCollateral}
          supplyApy={supplyApy}
          onEdit={refetch}
        />
        <AaveBorrowsTable
          borrowedAmount={borrowedAmount}
          borrowApy={borrowApy}
          availableToBorrow={availableToBorrow}
          maxBorrowCapacity={maxBorrowCapacity}
          eMode={eMode}
          onEdit={refetch}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AaveStressTest />
        <AaveActivityLog />
      </div>

      {lastUpdated && (
        <div className="text-xs text-muted-foreground text-center py-4">
          Updated: {new Date(lastUpdated).toLocaleString('he-IL')}
        </div>
      )}
    </div>
  );
}
