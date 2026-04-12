import { format, differenceInDays, addMonths } from "date-fns";

const fmt = (v, d = 0) => {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v < 0 ? "-$" : "$") + s;
};
const fmtILS = (v) => v == null ? "—" : `₪${Math.abs(v).toLocaleString("he-IL")}`;
const fmtPct = (v) => v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const diffStr = (curr, prev) => {
  if (prev == null || curr == null) return "—";
  const d = curr - prev;
  const pct = ((d / Math.abs(prev)) * 100).toFixed(1);
  const sign = d >= 0 ? "+" : "";
  const color = d >= 0 ? "#16a34a" : "#dc2626";
  return `<span style="color:${color}">${sign}${fmt(d)} (${sign}${pct}%)</span>`;
};

function svgPie(slices, size = 130) {
  const total = slices.reduce((s, sl) => s + sl.val, 0);
  if (!total) return `<svg width="${size}" height="${size}"></svg>`;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;
  let paths = "", angle = -Math.PI / 2;
  for (const sl of slices) {
    if (!sl.val) continue;
    const sweep = (sl.val / total) * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    paths += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${sl.color}" stroke="white" stroke-width="1.5"/>`;
    angle = end;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${paths}</svg>`;
}

function svgBars(items, w = 290, barH = 13, gap = 5) {
  const maxAbs = Math.max(...items.map(i => Math.abs(i.val)), 1);
  const labelW = 115, barMaxW = w - labelW - 75;
  const h = items.length * (barH + gap) + 8;
  let els = "";
  items.forEach((it, i) => {
    const y = i * (barH + gap) + 4;
    const bw = (Math.abs(it.val) / maxAbs) * barMaxW;
    const color = it.val >= 0 ? "#16a34a" : "#dc2626";
    const sign = it.val >= 0 ? "+" : "";
    const valStr = `${sign}$${Math.abs(it.val).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    els += `<text x="${labelW - 4}" y="${y + barH - 2}" font-size="9" fill="#374151" text-anchor="end" font-family="Arial">${it.label}</text>`;
    if (bw > 0) els += `<rect x="${labelW}" y="${y}" width="${bw.toFixed(1)}" height="${barH}" fill="${color}" rx="2" opacity="0.85"/>`;
    els += `<text x="${labelW + bw + 4}" y="${y + barH - 2}" font-size="9" fill="${color}" font-family="Arial">${valStr}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els}</svg>`;
}

function getUpcomingEvents(options, ibOptions, investors, openLev, today) {
  const events = [];

  // Rysk options expiring within 14 days
  options.filter(o => o.status === "Open" && o.maturity_date).forEach(o => {
    const d = new Date(o.maturity_date);
    const daysLeft = differenceInDays(d, today);
    if (daysLeft >= 0 && daysLeft <= 14) {
      events.push({ urgency: daysLeft <= 5 ? "red" : "yellow", daysLeft, text: `${o.asset} ${o.option_type} ×${o.size || 1} (Rysk) — פוקעת ${format(d, "d.M.yy")} (${daysLeft} ימ')` });
    }
  });

  // IB options expiring within 14 days
  ibOptions.filter(o => o.status === "Open" && o.expiration_date).forEach(o => {
    const d = new Date(o.expiration_date);
    const daysLeft = differenceInDays(d, today);
    if (daysLeft >= 0 && daysLeft <= 14) {
      events.push({ urgency: daysLeft <= 5 ? "red" : "yellow", daysLeft, text: `${o.ticker} ${o.category} ×${o.quantity} (IB) — פוקעת ${format(d, "d.M.yy")} (${daysLeft} ימ')` });
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

  return events.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 6);
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

export function generateReportHTML({ wizardAnswers, prevReport, investors, investorPayments, options, leveraged, aaveCollateral, periodStart, periodEnd, ibOptions = [] }) {
  const today = new Date();
  const todayStr = format(today, "dd.MM.yyyy");
  const periodStr = `${format(new Date(periodStart), "d.M.yy")} — ${format(new Date(periodEnd), "d.M.yy")}`;

  const { ib_nav, ib_options_pnl, ib_stocks_pnl, ib_win_rate, btc_price, eth_price, aave_price, mstr_price, aave_borrowed, aave_hf, manager_notes } = wizardAnswers;
  const IB_DEPOSITED = 413000;

  // Aave collateral
  const ethUnits = aaveCollateral.find(a => a.token?.toUpperCase().includes("ETH") && !a.token?.toUpperCase().includes("WETH"))?.units ||
                   aaveCollateral.find(a => a.token?.toUpperCase() === "ETH" || a.token?.toUpperCase() === "WETH")?.units || 0;
  const wbtcUnits = aaveCollateral.find(a => a.token?.toUpperCase().includes("BTC") || a.token?.toUpperCase().includes("WBTC"))?.units || 0;
  const aaveTokenUnits = aaveCollateral.find(a => a.token?.toUpperCase() === "AAVE")?.units || 0;

  // Also try alternate ETH token names
  const ethUnitsAlt = ethUnits || aaveCollateral.find(a => /eth/i.test(a.token))?.units || 0;

  const btcVal = wbtcUnits * (btc_price || 0);
  const ethVal = (ethUnitsAlt || ethUnits) * (eth_price || 0);
  const aaveTokenVal = aaveTokenUnits * (aave_price || 0);
  const collateralUSD = btcVal + ethVal + aaveTokenVal;
  const onChainNav = collateralUSD - (aave_borrowed || 0);
  const totalNav = (ib_nav || 0) + onChainNav;

  const prev = prevReport;
  const prevTotal = prev ? (prev.ib_nav || 0) + (prev.on_chain_nav || 0) : null;
  const prevIbNav = prev?.ib_nav;
  const prevBtc = prev?.btc_price;
  const prevEth = prev?.eth_price;
  const prevOnChain = prev?.on_chain_nav;

  // Leveraged positions with calcs
  const openLev = leveraged.filter(l => l.status === "Open").map(l => {
    const priceMap = { BTC: btc_price, ETH: eth_price, AAVE: aave_price, MSTR: mstr_price };
    const currentPrice = priceMap[l.asset?.toUpperCase()] || l.mark_price;
    const size = l.size || 0;
    const posValue = currentPrice && size ? currentPrice * size : l.position_value_usd;
    const pnl = l.entry_price && size && currentPrice ? (currentPrice - l.entry_price) * size * (l.direction === "Short" ? -1 : 1) : l.pnl_usd;
    const roe = pnl != null && l.margin_usd ? (pnl / l.margin_usd) * 100 : null;
    const distLiq = currentPrice && l.liquidation_price ? Math.abs((currentPrice - l.liquidation_price) / currentPrice * 100) : null;
    return { ...l, calcValue: posValue, calcPnl: pnl, calcRoe: roe, distLiq, currentPrice };
  });

  // Auto-detect upcoming events
  const events = getUpcomingEvents(options, ibOptions, investors, openLev, today);

  // Asset allocation (PIE CHART) — from ALL sources
  const mstrLevVal = openLev.filter(l => l.asset?.toUpperCase() === "MSTR").reduce((s, l) => s + Math.abs(l.calcValue || 0), 0);
  const ibOther = Math.max(0, (ib_nav || 0) - mstrLevVal);
  const pieSlices = [
    { name: "WBTC", val: btcVal, color: "#f7931a" },
    { name: "ETH", val: ethVal, color: "#627eea" },
    { name: "AAVE", val: aaveTokenVal, color: "#b878e8" },
    { name: "MSTR", val: mstrLevVal, color: "#3b82f6" },
    { name: "IB", val: ibOther, color: "#10b981" },
  ].filter(s => s.val > 0);
  const pieTotal = pieSlices.reduce((s, sl) => s + sl.val, 0) || 1;

  // P&L by strategy (BAR CHART)
  const ryskPremium = options.reduce((s, o) => s + (o.income_usd || 0), 0);
  const levPnl = openLev.reduce((s, l) => s + (l.calcPnl || 0), 0);
  const aaveYield = aaveCollateral.reduce((s, a) => s + ((a.supply_apy || 0) / 100) * (a.units || 0) * ((a.token?.toUpperCase().includes("ETH") ? eth_price : a.token?.toUpperCase().includes("BTC") ? btc_price : a.token?.toUpperCase() === "AAVE" ? aave_price : 0) || 0) / 52, 0);
  const barItems = [
    { label: "IB Options", val: ib_options_pnl || 0 },
    { label: "Rysk Finance", val: ryskPremium },
    { label: "Aave Yield", val: Math.round(aaveYield) },
    { label: "IB Stocks", val: ib_stocks_pnl || 0 },
    { label: "HyperLiquid", val: Math.round(levPnl) },
  ].filter(i => i.val !== 0);

  // Risk assessment
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
  const ibPct = ib_nav ? ((ib_nav - IB_DEPOSITED) / IB_DEPOSITED * 100) : null;
  if (ibPct != null && ibPct < -20) risks.push({ color: ibPct < -40 ? "red" : "yellow", text: `תיק IB ירד ${Math.abs(ibPct).toFixed(1)}% מההשקעה המקורית.` });
  if (risks.length === 0) risks.push({ color: "green", text: "לא זוהו סיכונים מהותיים." });

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

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; direction: rtl; font-size: 10px; color: #1e293b; background: white; }
    .page { width: 210mm; min-height: 297mm; padding: 8mm 10mm; position: relative; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .hdr { background: #0f1e3c; color: white; padding: 5px 10px; border-radius: 5px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; }
    .hdr strong { font-size: 12px; }
    .sec { font-size: 9px; font-weight: bold; background: #1e40af; color: white; padding: 3px 8px; border-radius: 3px; margin: 7px 0 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 9px; }
    th { background: #1e293b; color: white; padding: 3px 6px; text-align: right; }
    td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    .g { color: #16a34a; font-weight: bold; }
    .r { color: #dc2626; font-weight: bold; }
    .y { color: #b45309; }
    .event-red { background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; padding: 3px 8px; margin: 2px 0; font-size: 9px; }
    .event-yellow { background: #fef9c3; border: 1px solid #fde047; border-radius: 4px; padding: 3px 8px; margin: 2px 0; font-size: 9px; }
    .event-green { background: #dcfce7; border: 1px solid #86efac; border-radius: 4px; padding: 3px 8px; margin: 2px 0; font-size: 9px; }
    .row2col { display: flex; gap: 10px; align-items: flex-start; }
    .col-table { flex: 1.4; }
    .col-chart { flex: 1; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; }
    .legend-item { font-size: 8px; display: flex; align-items: center; gap: 3px; }
    .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
    .footer { position: absolute; bottom: 6mm; left: 10mm; right: 10mm; border-top: 1px solid #e2e8f0; padding-top: 3px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; }
    .risk-line { padding: 3px 8px; margin: 2px 0; font-size: 9px; border-radius: 3px; }
    .notes-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; padding: 5px 8px; font-size: 9px; line-height: 1.5; }
    @media print { .page { page-break-after: always; } }
  `;

  const header = `<div class="hdr"><div><strong>Oasis Project G Ltd. · דוח שבועי</strong> | ${periodStr}</div><div>הוכן: נדב | ${todayStr}</div></div>`;

  // Events box HTML
  const eventsHTML = events.length > 0
    ? `<div class="sec">📅 אירועים קרובים</div><div>${events.map(e => `<div class="event-${e.urgency}">${e.urgency === "red" ? "🔴" : "🟡"} ${e.text}</div>`).join("")}</div>`
    : `<div class="event-green">🟢 אין אירועים דחופים בשבועיים הקרובים.</div>`;

  // Risks HTML
  const riskColors = { red: "#fee2e2", yellow: "#fef9c3", green: "#dcfce7" };
  const riskDots = { red: "🔴", yellow: "🟡", green: "🟢" };
  const risksHTML = risks.map(r => `<div class="risk-line" style="background:${riskColors[r.color]}">${riskDots[r.color]} ${r.text}</div>`).join("");

  // Summary table
  const summaryTable = table(
    ["מדד", "ערך", "שינוי"],
    [
      { cells: ["שווי תיק כולל", `<strong>${fmt(totalNav)}</strong>`, diffStr(totalNav, prevTotal)] },
      { cells: ["Off-Chain (IB)", fmt(ib_nav), diffStr(ib_nav, prevIbNav)] },
      { cells: ["On-Chain (קריפטו)", fmt(onChainNav), diffStr(onChainNav, prevOnChain)] },
      { cells: ["BTC", fmt(btc_price), diffStr(btc_price, prevBtc)] },
      { cells: ["ETH", fmt(eth_price), diffStr(eth_price, prevEth)] },
    ]
  );

  // Pie chart + legend
  const pieSvg = svgPie(pieSlices, 130);
  const legend = `<div class="legend">${pieSlices.map(sl => `<span class="legend-item"><span class="dot" style="background:${sl.color}"></span>${sl.name} ${((sl.val / pieTotal) * 100).toFixed(1)}%</span>`).join("")}</div>`;

  // Bar chart
  const barSvg = svgBars(barItems);

  const page1 = `
<div class="page">
  ${header}
  ${eventsHTML}
  <div class="sec">1 · תמונה כוללת</div>
  <div class="row2col">
    <div class="col-table">${summaryTable}</div>
    <div class="col-chart">
      ${pieSvg}
      ${legend}
    </div>
  </div>
  <div class="sec">2 · ביצועים לפי אסטרטגיה</div>
  ${barSvg}
  <div class="sec">3 · הערכת סיכונים</div>
  ${risksHTML}
  ${manager_notes ? `<div class="sec">4 · הערות מנהל</div><div class="notes-box">${manager_notes.replace(/\n/g, "<br>")}</div>` : ""}
  <div class="footer"><span>Oasis Project G Ltd. · סודי</span><span>עמוד 1 מתוך 2</span></div>
</div>`;

  // === PAGE 2 ===

  // IB table
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

  // Investors table
  const investorsTable = table(
    ["משקיע", "קרן", "ריבית", "תשלום", "ששולם", "הבא"],
    [
      ...investorRows.map(r => ({ cells: [r.name, r.principal, r.rate, r.schedule, r.paid, r.next] })),
      { cells: [`<strong>סה״כ</strong>`, `<strong>${fmt(totalPrincipal)}</strong>`, "", "", `<strong>${fmt(totalPaid)}</strong>`, ""] },
    ]
  );

  // Aave table
  const aaveRows = aaveCollateral.map(a => {
    const priceMap = { "ETH": eth_price, "WETH": eth_price, "WBTC": btc_price, "BTC": btc_price, "AAVE": aave_price };
    const p = Object.entries(priceMap).find(([k]) => a.token?.toUpperCase().includes(k))?.[1] || 0;
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

  // HL table
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
  ) : "<p style='color:#94a3b8;padding:4px 0;'>אין פוזיציות פתוחות</p>";

  // Rysk options
  const ryskTable = openOpts.length > 0 ? table(
    ["נכס", "סוג", "Strike", "פרמיה", "פקיעה"],
    openOpts.map(o => ({ cells: [o.asset, `${o.direction} ${o.option_type}`, o.strike_price ? fmt(o.strike_price) : "—", `<span class="g">${fmt(o.income_usd, 2)}</span>`, o.maturity_date ? format(new Date(o.maturity_date), "d.M.yy") : "—"] }))
  ) : "<p style='color:#94a3b8;padding:3px 0;'>אין</p>";

  // IB options
  const ibOptsTable = openIbOpts.length > 0 ? table(
    ["Ticker", "סוג", "Strike", "Fill", "Qty", "Collateral", "פקיעה"],
    openIbOpts.map(o => {
      const daysLeft = o.expiration_date ? differenceInDays(new Date(o.expiration_date), today) : null;
      return {
        cells: [`<strong>${o.ticker}</strong>`, `${o.type} ${o.category}`, o.strike ? fmt(o.strike) : "—", `$${o.fill_price || 0}`, o.quantity || "—", fmt(o.collateral), o.expiration_date ? format(new Date(o.expiration_date), "d.M.yy") : "—"],
        highlight: daysLeft != null && daysLeft <= 7 ? "yellow" : null
      };
    })
  ) : "<p style='color:#94a3b8;padding:3px 0;'>אין</p>";

  const page2 = `
<div class="page">
  ${header}
  <div class="row2col" style="align-items:flex-start;gap:12px;">
    <div style="flex:1">
      <div class="sec">5 · IB — Off-Chain</div>
      ${ibTable}
      <div class="sec">6 · חוב למשקיעים</div>
      ${investorsTable}
    </div>
    <div style="flex:1">
      <div class="sec">7 · Aave V3 — On-Chain</div>
      ${aaveTable}
    </div>
  </div>
  <div class="sec">8 · HyperLiquid — ממונף</div>
  ${hlTable}
  <div class="row2col" style="gap:12px;">
    <div style="flex:1">
      <div class="sec">9a · אופציות Rysk</div>
      ${ryskTable}
    </div>
    <div style="flex:1">
      <div class="sec">9b · אופציות IB</div>
      ${ibOptsTable}
    </div>
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