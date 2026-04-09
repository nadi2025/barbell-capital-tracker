import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PortfolioBreakdown from "../components/dashboard/PortfolioBreakdown";
import MarginPanel from "../components/dashboard/MarginPanel";
import OpenOptionsTable from "../components/dashboard/OpenOptionsTable";
import HoldingsTable from "../components/dashboard/HoldingsTable";
import PnlChart from "../components/dashboard/PnlChart";
import AllocationChart from "../components/dashboard/AllocationChart";
import MonthlyPremiumChart from "../components/dashboard/MonthlyPremiumChart";
import StrategyInsights from "../components/dashboard/StrategyInsights";
import CapitalStructure from "../components/dashboard/CapitalStructure";
import DebtAlerts from "../components/dashboard/DebtAlerts";
import KpiCard from "../components/KpiCard";
import { TrendingUp, Award, BarChart3, Activity } from "lucide-react";

function fmt(val, decimals = 0) {
  if (val === undefined || val === null || isNaN(val)) return "$0";
  return val.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Dashboard() {
  const [options, setOptions] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.OptionsTrade.list("-open_date"),
      base44.entities.StockPosition.list(),
      base44.entities.Deposit.list(),
      base44.entities.AccountSnapshot.list("-snapshot_date", 1),
      base44.entities.DebtFacility.list(),
    ]).then(([o, s, d, snaps, debtList]) => {
      setOptions(o);
      setStocks(s);
      setDeposits(d);
      setSnapshot(snaps[0] || null);
      setDebts(debtList || []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const holdingStocks = stocks.filter(s => s.status === "Holding" || s.status === "Partially Sold");
  const totalStockValue = holdingStocks.reduce((s, x) => s + (x.current_value || 0), 0);

  const totalDeposited = deposits.reduce((s, d) => d.type === "Deposit" ? s + d.amount : s - d.amount, 0);

  const closedOptions = options.filter(o => o.status === "Closed" || o.status === "Expired");
  const openOptions = options.filter(o => o.status === "Open");

  const realizedPnl = closedOptions.reduce((s, o) => s + (o.pnl || 0), 0);
  const unrealizedPnl = holdingStocks.reduce((s, x) => s + (x.gain_loss || 0), 0);

  const premiumCollected = options
    .filter(o => o.type === "Sell")
    .reduce((s, o) => s + (o.fill_price || 0) * (o.quantity || 0) * 100, 0);

  const winRate = closedOptions.length > 0
    ? closedOptions.filter(o => (o.pnl || 0) > 0).length / closedOptions.length
    : 0;

  const openCollateral = openOptions.reduce((s, o) => s + (o.collateral || 0), 0);
  const openPremiumLocked = openOptions
    .filter(o => o.type === "Sell")
    .reduce((s, o) => s + (o.fill_price || 0) * (o.quantity || 0) * 100, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Oasis Project G Ltd. · IB U***72525 · As of Apr 9, 2026</p>
        </div>
      </div>

      {/* Top row: NAV + Margin */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PortfolioBreakdown snapshot={snapshot} totalDeposited={totalDeposited} />
        </div>
        <MarginPanel snapshot={snapshot} />
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          title="Realized P&L (Options)"
          value={fmt(realizedPnl)}
          trend={realizedPnl >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />
        <KpiCard
          title="Total Premium Collected"
          value={fmt(premiumCollected)}
          subtitle={`${openOptions.filter(o=>o.type==='Sell').length} open sells`}
          trend="up"
          icon={BarChart3}
        />
        <KpiCard
          title="Unrealized Stock P&L"
          value={fmt(unrealizedPnl)}
          trend={unrealizedPnl >= 0 ? "up" : "down"}
          icon={Activity}
        />
        <KpiCard
          title="Win Rate"
          value={`${(winRate * 100).toFixed(0)}%`}
          subtitle={`${closedOptions.filter(o=>(o.pnl||0)>0).length}/${closedOptions.length} trades`}
          icon={Award}
        />
      </div>

      {/* Debt Alerts */}
      <DebtAlerts debts={debts} />

      {/* Capital Structure */}
      <CapitalStructure debts={debts} nav={snapshot?.nav || 0} totalDeposited={totalDeposited} />

      {/* Strategy insights */}
      <StrategyInsights options={options} stocks={holdingStocks} snapshot={snapshot} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PnlChart options={closedOptions} />
        <AllocationChart stocks={holdingStocks} totalValue={totalStockValue} />
      </div>

      <MonthlyPremiumChart options={options} />

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <OpenOptionsTable options={openOptions} />
        <HoldingsTable stocks={holdingStocks} totalValue={totalStockValue} />
      </div>
    </div>
  );
}