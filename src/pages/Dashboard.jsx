import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import KpiCard from "../components/KpiCard";
import OpenOptionsTable from "../components/dashboard/OpenOptionsTable";
import HoldingsTable from "../components/dashboard/HoldingsTable";
import PnlChart from "../components/dashboard/PnlChart";
import AllocationChart from "../components/dashboard/AllocationChart";
import MonthlyPremiumChart from "../components/dashboard/MonthlyPremiumChart";
import {
  DollarSign, TrendingUp, Wallet, Target, Award, BarChart3
} from "lucide-react";

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return "$0";
  return val.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPct(val) {
  if (val === undefined || val === null || isNaN(val)) return "0%";
  return (val * 100).toFixed(1) + "%";
}

export default function Dashboard() {
  const [options, setOptions] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.OptionsTrade.list(),
      base44.entities.StockPosition.list(),
      base44.entities.Deposit.list(),
    ]).then(([o, s, d]) => {
      setOptions(o);
      setStocks(s);
      setDeposits(d);
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
  const totalPortfolioValue = holdingStocks.reduce((sum, s) => sum + (s.current_value || 0), 0);
  const totalInvested = deposits.reduce((sum, d) => {
    return d.type === "Deposit" ? sum + d.amount : sum - d.amount;
  }, 0);

  const closedOptions = options.filter(o => o.status === "Closed" || o.status === "Expired");
  const totalOptionsPnl = closedOptions.reduce((sum, o) => sum + (o.pnl || 0), 0);
  const totalStocksGainLoss = holdingStocks.reduce((sum, s) => sum + (s.gain_loss || 0), 0);
  const totalPnl = totalOptionsPnl + totalStocksGainLoss;
  const totalPnlPct = totalInvested > 0 ? totalPnl / totalInvested : 0;

  const totalPremium = options
    .filter(o => o.type === "Sell")
    .reduce((sum, o) => sum + (o.fill_price || 0) * (o.quantity || 0) * 100, 0);

  const openOptions = options.filter(o => o.status === "Open");
  const openCount = openOptions.length + holdingStocks.length;

  const winningTrades = closedOptions.filter(o => (o.pnl || 0) > 0).length;
  const winRate = closedOptions.length > 0 ? winningTrades / closedOptions.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Portfolio overview — Oasis Project G Ltd.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard
          title="Portfolio Value"
          value={formatCurrency(totalPortfolioValue)}
          icon={DollarSign}
        />
        <KpiCard
          title="Total Invested"
          value={formatCurrency(totalInvested)}
          icon={Wallet}
        />
        <KpiCard
          title="Total P&L"
          value={formatCurrency(totalPnl)}
          subtitle={formatPct(totalPnlPct)}
          trend={totalPnl >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />
        <KpiCard
          title="Options P&L"
          value={formatCurrency(totalOptionsPnl)}
          trend={totalOptionsPnl >= 0 ? "up" : "down"}
          icon={BarChart3}
        />
        <KpiCard
          title="Premium Collected"
          value={formatCurrency(totalPremium)}
          trend="up"
          icon={DollarSign}
        />
        <KpiCard
          title="Open Positions"
          value={openCount}
          icon={Target}
        />
        <KpiCard
          title="Win Rate"
          value={formatPct(winRate)}
          subtitle={`${winningTrades}/${closedOptions.length} trades`}
          icon={Award}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PnlChart options={closedOptions} />
        <AllocationChart stocks={holdingStocks} totalValue={totalPortfolioValue} />
      </div>

      <div className="grid grid-cols-1">
        <MonthlyPremiumChart options={options} />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <OpenOptionsTable options={openOptions} />
        <HoldingsTable stocks={holdingStocks} totalValue={totalPortfolioValue} />
      </div>
    </div>
  );
}