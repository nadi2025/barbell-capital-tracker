import { Link } from "react-router-dom";
import { differenceInDays, format } from "date-fns";

const fmt = (v, d = 0) => {
  if (v == null || isNaN(v)) return "$0";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmtILS = (v) => v == null ? "₪0" : `₪${Math.abs(v).toLocaleString("he-IL")}`;
const pct = (v, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

function SvgPie({ slices, size = 130 }) {
  const total = slices.reduce((s, sl) => s + sl.val, 0);
  if (!total) return null;
  const cx = size / 2, cy = size / 2, r = size / 2 - 8;
  let paths = [], angle = -Math.PI / 2;
  for (const sl of slices) {
    if (!sl.val) continue;
    const sweep = (sl.val / total) * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    paths.push(
      <path key={sl.name} d={`M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`}
        fill={sl.color} stroke="white" strokeWidth="2" />
    );
    angle = end;
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}>{paths}</svg>
  );
}

export default function UnifiedOverview({
  ibNav, cryptoNAV, totalDeposited, investorDebt,
  cryptoAssets, aaveCollateral, leveraged, hlTrades = [], openOptions, cryptoOptions,
  offChainInvestors, aaveAccount, realizedPnl, ibPnl, cryptoTotalAssets_WithHL, aaveBorrowUsd
}) {
  const today = new Date();

  // Prices from cryptoAssets
  const getPrice = (tokens) => {
    for (const t of tokens) {
      const a = cryptoAssets.find(x => x.token?.toUpperCase() === t.toUpperCase());
      if (a?.current_price_usd) return a.current_price_usd;
    }
    return 0;
  };
  const btcPrice = getPrice(["BTC", "WBTC"]);
  const ethPrice = getPrice(["ETH", "WETH"]);
  const aavePrice = getPrice(["AAVE"]);
  const mstrPrice = getPrice(["MSTR"]);

  // Row 1 calcs — cryptoNAV is already calculated properly in Dashboard
  const totalInvested = totalDeposited + investorDebt;
  const currentValue = ibNav + cryptoNAV; // Net value
  const totalPnl = currentValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Pie data
  const getCollateral = (tokens) => {
    const unit = aaveCollateral.find(c => tokens.some(t => c.token?.toUpperCase() === t.toUpperCase()));
    return unit?.units || 0;
  };
  const btcCollVal = getCollateral(["BTC", "WBTC"]) * btcPrice;
  const ethCollVal = getCollateral(["ETH", "WETH"]) * ethPrice;
  const aaveCollVal = getCollateral(["AAVE"]) * aavePrice;

  const hlByAsset = {};
  leveraged.forEach(l => {
    const k = l.asset?.toUpperCase();
    const price = k === "BTC" ? btcPrice : k === "ETH" ? ethPrice : k === "AAVE" ? aavePrice : k === "MSTR" ? mstrPrice : 0;
    const val = price && l.size ? price * l.size : l.position_value_usd || 0;
    hlByAsset[k] = (hlByAsset[k] || 0) + Math.abs(val);
  });

  const stablecoins = cryptoAssets.filter(a => /usdc|usdt|dai/i.test(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0);

  const pieSlices = [
    { name: "BTC", val: btcCollVal + (hlByAsset["BTC"] || 0), color: "#f7931a" },
    { name: "ETH", val: ethCollVal + (hlByAsset["ETH"] || 0), color: "#627eea" },
    { name: "AAVE", val: aaveCollVal + (hlByAsset["AAVE"] || 0), color: "#b878e8" },
    { name: "MSTR", val: hlByAsset["MSTR"] || 0, color: "#3b82f6" },
    { name: "IB", val: ibNav, color: "#10b981" },
    { name: "Stablecoins", val: stablecoins, color: "#94a3b8" },
  ].filter(s => s.val > 500);
  const pieTotal = pieSlices.reduce((s, sl) => s + sl.val, 0) || 1;

  // Bar chart: P&L by strategy
  const aaveYield = aaveCollateral.reduce((s, c) => {
    const p = c.token?.toUpperCase().includes("BTC") ? btcPrice : c.token?.toUpperCase().includes("ETH") ? ethPrice : c.token?.toUpperCase() === "AAVE" ? aavePrice : 0;
    return s + ((c.supply_apy || 0) / 100) * (c.units || 0) * p / 52;
  }, 0);
  const ryskPremium = cryptoOptions.reduce((s, o) => s + (o.income_usd || 0), 0);
  // Use stored mark_price exactly as OpenPositionsTab does
  const hlUnrealizedPnl = leveraged.reduce((s, l) => {
    if (!l.mark_price || !l.entry_price || !l.size) return s;
    const pnlCalc = l.direction === "Long"
      ? (l.mark_price - l.entry_price) * l.size
      : (l.entry_price - l.mark_price) * l.size;
    return s + pnlCalc;
  }, 0);
  // Dashboard shows Live PnL (unrealized only) to match HL page Live PnL card
  const hlPnl = hlUnrealizedPnl;

  const barItems = [
    { label: "IB Options", val: realizedPnl, color: realizedPnl >= 0 ? "#22c55e" : "#ef4444" },
    { label: "Rysk Finance", val: ryskPremium, color: ryskPremium >= 0 ? "#22c55e" : "#ef4444" },
    { label: "Aave Yield", val: Math.round(aaveYield), color: "#22c55e" },
    { label: "HyperLiquid", val: Math.round(hlPnl), color: hlPnl >= 0 ? "#22c55e" : "#ef4444" },
    { label: "IB P&L", val: ibPnl, color: ibPnl >= 0 ? "#22c55e" : "#ef4444" },
  ].filter(b => Math.abs(b.val) > 0);
  const maxBarVal = Math.max(...barItems.map(b => Math.abs(b.val)), 1);

  // Upcoming events
  const urgencyEvents = [];
  openOptions.filter(o => o.expiration_date).forEach(o => {
    const d = differenceInDays(new Date(o.expiration_date), today);
    if (d >= 0 && d <= 60) urgencyEvents.push({ urgency: d <= 7 ? "red" : d <= 30 ? "yellow" : "green", daysLeft: d, text: `${o.ticker} ${o.category} — ${format(new Date(o.expiration_date), "d.M.yy")}` });
  });
  cryptoOptions.filter(o => o.status === "Open" && o.maturity_date).forEach(o => {
    const d = differenceInDays(new Date(o.maturity_date), today);
    if (d >= 0 && d <= 60) urgencyEvents.push({ urgency: d <= 7 ? "red" : d <= 30 ? "yellow" : "green", daysLeft: d, text: `${o.asset} ${o.option_type} (Rysk) — ${format(new Date(o.maturity_date), "d.M.yy")}` });
  });
  offChainInvestors.filter(inv => inv.interest_schedule === "Monthly" && inv.status === "Active").forEach(inv => {
    const payDay = inv.payment_day_of_month || 1;
    let next = new Date(today.getFullYear(), today.getMonth(), payDay);
    if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
    const d = differenceInDays(next, today);
    if (d <= 30) {
      const payStr = inv.interest_currency === "ILS" ? fmtILS(inv.monthly_payment) : fmt(inv.monthly_payment);
      urgencyEvents.push({ urgency: d <= 5 ? "red" : "yellow", daysLeft: d, text: `ריבית ${inv.name}: ${payStr} — ${format(next, "d.M.yy")}` });
    }
  });
  if (aaveAccount?.health_factor && aaveAccount.health_factor < 2.5) {
    const hf = aaveAccount.health_factor;
    urgencyEvents.unshift({ urgency: hf < 1.5 ? "red" : hf < 2.0 ? "yellow" : "green", daysLeft: -1, text: `Aave HF: ${hf.toFixed(2)} ${hf < 1.5 ? "⚠ סכנת חיסול!" : hf < 2.0 ? "— שמור על מרחק" : "— בסדר"}` });
  }
  leveraged.forEach(l => {
    if (l.mark_price && l.liquidation_price) {
      const dist = Math.abs((l.mark_price - l.liquidation_price) / l.mark_price * 100);
      if (dist < 30) urgencyEvents.unshift({ urgency: dist < 20 ? "red" : "yellow", daysLeft: -1, text: `HL ${l.asset} ${l.direction} — מחיסול ${dist.toFixed(1)}%` });
    }
  });
  const sortedEvents = urgencyEvents.sort((a, b) => (a.urgency === "red" ? -2 : a.urgency === "yellow" ? -1 : 0) - (b.urgency === "red" ? -2 : b.urgency === "yellow" ? -1 : 0) || a.daysLeft - b.daysLeft).slice(0, 6);

  const urgencyStyle = { red: "bg-red-100 text-red-700 border-red-200", yellow: "bg-amber-50 text-amber-700 border-amber-200", green: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  const urgencyDot = { red: "🔴", yellow: "🟡", green: "🟢" };

  return (
    <div className="space-y-4">
      {/* Row 1: Big 3 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">הושקע סה״כ</p>
          <p className="text-3xl font-bold font-mono">{fmt(totalInvested)}</p>
          <p className="text-xs text-muted-foreground mt-1">Off: {fmt(totalDeposited, 0)} · On: {fmt(investorDebt, 0)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">שווי נוכחי</p>
          <p className={`text-3xl font-bold font-mono ${currentValue >= 0 ? "text-profit" : "text-loss"}`}>{fmt(currentValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Off: {fmt(ibNav, 0)} · On: {fmt(cryptoNAV, 0)}</p>
        </div>
        <div className={`border rounded-xl p-5 ${totalPnl >= 0 ? "bg-profit/5 border-profit/20" : "bg-loss/5 border-loss/20"}`}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">רווח / הפסד כולל</p>
          <p className={`text-3xl font-bold font-mono ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}>{fmt(totalPnl)}</p>
          <p className={`text-xs mt-1 ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}>{pct(totalPnlPct)} מההשקעה</p>
        </div>
      </div>

      {/* Row 2: Pie + Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">הקצאת נכסים</p>
          <div className="flex items-center gap-4">
            <SvgPie slices={pieSlices} size={130} />
            <div className="flex flex-col gap-1.5">
              {pieSlices.map(sl => (
                <div key={sl.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sl.color }} />
                  <span className="text-muted-foreground w-20">{sl.name}</span>
                  <span className="font-mono font-semibold">{((sl.val / pieTotal) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">ביצועים לפי אסטרטגיה</p>
          <div className="space-y-2.5">
            {barItems.map(b => {
              const bw = (Math.abs(b.val) / maxBarVal) * 100;
              return (
                <div key={b.label} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-24 flex-shrink-0 text-right">{b.label}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${bw}%`, background: b.color, opacity: 0.85 }} />
                  </div>
                  <span className="font-mono font-semibold w-20 text-right" style={{ color: b.color }}>{b.val >= 0 ? "+" : ""}{fmt(b.val, 0)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Alert strip */}
      {sortedEvents.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">אירועים קרובים</p>
          <div className="flex flex-wrap gap-2">
            {sortedEvents.map((e, i) => (
              <span key={i} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${urgencyStyle[e.urgency]}`}>
                {urgencyDot[e.urgency]} {e.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Row 4: Quick link cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/options" className="block bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OFF-CHAIN · IB</p>
          </div>
          <p className="text-xl font-bold font-mono">{fmt(ibNav)}</p>
          <p className={`text-xs font-mono mt-0.5 ${ibPnl >= 0 ? "text-profit" : "text-loss"}`}>P&L: {fmt(ibPnl, 0)} ({pct(ibNav > 0 && totalDeposited > 0 ? (ibPnl / totalDeposited) * 100 : 0)})</p>
          <p className="text-xs text-muted-foreground mt-1.5">IB Dashboard →</p>
        </Link>
        <Link to="/crypto" className="block bg-card border border-border rounded-xl p-4 hover:border-orange-400/40 transition-colors">
          <p className="text-xs text-muted-foreground mb-1">Net Asset Value</p>
          <p className={`text-2xl font-bold font-mono ${cryptoNAV >= 0 ? "text-profit" : "text-loss"}`}>{fmt(cryptoNAV)}</p>
          <p className="text-xs mt-1">Perf: <span className={cryptoNAV >= 0 ? "text-profit" : "text-loss"}>{((cryptoNAV / investorDebt) * 100).toFixed(1)}%</span></p>
          <p className="text-xs text-muted-foreground">Assets {fmt(cryptoTotalAssets_WithHL)} − Debt {fmt(investorDebt + aaveBorrowUsd)}</p>
          <p className="text-xs text-muted-foreground mt-1.5">Crypto Dashboard →</p>
        </Link>
      </div>
    </div>
  );
}