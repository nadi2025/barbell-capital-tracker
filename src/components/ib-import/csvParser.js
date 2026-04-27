/**
 * Parse IB Flex-Query Transaction History CSV.
 *
 * The IB CSV is multi-section (Summary, Transaction History, etc). We only
 * care about Transaction History rows for now. The option symbol is OCC-
 * encoded: "BMNR  270115P00045000" = BMNR, 2027-01-15, Put, strike $45.000.
 */
import { isCredit } from "@/lib/optionsHelpers";

// Robust CSV line splitter that respects double-quoted fields
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseIbSymbol(symbol) {
  // "SBET  260515C00007500" -> { ticker: SBET, exp: 2026-05-15, category: Call, strike: 7.5 }
  if (!symbol) return null;
  const s = symbol.trim();
  const m = s.match(/^(\S+)\s+(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  const [, ticker, yy, mm, dd, pc, strikeRaw] = m;
  return {
    ticker,
    expiration_date: `20${yy}-${mm}-${dd}`,
    category: pc === "P" ? "Put" : "Call",
    strike: parseInt(strikeRaw, 10) / 1000,
  };
}

/**
 * Parse the full IB flex-query CSV text. Returns:
 *   {
 *     period: { start, end },
 *     summary: { startingCash, endingCash, change },
 *     transactions: [{ date, ticker, category, strike, expiration_date,
 *                      transactionType, quantity, price, gross, commission, net,
 *                      description, symbol, raw }]
 *   }
 *
 * Only option transactions (those whose symbol parses via parseIbSymbol) are
 * included in `transactions` — other rows (stock fills, dividends, etc) are
 * collected into `otherRows` for the UI to preview/ignore.
 */
export function parseIbCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const period = { start: null, end: null };
  const summary = { startingCash: null, endingCash: null, change: null, baseCurrency: "USD" };
  const transactions = [];
  const otherRows = [];
  let txHeader = null;

  for (const line of lines) {
    const row = splitCsvLine(line);
    const section = row[0];
    const kind = row[1];

    if (section === "Statement" && kind === "Data") {
      if (row[2] === "Period") {
        // "April 16, 2026 - April 22, 2026"
        const val = row[3] || "";
        const parts = val.split(" - ");
        period.start = parts[0]?.trim() || null;
        period.end = parts[1]?.trim() || null;
      }
    }
    if (section === "Summary" && kind === "Data") {
      if (row[2] === "Base Currency") summary.baseCurrency = row[3];
      if (row[2] === "Starting Cash") summary.startingCash = parseFloat(row[3]);
      if (row[2] === "Ending Cash") summary.endingCash = parseFloat(row[3]);
      if (row[2] === "Change") summary.change = parseFloat(row[3]);
    }
    if (section === "Transaction History" && kind === "Header") {
      // column header row — remember field names for later
      txHeader = row.slice(2);
      continue;
    }
    if (section === "Transaction History" && kind === "Data" && txHeader) {
      const cols = row.slice(2);
      const recordByName = {};
      txHeader.forEach((h, i) => { recordByName[h.trim()] = (cols[i] || "").trim(); });

      const parsedSym = parseIbSymbol(recordByName["Symbol"]);
      const base = {
        date: recordByName["Date"],
        account: recordByName["Account"],
        description: recordByName["Description"],
        transactionType: recordByName["Transaction Type"],
        symbol: recordByName["Symbol"],
        quantity: parseFloat(recordByName["Quantity"]),
        price: parseFloat(recordByName["Price"]),
        priceCurrency: recordByName["Price Currency"],
        gross: parseFloat(recordByName["Gross Amount"] || recordByName["Gross Amount "]),
        commission: parseFloat(recordByName["Commission"]),
        net: parseFloat(recordByName["Net Amount"]),
        raw: line,
      };

      if (parsedSym) {
        transactions.push({ ...base, ...parsedSym });
      } else {
        otherRows.push(base);
      }
    }
  }

  return { period, summary, transactions, otherRows };
}

/**
 * Decide action for each option transaction given the current OpenOptionsTrade list.
 *
 * Rules:
 *  - BUY an option: look for matching OPEN `Sell` OptionsTrade (same ticker/cat/strike/exp).
 *    If found → action "close_short" (Buy To Close). If not found → "open_long" (Buy To Open).
 *  - SELL an option: look for matching OPEN `Buy` OptionsTrade. If found → "close_long".
 *    If not found → "open_short" (Sell To Open).
 *
 * Returns array of decided actions, each one has:
 *   { tx, action, matched (existing trade for close actions), newTrade (proposed entity),
 *     updates (patch for close actions) }
 */
export function decideActions(transactions, openTrades) {
  const decided = [];
  // Clone to allow depletion on match (so two CSV rows matching the same DB trade behave)
  const remaining = [...openTrades];

  for (const tx of transactions) {
    const isBuy = (tx.transactionType || "").toLowerCase() === "buy";
    const isSell = (tx.transactionType || "").toLowerCase() === "sell";
    if (!isBuy && !isSell) {
      decided.push({ tx, action: "skip", reason: `unknown type: ${tx.transactionType}` });
      continue;
    }

    const counterpartType = isBuy ? "Sell" : "Buy"; // to find the position we're closing
    const idx = remaining.findIndex(
      (t) =>
        t.status === "Open" &&
        t.type === counterpartType &&
        t.ticker === tx.ticker &&
        t.category === tx.category &&
        Number(t.strike) === Number(tx.strike) &&
        t.expiration_date === tx.expiration_date
    );

    if (idx !== -1) {
      const matched = remaining[idx];
      remaining.splice(idx, 1);
      // Close-out: pnl = (fill - close) * qty * 100 for shorts; opposite for longs
      const qty = Math.abs(matched.quantity || tx.quantity || 0);
      const fill = matched.fill_price || 0;
      const close = tx.price || 0;
      const feeTotal = (matched.fee || 0) + Math.abs(tx.commission || 0);
      // Credit positions: P&L = (fill - close) * qty * 100; debit: opposite.
      const pnl = isCredit(matched)
        ? (fill - close) * qty * 100 - feeTotal
        : (close - fill) * qty * 100 - feeTotal;
      decided.push({
        tx,
        action: isBuy ? "close_short" : "close_long",
        matched,
        updates: {
          status: "Closed",
          close_date: tx.date,
          close_price: close,
          fee: feeTotal,
          pnl,
        },
      });
    } else {
      // No match — open a new trade
      const newTrade = {
        type: isBuy ? "Buy" : "Sell",
        category: tx.category,
        open_date: tx.date,
        expiration_date: tx.expiration_date,
        ticker: tx.ticker,
        strike: tx.strike,
        quantity: Math.abs(tx.quantity || 0),
        fill_price: Math.abs(tx.price || 0),
        fee: Math.abs(tx.commission || 0),
        status: "Open",
        notes: `IB import · ${tx.description || tx.symbol}`,
      };
      decided.push({
        tx,
        action: isBuy ? "open_long" : "open_short",
        newTrade,
      });
    }
  }

  return decided;
}
