import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, RefreshCw, Wallet, BarChart3, Activity, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import PriceUpdateModal from "../../components/crypto/PriceUpdateModal";
import AlertsPanel from "../../components/crypto/AlertsPanel";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => v == null ? "0%" : `${(v * 100).toFixed(1)}%`;

const COLORS = ["#f7931a", "#627eea", "#b6509e", "#2775ca", "#16c784", "#6c757d"];

export default function CryptoDashboard() {
  const [assets, setAssets] = useState([]);
  const [loans, setLoans] = useState([]);
  const [lending, setLending] = useState([]);
  const [leveraged, setLeveraged] = useState([]);
  const [lpPositions, setLpPositions] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priceModalOpen, setPriceModalOpen] = useState(false);

  const load = async () => {
    const [a, lo, le, lev, lp, sn] = await Promise.all([
      base44.entities.CryptoAsset.list(),
      base44.entities.CryptoLoan.filter({ status: "Active" }),
      base44.entities.CryptoLending.filter({ status: "Active" }),
      base44.entities.LeveragedPosition.filter({ status: "Open" }),
      base44.entities.LpPosition.filter({ status: "Active" }),
      base44.entities.PortfolioSnapshot.list("-snapshot_date", 20),
    ]);
    setAssets(a); setLoans(lo); setLending(le); setLeveraged(lev); setLpPositions(lp); setSnapshots(sn);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  // CORRECT ACCOUNTING MODEL:
  // Assets = things we OWN at current market value
  const walletValue = assets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const hlEquity = leveraged.reduce((s, l) => {
    const pnl = l.mark_price && l.entry_price && l.size
      ? (l.direction === "Long" ? 1 : -1) * (l.mark_price - l.entry_price) * l.size
      : 0;
    return s + (l.margin_usd || 0) + pnl;
  }, 0);
  const vaultValue = lpPositions.reduce((s, l) => s + (l.current_value_usd || 0), 0);
  const lentValue = lending.reduce((s, l) => s + (l.amount_usd || 0), 0);
  const totalAssets = walletValue + Math.max(0, hlEquity) + vaultValue + lentValue;
  
  // Liabilities = things we OWE
  // S&T investor debt + Aave borrow (if any)
  const investorDebt = loans.reduce((s, l) => s + (l.principal_usd || 0), 0);
  const aaveBorrow = 327000; // Aave USDC borrow against collateral — MUST be included
  const totalDebt = investorDebt + aaveBorrow;
  const nav = totalAssets - totalDebt;
  const totalLent = lending.reduce((s, l) => s + (l.amount_usd || 0), 0);

  const activeLoan = loans[0];
  const quarterlyPayment = activeLoan ? activeLoan.principal_usd * activeLoan.annual_interest_rate / 4 : 0;



  // Effective leverage = Total Exposure / Equity
  // Exposure = underlying crypto exposure (not HL notional), Equity = NAV or Assets - Aave Borrow
  const exposureFromWallets = walletValue; // Aave collateral is the exposure
  const exposureFromHL = leveraged.reduce((s, l) => s + (l.position_value_usd || 0), 0); // HL notional
  const totalExposure = exposureFromWallets + exposureFromHL + vaultValue;
  const equity = Math.max(100000, totalAssets - aaveBorrow); // Equity at least the remaining buffer
  const leverageRatio = equity > 0 ? totalExposure / equity : 0;
  const borrowPowerUsed = activeLoan?.borrow_power_used || 0;

  const chartData = [...snapshots].reverse().map(s => ({
    date: s.snapshot_date,
    nav: s.net_value_usd,
    assets: s.total_assets_usd,
  }));

  // Alerts
  const liquidationAlerts = leveraged.filter(l => {
    if (!l.liquidation_price || !l.entry_price) return false;
    const current = l.entry_price;
    const liq = l.liquidation_price;
    return Math.abs(current - liq) / current < 0.15;
  });

  const staleAssets = assets.filter(a => {
    if (!a.last_updated) return true;
    const days = (new Date() - new Date(a.last_updated)) / 86400000;
    return days > 7;
  });

  // Allocation pie — based on UNDERLYING CRYPTO EXPOSURE (Aave collateral + HL notional)
  const btcWalletVal = assets.filter(a => ["awBTC", "wBTC", "BTC"].includes(a.token))
    .reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const btcHLVal = leveraged.filter(l => l.asset === "BTC").reduce((s, l) => s + (l.position_value_usd || 0), 0);
  const btcExposure = btcWalletVal + btcHLVal;

  const ethWalletVal = assets.filter(a => ["aETH", "ETH"].includes(a.token))
    .reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const ethHLVal = leveraged.filter(l => l.asset === "ETH").reduce((s, l) => s + (l.position_value_usd || 0), 0);
  const ethExposure = ethWalletVal + ethHLVal;

  const aaveWalletVal = assets.filter(a => ["aAAVE", "AAVE"].includes(a.token))
    .reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const aaveHLVal = leveraged.filter(l => l.asset === "AAVE").reduce((s, l) => s + (l.position_value_usd || 0), 0);
  const aaveExposure = aaveWalletVal + aaveHLVal;

  const mstrExposure = leveraged.filter(l => l.asset === "MSTR").reduce((s, l) => s + (l.position_value_usd || 0), 0);
  const stableExposure = assets.filter(a => a.asset_category === "Stablecoin")
    .reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const otherExposure = assets.filter(a => !["awBTC","wBTC","BTC","aETH","ETH","aAAVE","AAVE"].includes(a.token) && a.asset_category !== "Stablecoin")
    .reduce((s, a) => s + (a.current_value_usd || 0), 0) + vaultValue;

  const totalExposureForPie = btcExposure + ethExposure + aaveExposure + mstrExposure + stableExposure + otherExposure || 1;

  const pieData = [
    { name: "BTC", value: btcExposure },
    { name: "ETH", value: ethExposure },
    { name: "AAVE", value: aaveExposure },
    { name: "MSTR", value: mstrExposure },
    { name: "Stablecoins", value: stableExposure },
    { name: "Other", value: otherExposure },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
            <h1 className="text-2xl font-bold tracking-tight">Crypto Dashboard</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">MAGAM DeFi · Oasis Project G Ltd.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setPriceModalOpen(true)}>
            <RefreshCw className="w-4 h-4" /> Update Prices
          </Button>
        </div>
      </div>

      {/* Alerts */}
      <AlertsPanel
        borrowPowerUsed={borrowPowerUsed}
        liquidationAlerts={liquidationAlerts}
        staleAssets={staleAssets}
        loans={loans}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Net Asset Value</p>
          <p className={`text-2xl font-bold font-mono ${nav >= 0 ? "text-profit" : "text-loss"}`}>{fmt(nav)}</p>
          <p className="text-xs mt-1">Perf: <span className={nav >= 0 ? "text-profit" : "text-loss"}>{((nav / investorDebt) * 100).toFixed(1)}%</span></p>
          <p className="text-xs text-muted-foreground">Assets {fmt(totalAssets)} − Debt {fmt(totalDebt)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Assets</p>
          <p className="text-xl font-bold font-mono text-foreground">{fmt(totalAssets)}</p>
          <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
            <p>Aave: {fmt(walletValue)}</p>
            <p>HL equity: {fmt(Math.max(0, hlEquity))}</p>
            <p>Vaults: {fmt(vaultValue)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Debt</p>
          <p className="text-xl font-bold font-mono text-loss">{fmt(totalDebt)}</p>
          <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
            <p>S&T: {fmt(investorDebt)}</p>
            <p>Aave borrow: {fmt(aaveBorrow)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Effective Leverage</p>
          <p className="text-xl font-bold font-mono text-foreground">{leverageRatio.toFixed(2)}x</p>
          <p className="text-xs text-muted-foreground mt-1">Exposure {fmt(totalExposure)} / Equity</p>
        </div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Borrow Power Used</p>
          <p className={`text-xl font-bold font-mono ${borrowPowerUsed > 0.7 ? "text-loss" : borrowPowerUsed > 0.5 ? "text-amber-400" : "text-profit"}`}>
            {pct(borrowPowerUsed)}
          </p>
          <div className="w-full bg-muted rounded-full h-1.5 mt-2">
            <div className={`h-1.5 rounded-full ${borrowPowerUsed > 0.7 ? "bg-loss" : borrowPowerUsed > 0.5 ? "bg-amber-400" : "bg-profit"}`}
              style={{ width: `${Math.min(100, borrowPowerUsed * 100)}%` }} />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Open Leveraged Positions</p>
          <p className="text-xl font-bold font-mono text-foreground">{leveraged.filter(l => l.status === "Open").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Margin: {fmt(leveraged.filter(l => l.status === "Open").reduce((s, l) => s + (l.margin_usd || 0), 0))}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* NAV Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">NAV History</h3>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 88%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => fmt(v)} />
                <Line type="monotone" dataKey="nav" stroke="hsl(158 72% 38%)" strokeWidth={2} dot={false} name="NAV" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No historical data yet — update prices to start tracking</div>
          )}
        </div>

        {/* Allocation Pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Portfolio Allocation</h3>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-mono font-medium">{(d.value / totalExposureForPie * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No asset data</div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Wallets & Assets", path: "/crypto/wallets", icon: Wallet, color: "text-chart-2" },
          { label: "Leveraged Positions", path: "/crypto/leveraged", icon: TrendingUp, color: "text-chart-3" },
          { label: "Activity Log", path: "/crypto/activity", icon: Activity, color: "text-chart-4" },
        ].map(item => (
          <Link key={item.path} to={item.path}
            className="bg-card border border-border rounded-xl p-4 hover:bg-muted/50 transition-colors flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
            <item.icon className={`w-5 h-5 ${item.color}`} />
          </Link>
        ))}
      </div>

      <PriceUpdateModal open={priceModalOpen} onClose={() => setPriceModalOpen(false)} onUpdated={load} />
    </div>
  );
}