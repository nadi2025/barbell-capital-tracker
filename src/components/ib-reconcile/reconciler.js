/**
 * Full IB history reconciler.
 *
 * Walks a Flex-Query Transaction History CSV chronologically and produces a
 * clean picture of the portfolio as of the last date in the file:
 *   - All options (Open / Closed / Assigned / Expired OTM) with pnl
 *   - All stock positions (net shares, weighted avg cost, realized pnl from sales)
 *   - Cash flow summary (deposits, dividends, taxes, running cash)
 *
 * Designed for a one-time "wipe & rebuild" of OptionsTrade + StockPosition so
 * the Base44 DB matches the broker's ground truth.
 */

import { parseIbCsv, parseIbSymbol } from "@/components/ib-import/csvParser";

const OPT_MULT = 100; // contracts → shares multiplier

function classify(row) {
  const txType = (row.transactionType || "").trim();
  if (txType === "Deposit") return { ...row, kind: "Deposit" };
  if (txType === "Dividend") return { ...row, kind: "Dividend" };
  if (txType === "Foreign Tax Withholding") return { ...row, kind: "Tax" };
  if (txType === "Assignment") return { ...row, kind: "Assignment" };

  const opt = parseIbSymbol(row.symbol);
  if (opt) return { ...row, ...opt, kind: "Option" };

  // Stock buy/sell — symbol is a plain ticker
  return { ...row, ticker: (row.symbol || "").trim(), kind: "Stock" };
}

function posKey(t) {
  return `${t.ticker}|${t.category}|${t.strike}|${t.expiration_date}`;
}

function processOption(tx, positions, closed) {
  const key = posKey(tx);
  const txQty = Math.abs(tx.quantity || 0);
  const txPrice = Math.abs(tx.price || 0);
  const txComm = Math.abs(tx.commission || 0);
  const direction = tx.transactionType === "Sell" ? "Short" : "Long";

  let p = positions.get(key);

  if (!p) {
    // New position — first fill
    p = {
      ticker: tx.ticker,
      category: tx.category,
      strike: tx.strike,
      expiration_date: tx.expiration_date,
      direction,
      type: direction === "Short" ? "Sell" : "Buy",
      open_date: tx.date,
      qty: txQty,
      initial_qty: txQty,
      avgFillPrice: txPrice,
      totalCommission: txComm,
      status: "Open",
      closeFills: [],
      close_date: null,
      close_price: null,
      pnl: null,
      collateral: tx.category === "Put" && direction === "Short" ? tx.strike * txQty * OPT_MULT : 0,
    };
    positions.set(key, p);
    return;
  }

  const isAddingSameDir =
    (p.direction === "Short" && tx.transactionType === "Sell") ||
    (p.direction === "Long" && tx.transactionType === "Buy");

  if (isAddingSameDir) {
    // Add to existing position — weighted-avg the fill price, sum the qty
    const newQty = p.qty + txQty;
    p.avgFillPrice = (p.avgFillPrice * p.qty + txPrice * txQty) / newQty;
    p.qty = newQty;
    p.initial_qty += txQty;
    p.totalCommission += txComm;
    if (p.category === "Put" && direction === "Short") {
      p.collateral = p.strike * p.qty * OPT_MULT;
    }
    return;
  }

  // Reducing position → this CSV row closes some/all contracts
  const reduceQty = Math.min(p.qty, txQty);
  p.closeFills.push({ date: tx.date, qty: reduceQty, price: txPrice, commission: txComm });
  p.totalCommission += txComm;
  p.qty -= reduceQty;

  if (p.qty <= 0) {
    // Fully closed
    const totalCloseQty = p.closeFills.reduce((s, f) => s + f.qty, 0);
    const avgClose = totalCloseQty > 0
      ? p.closeFills.reduce((s, f) => s + f.price * f.qty, 0) / totalCloseQty
      : 0;
    p.status = "Closed";
    p.close_date = tx.date;
    p.close_price = avgClose;
    if (p.direction === "Short") {
      p.pnl = (p.avgFillPrice - avgClose) * p.initial_qty * OPT_MULT - p.totalCommission;
    } else {
      p.pnl = (avgClose - p.avgFillPrice) * p.initial_qty * OPT_MULT - p.totalCommission;
    }
    closed.push(p);
    positions.delete(key);
  }
}

function processStock(tx, stocks) {
  const ticker = (tx.ticker || tx.symbol || "").trim();
  if (!ticker) return;
  const qty = tx.quantity || 0;
  const price = Math.abs(tx.price || 0);

  let p = stocks.get(ticker);
  if (!p) {
    p = {
      ticker,
      shares: 0,
      totalCost: 0,
      avgCost: 0,
      realizedPnl: 0,
      status: "Holding",
      entry_date: tx.date,
      source: "Direct Buy",
      events: [],
      linked_assignment: false,
    };
    stocks.set(ticker, p);
  }

  if (qty > 0) {
    // Buy
    p.shares += qty;
    p.totalCost += price * qty;
    p.avgCost = p.shares > 0 ? p.totalCost / p.shares : 0;
    p.events.push({ date: tx.date, kind: "Buy", qty, price });
  } else {
    // Sell
    const absQty = Math.abs(qty);
    const costOfSold = p.avgCost * absQty;
    const proceeds = price * absQty;
    p.realizedPnl += proceeds - costOfSold;
    p.shares -= absQty;
    p.totalCost = Math.max(0, p.totalCost - costOfSold);
    p.events.push({ date: tx.date, kind: "Sell", qty: -absQty, price });
    if (p.shares < 0.0001) p.status = "Closed";
  }
}

function processAssignment(tx, optionPositions, stocks, closedOpts) {
  const ticker = (tx.symbol || tx.ticker || "").trim();
  const shares = tx.quantity || 0;
  const strike = Math.abs(tx.price || 0);

  // Find matching short put — same ticker, same strike, Put, Short, Open.
  // Prefer the one whose expiration_date matches the assignment date (or is just before).
  let matchedKey = null;
  let matchedOpt = null;
  const candidates = [];
  for (const [key, p] of optionPositions) {
    if (p.ticker === ticker && p.category === "Put" && p.strike === strike &&
        p.direction === "Short" && p.status === "Open") {
      candidates.push([key, p]);
    }
  }
  // Pick candidate closest in expiration (closest to assignment date, prefer earlier)
  candidates.sort((a, b) => new Date(a[1].expiration_date) - new Date(b[1].expiration_date));
  if (candidates.length > 0) {
    [matchedKey, matchedOpt] = candidates[0];
    matchedOpt.status = "Assigned";
    matchedOpt.close_date = tx.date;
    matchedOpt.close_price = 0;
    // PnL for an assigned short put = premium collected (commission already deducted)
    matchedOpt.pnl = matchedOpt.avgFillPrice * matchedOpt.initial_qty * OPT_MULT - matchedOpt.totalCommission;
    closedOpts.push(matchedOpt);
    optionPositions.delete(matchedKey);
  }

  // Create/add to stock position at cost basis = strike
  let p = stocks.get(ticker);
  if (!p) {
    p = {
      ticker,
      shares: 0,
      totalCost: 0,
      avgCost: 0,
      realizedPnl: 0,
      status: "Holding",
      entry_date: tx.date,
      source: "Assignment",
      events: [],
      linked_assignment: true,
    };
    stocks.set(ticker, p);
  } else {
    // If this is the first Assignment contributing to an existing position, flag it
    if (!p.linked_assignment) p.linked_assignment = true;
  }
  p.shares += shares;
  p.totalCost += strike * shares;
  p.avgCost = p.shares > 0 ? p.totalCost / p.shares : 0;
  p.events.push({ date: tx.date, kind: "Assignment", qty: shares, price: strike });
  // Update source if assignment contributed
  if (p.source !== "Assignment" && p.linked_assignment) p.source = "Assignment";
}

/**
 * Run the full reconciliation pass over a CSV text. Returns a structured
 * snapshot of the portfolio plus a cash-flow breakdown.
 *
 * @param {string} csvText
 * @param {Date} [today=new Date()] — used to decide which open options have
 *   expired OTM (no explicit close/assignment transaction).
 */
export function reconcileCsv(csvText, today = new Date()) {
  const parsed = parseIbCsv(csvText);
  const all = [...parsed.transactions, ...parsed.otherRows]
    .map(classify)
    .filter((t) => !!t.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const optionPositions = new Map();
  const stockPositions = new Map();
  const closedOptions = [];
  const cashFlows = [];

  const startingCash = parsed.summary.startingCash || 0;
  let cash = startingCash;
  let totalDeposits = 0;
  let totalDividends = 0;
  let totalTaxes = 0;
  let totalOptionsPremiumNet = 0;

  for (const tx of all) {
    const net = Number(tx.net) || 0;
    switch (tx.kind) {
      case "Deposit":
        cash += net;
        totalDeposits += net;
        cashFlows.push({ date: tx.date, type: "Deposit", amount: net });
        break;
      case "Dividend":
        cash += net;
        totalDividends += net;
        cashFlows.push({ date: tx.date, type: "Dividend", amount: net, ticker: tx.ticker });
        break;
      case "Tax":
        cash += net;
        totalTaxes += net;
        cashFlows.push({ date: tx.date, type: "Tax", amount: net, ticker: tx.ticker });
        break;
      case "Option":
        processOption(tx, optionPositions, closedOptions);
        cash += net;
        totalOptionsPremiumNet += net;
        break;
      case "Stock":
        processStock(tx, stockPositions);
        cash += net;
        break;
      case "Assignment":
        processAssignment(tx, optionPositions, stockPositions, closedOptions);
        cash += net;
        break;
      default:
        break;
    }
  }

  // Post-process: options still "Open" past expiration → mark Expired.
  // OptionsTrade.status enum accepts only Open / Closed / Assigned / Expired,
  // so we tag the OTM distinction in notes (plus the `expiredOtm` flag we
  // surface to the UI).
  const openOptions = [];
  const expiredOtm = [];
  for (const [key, p] of optionPositions) {
    const exp = new Date(p.expiration_date);
    if (exp < today) {
      p.status = "Expired";
      p.close_date = p.expiration_date;
      p.close_price = 0;
      p.expiredOtm = true;
      p.pnl = p.direction === "Short"
        ? (p.avgFillPrice * p.initial_qty * OPT_MULT - p.totalCommission)
        : -(p.avgFillPrice * p.initial_qty * OPT_MULT) - p.totalCommission;
      expiredOtm.push(p);
      optionPositions.delete(key);
    } else {
      openOptions.push(p);
    }
  }

  // Finalize stock derived values (current_value defaults to cost basis — user
  // updates via Price Hub for a live value)
  const stockList = Array.from(stockPositions.values()).map((p) => {
    const current_price = p.avgCost; // no live source yet
    const current_value = p.shares * current_price;
    const invested_value = p.totalCost;
    const gain_loss = current_value - invested_value;
    const gain_loss_pct = invested_value > 0 ? gain_loss / invested_value : 0;
    return {
      ...p,
      current_price,
      current_value,
      invested_value,
      gain_loss,
      gain_loss_pct,
    };
  });

  const allClosedOptions = [...closedOptions];
  const realizedOptionsPnl = allClosedOptions.reduce((s, o) => s + (o.pnl || 0), 0);

  return {
    openOptions,
    closedOptions: allClosedOptions,
    expiredOtm, // subset of closedOptions that we auto-classified
    stocks: stockList,
    cashFlows,
    summary: {
      startingCash,
      endingCash: cash,
      csvEndingCash: parsed.summary.endingCash,
      totalDeposits,
      totalDividends,
      totalTaxes,
      totalOptionsPremiumNet,
      realizedOptionsPnl,
      periodStart: parsed.period.start,
      periodEnd: parsed.period.end,
      txCount: all.length,
    },
  };
}

/**
 * Map a reconciler open-option record to the OptionsTrade entity shape that
 * Base44 expects.
 */
export function openOptionToEntity(p) {
  return {
    type: p.type,
    category: p.category,
    open_date: p.open_date,
    expiration_date: p.expiration_date,
    ticker: p.ticker,
    strike: p.strike,
    quantity: p.initial_qty,
    fill_price: Number(p.avgFillPrice.toFixed(4)),
    fee: Number(p.totalCommission.toFixed(2)),
    status: "Open",
    collateral: p.collateral || 0,
    notes: "IB reconcile",
  };
}

export function closedOptionToEntity(p) {
  const noteBits = ["IB reconcile"];
  if (p.expiredOtm) noteBits.push("OTM (auto-classified)");
  return {
    type: p.type,
    category: p.category,
    open_date: p.open_date,
    expiration_date: p.expiration_date,
    close_date: p.close_date,
    ticker: p.ticker,
    strike: p.strike,
    quantity: p.initial_qty,
    fill_price: Number(p.avgFillPrice.toFixed(4)),
    close_price: p.close_price != null ? Number(p.close_price.toFixed(4)) : null,
    fee: Number(p.totalCommission.toFixed(2)),
    pnl: p.pnl != null ? Number(p.pnl.toFixed(2)) : null,
    status: p.status,
    collateral: p.collateral || 0,
    notes: noteBits.join(" · "),
  };
}

export function stockToEntity(p) {
  return {
    ticker: p.ticker,
    source: p.source,
    entry_date: p.entry_date,
    shares: Number(p.shares.toFixed(4)),
    average_cost: Number(p.avgCost.toFixed(4)),
    current_price: Number(p.current_price.toFixed(4)),
    invested_value: Number(p.invested_value.toFixed(2)),
    current_value: Number(p.current_value.toFixed(2)),
    gain_loss: Number(p.gain_loss.toFixed(2)),
    gain_loss_pct: Number(p.gain_loss_pct.toFixed(4)),
    status: p.status,
    notes: `IB reconcile · realized P&L $${p.realizedPnl.toFixed(2)}`,
  };
}
