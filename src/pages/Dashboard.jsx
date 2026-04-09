import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, BarChart3, Award, DollarSign,
  Wallet, CreditCard, Activity, Bitcoin, ArrowUpRight, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import DebtAlerts from "../components/dashboard/DebtAlerts";
import CapitalStructure from "../components/dashboard/CapitalStructure";
import PriceUpdateModal from "../components/crypto/PriceUpdateModal";

const fmt = (v, d = 0) => {
  if (v == null || isNaN(v)) return "$0";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
};

const COLORS = ["#f7931a", "#627eea", "#b6509e", "#2775ca", "#16c784", "#6c757d"];

function StatCard({ title, value, sub, trend, icon: Icon, accent }) {
  return (
    <div className={`bg-card border rounded-xl p-4 flex flex-col gap-1 ${accent || "border-border"}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground/50" />}
      </div>
      <p className={`text-2xl font-bold font-mono ${trend === "up" ? "text-profit" : trend === "down" ? "text-loss" : "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [options, setOptions] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [debts, setDebts] = useState([]);
  const [cryptoAssets, setCryptoAssets] = useState([]);
  const [cryptoLoans, setCryptoLoans] = useState([]);
  const [cryptoLending, setCryptoLending] = useState([]);
  const [cryptoSnapshots, setCryptoSnapshots] = useState([]);
  const [optionsTrades, setOptionsTrades] = useState([]);
  const [aaveAccount, setAaveAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [priceModalOpen, setPriceModalOpen] = useState(false);

  const loadAll = async () => {
    const [o, s, d, snaps, debtList, ca, cl, cle, cs, ot, aa] = await Promise.all([
      base44.entities.OptionsTrade.list("-open_date"),
      base44.entities.StockPosition.list(),
      base44.entities.Deposit.list(),
      base44.entities.AccountSnapshot.list("-snapshot_date", 1),
      base44.entities.DebtFacility.list(),
      base44.entities.CryptoAsset.list(),
      base44.entities.CryptoLoan.filter({ status: "Active" }),
      base44.entities.CryptoLending.filter({ status: "Active" }),
      base44.entities.PortfolioSnapshot.list("-snapshot_date", 20),
      base44.entities.OptionsTrade.filter({ ticker: "RFS" }),
      base44.entities.AaveAccount.list(),
    ]);
    setOptions(o); setStocks(s); setDeposits(d);
    setSnapshot(snaps[0] || null); setDebts(debtList || []);
    setCryptoAssets(ca); setCryptoLoans(cl); setCryptoLending(cle); setCryptoSnapshots(cs); setOptionsTrades(ot);
    setAaveAccount(aa[0] || null);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );

  // ── Off-Chain calcs ──
  const holdingStocks = stocks.filter(s => s.status === "Holding" || s.status === "Partially Sold");
  const totalDeposited = deposits.reduce((s, d) => d.type === "Deposit" ? s + d.amount : s - d.amount, 0);
  const closedOptions = options.filter(o => o.status === "Closed" || o.status === "Expired");
  const openOptions = options.filter(o => o.status === "Open");
  const realizedPnl = closedOptions.reduce((s, o) => s + (o.pnl || 0), 0);
  const unrealizedPnl = holdingStocks.reduce((s, x) => s + (x.gain_loss || 0), 0);
  const premiumCollected = options.filter(o => o.type === "Sell").reduce((s, o) => s + (o.fill_price || 0) * (o.quantity || 0) * 100, 0);
  const winRate = closedOptions.length > 0 ? closedOptions.filter(o => (o.pnl || 0) > 0).length / closedOptions.length : 0;
  const totalOffChainDebt = debts.filter(d => d.status === "Active").reduce((s, d) => s + (d.outstanding_balance || 0), 0);
  const ibNav = snapshot?.nav || 0;
  const offChainNAV = ibNav - totalOffChainDebt;

  // ── On-Chain calcs ──
  const cryptoTotalAssets = cryptoAssets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const loansGivenValue = cryptoLending.reduce((s, l) => s + (l.amount_usd || 0), 0);
  const aaveBorrowAmount = aaveAccount?.borrow_usd || 0;
  const cryptoTotalDebt = cryptoLoans.reduce((s, l) => s + (l.principal_usd || 0), 0) + aaveBorrowAmount;
  const cryptoNAV = cryptoTotalAssets + loansGivenValue - cryptoTotalDebt;

  // ── Combined ──
  const totalNAV = ibNav + cryptoNAV;

  // Crypto allocation pie
  const btcVal = cryptoAssets.filter(a => ["awBTC","wBTC","BTC"].includes(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const ethVal = cryptoAssets.filter(a => ["aETH","ETH"].includes(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const aaveVal = cryptoAssets.filter(a => ["aAAVE","AAVE"].includes(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const stableVal = cryptoAssets.filter(a => a.asset_category === "Stablecoin").reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const otherVal = cryptoAssets.filter(a => !["awBTC","wBTC","BTC","aETH","ETH","aAAVE","AAVE"].includes(a.token) && a.asset_category !== "Stablecoin").reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const pieData = [
    { name: "BTC", value: btcVal },
    { name: "ETH", value: ethVal },
    { name: "AAVE", value: aaveVal },
    { name: "Stablecoins", value: stableVal },
    { name: "Other", value: otherVal },
  ].filter(d => d.value > 0);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0) || 1;

  // NAV history chart
  const chartData = [...cryptoSnapshots].reverse().map(s => ({
    date: s.snapshot_date?.slice(5),
    nav: s.net_value_usd,
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Oasis Project G Ltd. · {new Date().toLocaleDateString("he-IL")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setPriceModalOpen(true)}>
          <RefreshCw className="w-4 h-4" /> עדכן מחירי קריפטו
        </Button>
      </div>

      {/* ══ COMBINED NAV BANNER ══ */}
      <div className="bg-gradient-to-r from-primary/10 to-chart-2/10 border border-primary/20 rounded-2xl p-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">שווי תיק כולל (Off-Chain + On-Chain)</p>
        <p className="text-4xl font-bold font-mono text-foreground">{fmt(totalNAV)}</p>
        <div className="flex gap-6 mt-3">
          <div>
            <p className="text-xs text-muted-foreground">הון מניות (IB)</p>
            <p className="text-lg font-semibold font-mono">{fmt(ibNav)}</p>
          </div>
          <div className="border-l border-border pl-6">
            <p className="text-xs text-muted-foreground">On-Chain NAV</p>
            <p className={`text-lg font-semibold font-mono ${cryptoNAV >= 0 ? "text-profit" : "text-loss"}`}>{fmt(cryptoNAV)}</p>
          </div>
          <div className="border-l border-border pl-6">
            <p className="text-xs text-muted-foreground">הופקד סך הכל</p>
            <p className="text-lg font-semibold font-mono">{fmt(totalDeposited)}</p>
          </div>
        </div>
      </div>

      {/* ══ OFF-CHAIN SECTION ══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Off-Chain · Interactive Brokers</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="NAV (IB)" value={fmt(ibNav)} icon={BarChart3} />
          <StatCard title="P&L ממומש (אופציות)" value={fmt(realizedPnl)} trend={realizedPnl >= 0 ? "up" : "down"} icon={TrendingUp} sub={`${closedOptions.length} עסקאות סגורות`} />
          <StatCard title="P&L לא ממומש (מניות)" value={fmt(unrealizedPnl)} trend={unrealizedPnl >= 0 ? "up" : "down"} icon={Activity} sub={`${holdingStocks.length} מניות`} />
          <StatCard title="פרמיה שנגבתה" value={fmt(premiumCollected)} icon={Award} sub={`Win Rate: ${(winRate * 100).toFixed(0)}%`} />
        </div>
      </div>

      {/* Debt Alerts */}
      <DebtAlerts debts={debts} />

      {/* Capital Structure */}
      <CapitalStructure debts={debts} nav={ibNav} totalDeposited={totalDeposited} />

      {/* ══ ON-CHAIN SECTION ══ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-400/80">On-Chain · קריפטו</h2>
          </div>
          <Link to="/crypto" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            לדשבורד קריפטו <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="NAV קריפטו" value={fmt(cryptoNAV)} trend={cryptoNAV >= 0 ? "up" : "down"} icon={Bitcoin} />
          <StatCard title="סה״כ נכסים On-Chain" value={fmt(cryptoTotalAssets)} icon={Wallet} sub={`${cryptoAssets.length} נכסים`} />
          <StatCard title="הלוואות שנתנו" value={fmt(loansGivenValue)} icon={Wallet} sub={`${cryptoLending.length} הלוואות`} />
          <Link to="/crypto/aave" className="bg-card border border-border rounded-xl p-4 hover:bg-muted/20 transition-colors flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">חוב On-Chain</p>
              <CreditCard className="w-4 h-4 text-muted-foreground/50" />
            </div>
            <p className="text-2xl font-bold font-mono text-loss">{fmt(cryptoTotalDebt)}</p>
            <p className="text-xs text-muted-foreground">Aave: {fmt(aaveBorrowAmount)}</p>
          </Link>
          <StatCard title="BTC" value={fmt(btcVal)} icon={Bitcoin} sub={`ETH: ${fmt(ethVal)}`} />
        </div>
      </div>

      {/* On-Chain: Chart + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* NAV History */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">היסטוריית NAV קריפטו</h3>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(158 72% 38%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(158 72% 38%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 88%)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={v => fmt(v)} />
                <Area type="monotone" dataKey="nav" stroke="hsl(158 72% 38%)" fill="url(#navGrad)" strokeWidth={2} name="NAV" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">אין עדיין נתונים היסטוריים — עדכן מחירים כדי להתחיל לאסוף</div>
          )}
        </div>

        {/* Allocation Pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">הקצאת תיק On-Chain</h3>
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
              <div className="flex-1 space-y-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-medium">{(d.value / pieTotal * 100).toFixed(0)}%</span>
                      <span className="text-muted-foreground ml-1">{fmt(d.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">אין נתוני נכסים</div>
          )}
        </div>
      </div>

      <PriceUpdateModal open={priceModalOpen} onClose={() => setPriceModalOpen(false)} onUpdated={loadAll} />
    </div>
  );
}