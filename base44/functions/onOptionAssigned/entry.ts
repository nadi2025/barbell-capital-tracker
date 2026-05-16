import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const payload = await req.json();

  const { data: trade } = payload;

  if (!trade || trade.status !== "Assigned") {
    return Response.json({ skipped: true });
  }

  // ── Only handle Cash-Secured Put assignments here.
  // Covered Call assignments are handled separately (sells existing shares).
  const isCSP =
    trade.category === "cash_secured_put" ||
    (trade.category === "Put" && trade.type === "Sell");
  if (!isCSP) {
    return Response.json({ skipped: true, reason: "Not a CSP assignment" });
  }

  const qty = trade.quantity || 0;
  const shares = qty * 100;
  const strike = trade.strike || 0;
  const fillPrice = trade.fill_price || 0;
  const fee = trade.fee || 0;
  const premiumCollected = fillPrice * qty * 100;
  const investedValue = strike * shares;

  // ── Fetch the market price of the underlying at the moment of assignment.
  // We use the latest Prices entry for the ticker. This is what drives the
  // realized P&L: P&L = premium + (marketPrice - strike) * shares - fee.
  let marketPrice = null;
  const priceRows = await base44.asServiceRole.entities.Prices.filter({ asset: trade.ticker });
  if (priceRows.length > 0) {
    // Take the most recently updated price
    priceRows.sort((a, b) => new Date(b.last_updated || 0) - new Date(a.last_updated || 0));
    marketPrice = priceRows[0].price_usd;
  }

  // Realized P&L at the moment of assignment (CSP perspective):
  //   You collected premium, then bought shares at strike while market = marketPrice.
  //   Immediate mark-to-market P&L = premium - (strike - marketPrice) * shares - fee
  //                                = premium + (marketPrice - strike) * shares - fee
  // If we don't have a market price, fall back to premium - fee (best we can do).
  let realizedPnl;
  if (marketPrice != null) {
    realizedPnl = premiumCollected + (marketPrice - strike) * shares - fee;
  } else {
    realizedPnl = premiumCollected - fee;
  }

  // Effective cost basis for the new stock position = strike - premium/share
  // (premium reduces our true cost basis on the shares we now own).
  const premiumPerShare = shares > 0 ? premiumCollected / shares : 0;
  const effectiveCostPerShare = strike - premiumPerShare;
  const effectiveInvestedValue = effectiveCostPerShare * shares;

  // Days the option was open
  const openDate = new Date(trade.open_date);
  const assignDate = trade.close_date ? new Date(trade.close_date) : new Date();
  const daysHeld = Math.round((assignDate - openDate) / (1000 * 60 * 60 * 24));

  // 1. Persist the realized P&L on the option trade itself
  await base44.asServiceRole.entities.OptionsTrade.update(trade.id, {
    pnl: realizedPnl,
  });

  // 2. Create or update stock position (cost basis = strike - premium/share)
  const existingStocks = await base44.asServiceRole.entities.StockPosition.filter({ ticker: trade.ticker });
  const assignmentStocks = existingStocks.filter(s => s.source === "Assignment" && s.linked_option_id === trade.id);

  const stockData = {
    ticker: trade.ticker,
    source: "Assignment",
    entry_date: trade.close_date || new Date().toISOString().split("T")[0],
    shares,
    average_cost: effectiveCostPerShare,
    invested_value: effectiveInvestedValue,
    status: "Holding",
    linked_option_id: trade.id,
    notes: `Assigned from option opened ${trade.open_date}. Strike: $${strike.toFixed(2)}. Premium: $${premiumPerShare.toFixed(2)}/share. Effective cost: $${effectiveCostPerShare.toFixed(2)}/share.`,
  };

  let stockPosition;
  if (assignmentStocks.length > 0) {
    stockPosition = await base44.asServiceRole.entities.StockPosition.update(assignmentStocks[0].id, stockData);
  } else {
    stockPosition = await base44.asServiceRole.entities.StockPosition.create(stockData);
  }

  // 3. Send email report
  const users = await base44.asServiceRole.entities.User.filter({ role: "admin" });
  const emails = users.map(u => u.email).filter(Boolean);

  const expiryDate = trade.expiration_date || trade.close_date || "N/A";
  const pnlColor = realizedPnl >= 0 ? "#16a34a" : "#dc2626";
  const pnlSign = realizedPnl >= 0 ? "+" : "";
  const marketPriceDisplay = marketPrice != null ? `$${marketPrice.toFixed(2)}` : "N/A";

  const emailBody = `
<h2 style="color:#1a1a2e;font-family:Arial,sans-serif">📋 Assignment Report — ${trade.ticker} (Cash-Secured Put)</h2>
<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;font-weight:bold;color:#555">Ticker</td>
    <td style="padding:10px 14px;font-weight:bold">${trade.ticker}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Strategy</td>
    <td style="padding:10px 14px">Cash-Secured Put (Assigned)</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555">Strike Price</td>
    <td style="padding:10px 14px">$${strike.toFixed(2)}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Market Price at Assignment</td>
    <td style="padding:10px 14px">${marketPriceDisplay}</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555">Quantity</td>
    <td style="padding:10px 14px">${qty} contracts (${shares.toLocaleString()} shares)</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Option Open Date</td>
    <td style="padding:10px 14px">${trade.open_date}</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555">Expiration / Assignment Date</td>
    <td style="padding:10px 14px">${expiryDate}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Days Held</td>
    <td style="padding:10px 14px">${daysHeld} days</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555">Premium Collected ($/share)</td>
    <td style="padding:10px 14px">$${fillPrice.toFixed(2)}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Total Premium</td>
    <td style="padding:10px 14px;color:#16a34a">+$${premiumCollected.toLocaleString()}</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555">Fees</td>
    <td style="padding:10px 14px;color:#dc2626">-$${fee.toLocaleString()}</td>
  </tr>
  <tr style="background:#f0fdf4;border-top:2px solid ${pnlColor}">
    <td style="padding:12px 14px;color:${pnlColor};font-weight:bold;font-size:15px">Realized P&L at Assignment</td>
    <td style="padding:12px 14px;color:${pnlColor};font-weight:bold;font-size:15px">${pnlSign}$${realizedPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Effective Cost Basis ($/share)</td>
    <td style="padding:10px 14px">$${effectiveCostPerShare.toFixed(2)}</td>
  </tr>
  ${trade.notes ? `<tr style="background:#f5f5f5"><td style="padding:10px 14px;color:#555">Notes</td><td style="padding:10px 14px">${trade.notes}</td></tr>` : ""}
</table>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#888;margin-top:16px">
  P&L formula: premium + (market − strike) × shares − fees.<br/>
  Stock position created with ${shares.toLocaleString()} shares at effective cost $${effectiveCostPerShare.toFixed(2)} (strike − premium/share).
</p>
`;

  for (const email of emails) {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: `📋 Assignment: ${trade.ticker} CSP — ${shares.toLocaleString()} shares @ $${strike.toFixed(2)} (P&L ${pnlSign}$${realizedPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })})`,
      body: emailBody,
    });
  }

  return Response.json({ success: true, realizedPnl, marketPrice, stockPosition, emailsSent: emails.length });
});