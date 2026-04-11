import { jsPDF } from "jspdf";
import { differenceInDays, format, addMonths } from "date-fns";

const fmtUSD = (v) => {
  if (v == null) return "$0";
  const abs = Math.abs(v);
  const fmt = abs.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `-${fmt.replace('-','')}` : fmt;
};

function reverseHebrew(text) {
  if (!text) return "";
  // Reverse the string for RTL rendering in jsPDF
  return text.split("").reverse().join("");
}

function rtl(text) {
  return String(text || "");
}

// Draw a table
function drawTable(doc, x, y, headers, rows, colWidths, pageWidth) {
  const rowH = 7;
  const startX = x;

  // Header row
  doc.setFillColor(40, 40, 40);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");

  let cx = startX;
  headers.forEach((h, i) => {
    doc.rect(cx, y, colWidths[i], rowH, "F");
    doc.text(h, cx + colWidths[i] / 2, y + 5, { align: "center" });
    cx += colWidths[i];
  });
  y += rowH;

  // Data rows
  doc.setFont("helvetica", "normal");
  rows.forEach((row, ri) => {
    doc.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255);
    doc.setTextColor(30, 30, 30);
    let cx = startX;
    row.forEach((cell, i) => {
      doc.rect(cx, y, colWidths[i], rowH, "FD");
      const color = String(cell).startsWith("+") ? [34, 197, 94] : String(cell).startsWith("-") ? [239, 68, 68] : null;
      if (color) doc.setTextColor(...color);
      else doc.setTextColor(30, 30, 30);
      doc.text(String(cell || "—"), cx + colWidths[i] / 2, y + 5, { align: "center" });
      cx += colWidths[i];
    });
    y += rowH;
  });

  doc.setTextColor(30, 30, 30);
  return y + 3;
}

function addHeader(doc, title, period, pageNum, totalPages) {
  const pw = doc.internal.pageSize.getWidth();

  // Top bar
  doc.setFillColor(15, 30, 60);
  doc.rect(0, 0, pw, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Oasis Project G Ltd.", 10, 12);
  doc.setFontSize(9);
  doc.text(title, pw / 2, 12, { align: "center" });
  doc.setFontSize(8);
  doc.text(period, pw - 10, 12, { align: "right" });

  // Footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setFillColor(240, 240, 240);
  doc.rect(0, ph - 10, pw, 10, "F");
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(7);
  doc.text("Oasis Project G Ltd. · Internal Report · Confidential", pw / 2, ph - 4, { align: "center" });
  doc.text(`Page ${pageNum} of ${totalPages}`, pw - 10, ph - 4, { align: "right" });

  doc.setTextColor(30, 30, 30);
  return 24;
}

function sectionTitle(doc, text, y, color = [15, 30, 60]) {
  doc.setFillColor(...color);
  doc.rect(10, y, doc.internal.pageSize.getWidth() - 20, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(text, doc.internal.pageSize.getWidth() - 14, y + 5.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  return y + 12;
}

export async function generateWeeklyPDF({ managerInputs, portfolioData, activityLogs, investors, investorPayments, options, leveraged, aave }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth(); // 210
  const TOTAL_PAGES = 3;
  const today = format(new Date(), "dd.MM.yyyy");
  const period = `${format(new Date(managerInputs.period_start), "d.M.yy")} — ${format(new Date(managerInputs.period_end), "d.M.yy")}`;
  const periodTitle = `Period: ${period}`;

  // ── PAGE 1 ───────────────────────────────────────────────────────────
  let y = addHeader(doc, "Weekly Investment Management Report", periodTitle, 1, TOTAL_PAGES);

  // Sub header info
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`Generated: ${today}   |   Prepared by: Nadav`, pw - 10, y, { align: "right" });
  y += 8;

  // Section 1.1 — Overview table
  y = sectionTitle(doc, "1.1 — סקירה כללית · Portfolio Overview", y);

  const { current, prev } = portfolioData;
  const navChange = current.nav - (prev?.nav || 0);
  const ibChange = current.ib_nav - (prev?.ib_nav || 0);

  const overviewRows = [
    ["שווי תיק כולל (Net)", prev?.nav != null ? fmtUSD(prev.nav) : "—", fmtUSD(current.nav), prev?.nav != null ? (navChange >= 0 ? "+" : "") + fmtUSD(navChange) : "—"],
    ["Off-Chain (IB NAV)", prev?.ib_nav != null ? fmtUSD(prev.ib_nav) : "—", fmtUSD(current.ib_nav), prev?.ib_nav != null ? (ibChange >= 0 ? "+" : "") + fmtUSD(ibChange) : "—"],
    ["BTC Price", prev?.btc_price != null ? `$${prev.btc_price?.toLocaleString()}` : "—", `$${current.btc_price?.toLocaleString()}`, ""],
    ["ETH Price", prev?.eth_price != null ? `$${prev.eth_price?.toLocaleString()}` : "—", `$${current.eth_price?.toLocaleString()}`, ""],
  ];
  y = drawTable(doc, 10, y, ["מדד", "שבוע שעבר", "השבוע", "שינוי"], overviewRows, [60, 42, 42, 42], pw);

  // Manager summary
  if (managerInputs.manager_summary) {
    y += 2;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Manager Summary:", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(managerInputs.manager_summary, pw - 20);
    doc.text(lines, 10, y);
    y += lines.length * 4 + 4;
  }

  // Section 1.2 — Asset Allocation (simple bars)
  y = sectionTitle(doc, "1.2 — הקצאת נכסים · Asset Allocation", y);

  const alloc = current.allocation || {};
  const total = Object.values(alloc).reduce((s, v) => s + v, 0) || 1;
  const colors = { BTC: [247, 147, 26], ETH: [98, 126, 234], AAVE: [184, 118, 230], MSTR: [59, 130, 246], Stablecoins: [34, 197, 94], Other: [156, 163, 175] };
  const barW = pw - 60;
  const barH = 5;
  let bx = 10;
  let by = y;

  Object.entries(alloc).forEach(([k, v]) => {
    if (!v || v <= 0) return;
    const pct = v / total;
    const w = Math.max(1, pct * barW);
    const c = colors[k] || [100, 100, 100];
    doc.setFillColor(...c);
    doc.rect(bx, by, w, barH, "F");
    bx += w;
  });
  y += barH + 2;

  // Legend
  bx = 10;
  doc.setFontSize(7);
  Object.entries(alloc).forEach(([k, v]) => {
    if (!v || v <= 0) return;
    const pct = ((v / total) * 100).toFixed(1);
    const c = colors[k] || [100, 100, 100];
    doc.setFillColor(...c);
    doc.rect(bx, y, 3, 3, "F");
    doc.setTextColor(30, 30, 30);
    doc.text(`${k} ${pct}%`, bx + 4, y + 2.5);
    bx += 28;
  });
  y += 8;

  // Section 1.3 — Actions this week
  y = sectionTitle(doc, "1.3 — פעולות עיקריות השבוע", y);

  if (managerInputs.actions_taken) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Manager notes:", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(managerInputs.actions_taken, pw - 20);
    doc.text(lines, 10, y);
    y += lines.length * 4 + 3;
  }

  if (activityLogs.length > 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Activity Log (auto):", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    activityLogs.slice(0, 8).forEach(log => {
      doc.text(`• ${log.date}  ${log.action_type}: ${log.description?.substring(0, 60) || ""}`, 12, y);
      y += 4;
    });
  }

  // ── PAGE 2 ───────────────────────────────────────────────────────────
  doc.addPage();
  y = addHeader(doc, "Detailed Breakdown", periodTitle, 2, TOTAL_PAGES);

  // Section 2.1 — IB
  y = sectionTitle(doc, "2.1 — Off-Chain · Interactive Brokers", y);

  const ibRows = [
    ["IB NAV", fmtUSD(current.ib_nav)],
    ["Total Deposited", fmtUSD(current.ib_deposited)],
    ["P&L (Unrealized)", current.ib_nav != null && current.ib_deposited != null ? (current.ib_nav - current.ib_deposited >= 0 ? "+" : "") + fmtUSD(current.ib_nav - current.ib_deposited) : "—"],
    ["Options Premium Collected", fmtUSD(current.options_premium_total)],
    ["Options Win Rate", current.options_win_rate != null ? `${current.options_win_rate.toFixed(0)}%` : "—"],
  ];
  y = drawTable(doc, 10, y, ["מדד", "סכום"], ibRows, [100, 86], pw);

  // Section 2.2 — Investors debt
  y = sectionTitle(doc, "2.2 — חוב למשקיעים Off-Chain", y);

  const invRows = investors.map(inv => {
    const paid = investorPayments.filter(p => p.investor_id === inv.id).length * (inv.monthly_payment || 0);
    const nextPay = inv.interest_schedule === "Monthly"
      ? format(addMonths(new Date(inv.start_date), investorPayments.filter(p => p.investor_id === inv.id).length + 1), "d.M.yy")
      : format(new Date(inv.maturity_date), "MMM yyyy");
    return [
      inv.name,
      fmtUSD(inv.principal_usd),
      `${inv.interest_rate}%`,
      inv.interest_schedule === "Monthly" ? `Monthly $${(inv.monthly_payment || 0).toLocaleString()}` : "At Maturity",
      inv.interest_schedule === "Monthly" ? fmtUSD(paid) : "$0",
      nextPay,
    ];
  });
  const totalPrincipal = investors.reduce((s, i) => s + (i.principal_usd || 0), 0);
  const totalPaid = investors.reduce((s, inv) => s + investorPayments.filter(p => p.investor_id === inv.id).length * (inv.monthly_payment || 0), 0);
  invRows.push(["Total", fmtUSD(totalPrincipal), "", "", fmtUSD(totalPaid), ""]);
  y = drawTable(doc, 10, y, ["משקיע", "קרן", "ריבית", "לוח", "שולם", "תשלום הבא"], invRows, [25, 30, 17, 38, 28, 28], pw);

  // Section 2.3 — Aave
  y = sectionTitle(doc, "2.3 — On-Chain · Aave V3", y);

  const aaveRows = [
    ["Collateral", fmtUSD(aave?.collateral_usd)],
    ["Borrowed USDC", fmtUSD(aave?.borrow_usd)],
    ["Health Factor", aave?.health_factor?.toFixed(2) || "—"],
    ["Borrow Power Used", aave?.borrow_usd && aave?.collateral_usd ? `${((aave.borrow_usd / (aave.collateral_usd * 0.8)) * 100).toFixed(1)}%` : "—"],
    ["Net APY", aave?.net_apy != null ? `${aave.net_apy.toFixed(2)}%` : "—"],
  ];
  y = drawTable(doc, 10, y, ["מדד", "סכום"], aaveRows, [100, 86], pw);

  // Section 2.4 — HyperLiquid
  y = sectionTitle(doc, "2.4 — HyperLiquid — פוזיציות ממונפות", y);

  const levRows = leveraged.filter(l => l.status === "Open").map(l => {
    const pnl = l.pnl_usd != null ? l.pnl_usd : (l.mark_price && l.entry_price && l.size ? (l.mark_price - l.entry_price) * l.size * (l.direction === "Short" ? -1 : 1) : null);
    const roe = pnl != null && l.margin_usd ? (pnl / l.margin_usd) * 100 : null;
    const distToLiq = l.mark_price && l.liquidation_price ? Math.abs((l.mark_price - l.liquidation_price) / l.mark_price * 100) : null;
    return [
      l.asset,
      `${l.leverage || "—"}x`,
      fmtUSD(l.position_value_usd),
      pnl != null ? (pnl >= 0 ? "+" : "") + fmtUSD(pnl) : "—",
      roe != null ? `${roe.toFixed(1)}%` : "—",
      distToLiq != null ? `${distToLiq.toFixed(1)}%` : "—",
    ];
  });
  y = drawTable(doc, 10, y, ["נכס", "מינוף", "שווי", "P&L", "ROE%", "מרחק חיסול"], levRows, [20, 18, 32, 32, 22, 32], pw);

  // Section 2.5 — Options
  y = sectionTitle(doc, "2.5 — אופציות · Rysk Finance", y);

  const openOpts = options.filter(o => o.status === "Open");
  const optRows = openOpts.map(o => {
    const isOTM = o.strike_price && o.current_price ? (o.option_type === "Put" ? o.current_price > o.strike_price : o.current_price < o.strike_price) : null;
    return [
      o.asset,
      `${o.direction} ${o.option_type}`,
      o.strike_price ? `$${o.strike_price.toLocaleString()}` : "—",
      fmtUSD(o.income_usd),
      `${o.apr_percent?.toFixed(1) || "—"}%`,
      o.maturity_date ? format(new Date(o.maturity_date), "d.M.yy") : "—",
      isOTM == null ? "—" : isOTM ? "OTM" : "ITM",
    ];
  });
  y = drawTable(doc, 10, y, ["נכס", "סוג", "Strike", "פרמיה", "APR", "פקיעה", "סטטוס"], optRows, [20, 28, 25, 24, 20, 22, 17], pw);

  // ── PAGE 3 ───────────────────────────────────────────────────────────
  doc.addPage();
  y = addHeader(doc, "Risk Assessment & Action Plan", periodTitle, 3, TOTAL_PAGES);

  // Auto risks
  y = sectionTitle(doc, "3.1 — סיכונים · Risk Assessment", y);

  const risks = [];

  // HL risks
  leveraged.filter(l => l.status === "Open").forEach(l => {
    const pnl = l.pnl_usd != null ? l.pnl_usd : (l.mark_price && l.entry_price && l.size ? (l.mark_price - l.entry_price) * l.size * (l.direction === "Short" ? -1 : 1) : null);
    const roe = pnl != null && l.margin_usd ? (pnl / l.margin_usd) * 100 : null;
    const dist = l.mark_price && l.liquidation_price ? Math.abs((l.mark_price - l.liquidation_price) / l.mark_price * 100) : null;
    if (roe != null && roe < -100) risks.push({ sev: "RED", text: `${l.asset} HL position ROE ${roe.toFixed(1)}% — Consider closing.` });
    if (dist != null && dist < 25) risks.push({ sev: "RED", text: `${l.asset} liquidation distance ${dist.toFixed(1)}% — CRITICAL.` });
    else if (dist != null && dist < 35) risks.push({ sev: "YELLOW", text: `${l.asset} liquidation distance ${dist.toFixed(1)}% — Monitor closely.` });
  });

  // Aave risks
  if (aave?.health_factor) {
    if (aave.health_factor < 1.5) risks.push({ sev: "RED", text: `Aave Health Factor ${aave.health_factor.toFixed(2)} — DANGER.` });
    else if (aave.health_factor < 2.0) risks.push({ sev: "YELLOW", text: `Aave Health Factor ${aave.health_factor.toFixed(2)} — Monitor.` });
    else risks.push({ sev: "GREEN", text: `Aave Health Factor ${aave.health_factor.toFixed(2)} — Safe range.` });
  }

  // IB performance
  if (current.ib_nav && current.ib_deposited) {
    const pct = (current.ib_nav - current.ib_deposited) / current.ib_deposited * 100;
    if (pct < -40) risks.push({ sev: "RED", text: `IB NAV down ${pct.toFixed(1)}% from deposited — Critical.` });
    else if (pct < -20) risks.push({ sev: "YELLOW", text: `IB NAV down ${pct.toFixed(1)}% from original investment.` });
  }

  // Options expiry
  openOpts.forEach(o => {
    if (o.maturity_date) {
      const days = differenceInDays(new Date(o.maturity_date), new Date());
      if (days <= 7) risks.push({ sev: "YELLOW", text: `Option ${o.asset} ${o.option_type} expires in ${days} days (${format(new Date(o.maturity_date), "d.M.yy")}).` });
    }
  });

  if (risks.length === 0) risks.push({ sev: "GREEN", text: "No major risks detected." });

  const sevColor = { RED: [239, 68, 68], YELLOW: [245, 158, 11], GREEN: [34, 197, 94] };
  const sevEmoji = { RED: "⬤ ", YELLOW: "⬤ ", GREEN: "⬤ " };

  risks.forEach(r => {
    doc.setFillColor(r.sev === "RED" ? 255 : r.sev === "YELLOW" ? 255 : 240, r.sev === "RED" ? 245 : r.sev === "YELLOW" ? 250 : 253, r.sev === "RED" ? 245 : r.sev === "YELLOW" ? 235 : 243);
    doc.rect(10, y, pw - 20, 7, "F");
    doc.setTextColor(...sevColor[r.sev]);
    doc.setFontSize(8);
    doc.text("●", 13, y + 5);
    doc.setTextColor(30, 30, 30);
    doc.text(r.text.substring(0, 90), 18, y + 5);
    y += 8;
  });

  // Manual risks
  if (managerInputs.risks_notes) {
    y += 3;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Manager notes on risks:", 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(managerInputs.risks_notes, pw - 20);
    doc.text(lines, 10, y);
    y += lines.length * 4 + 4;
  }

  // Section 3.2 — Action plan
  y = sectionTitle(doc, "3.2 — תכנית פעולה לשבוע הבא", y);

  doc.setFontSize(8);
  if (managerInputs.next_week_plan) {
    const lines = doc.splitTextToSize(managerInputs.next_week_plan, pw - 20);
    doc.text(lines, 10, y);
    y += lines.length * 4;
  } else {
    doc.setTextColor(150, 150, 150);
    doc.text("No action plan provided.", 10, y);
    doc.setTextColor(30, 30, 30);
    y += 6;
  }

  return doc;
}