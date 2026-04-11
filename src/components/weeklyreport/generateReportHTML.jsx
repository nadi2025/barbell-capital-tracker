import { format, differenceInDays, addMonths } from "date-fns";

const fmt = (v, decimals = 0) => {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const s = abs.toLocaleString("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v < 0 ? "-$" : "$") + s;
};
const fmtPct = (v) => v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const diffStr = (curr, prev) => {
  if (prev == null || curr == null) return "—";
  const d = curr - prev;
  const pct = ((d / Math.abs(prev)) * 100).toFixed(1);
  const sign = d >= 0 ? "+" : "";
  return `${sign}${fmt(d)} (${sign}${pct}%)`;
};

function tableRow(cells, isHeader = false, highlight = null) {
  const tag = isHeader ? "th" : "td";
  const bg = highlight === "red" ? "#fee2e2" : highlight === "yellow" ? "#fef9c3" : "";
  const rowStyle = bg ? `style="background:${bg}"` : "";
  return `<tr ${rowStyle}>${cells.map(c => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
}

function table(headers, rows, caption = null) {
  return `
    ${caption ? `<h4 style="margin:12px 0 4px;font-size:11px;color:#6b7280;">${caption}</h4>` : ""}
    <table>
      <thead>${tableRow(headers, true)}</thead>
      <tbody>${rows.map(r => tableRow(r.cells, false, r.highlight)).join("")}</tbody>
    </table>`;
}

function riskRow(color, text) {
  const dot = color === "red" ? "🔴" : color === "yellow" ? "🟡" : "🟢";
  const bg = color === "red" ? "#fee2e2" : color === "yellow" ? "#fef9c3" : "#dcfce7";
  return `<div style="background:${bg};border-radius:6px;padding:6px 10px;margin:4px 0;font-size:11px;">${dot} ${text}</div>`;
}

export function generateReportHTML({ wizardAnswers, prevReport, investors, investorPayments, options, leveraged, aaveCollateral, periodStart, periodEnd }) {
  const today = new Date();
  const todayStr = format(today, "dd.MM.yyyy");

  const {
    ib_nav, ib_options_pnl, ib_stocks_pnl, ib_premium_total, ib_win_rate,
    btc_price, eth_price, aave_price, mstr_price,
    aave_borrowed, aave_hf, manager_notes
  } = wizardAnswers;

  const IB_DEPOSITED = 413000;

  // Aave collateral calculation from units × prices
  const ethUnits = aaveCollateral.find(a => a.token?.includes("ETH"))?.units || 0;
  const wbtcUnits = aaveCollateral.find(a => a.token?.includes("BTC") || a.token?.includes("WBTC"))?.units || 0;
  const aaveTokenUnits = aaveCollateral.find(a => a.token === "AAVE")?.units || 0;
  const collateralUSD = (ethUnits * eth_price) + (wbtcUnits * btc_price) + (aaveTokenUnits * aave_price);
  const onChainNav = collateralUSD - (aave_borrowed || 0);

  const totalNav = (ib_nav || 0) + onChainNav;

  const prev = prevReport;
  const prevTotal = prev ? (prev.ib_nav || 0) + (prev.on_chain_nav || 0) : null;
  const prevIbNav = prev?.ib_nav;
  const prevBtc = prev?.btc_price;
  const prevEth = prev?.eth_price;
  const prevOnChain = prev?.on_chain_nav;

  // Allocation for bar
  const btcVal = wbtcUnits * btc_price;
  const ethVal = ethUnits * eth_price;
  const aaveVal = aaveTokenUnits * aave_price;
  const totalAssets = collateralUSD || 1;
  const alloc = [
    { name: "BTC/WBTC", val: btcVal, color: "#f7931a" },
    { name: "ETH", val: ethVal, color: "#627eea" },
    { name: "AAVE", val: aaveVal, color: "#b878e8" },
  ];

  // Open options
  const openOpts = options.filter(o => o.status === "Open");
  const expiringSoon = openOpts.filter(o => o.maturity_date && differenceInDays(new Date(o.maturity_date), today) <= 7);

  // Leveraged positions with recalculated values
  const openLev = leveraged.filter(l => l.status === "Open").map(l => {
    const priceMap = { BTC: btc_price, ETH: eth_price, AAVE: aave_price, MSTR: mstr_price };
    const currentPrice = priceMap[l.asset] || l.mark_price;
    const size = l.size || 0;
    const posValue = currentPrice && size ? currentPrice * size : l.position_value_usd;
    const pnl = l.entry_price && size && currentPrice ? (currentPrice - l.entry_price) * size * (l.direction === "Short" ? -1 : 1) : l.pnl_usd;
    const roe = pnl != null && l.margin_usd ? (pnl / l.margin_usd) * 100 : null;
    const distLiq = currentPrice && l.liquidation_price ? Math.abs((currentPrice - l.liquidation_price) / currentPrice * 100) : null;
    return { ...l, calcValue: posValue, calcPnl: pnl, calcRoe: roe, distLiq, currentPrice };
  });

  // Investor interest calcs
  const investorRows = investors.map(inv => {
    const paid = investorPayments.filter(p => p.investor_id === inv.id).reduce((s, p) => s + (p.amount || 0), 0);
    const termYears = inv.start_date && inv.maturity_date
      ? differenceInDays(new Date(inv.maturity_date), new Date(inv.start_date)) / 365
      : 3;
    const totalInterest = inv.principal_usd * (inv.interest_rate / 100) * termYears;
    const totalDue = inv.principal_usd + totalInterest;
    const nextPayDisplay = inv.interest_schedule === "Monthly"
      ? format(addMonths(new Date(inv.start_date), investorPayments.filter(p => p.investor_id === inv.id).length + 1), "d.M.yy")
      : format(new Date(inv.maturity_date), "MMM yyyy");
    return {
      name: inv.name,
      principal: fmt(inv.principal_usd),
      rate: `${inv.interest_rate}%`,
      schedule: inv.interest_schedule === "Monthly" ? `חודשי $${(inv.monthly_payment || 0).toFixed(0)}` : "בפירעון",
      paid: fmt(paid),
      next: nextPayDisplay,
    };
  });

  // Risks
  const risks = [];
  openLev.forEach(l => {
    if (l.calcRoe != null && l.calcRoe < -100) risks.push({ color: "red", text: `${l.asset} בהפסד של ${l.calcRoe.toFixed(1)}%. שקלו סגירה.` });
    if (l.distLiq != null && l.distLiq < 25) risks.push({ color: "red", text: `${l.asset} קרוב לחיסול — ${l.distLiq.toFixed(1)}% מרחק. פעולה דחופה!` });
    else if (l.distLiq != null && l.distLiq < 35) risks.push({ color: "yellow", text: `${l.asset} — מעקב. ${l.distLiq.toFixed(1)}% מרחק מחיסול.` });
  });
  if (aave_hf) {
    if (aave_hf < 1.5) risks.push({ color: "red", text: `Health Factor ${aave_hf} — סכנת חיסול!` });
    else if (aave_hf < 2.0) risks.push({ color: "yellow", text: `Health Factor ${aave_hf} — זהירות.` });
    else risks.push({ color: "green", text: `Health Factor ${aave_hf} — בטווח בטוח.` });
  }
  const ibDownPct = ib_nav ? ((ib_nav - IB_DEPOSITED) / IB_DEPOSITED * 100) : null;
  if (ibDownPct != null && ibDownPct < -40) risks.push({ color: "red", text: `תיק IB ירד ${Math.abs(ibDownPct).toFixed(1)}% מההשקעה המקורית — חמור.` });
  else if (ibDownPct != null && ibDownPct < -20) risks.push({ color: "yellow", text: `תיק IB ירד ${Math.abs(ibDownPct).toFixed(1)}% מההשקעה המקורית.` });
  if (expiringSoon.length > 0) risks.push({ color: "yellow", text: `${expiringSoon.length} אופציות פוקעות תוך 7 ימים. נדרש מעקב.` });
  if (risks.length === 0) risks.push({ color: "green", text: "לא זוהו סיכונים מהותיים." });

  const periodStr = `${format(new Date(periodStart), "d.M.yy")} — ${format(new Date(periodEnd), "d.M.yy")}`;

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'David', sans-serif; direction: rtl; font-size: 11px; color: #1e293b; background: white; }
    .page { width: 210mm; min-height: 297mm; padding: 10mm 12mm; page-break-after: always; position: relative; }
    .page:last-child { page-break-after: auto; }
    .header { background: #0f1e3c; color: white; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
    .header-left h1 { font-size: 14px; font-weight: bold; }
    .header-left p { font-size: 10px; color: #94a3b8; margin-top: 2px; }
    .header-right { text-align: left; font-size: 10px; color: #94a3b8; }
    .section-title { background: #1e40af; color: white; padding: 5px 10px; border-radius: 4px; font-size: 10px; font-weight: bold; margin: 12px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
    th { background: #1e293b; color: white; padding: 5px 8px; text-align: right; font-weight: bold; }
    td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    .green { color: #16a34a; font-weight: bold; }
    .red { color: #dc2626; font-weight: bold; }
    .yellow { color: #b45309; }
    .badge-green { background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 10px; font-size: 9px; }
    .badge-yellow { background: #fef9c3; color: #854d0e; padding: 2px 6px; border-radius: 10px; font-size: 9px; }
    .badge-red { background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 10px; font-size: 9px; }
    .footer { position: absolute; bottom: 8mm; left: 12mm; right: 12mm; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    .alloc-bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; margin: 6px 0; }
    .alloc-legend { display: flex; flex-wrap: wrap; gap: 8px; font-size: 9px; margin-bottom: 6px; }
    .notes-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 8px 12px; margin: 6px 0; font-size: 10px; line-height: 1.5; }
    @media print { .page { page-break-after: always; } }
  `;

  const pageHeader = (pageNum) => `
    <div class="header">
      <div class="header-left">
        <h1>Oasis Project G Ltd. · דוח ניהול השקעות שבועי</h1>
        <p>לתקופה: ${periodStr}</p>
      </div>
      <div class="header-right">
        הוכן ע״י: נדב<br>${todayStr}
      </div>
    </div>`;

  const pageFooter = (pageNum) => `
    <div class="footer">
      <span>Oasis Project G Ltd. · דוח פנימי · סודי</span>
      <span>עמוד ${pageNum} מתוך 3</span>
    </div>`;

  // Alloc bar HTML
  const allocTotal = alloc.reduce((s, a) => s + a.val, 0) || 1;
  const allocBarHTML = `
    <div class="alloc-bar">
      ${alloc.map(a => `<div style="width:${((a.val/allocTotal)*100).toFixed(1)}%;background:${a.color}"></div>`).join("")}
    </div>
    <div class="alloc-legend">
      ${alloc.map(a => `<span><span style="display:inline-block;width:8px;height:8px;background:${a.color};border-radius:2px;margin-left:3px"></span>${a.name} ${((a.val/allocTotal)*100).toFixed(1)}%</span>`).join("")}
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<title>דוח שבועי - Oasis ${todayStr}</title>
<style>${css}</style>
</head>
<body>

<!-- PAGE 1 -->
<div class="page">
  ${pageHeader(1)}

  <div class="section-title">1.1 · תמונה כוללת — Portfolio Overview</div>
  ${table(
    ["מדד", "ערך נוכחי", "שינוי משבוע שעבר"],
    [
      { cells: ["שווי תיק כולל", fmt(totalNav), diffStr(totalNav, prevTotal)] },
      { cells: ["Off-Chain (IB)", fmt(ib_nav), diffStr(ib_nav, prevIbNav)] },
      { cells: ["On-Chain (קריפטו)", fmt(onChainNav), diffStr(onChainNav, prevOnChain)] },
      { cells: ["מחיר BTC", fmt(btc_price), diffStr(btc_price, prevBtc)] },
      { cells: ["מחיר ETH", fmt(eth_price), diffStr(eth_price, prevEth)] },
    ]
  )}

  <div class="section-title">1.2 · הקצאת נכסים</div>
  ${allocBarHTML}

  <div class="section-title">1.3 · פעולות עיקריות השבוע</div>
  ${manager_notes
    ? `<div class="notes-box">${manager_notes.replace(/\n/g, "<br>")}</div>`
    : `<p style="color:#94a3b8;font-size:10px;padding:6px 0;">לא הוזנו הערות לדוח זה.</p>`}

  ${pageFooter(1)}
</div>

<!-- PAGE 2 -->
<div class="page">
  ${pageHeader(2)}

  <div class="section-title">2.1 · Off-Chain · Interactive Brokers</div>
  ${table(
    ["מדד", "סכום"],
    [
      { cells: ["NAV תיק IB", fmt(ib_nav)], highlight: ib_nav < IB_DEPOSITED * 0.75 ? "yellow" : null },
      { cells: ["הון שהופקד", fmt(IB_DEPOSITED)] },
      { cells: ["רווח/הפסד כולל", `<span class="${(ib_nav - IB_DEPOSITED) >= 0 ? "green" : "red"}">${fmt(ib_nav - IB_DEPOSITED)} (${fmtPct((ib_nav - IB_DEPOSITED) / IB_DEPOSITED * 100)})</span>`] },
      { cells: ["P&L אופציות (ממומש)", `<span class="${(ib_options_pnl||0) >= 0 ? "green" : "red"}">${fmt(ib_options_pnl)}</span>`] },
      { cells: ["P&L מניות (לא ממומש)", `<span class="${(ib_stocks_pnl||0) >= 0 ? "green" : "red"}">${fmt(ib_stocks_pnl)}</span>`] },
      { cells: ["פרמיה שנגבתה (מצטבר)", `<span class="green">${fmt(ib_premium_total)}</span>`] },
      { cells: ["Win Rate אופציות", ib_win_rate != null ? `${ib_win_rate}%` : "—"] },
    ]
  )}

  <div class="section-title">2.2 · חוב למשקיעים Off-Chain</div>
  ${table(
    ["משקיע", "קרן", "ריבית", "לוח תשלומים", "ריבית ששולמה", "תשלום הבא"],
    [
      ...investorRows.map(r => ({ cells: [r.name, r.principal, r.rate, r.schedule, r.paid, r.next] })),
      { cells: [`<strong>סה״כ</strong>`, `<strong>${fmt(investors.reduce((s,i)=>s+(i.principal_usd||0),0))}</strong>`, "", "", `<strong>${fmt(investorPayments.reduce((s,p)=>s+(p.amount||0),0))}</strong>`, ""], highlight: null },
    ]
  )}

  <div class="section-title">2.3 · On-Chain · Aave V3</div>
  ${table(
    ["מדד", "סכום"],
    [
      { cells: [`ETH בבטוחה (${ethUnits.toFixed(2)} יח')`, fmt(ethUnits * eth_price)] },
      { cells: [`WBTC/BTC בבטוחה (${wbtcUnits.toFixed(4)} יח')`, fmt(wbtcUnits * btc_price)] },
      { cells: [`AAVE בבטוחה (${aaveTokenUnits.toFixed(2)} יח')`, fmt(aaveTokenUnits * aave_price)] },
      { cells: ["<strong>סה״כ בטוחות</strong>", `<strong>${fmt(collateralUSD)}</strong>`] },
      { cells: ["חוב USDC", `<span class="red">${fmt(aave_borrowed)}</span>`] },
      { cells: ["שווי נקי Aave", `<span class="${onChainNav >= 0 ? "green" : "red"}">${fmt(onChainNav)}</span>`] },
      { cells: ["Health Factor", `<span class="${aave_hf >= 2 ? "green" : aave_hf >= 1.5 ? "yellow" : "red"}">${aave_hf || "—"}</span>`] },
    ]
  )}

  <div class="section-title">2.4 · HyperLiquid — פוזיציות ממונפות</div>
  ${openLev.length > 0 ? table(
    ["נכס", "כיוון", "מינוף", "שווי פוזיציה", "P&L", "ROE%", "מרחק חיסול"],
    openLev.map(l => ({
      cells: [
        l.asset,
        l.direction === "Long" ? "Long ▲" : "Short ▼",
        `${l.leverage || "—"}x`,
        fmt(l.calcValue),
        `<span class="${(l.calcPnl||0) >= 0 ? "green" : "red"}">${fmt(l.calcPnl)}</span>`,
        l.calcRoe != null ? `<span class="${l.calcRoe >= 0 ? "green" : l.calcRoe < -100 ? "red" : "yellow"}">${l.calcRoe.toFixed(1)}%</span>` : "—",
        l.distLiq != null ? `<span class="${l.distLiq < 25 ? "red" : l.distLiq < 35 ? "yellow" : "green"}">${l.distLiq.toFixed(1)}%</span>` : "—",
      ],
      highlight: l.distLiq < 25 ? "red" : (l.calcRoe != null && l.calcRoe < -100) ? "red" : null
    }))
  ) : "<p style='color:#94a3b8;padding:6px 0;font-size:10px;'>אין פוזיציות פתוחות</p>"}

  <div class="section-title">2.5 · אופציות · Rysk Finance</div>
  ${openOpts.length > 0 ? table(
    ["נכס", "סוג", "Strike", "פרמיה", "APR", "פקיעה", "סטטוס"],
    openOpts.map(o => {
      const isOTM = o.strike_price && o.current_price ? (o.option_type === "Put" ? o.current_price > o.strike_price : o.current_price < o.strike_price) : null;
      const daysLeft = o.maturity_date ? differenceInDays(new Date(o.maturity_date), today) : null;
      return {
        cells: [
          o.asset,
          `${o.direction} ${o.option_type}`,
          o.strike_price ? fmt(o.strike_price) : "—",
          `<span class="green">${fmt(o.income_usd, 2)}</span>`,
          o.apr_percent ? `${o.apr_percent.toFixed(1)}%` : "—",
          o.maturity_date ? format(new Date(o.maturity_date), "d.M.yy") : "—",
          isOTM == null ? "—" : isOTM ? `<span class="badge-green">OTM ✓</span>` : `<span class="badge-red">ITM</span>`,
        ],
        highlight: daysLeft != null && daysLeft <= 7 ? "yellow" : null
      };
    })
  ) : "<p style='color:#94a3b8;padding:6px 0;font-size:10px;'>אין אופציות פתוחות</p>"}

  ${pageFooter(2)}
</div>

<!-- PAGE 3 -->
<div class="page">
  ${pageHeader(3)}

  <div class="section-title">3.1 · הערכת סיכונים</div>
  <div style="margin-bottom:10px;">
    ${risks.map(r => riskRow(r.color, r.text)).join("")}
  </div>

  ${manager_notes ? `
  <div class="section-title">3.2 · הערות המנהל</div>
  <div class="notes-box">${manager_notes.replace(/\n/g, "<br>")}</div>
  ` : ""}

  <div class="section-title">3.3 · ריבית על אופציות Rysk — סיכום</div>
  ${table(
    ["מדד", "סכום"],
    [
      { cells: ["סה״כ פרמיה (Rysk)", fmt(options.reduce((s,o)=>s+(o.income_usd||0),0), 2)] },
      { cells: ["אופציות פתוחות", openOpts.length.toString()] },
      { cells: ["אופציות שפקעו OTM (win)", options.filter(o=>o.status==="Expired OTM").length.toString()] },
      { cells: ["Win Rate Rysk", options.filter(o=>["Expired OTM","Expired ITM","Exercised"].includes(o.status)).length > 0
        ? `${(options.filter(o=>o.status==="Expired OTM").length / options.filter(o=>["Expired OTM","Expired ITM","Exercised"].includes(o.status)).length * 100).toFixed(0)}%`
        : "—"] },
    ]
  )}

  ${pageFooter(3)}
</div>

<div style="text-align:center;padding:20px;font-size:12px;color:#94a3b8;display:none;" id="print-hint">
  השתמש ב-Ctrl+P / Cmd+P כדי לשמור כ-PDF
</div>

<script>
  document.getElementById('print-hint').style.display='block';
  setTimeout(() => window.print(), 800);
</script>
</body>
</html>`;

  return html;
}