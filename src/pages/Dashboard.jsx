import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { RefreshCw, ArrowRight, ArrowUpRight, Zap, AlertTriangle, Calendar, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import PriceUpdateModal from "../components/crypto/PriceUpdateModal";
import UnifiedOverview from "../components/dashboard/UnifiedOverview";

const fmt = (v, d = 0) => {
  if (v == null || isNaN(v)) return "$0";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
};

const pct = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

function Row({ label, value, valueClass = "", sub }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-mono font-semibold ${valueClass}`}>{value}</span>
        {sub && <span className="text-xs text-muted-foreground ml-1.5">{sub}</span>}
      </div>
    </div>
  );
}

function SectionLabel({ label }) {
  return <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mt-3 mb-1">{label}</p>;
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
  const [leveraged, setLeveraged] = useState([]);
  const [hlTrades, setHlTrades] = useState([]);
  const [aaveAccount, setAaveAccount] = useState(null);
  const [aaveCollateral, setAaveCollateral] = useState([]);
  const [aaveBorrow, setAaveBorrow] = useState(null);
  const [cryptoOptions, setCryptoOptions] = useState([]);
  const [offChainInvestors, setOffChainInvestors] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [fetchingLivePrices, setFetchingLivePrices] = useState(false);

  const loadAll = async () => {
    const [o, s, d, snaps, debtList, ca, cl, cle, lev, aa, ac, ab, co, oci, hlt, pr] = await Promise.all([
      base44.entities.OptionsTrade.list("-open_date"),
      base44.entities.StockPosition.list(),
      base44.entities.Deposit.list(),
      base44.entities.AccountSnapshot.list("-snapshot_date", 1),
      base44.entities.DebtFacility.list(),
      base44.entities.CryptoAsset.list(),
      base44.entities.CryptoLoan.filter({ status: "Active" }),
      base44.entities.CryptoLending.filter({ status: "Active" }),
      base44.entities.LeveragedPosition.filter({ status: "Open" }),
      base44.entities.AaveAccount.list(),
      base44.entities.AaveCollateral.list(),
      base44.entities.AaveBorrow.list(),
      base44.entities.CryptoOptionsPosition.list(),
      base44.entities.OffChainInvestor.filter({ status: "Active" }),
      base44.entities.HLTrade.list("-trade_date", 500),
      base44.entities.Prices.list(),
    ]);
    setOptions(o); setStocks(s); setDeposits(d);
    setSnapshot(snaps[0] || null); setDebts(debtList || []);
    setCryptoAssets(ca); setCryptoLoans(cl); setCryptoLending(cle);
    setLeveraged(lev);
    setHlTrades(hlt || []);
    setAaveAccount(aa[0] || null);
    setAaveCollateral(ac);
    setAaveBorrow(ab[0] || null);
    setCryptoOptions(co || []);
    setOffChainInvestors(oci || []);
    setPrices(pr || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const handleFetchLivePrices = async () => {
    setFetchingLivePrices(true);
    try {
      await base44.functions.invoke('updatePricesDaily', {});
      await loadAll();
    } catch (e) {
      console.error('Error fetching prices:', e);
    } finally {
      setFetchingLivePrices(false);
    }
  };

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
  const ibPnl = ibNav - totalDeposited;
  const ibPnlPct = totalDeposited > 0 ? ibPnl / totalDeposited : 0;

  // ── On-Chain calcs ── (prices from Prices entity, fallback to CryptoAsset)
  const TOKEN_PRICES = {};
  prices.forEach(p => { if (p.asset && p.price_usd) TOKEN_PRICES[p.asset.toUpperCase()] = p.price_usd; });
  cryptoAssets.forEach(a => { if (a.token && a.current_price_usd && !TOKEN_PRICES[a.token.toUpperCase()]) TOKEN_PRICES[a.token.toUpperCase()] = a.current_price_usd; });
  if (!TOKEN_PRICES["WBTC"] && TOKEN_PRICES["BTC"]) TOKEN_PRICES["WBTC"] = TOKEN_PRICES["BTC"];
  if (!TOKEN_PRICES["BTC"] && TOKEN_PRICES["WBTC"]) TOKEN_PRICES["BTC"] = TOKEN_PRICES["WBTC"];
  if (!TOKEN_PRICES["WETH"] && TOKEN_PRICES["ETH"]) TOKEN_PRICES["WETH"] = TOKEN_PRICES["ETH"];
  const aaveCollateralUsd = aaveCollateral.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token?.toUpperCase()] || 0;
    return s + c.units * price;
  }, 0);
  const aaveBorrowUsd = aaveBorrow?.borrowed_amount || aaveAccount?.borrow_usd || 0;
  const cryptoTotalAssets = cryptoAssets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const loansGivenValue = cryptoLending.reduce((s, l) => s + (l.amount_usd || 0), 0);
  const investorDebt = cryptoLoans.reduce((s, l) => s + (l.principal_usd || 0), 0);
  const hlEquity = leveraged.reduce((s, l) => {
    const pnl = l.mark_price && l.entry_price && l.size
      ? (l.direction === "Long" ? 1 : -1) * (l.mark_price - l.entry_price) * l.size
      : 0;
    return s + (l.margin_usd || 0) + pnl;
  }, 0);
  const vaultValue = 0;
  const cryptoTotalAssets_WithHL = cryptoTotalAssets + Math.max(0, hlEquity) + vaultValue + loansGivenValue;
  const stablecoinsValue = cryptoAssets.filter(a => a.asset_category === "Stablecoin").reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const aaveNetWorth = aaveCollateralUsd - aaveBorrowUsd;
  const cryptoTotalDebt = investorDebt + aaveBorrowUsd;

  // ── Aave health ──
  const healthFactor = aaveAccount?.health_factor || (aaveCollateral.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token] || 0;
    return s + (c.units * price * (c.liquidation_threshold / 100));
  }, 0) / Math.max(aaveBorrowUsd, 1));
  const borrowPowerUsed = aaveAccount?.borrow_power_used || (aaveBorrowUsd / Math.max(aaveCollateral.reduce((s, c) => {
    const price = TOKEN_PRICES[c.token] || 0;
    return s + (c.units * price * (c.liquidation_threshold / 100));
  }, 0), 1));

  // ── On-Chain NAV calculation (same as Crypto Dashboard) ──
  const onChainNAV = aaveCollateralUsd - aaveBorrowUsd + stablecoinsValue + loansGivenValue;

  // ── Combined ──
  const totalAssets = ibNav + cryptoTotalAssets_WithHL; // Gross assets (Off + On chain, no debts deducted)
  const totalInvested = totalDeposited + investorDebt; // Total invested capital
  const totalAllDebts = totalOffChainDebt + cryptoTotalDebt; // All debts (Off + On chain)
  const totalNAV = totalAssets - totalAllDebts; // Net = Assets - All Debts
  const totalPnl = totalNAV - totalInvested; // P&L = Net - Invested

  // ── Alerts ──
  const alerts = [];
  const nextExpiry = openOptions.sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))[0];
  if (nextExpiry?.expiration_date) {
    const days = Math.ceil((new Date(nextExpiry.expiration_date) - new Date()) / 86400000);
    alerts.push({ icon: Calendar, color: days < 7 ? "text-amber-400" : "text-muted-foreground", label: `פקיעת אופציות הבאה: ${nextExpiry.expiration_date} (${days} ימים) · ${nextExpiry.ticker} $${nextExpiry.strike}`, category: "options" });
  }
  const nextDebt = debts.filter(d => d.status === "Active" && d.maturity_date).sort((a, b) => new Date(a.maturity_date) - new Date(b.maturity_date))[0];
  if (nextDebt) {
    const days = Math.ceil((new Date(nextDebt.maturity_date) - new Date()) / 86400000);
    const interest = nextDebt.outstanding_balance * nextDebt.interest_rate_pct / 100 / 4;
    alerts.push({ icon: Calendar, color: days < 30 ? "text-amber-400" : "text-muted-foreground", label: `תשלום ריבית הבא: ${fmt(interest)} · ${nextDebt.maturity_date} (${days} ימים)`, category: "debt" });
  }
  if (healthFactor > 0 && healthFactor < 2) {
    alerts.push({ icon: AlertTriangle, color: healthFactor < 1.5 ? "text-loss" : "text-amber-400", label: `Aave Health Factor: ${healthFactor.toFixed(2)} — ${healthFactor < 1.5 ? "סיכון גבוה!" : "שמור על מרחק"}`, category: "risk" });
  }
  const bigLoss = stocks.find(s => s.gain_loss_pct && s.gain_loss_pct < -0.3);
  if (bigLoss) {
    alerts.push({ icon: TrendingDown, color: "text-loss", label: `${bigLoss.ticker}: ${pct(bigLoss.gain_loss_pct)} ROE (${fmt(bigLoss.gain_loss)})`, category: "risk" });
  }
  leveraged.forEach(p => {
    if (p.mark_price && p.liquidation_price) {
      const dist = Math.abs((p.mark_price - p.liquidation_price) / p.mark_price) * 100;
      if (dist < 25) {
        alerts.push({ icon: AlertTriangle, color: dist < 15 ? "text-loss" : "text-amber-400", label: `HL ${p.asset} ${p.direction}: מרחק חיסול ${dist.toFixed(1)}% ${dist < 15 ? "⚠ פעולה דחופה!" : ""}`, category: "risk" });
      }
    }
  });

  const hfColor = healthFactor > 2 ? "text-profit" : healthFactor < 1.5 ? "text-loss" : "text-amber-400";
  const hfDot = healthFactor > 2 ? "bg-profit" : healthFactor < 1.5 ? "bg-loss" : "bg-amber-400";

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ══ UNIFIED OVERVIEW ══ */}
      <UnifiedOverview
        ibNav={ibNav}
        onChainNAV={onChainNAV}
        totalDeposited={totalDeposited}
        investorDebt={investorDebt}
        cryptoAssets={cryptoAssets}
        aaveCollateral={aaveCollateral}
        leveraged={leveraged}
        hlTrades={hlTrades}
        openOptions={openOptions}
        cryptoOptions={cryptoOptions}
        offChainInvestors={offChainInvestors}
        aaveAccount={aaveAccount}
        realizedPnl={realizedPnl}
        ibPnl={ibPnl}
        cryptoTotalAssets_WithHL={cryptoTotalAssets_WithHL}
        aaveBorrowUsd={aaveBorrowUsd}
        prices={prices}
      />

      <div className="border-t border-border/40 pt-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-4">פירוט — Off-Chain &amp; On-Chain</p>
      </div>

      {/* ══ HERO BANNER ══ */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">סה״כ נכסים</p>
            <p className={`text-4xl font-bold font-mono mt-1 text-foreground`}>{fmt(totalAssets)}</p>
            <p className="text-xs text-muted-foreground mt-1">Off: {fmt(ibNav)} · On: {fmt(cryptoTotalAssets_WithHL)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString("he-IL")}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleFetchLivePrices} disabled={fetchingLivePrices}>
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingLivePrices ? 'animate-spin' : ''}`} /> {fetchingLivePrices ? 'טוען...' : 'מהאינטרנט'}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPriceModalOpen(true)}>
              <RefreshCw className="w-3.5 h-3.5" /> ידני
            </Button>
          </div>
        </div>

        {/* Invested → Current = P&L flow */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 mb-5">
          <div className="bg-muted/50 rounded-xl px-4 py-3 min-w-[140px]">
            <p className="text-xs text-muted-foreground mb-0.5">הושקע</p>
            <p className="text-xl font-bold font-mono">{fmt(totalDeposited)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">הפקדות IB</p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground hidden sm:block" />
          <div className="bg-muted/50 rounded-xl px-4 py-3 min-w-[140px]">
            <p className="text-xs text-muted-foreground mb-0.5">שווי נוכחי</p>
            <p className="text-xl font-bold font-mono">{fmt(ibNav)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">NAV (IB)</p>
          </div>
          <span className="text-muted-foreground font-bold hidden sm:block">=</span>
          <div className={`rounded-xl px-4 py-3 min-w-[140px] ${ibPnl >= 0 ? "bg-profit/10" : "bg-loss/10"}`}>
            <p className="text-xs text-muted-foreground mb-0.5">IB P&L</p>
            <p className={`text-xl font-bold font-mono ${ibPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmt(ibPnl)}</p>
            <p className={`text-xs mt-0.5 ${ibPnl >= 0 ? "text-profit" : "text-loss"}`}>{pct(ibPnlPct)}</p>
          </div>
        </div>

        {/* Two-segment bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Off-Chain (IB): <span className={ibNav >= 0 ? "text-profit font-semibold" : "text-loss font-semibold"}>{fmt(ibNav)}</span></span>
            <span>On-Chain: <span className={onChainNAV >= 0 ? "text-profit font-semibold" : "text-loss font-semibold"}>{fmt(onChainNAV)}</span></span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
            {ibNav > 0 && (
              <div className="h-full bg-profit" style={{ width: `${(ibNav / Math.max(ibNav, 1)) * 100}%` }} />
            )}
            {onChainNAV < 0 && (
              <div className="h-full bg-loss opacity-60" style={{ width: `100%` }} />
            )}
          </div>
        </div>
      </div>

      {/* ══ TWO-COLUMN: OFF-CHAIN | ON-CHAIN ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* LEFT — Off-Chain */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Off-Chain · Interactive Brokers</h2>
          </div>

          <Row label="NAV (IB)" value={fmt(ibNav)} valueClass="text-foreground" />
          <Row label="הופקד" value={fmt(totalDeposited)} />
          <Row label="P&L כולל" value={fmt(ibPnl)} valueClass={ibPnl >= 0 ? "text-profit" : "text-loss"} sub={pct(ibPnlPct)} />

          <SectionLabel label="אופציות (מימוש)" />
          <Row label="P&L ממומש" value={fmt(realizedPnl)} valueClass={realizedPnl >= 0 ? "text-profit" : "text-loss"} />
          <Row label="עסקאות סגורות" value={closedOptions.length} />
          <Row label="Win Rate" value={`${(winRate * 100).toFixed(0)}%`} valueClass={winRate > 0.6 ? "text-profit" : ""} />
          <Row label="פרמיה שנגבתה" value={fmt(premiumCollected)} valueClass="text-profit" />

          <SectionLabel label="מניות (לא ממומש)" />
          <Row label="P&L לא ממומש" value={fmt(unrealizedPnl)} valueClass={unrealizedPnl >= 0 ? "text-profit" : "text-loss"} />
          <Row label="פוזיציות פתוחות" value={holdingStocks.length} />

          <SectionLabel label="מבנה הון" />
          <div className="py-1.5">
            {totalOffChainDebt > 0
              ? <p className="text-xs font-medium">Equity {((ibNav / (ibNav + totalOffChainDebt)) * 100).toFixed(0)}% · Debt {fmt(totalOffChainDebt)}</p>
              : <p className="text-xs font-medium text-muted-foreground">Equity 100% · אין חוב</p>
            }
          </div>

          <div className="mt-auto pt-4">
            <Link to="/options" className="text-xs text-primary flex items-center gap-1 hover:underline">
              לפירוט IB <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* RIGHT — On-Chain */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400/80">On-Chain · Crypto · DeFi</h2>
          </div>

          <Row label="On-Chain NAV" value={fmt(onChainNAV)} valueClass={onChainNAV >= 0 ? "text-profit" : "text-loss"} />
          <Row label="סה״כ נכסים" value={fmt(cryptoTotalAssets)} />
          <Row label="סה״כ חוב" value={fmt(cryptoTotalDebt)} valueClass="text-loss" />

          <SectionLabel label="פירוט נכסים" />
          <Row label="Aave collateral" value={fmt(aaveCollateralUsd > 0 ? aaveCollateralUsd : cryptoAssets.filter(a => a.asset_category === "Collateral on Aave").reduce((s, a) => s + (a.current_value_usd || 0), 0))} />
          <Row label="HyperLiquid equity" value={fmt(Math.max(0, hlEquity))} />
          <Row label="הלוואות שנתנו" value={fmt(loansGivenValue)} sub={`${cryptoLending.length} הלוואות`} />
          <Row label="מזומן / יציב" value={fmt(cryptoAssets.filter(a => a.asset_category === "Stablecoin").reduce((s, a) => s + (a.current_value_usd || 0), 0))} />

          <SectionLabel label="פירוט חוב" />
          <Row label="S&T Investor Debt" value={fmt(investorDebt)} valueClass="text-loss" />
          <Row label="Aave Borrow" value={fmt(aaveBorrowUsd)} valueClass="text-loss" />

          <SectionLabel label="סיכון מהיר" />
          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="text-xs text-muted-foreground">Aave Health Factor</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${hfDot}`} />
              <span className={`text-sm font-mono font-semibold ${hfColor}`}>{healthFactor > 0 ? healthFactor.toFixed(2) : "—"}</span>
            </div>
          </div>
          <Row label="Borrow Power Used" value={`${(borrowPowerUsed * 100).toFixed(0)}%`} valueClass={borrowPowerUsed > 0.7 ? "text-loss" : borrowPowerUsed > 0.5 ? "text-amber-400" : "text-profit"} />
          <Row label="פוזיציות HL פתוחות" value={leveraged.length} />

          <div className="mt-auto pt-4">
            <Link to="/crypto" className="text-xs text-orange-400 flex items-center gap-1 hover:underline">
              לדשבורד קריפטו <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ══ ALERTS BAR ══ */}
      {alerts.length > 0 && (() => {
        const categories = [
          { key: "options", label: "📅 אופציות", borderColor: "border-l-primary" },
          { key: "debt", label: "🏦 ריבית וחוב", borderColor: "border-l-amber-400" },
          { key: "risk", label: "⚠️ סיכון ומניות", borderColor: "border-l-loss" },
        ];
        return (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">התראות ואירועים קרובים</p>
            <div className="space-y-3">
              {categories.map(cat => {
                const catAlerts = alerts.filter(a => a.category === cat.key);
                if (catAlerts.length === 0) return null;
                return (
                  <div key={cat.key} className={`border-l-2 pl-3 ${cat.borderColor}`}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">{cat.label}</p>
                    <div className="space-y-1.5">
                      {catAlerts.map((a, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <a.icon className={`w-4 h-4 flex-shrink-0 ${a.color}`} />
                          <span className={`text-sm ${a.color}`}>{a.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <PriceUpdateModal open={priceModalOpen} onClose={() => setPriceModalOpen(false)} onUpdated={loadAll} prices={prices} />
    </div>
  );
}