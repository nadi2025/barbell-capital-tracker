// Options trade helpers — single source of truth for category, direction,
// collateral, and P&L logic. Backwards-compatible with legacy trades that
// still use the old { type: "Sell"/"Buy", category: "Put"/"Call"/"PCS"/"CCS" }
// schema; new trades use { category: <one of CATEGORIES>, net_direction }.

export const CATEGORIES = [
  "call_debit_spread",
  "call_credit_spread",
  "put_debit_spread",
  "put_credit_spread",
  "naked_call",
  "naked_put",
  "covered_call",
  "cash_secured_put",
  "long_call",
  "long_put",
];

// Labels include both the formal name (e.g. "Call Debit Spread") and the
// trader-vernacular alias (e.g. "Bull Call") so people who think in either
// vocabulary can find the right strategy in the dropdown.
export const CATEGORY_LABELS = {
  call_debit_spread: "Call Debit Spread (Bull Call)",
  call_credit_spread: "Call Credit Spread (Bear Call)",
  put_debit_spread: "Put Debit Spread (Bear Put)",
  put_credit_spread: "Put Credit Spread (Bull Put)",
  naked_call: "Naked Call",
  naked_put: "Naked Put",
  covered_call: "Covered Call",
  cash_secured_put: "Cash-Secured Put",
  long_call: "Long Call",
  long_put: "Long Put",
};

const DEBIT_CATEGORIES = new Set([
  "call_debit_spread", "put_debit_spread", "long_call", "long_put",
]);
const CREDIT_CATEGORIES = new Set([
  "call_credit_spread", "put_credit_spread",
  "naked_call", "naked_put", "covered_call", "cash_secured_put",
]);

const SINGLE_LEG_LONG = new Set(["long_call", "long_put"]);
const SINGLE_LEG_SHORT = new Set([
  "naked_call", "naked_put", "covered_call", "cash_secured_put",
]);
const SPREAD_CATEGORIES = new Set([
  "call_debit_spread", "call_credit_spread",
  "put_debit_spread", "put_credit_spread",
]);

// Map legacy { type, category } → canonical new category. Returns null if the
// legacy combo doesn't unambiguously map.
function legacyToCanonical(trade) {
  const cat = trade?.category;
  const typ = trade?.type;
  if (cat === "PCS") return "put_credit_spread";
  if (cat === "CCS") return "call_credit_spread";
  if (cat === "Put" && typ === "Sell") return "cash_secured_put";
  if (cat === "Put" && typ === "Buy") return "long_put";
  if (cat === "Call" && typ === "Sell") return "covered_call";
  if (cat === "Call" && typ === "Buy") return "long_call";
  return null;
}

// Returns the canonical (new-schema) category for a trade. If trade.category
// is already one of CATEGORIES, returns it. Otherwise maps legacy.
export function getCanonicalCategory(trade) {
  if (!trade) return null;
  if (CATEGORIES.includes(trade.category)) return trade.category;
  return legacyToCanonical(trade);
}

// "debit" (you paid) | "credit" (you received) | null
export function getDirection(trade) {
  if (!trade) return null;
  if (trade.net_direction === "debit" || trade.net_direction === "credit") {
    return trade.net_direction;
  }
  const cat = getCanonicalCategory(trade);
  if (DEBIT_CATEGORIES.has(cat)) return "debit";
  if (CREDIT_CATEGORIES.has(cat)) return "credit";
  return null;
}

export function isCredit(trade) { return getDirection(trade) === "credit"; }
export function isDebit(trade) { return getDirection(trade) === "debit"; }

// Strike accessors — prefer new field name, fall back to legacy.
export function getLongStrike(trade) {
  if (trade?.long_strike != null) return trade.long_strike;
  // Legacy: long_call / long_put used `strike`
  if (trade?.strike != null) return trade.strike;
  return null;
}
export function getShortStrike(trade) {
  if (trade?.short_strike != null) return trade.short_strike;
  // Legacy: covered_call / CSP / naked used `strike`; spreads used strike_2
  const cat = getCanonicalCategory(trade);
  if (SINGLE_LEG_SHORT.has(cat) && trade?.strike != null) return trade.strike;
  if (trade?.strike_2 != null) return trade.strike_2;
  return null;
}

export function isSpread(trade) { return SPREAD_CATEGORIES.has(getCanonicalCategory(trade)); }
export function hasLongLeg(trade) {
  const cat = getCanonicalCategory(trade);
  return SPREAD_CATEGORIES.has(cat) || SINGLE_LEG_LONG.has(cat);
}
export function hasShortLeg(trade) {
  const cat = getCanonicalCategory(trade);
  return SPREAD_CATEGORIES.has(cat) || SINGLE_LEG_SHORT.has(cat);
}

// Validate strike order for spreads. Returns null if valid, error string if not.
export function validateStrikes(category, longStrike, shortStrike) {
  if (!SPREAD_CATEGORIES.has(category)) return null;
  const L = Number(longStrike) || 0;
  const S = Number(shortStrike) || 0;
  if (!L || !S) return null; // empty fields handled by required-validation elsewhere
  // Per spec:
  //   call_debit_spread:  long_strike < short_strike (buy lower, sell higher)
  //   call_credit_spread: long_strike > short_strike (buy higher protection)
  //   put_debit_spread:   long_strike > short_strike
  //   put_credit_spread:  long_strike < short_strike
  switch (category) {
    case "call_debit_spread":
      return L < S ? null : `${CATEGORY_LABELS[category]}: long strike must be < short strike. If you meant a Bear Call, switch to Call Credit Spread.`;
    case "call_credit_spread":
      return L > S ? null : `${CATEGORY_LABELS[category]}: long strike must be > short strike. If you meant a Bull Call, switch to Call Debit Spread.`;
    case "put_debit_spread":
      return L > S ? null : `${CATEGORY_LABELS[category]}: long strike must be > short strike. If you meant a Bull Put, switch to Put Credit Spread.`;
    case "put_credit_spread":
      return L < S ? null : `${CATEGORY_LABELS[category]}: long strike must be < short strike. If you meant a Bear Put, switch to Put Debit Spread.`;
    default:
      return null;
  }
}

// Auto-compute collateral. Returns 0 for debit positions and covered calls.
export function computeCollateral(trade) {
  const qty = Number(trade?.quantity) || 0;
  const long = Number(getLongStrike(trade)) || 0;
  const short = Number(getShortStrike(trade)) || 0;
  const fill = Number(trade?.fill_price) || 0;
  const cat = getCanonicalCategory(trade);

  switch (cat) {
    case "call_debit_spread":
    case "put_debit_spread":
    case "long_call":
    case "long_put":
      return 0;
    case "put_credit_spread": {
      const width = Math.abs(short - long);
      return Math.max(0, (width - fill) * 100 * qty);
    }
    case "call_credit_spread": {
      const width = Math.abs(long - short);
      return Math.max(0, (width - fill) * 100 * qty);
    }
    case "naked_put":
    case "cash_secured_put":
      return short * 100 * qty;
    case "naked_call":
      return short * 100 * qty * 0.2; // approx 20% margin
    case "covered_call":
      return 0; // shares are the collateral
    default:
      return 0;
  }
}

// Realized P&L. Returns null while position is open.
// For debit positions you paid `fill` and receive `close` → P&L = (close - fill) * 100 * qty
// For credit positions you received `fill` and pay `close` → P&L = (fill - close) * 100 * qty
export function computeRealizedPL(trade) {
  if (!trade) return null;
  const closed = trade.status === "Closed" || trade.status === "Expired" || trade.status === "Assigned";
  if (!closed) return null;
  const qty = Number(trade.quantity) || 0;
  const fill = Number(trade.fill_price) || 0;
  const fee = Number(trade.fee) || 0;
  // Expired & no close_price typed → assume worthless (close = 0)
  const closeRaw = trade.close_price;
  const close = (trade.status === "Expired" && (closeRaw == null || closeRaw === ""))
    ? 0
    : (Number(closeRaw) || 0);
  const dir = getDirection(trade);
  if (!dir) return null;
  const sign = dir === "debit" ? 1 : -1;
  return sign * (close - fill) * 100 * qty - fee;
}

// Strategy display (label + tone). Used by StocksPage and similar consumers
// that previously combined type+category.
const STRATEGY_DISPLAY = {
  covered_call: { label: "Covered Call", tone: "profit" },
  cash_secured_put: { label: "Cash-Secured Put", tone: "profit" },
  long_call: { label: "Long Call", tone: "primary" },
  long_put: { label: "Protective Put", tone: "primary" },
  naked_call: { label: "Naked Call", tone: "warn" },
  naked_put: { label: "Naked Put", tone: "warn" },
  call_debit_spread: { label: "Call Debit Spread", tone: "primary" },
  call_credit_spread: { label: "Call Credit Spread", tone: "profit" },
  put_debit_spread: { label: "Put Debit Spread", tone: "primary" },
  put_credit_spread: { label: "Put Credit Spread", tone: "profit" },
};
export function getStrategyDisplay(trade) {
  const cat = getCanonicalCategory(trade);
  return cat ? STRATEGY_DISPLAY[cat] : null;
}

// Convenience predicates used by Stocks / Dashboard consumers.
export function isCoveredCall(trade) { return getCanonicalCategory(trade) === "covered_call"; }
export function isCashSecuredPut(trade) { return getCanonicalCategory(trade) === "cash_secured_put"; }
export function isProtectivePut(trade) { return getCanonicalCategory(trade) === "long_put"; }
export function isLongCall(trade) { return getCanonicalCategory(trade) === "long_call"; }

// Strike display string for a trade. Spreads → "Long $X / Short $Y".
// Single-leg → "$X". Returns "—" if no strike.
export function formatStrike(trade) {
  const cat = getCanonicalCategory(trade);
  const L = getLongStrike(trade);
  const S = getShortStrike(trade);
  if (SPREAD_CATEGORIES.has(cat)) {
    if (L != null && S != null) return `Long $${L} / Short $${S}`;
    if (L != null) return `Long $${L}`;
    if (S != null) return `Short $${S}`;
    return "—";
  }
  if (SINGLE_LEG_LONG.has(cat) && L != null) return `$${L}`;
  if (SINGLE_LEG_SHORT.has(cat) && S != null) return `$${S}`;
  // Legacy fallback
  if (L != null && S != null) return `$${L} / $${S}`;
  if (L != null) return `$${L}`;
  if (S != null) return `$${S}`;
  return "—";
}
