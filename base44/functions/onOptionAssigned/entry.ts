import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const payload = await req.json();

  const { data: trade, event } = payload;

  if (!trade || trade.status !== "Assigned") {
    return Response.json({ skipped: true });
  }

  const shares = (trade.quantity || 0) * 100;
  const strike = trade.strike || 0;
  const fillPrice = trade.fill_price || 0;
  const premiumCollected = fillPrice * (trade.quantity || 0) * 100;
  const investedValue = strike * shares;
  const effectiveCost = investedValue - premiumCollected; // net cost after premium

  // Days the option was open
  const openDate = new Date(trade.open_date);
  const assignDate = trade.close_date ? new Date(trade.close_date) : new Date();
  const daysHeld = Math.round((assignDate - openDate) / (1000 * 60 * 60 * 24));

  // 1. Create or update stock position
  const existingStocks = await base44.asServiceRole.entities.StockPosition.filter({ ticker: trade.ticker });
  const assignmentStocks = existingStocks.filter(s => s.source === "Assignment" && s.linked_option_id === trade.id);

  const stockData = {
    ticker: trade.ticker,
    source: "Assignment",
    entry_date: trade.close_date || new Date().toISOString().split("T")[0],
    shares,
    average_cost: strike,
    invested_value: investedValue,
    status: "Holding",
    linked_option_id: trade.id,
    notes: `Assigned from option opened ${trade.open_date}. Premium collected: $${premiumCollected.toLocaleString()}. Net cost: $${effectiveCost.toLocaleString()}.`,
  };

  let stockPosition;
  if (assignmentStocks.length > 0) {
    stockPosition = await base44.asServiceRole.entities.StockPosition.update(assignmentStocks[0].id, stockData);
  } else {
    stockPosition = await base44.asServiceRole.entities.StockPosition.create(stockData);
  }

  // 2. Send email report
  // Get the user who created the trade (or all admins)
  const users = await base44.asServiceRole.entities.User.filter({ role: "admin" });
  const emails = users.map(u => u.email).filter(Boolean);

  const expiryDate = trade.expiration_date || trade.close_date || "N/A";
  const annualizedRoc = trade.annualized_roc ? `${(trade.annualized_roc * 100).toFixed(1)}%` : "N/A";

  const emailBody = `
<h2 style="color:#1a1a2e;font-family:Arial,sans-serif">📋 Assignment Report — ${trade.ticker}</h2>
<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;font-weight:bold;color:#555">Ticker</td>
    <td style="padding:10px 14px;font-weight:bold">${trade.ticker}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Option Type</td>
    <td style="padding:10px 14px">${trade.category} ${trade.type}</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555">Strike Price</td>
    <td style="padding:10px 14px">$${strike.toFixed(2)}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Quantity</td>
    <td style="padding:10px 14px">${trade.quantity} contracts (${shares.toLocaleString()} shares)</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555">Option Open Date</td>
    <td style="padding:10px 14px">${trade.open_date}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Expiration / Assignment Date</td>
    <td style="padding:10px 14px">${expiryDate}</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555">Days Held (Option)</td>
    <td style="padding:10px 14px">${daysHeld} days</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Fill Price (Premium/share)</td>
    <td style="padding:10px 14px">$${fillPrice.toFixed(2)}</td>
  </tr>
  <tr style="background:#f5f5f5">
    <td style="padding:10px 14px;color:#555;font-weight:bold">Total Premium Collected</td>
    <td style="padding:10px 14px;color:#22c55e;font-weight:bold">+$${premiumCollected.toLocaleString()}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Gross Stock Cost (Strike × Shares)</td>
    <td style="padding:10px 14px;color:#ef4444">-$${investedValue.toLocaleString()}</td>
  </tr>
  <tr style="background:#f0fdf4;border-top:2px solid #22c55e">
    <td style="padding:12px 14px;color:#166534;font-weight:bold;font-size:15px">Net Effective Cost</td>
    <td style="padding:12px 14px;color:#166534;font-weight:bold;font-size:15px">$${effectiveCost.toLocaleString()}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#555">Annualized ROC</td>
    <td style="padding:10px 14px">${annualizedRoc}</td>
  </tr>
  ${trade.notes ? `<tr style="background:#f5f5f5"><td style="padding:10px 14px;color:#555">Notes</td><td style="padding:10px 14px">${trade.notes}</td></tr>` : ""}
</table>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#888;margin-top:16px">
  Stock position has been automatically created in Oasis Tracker with ${shares.toLocaleString()} shares at average cost $${strike.toFixed(2)}.
</p>
`;

  for (const email of emails) {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: `📋 Assignment: ${trade.ticker} — ${shares.toLocaleString()} shares @ $${strike.toFixed(2)}`,
      body: emailBody,
    });
  }

  return Response.json({ success: true, stockPosition, emailsSent: emails.length });
});