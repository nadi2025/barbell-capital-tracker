import { format, differenceInDays } from "date-fns";

const fmt = (v, d = 0) => {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v < 0 ? "-$" : "$") + s;
};
const fmtILS = (v) => v == null ? "—" : `₪${Math.abs(v).toLocaleString("he-IL")}`;
const fmtPct = (v) => v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

const diffStr = (curr, prev, isFirst) => {
  if (isFirst) return `<span style="color:#6b7280;font-size:10px">דוח ראשון</span>`;
  if (prev == null || curr == null) return "—";
  const d = curr - prev;
  const pct = prev !== 0 ? ((d / Math.abs(prev)) * 100).toFixed(1) : "0.0";
  const sign = d >= 0 ? "+" : "";
  const color = d >= 0 ? "#16a34a" : "#dc2626";
  return `<span style="color:${color}">${sign}${fmt(d)} (${sign}${pct}%)</span>`;
};

function svgPie(slices, size = 140) {
  const total = slices.reduce((s, sl) => s + sl.val, 0);
  if (!total) return `<svg width="${size}" height="${size}"></svg>`;
  const cx = size / 2, cy = size / 2, r = size / 2 - 5;
  let paths = "", angle = -Math.PI / 2;
  for (const sl of slices) {
    if (!sl.val) continue;
    const sweep = (sl.val / total) * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    paths += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${sl.color}" stroke="white" stroke-width="2"/>`;
    angle = end;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${paths}</svg>`;
}

function svgBars(items, w = 310, barH = 24, gap = 6) {
  const maxAbs = Math.max(...items.map(i => Math.abs(i.val)), 1);
  const labelW = 130, barMaxW = w - labelW - 90;
  const h = items.length * (barH + gap) + 8;
  let els = "";
  items.forEach((it, i) => {
    const y = i * (barH + gap) + 4;
    const bw = (Math.abs(it.val) / maxAbs) * barMaxW;
    const color = it.val >= 0 ? "#22C55E" : "#EF4444";
    const sign = it.val >= 0 ? "+" : "";
    const valStr = `${sign}$${Math.abs(it.val).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    els += `<text x="${labelW - 5}" y="${y + barH - 5}" font-size="12" fill="#374151" text-anchor="end" font-family="Arial">${it.label}</text>`;
    if (bw > 0) els += `<rect x="${labelW}" y="${y}" width="${bw.toFixed(1)}" height="${barH}" fill="${color}" rx="3" opacity="0.9"/>`;
    els += `<text x="${labelW + bw + 6}" y="${y + barH - 5}" font-size="12" fill="${color}" font-weight="bold" font-family="Arial">${valStr}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els}</svg>`;
}

function getUrgency(daysLeft) {
  if (daysLeft <= 7) return "red";
  if (daysLeft <= 30) return "yellow";
  return "green";
}

function getClosedOptions(options, ibOptions, reportDate) {
  const cutoff = new Date(reportDate);
  cutoff.setDate(cutoff.getDate() - 30);
  const closed = [];

  options.forEach(o => {
    if (["Expired OTM", "Expired ITM", "Exercised"].includes(o.status) && o.maturity_date) {
      const d = new Date(o.maturity_date);
      if (d >= cutoff && d <= new Date(reportDate)) {
        const result = o.status === "Expired OTM" ? "OTM ✓" : o.status === "Expired ITM" ? "ITM — מומשה" : "Exercised";
        closed.push({ asset: o.asset, type: `${o.direction || "Sell"} ${o.option_type}`, strike: o.strike_price, closeDate: o.maturity_date, result, pnl: o.net_pnl || o.income_usd || 0, source: "Rysk", isWin: o.status === "Expired OTM" });
      }
    }
  });

  ibOptions.forEach(o => {
    const closeDate = o.close_date || o.expiration_date;
    if (["Closed", "Assigned", "Expired"].includes(o.status) && closeDate) {
      const d = new Date(closeDate);
      if (d >= cutoff && d <= new Date(reportDate)) {
        const result = o.status === "Assigned" ? "ITM — מומשה" : o.status === "Expired" ? "OTM ✓" : "Closed early";
        closed.push({ asset: o.ticker, type: `${o.type || "Sell"} ${o.category}`, strike: o.strike, closeDate, result, pnl: o.pnl || 0, source: "IB", isWin: o.status === "Expired" || (o.pnl || 0) > 0 });
      }
    }
  });

  return closed.sort((a, b) => new Date(b.closeDate) - new Date(a.closeDate));
}

function getUpcomingEvents(options, ibOptions, investors, openLev, today) {
  const events = [];

  // Rysk options expiring within 60 days
  options.filter(o => o.status === "Open" && o.maturity_date).forEach(o => {
    const d = new Date(o.maturity_date);
    const daysLeft = differenceInDays(d, today);
    if (daysLeft >= 0 && daysLeft <= 60) {
      events.push({ urgency: getUrgency(daysLeft), daysLeft, text: `${o.asset} ${o.option_type} ×${o.size || 1} (Rysk) — פוקעת ${format(d, "d.M.yy")} (${daysLeft} ימ')` });
    }
  });

  // IB options expiring within 60 days
  ibOptions.filter(o => o.status === "Open" && o.expiration_date).forEach(o => {
    const d = new Date(o.expiration_date);
    const daysLeft = differenceInDays(d, today);
    if (daysLeft >= 0 && daysLeft <= 60) {
      events.push({ urgency: getUrgency(daysLeft), daysLeft, text: `${o.ticker} ${o.category} ×${o.quantity} (IB) — פוקעת ${format(d, "d.M.yy")} (${daysLeft} ימ')` });
    }
    if (!o.expiration_date && o.expiration_year) {
      events.push({ urgency: "yellow", daysLeft: 999, text: `${o.ticker} ${o.category} ×${o.quantity} (IB) — פוקעת ${o.expiration_year} (תאריך מדויק חסר)` });
    }
  });

  // Investor payments within 30 days
  investors.filter(inv => inv.interest_schedule === "Monthly" && inv.status === "Active").forEach(inv => {
    const payDay = inv.payment_day_of_month || 1;
    let nextPay = new Date(today.getFullYear(), today.getMonth(), payDay);
    if (nextPay <= today) nextPay = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
    const daysLeft = differenceInDays(nextPay, today);
    if (daysLeft >= 0 && daysLeft <= 30) {
      const isILS = inv.interest_currency === "ILS";
      const payStr = isILS ? fmtILS(inv.monthly_payment) : fmt(inv.monthly_payment);
      events.push({ urgency: daysLeft <= 5 ? "red" : "yellow", daysLeft, text: `ריבית ${inv.name}: ${payStr} נטו — ${format(nextPay, "d.M.yy")} (${daysLeft} ימ')` });
    }
  });

  // HL near liquidation
  openLev.forEach(l => {
    if (l.distLiq != null && l.distLiq < 30) {
      events.push({ urgency: l.distLiq < 25 ? "red" : "yellow", daysLeft: 0, text: `HL ${l.asset} ${l.direction} ${l.leverage || ""}x — מרחק חיסול ${l.distLiq.toFixed(1)}%${l.distLiq < 25 ? " ⚠ פעולה דחופה!" : ""}` });
    }
  });

  const sorted = events.sort((a, b) => a.daysLeft - b.daysLeft);
  const top8 = sorted.slice(0, 8);
  const extra = sorted.length - 8;
  if (extra > 0) top8.push({ urgency: "yellow", daysLeft: 9999, text: `... ועוד ${extra} אירועים נוספים` });
  return top8;
}

function tableRow(cells, isHeader = false, highlight = null) {
  const tag = isHeader ? "th" : "td";
  const bg = highlight === "red" ? "#fee2e2" : highlight === "yellow" ? "#fef9c3" : "";
  const rowStyle = bg ? ` style="background:${bg}"` : "";
  return `<tr${rowStyle}>${cells.map(c => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
}

function table(headers, rows) {
  return `<table><thead>${tableRow(headers, true)}</thead><tbody>${rows.map(r => tableRow(r.cells, false, r.highlight)).join("")}</tbody></table>`;
}

function sectionBlock(color, title, content) {
  const bg = color === "blue" ? "#F0F7FF" : "#F0FFF4";
  const border = color === "blue" ? "#1e40af" : "#166534";
  return `<div style="background:${bg};border-radius:6px;padding:6px 8px;margin-bottom:8px;border-right:4px solid ${border}">
    <div style="font-size:11px;font-weight:bold;color:${border};margin-bottom:6px;letter-spacing:0.3px">${color === "blue" ? "🏢 OFF-CHAIN · Interactive Brokers + Leumi Notes" : "⛓ ON-CHAIN · DeFi · Crypto"}</div>
    ${content}
  </div>`;
}

export function generateReportHTML({ wizardAnswers, prevReport, investors, investorPayments, options, leveraged, aaveCollateral, periodStart, periodEnd, ibOptions = [], assets = [] }) {
  const today = new Date();
  const todayStr = format(today, "dd.MM.yyyy");
  const periodStr = `${format(new Date(periodStart), "d.M.yy")} — ${format(new Date(periodEnd), "d.M.yy")}`;

  const { ib_nav, ib_options_pnl, ib_stocks_pnl, manager_notes, btc_price, eth_price, aave_price, mstr_price, aave_borrowed, aave_hf, ib_win_rate } = wizardAnswers;
  const IB_DEPOSITED = 413000;
  const isFirstReport = !prevReport;

  // Aave collateral units
  const ethUnits = aaveCollateral.find(a => /eth/i.test(a.token))?.units || 0;
  const wbtcUnits = aaveCollateral.find(a => /btc|wbtc/i.test(a.token))?.units || 0;
  const aaveTokenUnits = aaveCollateral.find(a => a.token?.toUpperCase() === "AAVE")?.units || 0;

  const btcVal = wbtcUnits * (btc_price || 0);
  const ethVal = ethUnits * (eth_price || 0);
  const aaveTokenVal = aaveTokenUnits * (aave_price || 0);
  const collateralUSD = btcVal + ethVal + aaveTokenVal;
  const onChainNav = collateralUSD - (aave_borrowed || 0);
  const totalNav = (ib_nav || 0) + onChainNav;

  const prevTotal = prevReport ? (prevReport.ib_nav || 0) + (prevReport.on_chain_nav || 0) : null;
  const prevIbNav = prevReport?.ib_nav;
  const prevBtc = prevReport?.btc_price;
  const prevEth = prevReport?.eth_price;
  const prevOnChain = prevReport?.on_chain_nav;

  // Leveraged positions with calcs
  const priceByToken = (token) => {
    const t = token?.toUpperCase();
    if (t === "BTC") return btc_price;
    if (t === "ETH") return eth_price;
    if (t === "AAVE") return aave_price;
    if (t === "MSTR") return mstr_price;
    return null;
  };

  const openLev = leveraged.filter(l => l.status === "Open").map(l => {
    const currentPrice = priceByToken(l.asset) || l.mark_price;
    const size = l.size || 0;
    const posValue = currentPrice && size ? currentPrice * size : l.position_value_usd || 0;
    const pnl = l.entry_price && size && currentPrice ? (currentPrice - l.entry_price) * size * (l.direction === "Short" ? -1 : 1) : (l.pnl_usd || 0);
    const roe = pnl != null && l.margin_usd ? (pnl / l.margin_usd) * 100 : null;
    const distLiq = currentPrice && l.liquidation_price ? Math.abs((currentPrice - l.liquidation_price) / currentPrice * 100) : null;
    return { ...l, calcValue: posValue, calcPnl: pnl, calcRoe: roe, distLiq, currentPrice };
  });

  // === PIE CHART: Asset type allocation across entire portfolio ===
  // Group HL positions by asset
  const hlByAsset = {};
  openLev.forEach(l => {
    const key = l.asset?.toUpperCase();
    if (!hlByAsset[key]) hlByAsset[key] = 0;
    hlByAsset[key] += Math.abs(l.calcValue || 0);
  });

  const pieBTC = btcVal + (hlByAsset["BTC"] || 0);
  const pieETH = ethVal + (hlByAsset["ETH"] || 0);
  const pieAAVE = aaveTokenVal + (hlByAsset["AAVE"] || 0);
  const pieMSTR = hlByAsset["MSTR"] || 0;

  // Stablecoins from assets list
  const stablecoins = (assets || []).filter(a => /usdc|usdt|dai|busd/i.test(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0);

  // IB remaining (IB NAV minus known HL MSTR allocation — approximate)
  const ibRemaining = Math.max(0, (ib_nav || 0) - pieMSTR);

  const pieSlices = [
    { name: "BTC", val: pieBTC, color: "#f7931a" },
    { name: "ETH", val: pieETH, color: "#627eea" },
    { name: "AAVE", val: pieAAVE, color: "#b878e8" },
    { name: "MSTR", val: pieMSTR, color: "#3b82f6" },
    { name: "IB Stocks", val: ibRemaining, color: "#10b981" },
    { name: "Stablecoins", val: stablecoins, color: "#94a3b8" },
  ].filter(s => s.val > 100);
  const pieTotal = pieSlices.reduce((s, sl) => s + sl.val, 0) || 1;

  // === BAR CHART: P&L by strategy ===
  const ryskPremium = options.reduce((s, o) => s + (o.income_usd || 0), 0);
  const levPnl = openLev.reduce((s, l) => s + (l.calcPnl || 0), 0);
  const aaveYield = aaveCollateral.reduce((s, a) => {
    const p = priceByToken(a.token) || 0;
    return s + ((a.supply_apy || 0) / 100) * (a.units || 0) * p / 52;
  }, 0);

  // IB Options premium from closed trades
  const ibOptsPremium = (ibOptions || []).filter(o => ["Closed", "Assigned", "Expired"].includes(o.status) && (o.pnl || 0) > 0).reduce((s, o) => s + (o.pnl || 0), 0);

  const barItems = [
    ib_options_pnl ? { label: "IB Options P&L", val: ib_options_pnl } : null,
    ibOptsPremium > 0 ? { label: "IB Options (סה\"כ)", val: ibOptsPremium } : null,
    ryskPremium ? { label: "Rysk Finance", val: ryskPremium } : null,
    Math.round(aaveYield) ? { label: "Aave Yield", val: Math.round(aaveYield) } : null,
    ib_stocks_pnl ? { label: "IB Stocks", val: ib_stocks_pnl } : null,
    Math.round(levPnl) ? { label: "HyperLiquid", val: Math.round(levPnl) } : null,
  ].filter(Boolean).filter(i => i.val !== 0);

  // === RISK ===
  const risks = [];
  openLev.forEach(l => {
    if (l.calcRoe != null && l.calcRoe < -100) risks.push({ color: "red", text: `${l.asset} ${l.leverage || ""}x — הפסד ${l.calcRoe.toFixed(0)}%, מרחק חיסול ${l.distLiq?.toFixed(1) || "?"}%. לשקול סגירה.` });
    else if (l.distLiq != null && l.distLiq < 25) risks.push({ color: "red", text: `${l.asset} ${l.leverage || ""}x — מרחק חיסול ${l.distLiq.toFixed(1)}% ⚠ פעולה דחופה!` });
    else if (l.distLiq != null && l.distLiq < 35) risks.push({ color: "yellow", text: `${l.asset} ${l.leverage || ""}x — מרחק חיסול ${l.distLiq.toFixed(1)}%. מעקב.` });
  });
  if (aave_hf) {
    if (aave_hf < 1.5) risks.push({ color: "red", text: `Aave HF ${aave_hf} — סכנת חיסול!` });
    else if (aave_hf < 2.0) risks.push({ color: "yellow", text: `Aave HF ${aave_hf} — זהירות.` });
    else risks.push({ color: "green", text: `Aave HF ${aave_hf} — בטוח.` });
  }
  // Aave borrow sanity check
  if (aave_borrowed && aave_borrowed < 100000 && collateralUSD > 500000) {
    risks.push({ color: "yellow", text: `⚠ חוב Aave (${fmt(aave_borrowed)}) נראה נמוך ביחס לבטוחות (${fmt(collateralUSD)}). בדוק את הנתון!` });
  }
  const ibPct = ib_nav ? ((ib_nav - IB_DEPOSITED) / IB_DEPOSITED * 100) : null;
  if (ibPct != null && ibPct < -20) risks.push({ color: ibPct < -40 ? "red" : "yellow", text: `תיק IB ירד ${Math.abs(ibPct).toFixed(1)}% מההשקעה המקורית.` });
  if (risks.length === 0) risks.push({ color: "green", text: "לא זוהו סיכונים מהותיים." });

  // Events
  const events = getUpcomingEvents(options, ibOptions, investors, openLev, today);
  const closedOpts = getClosedOptions(options, ibOptions, periodEnd);

  // Investor rows
  const investorRows = investors.map(inv => {
    const paid = investorPayments.filter(p => p.investor_id === inv.id).reduce((s, p) => s + (p.amount || 0), 0);
    const isILS = inv.interest_currency === "ILS";
    const payDay = inv.payment_day_of_month || 1;
    let nextPay = new Date(today.getFullYear(), today.getMonth(), payDay);
    if (nextPay <= today) nextPay = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
    const scheduleStr = inv.interest_schedule === "Monthly"
      ? (isILS ? `${fmtILS(inv.monthly_payment)}/חודש נטו` : `${fmt(inv.monthly_payment)}/חודש`)
      : "בפירעון";
    const nextPayStr = inv.interest_schedule === "Monthly"
      ? format(nextPay, "d.M.yy")
      : format(new Date(inv.maturity_date), "M/yyyy");
    return { name: inv.name, principal: fmt(inv.principal_usd), rate: `${inv.interest_rate}%`, schedule: scheduleStr, paid: fmt(paid), next: nextPayStr };
  });
  const totalPrincipal = investors.reduce((s, i) => s + (i.principal_usd || 0), 0);
  const totalPaid = investorPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const openOpts = options.filter(o => o.status === "Open");
  const openIbOpts = ibOptions.filter(o => o.status === "Open");

  // === CSS ===
  const css = `
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; direction: rtl; font-size: 13px; color: #1e293b; background: white; }
    .page { width: 100%; padding: 0; }
    .page2 { page-break-before: always; }
    .hdr { background: #0f1e3c; color: white; padding: 6px 12px; border-radius: 5px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .hdr strong { font-size: 13px; }
    .hdr span { font-size: 11px; }
    .sec { font-size: 14px; font-weight: bold; background: #1e40af; color: white; padding: 4px 10px; border-radius: 4px; margin: 9px 0 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 7px; font-size: 13px; }
    th { background: #1e293b; color: white; padding: 4px 7px; text-align: right; font-size: 13px; font-weight: bold; }
    td { padding: 4px 7px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    tr:nth-child(even) td { background: #f8fafc; }
    .g { color: #16a34a; font-weight: bold; }
    .r { color: #dc2626; font-weight: bold; }
    .y { color: #b45309; }
    .event-red { background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; padding: 4px 10px; margin: 3px 0; font-size: 13px; }
    .event-yellow { background: #fef9c3; border: 1px solid #fde047; border-radius: 4px; padding: 4px 10px; margin: 3px 0; font-size: 13px; }
    .event-green { background: #dcfce7; border: 1px solid #86efac; border-radius: 4px; padding: 4px 10px; margin: 3px 0; font-size: 13px; }
    .row2col { display: flex; gap: 12px; align-items: flex-start; }
    .col-table { flex: 1.4; }
    .col-chart { flex: 1; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 5px; }
    .legend-item { font-size: 11px; display: flex; align-items: center; gap: 3px; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
    .footer { margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 4px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
    .risk-line { padding: 4px 10px; margin: 3px 0; font-size: 13px; border-radius: 3px; }
    .notes-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; padding: 6px 10px; font-size: 13px; line-height: 1.5; }
    @media print { .page2 { page-break-before: always; } }
  `;

  const header = `<div class="hdr"><div><strong>Oasis Project G Ltd. · דוח שבועי</strong> <span>| ${periodStr}</span></div><span>הוכן: נדב | ${todayStr}</span></div>`;

  const urgencyEmoji = { red: "🔴", yellow: "🟡", green: "🟢" };
  const eventsHTML = events.length > 0
    ? `<div class="sec">📅 אירועים קרובים (60 יום)</div><div>${events.map(e => `<div class="event-${e.urgency}">${urgencyEmoji[e.urgency] || "🟡"} ${e.text}</div>`).join("")}</div>`
    : `<div class="event-green">🟢 אין אירועים דחופים ב-60 הימים הקרובים.</div>`;

  const riskColors = { red: "#fee2e2", yellow: "#fef9c3", green: "#dcfce7" };
  const riskDots = { red: "🔴", yellow: "🟡", green: "🟢" };
  const risksHTML = risks.map(r => `<div class="risk-line" style="background:${riskColors[r.color]}">${riskDots[r.color]} ${r.text}</div>`).join("");

  const summaryTable = table(
    ["מדד", "ערך", "שינוי"],
    [
      { cells: ["שווי תיק כולל", `<strong>${fmt(totalNav)}</strong>`, diffStr(totalNav, prevTotal, isFirstReport)] },
      { cells: ["Off-Chain (IB)", fmt(ib_nav), diffStr(ib_nav, prevIbNav, isFirstReport)] },
      { cells: ["On-Chain (קריפטו)", fmt(onChainNav), diffStr(onChainNav, prevOnChain, isFirstReport)] },
      { cells: ["BTC", fmt(btc_price), diffStr(btc_price, prevBtc, isFirstReport)] },
      { cells: ["ETH", fmt(eth_price), diffStr(eth_price, prevEth, isFirstReport)] },
    ]
  );

  const pieSvg = svgPie(pieSlices, 140);
  const legend = `<div class="legend">${pieSlices.map(sl => `<span class="legend-item"><span class="dot" style="background:${sl.color}"></span>${sl.name} ${((sl.val / pieTotal) * 100).toFixed(1)}%</span>`).join("")}</div>`;
  const barSvg = barItems.length > 0 ? svgBars(barItems) : "<p style='color:#94a3b8;font-size:13px'>אין נתוני ביצועים</p>";

  const page1 = `
<div class="page">
  ${header}
  ${eventsHTML}
  <div class="sec">1 · תמונה כוללת</div>
  <div class="row2col">
    <div class="col-table">${summaryTable}</div>
    <div class="col-chart">${pieSvg}${legend}</div>
  </div>
  <div class="sec">2 · ביצועים לפי אסטרטגיה</div>
  ${barSvg}
  <div class="sec">3 · הערכת סיכונים</div>
  ${risksHTML}
  ${manager_notes ? `<div class="sec">4 · הערות מנהל</div><div class="notes-box">${manager_notes.replace(/\n/g, "<br>")}</div>` : ""}
  <div class="footer"><span>Oasis Project G Ltd. · סודי</span><span>עמוד 1 מתוך 2</span></div>
</div>`;

  // === PAGE 2 ===

  const ibTable = table(
    ["מדד", "סכום"],
    [
      { cells: ["NAV תיק IB", fmt(ib_nav)], highlight: ib_nav < IB_DEPOSITED * 0.75 ? "yellow" : null },
      { cells: ["הון שהופקד", fmt(IB_DEPOSITED)] },
      { cells: ["P&L כולל", `<span class="${(ib_nav - IB_DEPOSITED) >= 0 ? "g" : "r"}">${fmt(ib_nav - IB_DEPOSITED)} (${fmtPct((ib_nav - IB_DEPOSITED) / IB_DEPOSITED * 100)})</span>`] },
      { cells: ["P&L אופציות (ממומש)", `<span class="${(ib_options_pnl || 0) >= 0 ? "g" : "r"}">${fmt(ib_options_pnl)}</span>`] },
      { cells: ["Win Rate אופציות", ib_win_rate != null ? `${ib_win_rate}%` : "—"] },
    ]
  );

  const investorsTable = table(
    ["משקיע", "קרן", "ריבית", "תשלום", "ששולם", "הבא"],
    [
      ...investorRows.map(r => ({ cells: [r.name, r.principal, r.rate, r.schedule, r.paid, r.next] })),
      { cells: [`<strong>סה״כ</strong>`, `<strong>${fmt(totalPrincipal)}</strong>`, "", "", `<strong>${fmt(totalPaid)}</strong>`, ""] },
    ]
  );

  const ibOptsTable = openIbOpts.length > 0 ? table(
    ["Ticker", "סוג", "Strike", "Fill", "Qty", "פקיעה"],
    openIbOpts.map(o => {
      const daysLeft = o.expiration_date ? differenceInDays(new Date(o.expiration_date), today) : null;
      return {
        cells: [`<strong>${o.ticker}</strong>`, `${o.type} ${o.category}`, o.strike ? fmt(o.strike) : "—", `$${o.fill_price || 0}`, o.quantity || "—", o.expiration_date ? format(new Date(o.expiration_date), "d.M.yy") : "—"],
        highlight: daysLeft != null && daysLeft <= 7 ? "yellow" : null
      };
    })
  ) : "<p style='color:#94a3b8;padding:3px 0;font-size:13px'>אין</p>";

  const aaveRows = aaveCollateral.map(a => {
    const p = priceByToken(a.token) || 0;
    const val = (a.units || 0) * p;
    return { cells: [a.token, (a.units || 0).toFixed(4), fmt(val)] };
  });
  const aaveTable = table(
    ["בטוחה", "יחידות", "שווי"],
    [
      ...aaveRows,
      { cells: [`<strong>סה״כ בטוחות</strong>`, "", `<strong>${fmt(collateralUSD)}</strong>`] },
      { cells: ["חוב USDC", "", `<span class="r">${fmt(aave_borrowed)}</span>`] },
      { cells: ["<strong>נקי</strong>", `HF: ${aave_hf || "—"}`, `<strong class="${onChainNav >= 0 ? "g" : "r"}">${fmt(onChainNav)}</strong>`] },
    ]
  );

  const hlTable = openLev.length > 0 ? table(
    ["נכס", "כיוון", "מינוף", "שווי", "P&L", "ROE%", "מרחק חיסול"],
    openLev.map(l => ({
      cells: [
        `<strong>${l.asset}</strong>`, l.direction === "Long" ? "Long ▲" : "Short ▼", `${l.leverage || "—"}x`,
        fmt(l.calcValue),
        `<span class="${(l.calcPnl || 0) >= 0 ? "g" : "r"}">${fmt(l.calcPnl)}</span>`,
        l.calcRoe != null ? `<span class="${l.calcRoe >= 0 ? "g" : l.calcRoe < -100 ? "r" : "y"}">${l.calcRoe.toFixed(1)}%</span>` : "—",
        l.distLiq != null ? `<span class="${l.distLiq < 25 ? "r" : l.distLiq < 35 ? "y" : "g"}">${l.distLiq.toFixed(1)}%</span>` : "—",
      ],
      highlight: l.distLiq < 25 ? "red" : (l.calcRoe != null && l.calcRoe < -100) ? "red" : null
    }))
  ) : "<p style='color:#94a3b8;padding:4px 0;font-size:13px'>אין פוזיציות פתוחות</p>";

  const ryskTable = openOpts.length > 0 ? table(
    ["נכס", "סוג", "Strike", "פרמיה", "פקיעה"],
    openOpts.map(o => ({ cells: [o.asset, `${o.direction} ${o.option_type}`, o.strike_price ? fmt(o.strike_price) : "—", `<span class="g">${fmt(o.income_usd, 2)}</span>`, o.maturity_date ? format(new Date(o.maturity_date), "d.M.yy") : "—"] }))
  ) : "<p style='color:#94a3b8;padding:3px 0;font-size:13px'>אין</p>";

  // Closed options section
  let closedOptsHTML = "<p style='color:#94a3b8;font-size:12px'>אין עסקאות סגורות ב-30 ימים האחרונים</p>";
  let analysisHTML = "";
  if (closedOpts.length > 0) {
    const wins = closedOpts.filter(o => o.isWin).length;
    const itm = closedOpts.filter(o => o.result.includes("ITM")).length;
    const totalPnl = closedOpts.reduce((s, o) => s + (o.pnl || 0), 0);
    const winRate = Math.round((wins / closedOpts.length) * 100);

    closedOptsHTML = `<table><thead><tr>
      <th>נכס</th><th>סוג</th><th>Strike</th><th>נסגרה</th><th>תוצאה</th><th>P&L</th><th>מקור</th>
    </tr></thead><tbody>${closedOpts.map(o => `<tr>
      <td><strong>${o.asset}</strong></td>
      <td style="font-size:11px">${o.type}</td>
      <td>${o.strike ? fmt(o.strike) : "—"}</td>
      <td>${o.closeDate ? format(new Date(o.closeDate), "d.M.yy") : "—"}</td>
      <td style="color:${o.isWin ? "#16a34a" : "#dc2626"}">${o.result}</td>
      <td style="color:${(o.pnl || 0) >= 0 ? "#16a34a" : "#dc2626"};font-weight:bold">${fmt(o.pnl, 2)}</td>
      <td style="font-size:11px;color:#6b7280">${o.source}</td>
    </tr>`).join("")}</tbody></table>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:5px 8px;font-size:12px;margin-top:4px">
      סה״כ 30 יום: <strong>${closedOpts.length}</strong> עסקאות | <strong style="color:#16a34a">${wins} OTM (win)</strong> | <strong style="color:#dc2626">${itm} ITM (assignment)</strong> | P&L נטו: <strong style="color:${totalPnl >= 0 ? "#16a34a" : "#dc2626"}">${fmt(totalPnl, 0)}</strong>
    </div>`;

    const lines = [];
    if (winRate >= 70) lines.push(`שיעור הצלחה גבוה של ${winRate}% בתקופה. אסטרטגיית מכירת הפרמיה עובדת.`);
    else if (winRate < 50) lines.push(`שיעור הצלחה נמוך של ${winRate}%. יש לבחון את בחירת ה-Strike ותנאי השוק.`);
    else lines.push(`שיעור הצלחה של ${winRate}% בתקופה.`);
    if (totalPnl > 0) lines.push(`רווח נקי של ${fmt(totalPnl, 0)} מאופציות ב-30 ימים האחרונים.`);
    else if (totalPnl < 0) lines.push(`הפסד נקי של ${fmt(Math.abs(totalPnl), 0)}. עלות ה-assignment גבוהה מהפרמיה שנגבתה.`);
    if (itm > 0) lines.push(`${itm} אופציות מומשו — נבדוק אם הנכסים שנרכשו/נמכרו תורמים לתיק.`);
    analysisHTML = `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:6px 10px;font-size:12px;line-height:1.6;margin-top:4px">${lines.join(" ")}</div>`;
  }

  const offChainContent = `
    <div class="sec">5 · IB — Off-Chain</div>${ibTable}
    <div class="sec">6 · חוב למשקיעים</div>${investorsTable}
    <div class="sec" style="font-size:12px">9b · IB אופציות פתוחות</div>${ibOptsTable}
    <div class="sec" style="font-size:12px">10 · אופציות שנסגרו — 30 ימים אחרונים</div>${closedOptsHTML}${analysisHTML}
  `;
  const onChainContent = `
    <div class="sec">7 · Aave V3 — On-Chain</div>${aaveTable}
    <div class="sec">8 · HyperLiquid — ממונף</div>${hlTable}
    <div class="sec">9a · אופציות Rysk</div>${ryskTable}
  `;

  const page2 = `
<div class="page page2">
  ${header}
  <div class="row2col" style="align-items:flex-start;gap:14px;">
    <div style="flex:1">${sectionBlock("blue", "off-chain", offChainContent)}</div>
    <div style="flex:1">${sectionBlock("green", "on-chain", onChainContent)}</div>
  </div>
  <div class="footer"><span>Oasis Project G Ltd. · דוח פנימי · סודי</span><span>עמוד 2 מתוך 2</span></div>
</div>`;

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>דוח שבועי — Oasis ${todayStr}</title>
<style>${css}</style>
</head>
<body>
${page1}
${page2}
<script>setTimeout(() => window.print(), 600);</script>
</body>
</html>`;
}