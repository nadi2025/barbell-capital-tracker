import { Link, useOutletContext } from "react-router-dom";
import { TrendingUp, RefreshCw, Wallet, Activity, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import AlertsPanel from "@/components/crypto/AlertsPanel";
import { useEntityList } from "@/hooks/useEntityQuery";
import { useAavePosition } from "@/hooks/useAavePosition";

const fmt = (v, d = 0) =>
v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => v == null ? "0%" : `${(v * 100).toFixed(1)}%`;

const COLORS = ["#f7931a", "#627eea", "#b6509e", "#2775ca", "#16c784", "#6c757d", "#94a3b8"];

export default function CryptoDashboard() {
  // PriceHub lives at the Layout level — opened via Outlet context
  const { openPriceHub } = useOutletContext() || {};

  // Real-time queries — auto-refresh every 60s + on window focus + on any mutation
  const { data: assets = [], isLoading: la } = useEntityList("CryptoAsset");
  const { data: loans = [] } = useEntityList("CryptoLoan", { filter: { status: "Active" } });
  const { data: lending = [] } = useEntityList("CryptoLending", { filter: { status: "Active" } });
  const { data: leveraged = [] } = useEntityList("LeveragedPosition", { filter: { status: "Open" } });
  const { data: lpPositions = [] } = useEntityList("LpPosition", { filter: { status: "Active" } });
  const { data: snapshots = [] } = useEntityList("PortfolioSnapshot", { sort: "-snapshot_date", limit: 20 });
  const { data: cryptoOptions = [] } = useEntityList("CryptoOptionsPosition", { filter: { status: "Open" } });
  const { data: pricesData = [] } = useEntityList("Prices");
  // Aave aggregate now derived on the client from AaveCollateral + AaveBorrow
  // + Prices (see hooks/useAavePosition.js). Same fields as the old server
  // function, plus instant React Query invalidation.
  const aaveData = useAavePosition();

  const loading = la;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  // ── Derived values (ALL dynamic — no magic numbers) ──
  const aaveBorrow = aaveData.borrowedAmount || 0;
  const aaveHF = aaveData.healthFactor || 0;
  const borrowPowerUsed = aaveData.borrowPowerUsed ? aaveData.borrowPowerUsed / 100 : 0;

  // Live price map — same source as calcDashboard uses
  const priceMap = {};
  pricesData.forEach((p) => {if (p.asset) priceMap[p.asset.toUpperCase()] = p.price_usd;});

  // Categorized asset values
  const aaveCollateralValue = assets.
  filter((a) => a.asset_category === "Collateral on Aave").
  reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const stablecoinsValue = assets.
  filter((a) => a.asset_category === "Stablecoin").
  reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const spotValue = assets.
  filter((a) => a.asset_category === "Spot").
  reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const walletValue = assets.reduce((s, a) => s + (a.current_value_usd || 0), 0);

  const aaveNetWorth = aaveCollateralValue - aaveBorrow;
  const activeNotional = cryptoOptions.reduce((s, o) => s + (o.notional_usd || 0), 0);
  const totalMarginFromPositions = leveraged.reduce((s, l) => s + (l.margin_usd || 0), 0);
  const hlUnrealizedPnl = leveraged.reduce((s, l) => {
    const livePrice = priceMap[(l.asset || "").toUpperCase()] || l.mark_price || 0;
    if (!livePrice || !l.entry_price || !l.size) return s;
    return s + (l.direction === "Long" ? (livePrice - l.entry_price) * l.size : (l.entry_price - livePrice) * l.size);
  }, 0);
  const hlEquity = totalMarginFromPositions + hlUnrealizedPnl;

  const vaultValue = lpPositions.reduce((s, l) => s + (l.current_value_usd || 0), 0);
  const lentValue = lending.reduce((s, l) => s + (l.amount_usd || 0), 0);
  const investorDebt = loans.reduce((s, l) => s + (l.principal_usd || 0), 0);

  // Total Assets = wallet (incl. Aave collateral) + HL equity + vaults + lending + options notional
  const totalAssets = walletValue + Math.max(0, hlEquity) + vaultValue + lentValue + activeNotional;
  const totalDebt = investorDebt + aaveBorrow;

  // NAV = equity in every bucket
  const nav = aaveNetWorth + stablecoinsValue + spotValue + lentValue + activeNotional + Math.max(0, hlEquity) + vaultValue - investorDebt;

  // Performance = NAV vs invested capital (investor debt is the capital we work with)
  const investedCapital = investorDebt > 0 ? investorDebt : 1;
  const perfPct = investedCapital > 0 ? (nav - investedCapital) / investedCapital * 100 : 0;

  // Effective leverage = Total exposure / Equity
  const exposureFromWallets = walletValue - stablecoinsValue; // non-stable crypto exposure
  const exposureFromHL = leveraged.reduce((s, l) => {
    const livePrice = priceMap[(l.asset || "").toUpperCase()] || l.mark_price || 0;
    const val = livePrice && l.size ? livePrice * l.size : l.position_value_usd || 0;
    return s + Math.abs(val);
  }, 0);
  const totalExposure = exposureFromWallets + exposureFromHL + vaultValue;
  const equity = nav > 0 ? nav : Math.max(1, totalAssets - totalDebt);
  const leverageRatio = equity > 0 ? totalExposure / equity : 0;

  const chartData = [...snapshots].reverse().map((s) => ({
    date: s.snapshot_date,
    nav: s.net_value_usd,
    assets: s.total_assets_usd
  }));

  // Alerts
  const liquidationAlerts = leveraged.filter((l) => {
    if (!l.liquidation_price || !l.mark_price) return false;
    return Math.abs((l.mark_price - l.liquidation_price) / l.mark_price) < 0.25;
  });

  const staleAssets = assets.filter((a) => {
    if (!a.last_updated) return true;
    const days = (Date.now() - new Date(a.last_updated).getTime()) / 86400000;
    return days > 7;
  });

  // Allocation pie — underlying exposure
  const byToken = (tokens) =>
  assets.filter((a) => tokens.includes((a.token || "").toUpperCase())).reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const byHLAsset = (asset) =>
  leveraged.filter((l) => (l.asset || "").toUpperCase() === asset).reduce((s, l) => {
    const livePrice = priceMap[asset] || l.mark_price || 0;
    const val = livePrice && l.size ? livePrice * l.size : l.position_value_usd || 0;
    return s + Math.abs(val);
  }, 0);

  const btcExposure = byToken(["AWBTC", "WBTC", "BTC"]) + byHLAsset("BTC");
  const ethExposure = byToken(["AETH", "WETH", "ETH"]) + byHLAsset("ETH");
  const aaveExposure = byToken(["AAAVE", "AAVE"]) + byHLAsset("AAVE");
  const mstrExposure = byHLAsset("MSTR");
  const stableExposure = stablecoinsValue;
  const optionsExposure = activeNotional;
  const otherExposure =
  assets.
  filter((a) => {
    const t = (a.token || "").toUpperCase();
    const known = ["AWBTC", "WBTC", "BTC", "AETH", "WETH", "ETH", "AAAVE", "AAVE"].includes(t);
    return !known && a.asset_category !== "Stablecoin";
  }).
  reduce((s, a) => s + (a.current_value_usd || 0), 0) + vaultValue;

  const totalExposureForPie = btcExposure + ethExposure + aaveExposure + mstrExposure + stableExposure + optionsExposure + otherExposure || 1;

  const pieData = [
  { name: "BTC", value: btcExposure },
  { name: "ETH", value: ethExposure },
  { name: "AAVE", value: aaveExposure },
  { name: "MSTR", value: mstrExposure },
  { name: "Stablecoins", value: stableExposure },
  { name: "Options", value: optionsExposure },
  { name: "Other", value: otherExposure }].
  filter((d) => d.value > 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">
              On-Chain
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Crypto Dashboard</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">MAGAM DeFi · Oasis Project G Ltd.</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openPriceHub}>
          <Zap className="w-4 h-4" /> מרכז מחירים
        </Button>
      </div>

      {/* Alerts */}
      <AlertsPanel
        borrowPowerUsed={borrowPowerUsed}
        liquidationAlerts={liquidationAlerts}
        staleAssets={staleAssets}
        loans={loans} />
      

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Net Asset Value</p>
          <p className={`text-2xl font-bold font-mono ${nav >= 0 ? "text-profit" : "text-loss"}`}>{fmt(nav)}</p>
          <p className="text-xs mt-1">
            Perf: <span className={perfPct >= 0 ? "text-profit" : "text-loss"}>{perfPct >= 0 ? "+" : ""}{perfPct.toFixed(1)}%</span>
          </p>
          <p className="text-xs text-muted-foreground">Assets {fmt(totalAssets)} − Debt {fmt(totalDebt)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Assets</p>
          <p className="text-xl font-bold font-mono text-foreground">{fmt(totalAssets)}</p>
          <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
            <p>Aave Collateral: {fmt(aaveCollateralValue)}</p>
            <p>Stablecoins: {fmt(stablecoinsValue)}</p>
            <p>HL Equity: {fmt(Math.max(0, hlEquity))}</p>
            <p>Vaults: {fmt(vaultValue)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Debt</p>
          <p className="text-xl font-bold font-mono text-loss">{fmt(totalDebt)}</p>
          <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
            <p>S&T: {fmt(investorDebt)}</p>
            <p>Aave Borrow: {fmt(aaveBorrow)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 hidden">
          <p className="text-xs text-muted-foreground mb-1">Effective Leverage</p>
          <p className="text-xl font-bold font-mono text-foreground">{leverageRatio.toFixed(2)}x</p>
          <p className="text-xs text-muted-foreground mt-1">Exposure {fmt(totalExposure)} / Equity</p>
          <p className="text-xs text-muted-foreground">Aave HF: <span className={aaveHF > 2 ? "text-profit" : aaveHF > 1.5 ? "text-amber-500" : "text-loss"}>{aaveHF > 0 ? aaveHF.toFixed(2) : "—"}</span></p>
        </div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Active Notional (Options)</p>
          <p className="text-xl font-bold font-mono text-foreground">{fmt(activeNotional)}</p>
          <p className="text-xs text-muted-foreground mt-1">{cryptoOptions.length} open positions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Borrow Power Used</p>
          <p className={`text-xl font-bold font-mono ${borrowPowerUsed > 0.7 ? "text-loss" : borrowPowerUsed > 0.5 ? "text-amber-400" : "text-profit"}`}>
            {pct(borrowPowerUsed)}
          </p>
          <div className="w-full bg-muted rounded-full h-1.5 mt-2">
            <div
              className={`h-1.5 rounded-full ${borrowPowerUsed > 0.7 ? "bg-loss" : borrowPowerUsed > 0.5 ? "bg-amber-400" : "bg-profit"}`}
              style={{ width: `${Math.min(100, borrowPowerUsed * 100)}%` }} />
            
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">HL Live P&L</p>
          <p className={`text-xl font-bold font-mono ${hlUnrealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
            {hlUnrealizedPnl >= 0 ? "+" : ""}{fmt(hlUnrealizedPnl)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {leveraged.length} פוזיציות · Margin {fmt(totalMarginFromPositions, 0)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Lending Given</p>
          <p className="text-xl font-bold font-mono text-foreground">{fmt(lentValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{lending.length} פוזיציות פעילות</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">NAV History</h3>
          {chartData.length > 1 ?
          <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 88%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Line type="monotone" dataKey="nav" stroke="hsl(158 72% 38%)" strokeWidth={2} dot={false} name="NAV" />
              </LineChart>
            </ResponsiveContainer> :

          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No historical data yet — update prices to start tracking
            </div>
          }
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Portfolio Allocation (Exposure)</h3>
          {pieData.length > 0 ?
          <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value">
                    {pieData.map((_, i) =>
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  )}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {pieData.map((d, i) =>
              <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-mono font-medium">{(d.value / totalExposureForPie * 100).toFixed(0)}%</span>
                  </div>
              )}
              </div>
            </div> :

          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No asset data</div>
          }
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
        { label: "Wallets & Assets", path: "/crypto/wallets", icon: Wallet, color: "text-chart-2" },
        { label: "Leveraged Positions", path: "/crypto/leveraged", icon: TrendingUp, color: "text-chart-3" },
        { label: "Activity Log", path: "/crypto/activity", icon: Activity, color: "text-chart-4" }].
        map((item) =>
        <Link
          key={item.path}
          to={item.path}
          className="bg-card border border-border rounded-xl p-4 hover:bg-muted/50 transition-colors flex items-center justify-between">
          
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <item.icon className={`w-5 h-5 ${item.color}`} />
          </Link>
        )}
      </div>

    </div>);

}