import { format, differenceInDays } from "date-fns";

const $ = (v, d = 0) => {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const str = abs.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v < 0 ? "-$" : "$") + str;
};
const pct = (v, d = 1) => v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const fmtILS = (v) => v == null ? "—" : `₪${Math.abs(v).toLocaleString("he-IL")}`;
const fmtDate = (d) => { try { return format(new Date(d), "d.M.yy"); } catch { return d || "—"; } };

function urgencyColor(days) {
  if (days <= 7) return "#dc2626";
  if (days <= 30) return "#d97706";
  return "#16a34a";
}
function urgencyBg(days) {
  if (days <= 7) return "#fee2e2";
  if (days <= 30) return "#fef3c7";
  return "#dcfce7";
}
function urgencyDot(days) {
  if (days <= 7) return "🔴";
  if (days <= 30) return "🟡";
  return "🟢";
}

export function buildReportHTML({ answers, appData, prevReport }) {
  const today = new Date();
  const todayStr = format(today, "dd.MM.yyyy");
  const periodStart = format(new Date(new Date().setDate(today.getDate() - 7)), "d.M.yy");
  const periodEnd = format(today, "d.M.yy");

  const { assets, aaveCollateral, leveraged, investors, investorPayments, cryptoOptions, ibOptions, stocks = [], hlTrades = [], prices = [], aaveBorrowUsd = 0, aaveHealthFactor = 0 } = appData;
  // Auto-calculate IB stocks P&L from StockPosition entity
  const ibStocksPnl = stocks.reduce((s, st) => s + (st.gain_loss || 0), 0);

  // Prices — prefer wizard override, then Prices entity, then CryptoAsset fallback
  const priceEntityMap = {};
  prices.forEach(p => { priceEntityMap[p.asset?.toUpperCase()] = p.price_usd; });
  const getPrice = (tokens, override) => {
    if (override && parseFloat(override) > 0) return parseFloat(override);
    for (const t of tokens) {
      if (priceEntityMap[t.toUpperCase()] > 0) return priceEntityMap[t.toUpperCase()];
    }
    for (const t of tokens) {
      const a = assets.find(x => x.token?.toUpperCase() === t.toUpperCase());
      if (a?.current_price_usd > 0) return a.current_price_usd;
    }
    return 0;
  };
  const btcP = getPrice(["BTC", "WBTC"], answers.btc_price);
  const ethP = getPrice(["ETH", "WETH"], answers.eth_price);
  const aaveP = getPrice(["AAVE"], answers.aave_price);
  const mstrP = getPrice(["MSTR"], answers.mstr_price);

  // Aave collateral values — uses asset_name field (not token)
  // Deduplicate by asset_name, keep latest
  const uniqueCollaterals = {};
  aaveCollateral.forEach(c => {
    const key = c.asset_name?.toUpperCase();
    if (!key) return;
    if (!uniqueCollaterals[key] || new Date(c.updated_date || c.created_date) > new Date(uniqueCollaterals[key].updated_date || uniqueCollaterals[key].created_date)) {
      uniqueCollaterals[key] = c;
    }
  });
  const getCollUnit = (keys) => {
    for (const k of keys) {
      const c = uniqueCollaterals[k.toUpperCase()];
      if (c) return c.units || 0;
    }
    return 0;
  };
  const ethUnits = getCollUnit(["ETH", "WETH"]);
  const btcUnits = getCollUnit(["BTC", "WBTC"]);
  const aaveTokenUnits = getCollUnit(["AAVE"]);
  const ethCollVal = ethUnits * ethP;
  const btcCollVal = btcUnits * btcP;
  const aaveCollValUSD = aaveTokenUnits * aaveP;
  const totalCollateral = ethCollVal + btcCollVal + aaveCollValUSD;
  // Use live-calculated Aave data (from calculateAavePosition function)
  const aaveBorrow = aaveBorrowUsd;
  const aaveHF = aaveHealthFactor > 0 ? aaveHealthFactor : null;

  // HL positions
  const openLev = leveraged.filter(l => l.status === "Open").map(l => {
    const price = l.asset?.toUpperCase() === "BTC" ? btcP : l.asset?.toUpperCase() === "ETH" ? ethP
      : l.asset?.toUpperCase() === "AAVE" ? aaveP : l.asset?.toUpperCase() === "MSTR" ? mstrP : l.mark_price || 0;
    const posVal = price && l.size ? price * l.size : l.position_value_usd || 0;
    const pnlCalc = price && l.entry_price && l.size
      ? (price - l.entry_price) * l.size * (l.direction === "Short" ? -1 : 1) : l.pnl_usd || 0;
    const roe = pnlCalc && l.margin_usd ? (pnlCalc / l.margin_usd) * 100 : null;
    const distLiq = price && l.liquidation_price ? Math.abs((price - l.liquidation_price) / price * 100) : null;
    return { ...l, posVal, pnlCalc, roe, distLiq };
  });
  const hlPnl = openLev.reduce((s, l) => s + l.pnlCalc, 0);
  // HL realized P&L from trade history
  const hlRealizedPnl = hlTrades
    .filter(t => t.direction?.toLowerCase().includes("close"))
    .reduce((s, t) => s + (t.closed_pnl || 0), 0);
  const hlTotalPnl = hlPnl + hlRealizedPnl;

  // On-chain NAV (same formula as Crypto Dashboard: Aave net + stablecoins + lending)
  const stablecoins = assets.filter(a => /usdc|usdt|dai/i.test(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const otherAssets = assets.filter(a => !/usdc|usdt|dai|eth|weth|btc|wbtc|aave|mstr/i.test(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const cryptoInvestorDebt = 1700000; // S&T debt — fixed
  const aaveNetWorth = totalCollateral - aaveBorrow;
  const lentValue = 0; // No active lending positions
  const onChainNav = aaveNetWorth + stablecoins + otherAssets + lentValue;

  // Total NAV
  const ibNav = answers.ib_nav;
  const totalNav = ibNav + onChainNav;
  const totalInvested = 413000 + cryptoInvestorDebt;
  const totalPnl = totalNav - totalInvested;
  const totalPnlPct = (totalPnl / totalInvested) * 100;
  const prevTotal = prevReport ? (prevReport.ib_nav || 0) + (prevReport.wizard_on_chain_nav || 0) : null;
  const weekChange = prevTotal != null ? totalNav - prevTotal : null;

  // Pie slices
  const hlByAsset = {};
  openLev.forEach(l => {
    const k = l.asset?.toUpperCase();
    hlByAsset[k] = (hlByAsset[k] || 0) + Math.abs(l.posVal || 0);
  });
  const pieBTC = btcCollVal + (hlByAsset["BTC"] || 0);
  const pieETH = ethCollVal + (hlByAsset["ETH"] || 0);
  const pieAAVE = aaveCollValUSD + (hlByAsset["AAVE"] || 0);
  const pieMSTR = hlByAsset["MSTR"] || 0;
  const pieIB = Math.max(0, ibNav);
  const pieStable = stablecoins;
  const pieOther = Math.max(0, otherAssets);
  const pieTotal = pieBTC + pieETH + pieAAVE + pieMSTR + pieIB + pieStable + pieOther || 1;
  const pieData = [
    { label: "BTC", val: pieBTC, color: "#f7931a" },
    { label: "ETH", val: pieETH, color: "#627eea" },
    { label: "AAVE", val: pieAAVE, color: "#b878e8" },
    { label: "MSTR", val: pieMSTR, color: "#3b82f6" },
    { label: "IB", val: pieIB, color: "#10b981" },
    { label: "Stablecoins", val: pieStable, color: "#94a3b8" },
    { label: "Other", val: pieOther, color: "#e2e8f0" },
  ].filter(s => s.val > 0);

  // Bar chart data
  const ryskPremium = cryptoOptions.reduce((s, o) => s + (o.income_usd || 0), 0);
  const aaveYield = Object.values(uniqueCollaterals).reduce((s, c) => {
    const key = c.asset_name?.toUpperCase() || "";
    const p = key.includes("BTC") ? btcP : key.includes("ETH") ? ethP : key === "AAVE" ? aaveP : 0;
    return s + ((c.supply_apy || 0) / 100) * (c.units || 0) * p / 52;
  }, 0);
  const barData = [
    { label: "IB Options P&L", val: answers.ib_options_pnl },
    { label: "Rysk Premium", val: ryskPremium },
    { label: "Aave Yield", val: Math.round(aaveYield) },
    { label: "IB Stocks", val: ibStocksPnl },
    { label: "HyperLiquid (unrealized)", val: Math.round(hlPnl) },
    { label: "HyperLiquid (realized)", val: Math.round(hlRealizedPnl) },
  ].filter(b => b.val !== 0);

  // Events (60 days)
  const events = [];
  const openCryptoOpts = cryptoOptions.filter(o => o.status === "Open" && o.maturity_date);
  openCryptoOpts.forEach(o => {
    const days = differenceInDays(new Date(o.maturity_date), today);
    if (days >= 0 && days <= 60) events.push({ days, text: `${o.asset} ${o.option_type} ×${o.size || 1} (Rysk) — ${fmtDate(o.maturity_date)}` });
  });
  const openIbOpts = ibOptions.filter(o => o.status === "Open" && o.expiration_date);
  openIbOpts.forEach(o => {
    const days = differenceInDays(new Date(o.expiration_date), today);
    if (days >= 0 && days <= 60) events.push({ days, text: `${o.ticker} ${o.category} ×${o.quantity} (IB) — ${fmtDate(o.expiration_date)}` });
  });
  investors.filter(inv => inv.interest_schedule === "Monthly" && inv.status === "Active").forEach(inv => {
    const payDay = inv.payment_day_of_month || 1;
    let next = new Date(today.getFullYear(), today.getMonth(), payDay);
    if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
    const days = differenceInDays(next, today);
    if (days <= 60) {
      const payStr = inv.interest_currency === "ILS" ? fmtILS(inv.monthly_payment) : $(inv.monthly_payment);
      events.push({ days, text: `ריבית ${inv.name}: ${payStr} — ${fmtDate(next)}` });
    }
  });
  if (aaveHF && aaveHF < 2.0) events.unshift({ days: 0, text: `Aave HF: ${aaveHF.toFixed(2)} — ${aaveHF < 1.5 ? "⚠ סכנת חיסול!" : "שמור על מרחק"}` });
  openLev.forEach(l => {
    if (l.distLiq != null && l.distLiq < 30) events.unshift({ days: 0, text: `HL ${l.asset} ${l.direction} — מרחק חיסול ${l.distLiq.toFixed(1)}%` });
  });
  const sortedEvents = events.sort((a, b) => a.days - b.days).slice(0, 8);
  const extraEvents = events.length > 8 ? events.length - 8 : 0;

  // Risks
  const risks = [];
  openLev.forEach(l => {
    if (l.roe != null && l.roe < -100) risks.push({ level: "red", text: `${l.asset} ${l.leverage || ""}x: ROE ${l.roe.toFixed(0)}%, מרחק חיסול ${l.distLiq?.toFixed(1) || "?"}%` });
    else if (l.distLiq != null && l.distLiq < 25) risks.push({ level: "red", text: `${l.asset} ${l.leverage || ""}x: מרחק חיסול ${l.distLiq.toFixed(1)}% ⚠ פעולה דחופה!` });
    else if (l.distLiq != null && l.distLiq < 35) risks.push({ level: "yellow", text: `${l.asset} ${l.leverage || ""}x: מרחק חיסול ${l.distLiq.toFixed(1)}%` });
  });
  if (aaveHF) {
    if (aaveHF < 1.5) risks.push({ level: "red", text: `Aave HF: ${aaveHF.toFixed(2)} — סכנת חיסול!` });
    else if (aaveHF < 2.0) risks.push({ level: "yellow", text: `Aave HF: ${aaveHF.toFixed(2)} — שמור על מרחק` });
    else risks.push({ level: "green", text: `Aave HF: ${aaveHF.toFixed(2)} — בטוח` });
  }
  const ibPnlTotal = ibNav - 413000;
  if (ibPnlTotal / 413000 < -0.25) risks.push({ level: "yellow", text: `תיק IB ירד ${Math.abs((ibPnlTotal / 413000) * 100).toFixed(1)}% מהשקעה מקורית` });
  const expiringSoon = [...openCryptoOpts, ...openIbOpts].filter(o => {
    const d = differenceInDays(new Date(o.expiration_date || o.maturity_date), today);
    return d >= 0 && d <= 7;
  });
  if (expiringSoon.length > 0) risks.push({ level: "yellow", text: `${expiringSoon.length} אופציות פוקעות תוך 7 ימים` });
  if (risks.length === 0) risks.push({ level: "green", text: "לא זוהו סיכונים מהותיים" });
  const topRisks = risks.slice(0, 5);

  // Closed options last 30 days
  const cutoff30 = new Date(today); cutoff30.setDate(today.getDate() - 30);
  const closedOpts = [];
  cryptoOptions.forEach(o => {
    if (["Expired OTM", "Expired ITM", "Exercised"].includes(o.status) && o.maturity_date && new Date(o.maturity_date) >= cutoff30) {
      closedOpts.push({ asset: o.asset, type: `${o.direction || "Sell"} ${o.option_type}`, strike: o.strike_price, date: o.maturity_date, result: o.status === "Expired OTM" ? "OTM ✓" : "ITM — מומשה", pnl: o.net_pnl || o.income_usd || 0, isWin: o.status === "Expired OTM", source: "Rysk" });
    }
  });
  ibOptions.forEach(o => {
    const cd = o.close_date || o.expiration_date;
    if (["Closed", "Assigned", "Expired"].includes(o.status) && cd && new Date(cd) >= cutoff30) {
      closedOpts.push({ asset: o.ticker, type: `${o.type || "Sell"} ${o.category}`, strike: o.strike, date: cd, result: o.status === "Assigned" ? "ITM — מומשה" : o.status === "Expired" ? "OTM ✓" : "Closed early", pnl: o.pnl || 0, isWin: o.status === "Expired" || (o.pnl || 0) > 0, source: "IB" });
    }
  });
  const closedWins = closedOpts.filter(o => o.isWin).length;
  const closedItm = closedOpts.filter(o => o.result.includes("ITM")).length;
  const closedPnl = closedOpts.reduce((s, o) => s + o.pnl, 0);

  // Investor rows
  const investorRows = investors.filter(inv => inv.status === "Active").map(inv => {
    const paid = (investorPayments || []).filter(p => p.investor_id === inv.id).reduce((s, p) => s + (p.amount || 0), 0);
    const payDay = inv.payment_day_of_month || 1;
    let next = new Date(today.getFullYear(), today.getMonth(), payDay);
    if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
    const scheduleStr = inv.interest_schedule === "Monthly"
      ? (inv.interest_currency === "ILS" ? `${fmtILS(inv.monthly_payment)}/חודש` : `${$(inv.monthly_payment)}/חודש`) : "בפירעון";
    const nextStr = inv.interest_schedule === "Monthly" ? fmtDate(next) : fmtDate(inv.maturity_date);
    return `<tr><td><strong>${inv.name}</strong></td><td>${$(inv.principal_usd)}</td><td>${inv.interest_rate}%</td><td>${scheduleStr}</td><td>${nextStr}</td></tr>`;
  }).join("");

  // Chart.js data JSON
  const pieChartJson = JSON.stringify({ labels: pieData.map(p => `${p.label} ${((p.val / pieTotal) * 100).toFixed(1)}%`), datasets: [{ data: pieData.map(p => p.val), backgroundColor: pieData.map(p => p.color), borderWidth: 2, borderColor: "#fff" }] });
  const barChartJson = JSON.stringify({ labels: barData.map(b => b.label), datasets: [{ data: barData.map(b => b.val), backgroundColor: barData.map(b => b.val >= 0 ? "#22c55e" : "#ef4444"), borderRadius: 4 }] });

  // Color helpers
  const clr = (v) => v >= 0 ? "positive" : "negative";
  const riskDot = { red: "🔴", yellow: "🟡", green: "🟢" };
  const riskClr = { red: "risk-red", yellow: "risk-yellow", green: "risk-green" };

  const eventsHTML = sortedEvents.map(e =>
    `<span style="display:inline-block;padding:2px 8px;margin:2px;border-radius:12px;font-size:10px;background:${urgencyBg(e.days)};color:${urgencyColor(e.days)};border:1px solid ${urgencyColor(e.days)}40">${urgencyDot(e.days)} ${e.text}</span>`
  ).join("") + (extraEvents > 0 ? `<span style="font-size:10px;color:#6b7280;margin-right:4px">... ועוד ${extraEvents} אירועים</span>` : "");

  const hlTableRows = openLev.map(l =>
    `<tr style="${l.distLiq != null && l.distLiq < 25 ? "background:#fee2e2" : ""}">
      <td><strong>${l.asset}</strong></td>
      <td>${l.direction === "Long" ? "▲ Long" : "▼ Short"}</td>
      <td>${l.leverage || "—"}x</td>
      <td>${$(l.posVal)}</td>
      <td class="${clr(l.pnlCalc)}">${$(l.pnlCalc)}</td>
      <td class="${l.roe != null ? clr(l.roe) : ""}">${l.roe != null ? pct(l.roe, 0) : "—"}</td>
      <td class="${l.distLiq != null ? (l.distLiq < 25 ? "risk-red" : l.distLiq < 35 ? "risk-yellow" : "risk-green") : ""}">${l.distLiq != null ? `${l.distLiq.toFixed(1)}%` : "—"}</td>
    </tr>`
  ).join("");

  const ryskTableRows = cryptoOptions.filter(o => o.status === "Open").map(o =>
    `<tr><td><strong>${o.asset}</strong></td><td>${o.direction || "Sell"} ${o.option_type}</td><td>${$(o.strike_price)}</td><td class="positive">${$(o.income_usd, 2)}</td><td>${fmtDate(o.maturity_date)}</td></tr>`
  ).join("");

  const ibOptsTableRows = ibOptions.filter(o => o.status === "Open").sort((a, b) => new Date(a.expiration_date || 0) - new Date(b.expiration_date || 0)).map(o => {
    const days = o.expiration_date ? differenceInDays(new Date(o.expiration_date), today) : null;
    return `<tr style="${days != null && days <= 7 ? "background:#fef3c7" : ""}"><td><strong>${o.ticker}</strong></td><td>${o.type || ""} ${o.category}</td><td>${$(o.strike)}</td><td>${o.quantity}</td><td>${fmtDate(o.expiration_date)}</td></tr>`;
  }).join("");

  const closedTableRows = closedOpts.sort((a, b) => new Date(b.date) - new Date(a.date)).map(o =>
    `<tr><td>${o.asset}</td><td style="font-size:10px">${o.type}</td><td>${$(o.strike)}</td><td class="${o.isWin ? "positive" : "negative"}">${o.result}</td><td class="${clr(o.pnl)}">${$(o.pnl, 2)}</td><td style="color:#6b7280;font-size:10px">${o.source}</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>דוח שבועי Oasis — ${todayStr}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Assistant', Arial, sans-serif; direction: rtl; font-size: 13px; color: #1e293b; background: white; }
  @media screen { body { max-width: 210mm; margin: 0 auto; padding: 20px; } }
  @media print {
    @page { size: A4; margin: 12mm; }
    body { font-size: 11px; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
    canvas { max-width: 100% !important; max-height: 200px !important; }
  }
  .hdr { background: #0f1e3c; color: white; padding: 8px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .hdr strong { font-size: 14px; }
  .hdr span { font-size: 11px; opacity: 0.8; }
  .kpi-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
  .kpi .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .kpi .big { font-size: 22px; font-weight: 700; font-family: monospace; }
  .kpi .sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .kpi .change { font-size: 11px; margin-top: 1px; }
  .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .chart-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; overflow: hidden; }
  .chart-box .title { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 6px; }
  canvas { max-width: 100% !important; height: auto !important; }
  .sec { font-size: 12px; font-weight: 700; background: #1e40af; color: white; padding: 3px 10px; border-radius: 4px; margin: 8px 0 5px; }
  .sec-green { background: #166534; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 12px; }
  th { background: #1e293b; color: white; padding: 4px 7px; text-align: right; font-size: 11px; font-weight: 700; }
  td { padding: 3px 7px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .positive { color: #16a34a; font-weight: 600; }
  .negative { color: #dc2626; font-weight: 600; }
  .risk-red { color: #dc2626; }
  .risk-yellow { color: #d97706; }
  .risk-green { color: #16a34a; }
  .risks { margin-bottom: 10px; }
  .risk-item { padding: 4px 10px; margin: 3px 0; border-radius: 4px; font-size: 12px; }
  .risk-item.red { background: #fee2e2; }
  .risk-item.yellow { background: #fef3c7; }
  .risk-item.green { background: #dcfce7; }
  .events-strip { margin-bottom: 10px; line-height: 1.8; }
  .notes-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 8px 12px; font-size: 12px; line-height: 1.6; margin-bottom: 10px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .col-inner { background: #f8fafc; border-radius: 6px; padding: 6px 8px; }
  .footer { border-top: 1px solid #e2e8f0; margin-top: 10px; padding-top: 6px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
  .print-btn { display: inline-flex; align-items: center; gap: 6px; background: #1e40af; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 14px; }
  .print-btn:hover { background: #1d4ed8; }
  .closed-summary { background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; padding: 5px 10px; font-size: 11px; margin-top: 4px; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 הדפס / שמור כ-PDF</button>

<!-- PAGE 1 -->
<div class="hdr">
  <strong>Oasis Project G Ltd. · דוח שבועי · ${periodStart} — ${periodEnd}</strong>
  <span>הוכן: נדב · ${todayStr}</span>
</div>

<!-- Row 1: KPIs -->
<div class="kpi-row">
  <div class="kpi">
    <div class="label">שווי כולל</div>
    <div class="big ${clr(totalNav)}">${$(totalNav)}</div>
    <div class="sub">Off: ${$(ibNav)} · On: ${$(onChainNav)}</div>
    <div class="change ${clr(weekChange || 0)}">${weekChange != null ? `vs שבוע: ${$(weekChange)} (${pct((weekChange / Math.abs(prevTotal || 1)) * 100)})` : "דוח ראשון"}</div>
  </div>
  <div class="kpi">
    <div class="label">הושקע סה"כ</div>
    <div class="big">${$(totalInvested)}</div>
    <div class="sub">Off: $413K · On: $1,700K</div>
  </div>
  <div class="kpi" style="${totalPnl < 0 ? "background:#fff1f2;border-color:#fecdd3" : "background:#f0fdf4;border-color:#bbf7d0"}">
    <div class="label">P&L כולל</div>
    <div class="big ${clr(totalPnl)}">${$(totalPnl)}</div>
    <div class="change ${clr(totalPnlPct)}">${pct(totalPnlPct)} מההשקעה</div>
  </div>
</div>

<!-- Row 2: Charts -->
<div class="charts-row">
  <div class="chart-box">
    <div class="title">הקצאת נכסים</div>
    <canvas id="pieChart"></canvas>
  </div>
  <div class="chart-box">
    <div class="title">ביצועים לפי אסטרטגיה</div>
    <canvas id="barChart"></canvas>
  </div>
</div>

<!-- Row 3: Events -->
<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">📅 אירועים קרובים (60 יום)</div>
<div class="events-strip">${eventsHTML || "<span style='color:#94a3b8;font-size:11px'>אין אירועים קרובים</span>"}</div>

<!-- Row 4: Risks -->
<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">⚠ הערכת סיכונים</div>
<div class="risks">${topRisks.map(r => `<div class="risk-item ${r.level}">${riskDot[r.level]} ${r.text}</div>`).join("")}</div>

${answers.notes ? `<div class="notes-box">📝 ${answers.notes.replace(/\n/g, "<br>")}</div>` : ""}

<div class="footer"><span>Oasis Project G Ltd. · דוח פנימי · סודי</span><span>עמוד 1 מתוך 3</span></div>

<!-- PAGE 2 -->
<div class="page-break"></div>

<div class="hdr">
  <strong>Oasis Project G Ltd. · פירוט · ${periodStart} — ${periodEnd}</strong>
  <span>${todayStr}</span>
</div>

<div class="two-col">
<!-- LEFT: OFF-CHAIN -->
<div>
  <div class="col-inner" style="border-right: 4px solid #1e40af">
    <div style="font-size:11px;font-weight:700;color:#1e40af;margin-bottom:6px">🏢 OFF-CHAIN · IB</div>
    <div class="sec">A · IB Summary</div>
    <table>
      <tr><th>מדד</th><th>ערך</th></tr>
      <tr><td>NAV</td><td class="positive"><strong>${$(ibNav)}</strong></td></tr>
      <tr><td>הופקד</td><td>$413,000</td></tr>
      <tr><td>P&L</td><td class="${clr(ibNav - 413000)}">${$(ibNav - 413000)} (${pct(((ibNav - 413000) / 413000) * 100)})</td></tr>
      <tr><td>P&L אופציות</td><td class="${clr(answers.ib_options_pnl)}">${$(answers.ib_options_pnl)}</td></tr>
      <tr><td>Win Rate IB</td><td>${answers.ib_win_rate || "—"}%</td></tr>
      <tr><td>P&L מניות (unrealized)</td><td class="${clr(ibStocksPnl)}">${$(ibStocksPnl)}</td></tr>
    </table>

    <div class="sec">B · חוב למשקיעים</div>
    <table>
      <tr><th>משקיע</th><th>קרן</th><th>ריבית</th><th>תשלום</th><th>הבא</th></tr>
      ${investorRows || "<tr><td colspan='5' style='color:#94a3b8'>אין</td></tr>"}
    </table>

    <div class="sec">C · IB אופציות פתוחות</div>
    <table>
      <tr><th>Ticker</th><th>סוג</th><th>Strike</th><th>כמות</th><th>פקיעה</th></tr>
      ${ibOptsTableRows || "<tr><td colspan='5' style='color:#94a3b8'>אין</td></tr>"}
    </table>
  </div>
</div>

<!-- RIGHT: ON-CHAIN -->
<div>
  <div class="col-inner" style="border-right: 4px solid #166534">
    <div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:6px">⛓ ON-CHAIN · DeFi</div>
    <div class="sec sec-green">D · Aave V3</div>
    <table>
      <tr><th>בטוחה</th><th>יחידות</th><th>שווי</th></tr>
      <tr><td>ETH</td><td>${ethUnits.toFixed(3)}</td><td>${$(ethCollVal)}</td></tr>
      <tr><td>BTC</td><td>${btcUnits.toFixed(4)}</td><td>${$(btcCollVal)}</td></tr>
      <tr><td>AAVE</td><td>${aaveTokenUnits.toFixed(2)}</td><td>${$(aaveCollValUSD)}</td></tr>
      <tr><td><strong>סה"כ בטוחות</strong></td><td></td><td><strong>${$(totalCollateral)}</strong></td></tr>
      <tr><td>חוב USDC</td><td></td><td class="negative">${$(aaveBorrow)}</td></tr>
      <tr><td colspan="2">HF: <strong class="${aaveHF ? (aaveHF > 2 ? "risk-green" : aaveHF < 1.5 ? "risk-red" : "risk-yellow") : ""}">${aaveHF?.toFixed(2) || "—"}</strong></td><td class="${clr(totalCollateral - aaveBorrow)}"><strong>${$(totalCollateral - aaveBorrow)}</strong></td></tr>
    </table>

    <div class="sec sec-green">E · HyperLiquid</div>
    <div style="font-size:11px;color:#475569;margin-bottom:4px">P&L ממומש (היסטוריה): <strong class="${clr(hlRealizedPnl)}">${$(hlRealizedPnl)}</strong> · P&L לא ממומש: <strong class="${clr(hlPnl)}">${$(hlPnl)}</strong> · סה"כ: <strong class="${clr(hlTotalPnl)}">${$(hlTotalPnl)}</strong></div>
    ${openLev.length > 0 ? `<table>
      <tr><th>נכס</th><th>כיוון</th><th>×מינוף</th><th>שווי</th><th>P&L</th><th>ROE</th><th>חיסול%</th></tr>
      ${hlTableRows}
    </table>` : "<p style='color:#94a3b8;font-size:11px;padding:3px 0'>אין פוזיציות פתוחות</p>"}

    <div class="sec sec-green">F · Rysk אופציות פתוחות</div>
    ${cryptoOptions.filter(o => o.status === "Open").length > 0 ? `<table>
      <tr><th>נכס</th><th>סוג</th><th>Strike</th><th>פרמיה</th><th>פקיעה</th></tr>
      ${ryskTableRows}
    </table>` : "<p style='color:#94a3b8;font-size:11px;padding:3px 0'>אין</p>"}
  </div>
</div>
</div>

<div class="footer"><span>Oasis Project G Ltd. · דוח פנימי · סודי</span><span>עמוד 2 מתוך 3</span></div>

<!-- PAGE 3 -->
<div class="page-break"></div>

<div class="hdr">
  <strong>Oasis Project G Ltd. · נתוני קריפטו ומניות · ${periodStart} — ${periodEnd}</strong>
  <span>${todayStr}</span>
</div>

<div class="sec">G · מחירי קריפטו בעמוד הדוח</div>
<table>
  <tr><th>נכס</th><th>מחיר נוכחי</th><th>יחידות בחזקה</th><th>שווי כולל</th></tr>
  <tr><td><strong>BTC</strong></td><td>${$(btcP)}</td><td>${btcUnits.toFixed(4)}</td><td class="positive"><strong>${$(btcCollVal)}</strong></td></tr>
  <tr><td><strong>ETH</strong></td><td>${$(ethP)}</td><td>${ethUnits.toFixed(3)}</td><td class="positive"><strong>${$(ethCollVal)}</strong></td></tr>
  <tr><td><strong>AAVE</strong></td><td>${$(aaveP)}</td><td>${aaveTokenUnits.toFixed(2)}</td><td class="positive"><strong>${$(aaveCollValUSD)}</strong></td></tr>
  <tr><td><strong>MSTR</strong></td><td>${$(mstrP)}</td><td>—</td><td>—</td></tr>
  <tr><td><strong>Stablecoins</strong></td><td>$1.00</td><td>—</td><td class="positive"><strong>${$(stablecoins)}</strong></td></tr>
</table>

<div class="sec" style="margin-top:10px">H · מניות IB פתוחות</div>
${stocks.filter(s => s.status !== "Closed").length > 0 ? `<table>
  <tr><th>Ticker</th><th>מניות</th><th>עלות ממוצעת</th><th>מחיר נוכחי</th><th>P&L</th><th>P&L%</th></tr>
  ${stocks.filter(s => s.status !== "Closed").map(s => `<tr><td><strong>${s.ticker}</strong></td><td>${s.shares}</td><td>${$(s.average_cost)}</td><td>${$(s.current_price)}</td><td class="${clr(s.gain_loss)}">${$(s.gain_loss)}</td><td class="${clr(s.gain_loss_pct)}">${pct(s.gain_loss_pct, 1)}</td></tr>`).join("")}
</table>` : "<p style='color:#94a3b8;font-size:11px;padding:3px 0'>אין מניות פתוחות</p>"}

<div class="sec" style="margin-top:10px">I · אופציות שנסגרו — 30 ימים אחרונים</div>
${closedOpts.length > 0 ? `<table>
  <tr><th>נכס</th><th>סוג</th><th>Strike</th><th>תוצאה</th><th>P&L</th><th>מקור</th></tr>
  ${closedTableRows}
</table>
<div class="closed-summary">סה"כ 30 יום: <strong>${closedOpts.length}</strong> עסקאות | <strong class="positive">${closedWins} OTM (win)</strong> | <strong class="negative">${closedItm} ITM (assignment)</strong> | P&L נטו: <strong class="${clr(closedPnl)}">${$(closedPnl, 0)}</strong></div>`
: "<p style='color:#94a3b8;font-size:11px;padding:3px 0'>אין עסקאות שנסגרו ב-30 ימים האחרונים</p>"}

<div class="footer"><span>Oasis Project G Ltd. · דוח פנימי · סודי</span><span>עמוד 3 מתוך 3</span></div>

<script>
(function() {
  const pieData = ${pieChartJson};
  const barData = ${barChartJson};
  new Chart(document.getElementById('pieChart'), { type: 'pie', data: pieData, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'right', align: 'center', labels: { font: { size: 11, weight: '500', family: 'Assistant, Arial' }, boxWidth: 14, padding: 10, usePointStyle: true, pointStyle: 'circle' } }, tooltip: { padding: 10, font: { size: 11 }, backgroundColor: 'rgba(0,0,0,0.8)' } } } });
  new Chart(document.getElementById('barChart'), { type: 'bar', data: barData, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { padding: 10, font: { size: 11 }, backgroundColor: 'rgba(0,0,0,0.8)' } }, scales: { x: { ticks: { font: { size: 10, family: 'Assistant, Arial' }, callback: v => '$' + v.toLocaleString() }, grid: { color: '#e5e7eb', drawBorder: false }, beginAtZero: true }, y: { ticks: { font: { size: 10, family: 'Assistant, Arial' } }, grid: { display: false } } } } });
})();
</script>
</body>
</html>`;
}