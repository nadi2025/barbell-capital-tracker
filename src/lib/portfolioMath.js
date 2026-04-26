/**
 * portfolioMath — pure derivation functions for the capital tracker.
 *
 * Goals:
 *   - Single home for every formula that turns "stored entity rows + a price
 *     map" into the values rendered on screen.
 *   - Pure: no DB calls, no React, no `base44Client` imports, no side effects.
 *     Every function takes inputs and returns a *new* object.
 *   - Replaces five overlapping callers (PriceHub cascade, calcDashboard,
 *     calculateAavePosition Deno function, OpenPositionsTab helpers, and ad-hoc
 *     formulas scattered across pages) with one canonical source.
 *
 * Naming convention for the per-position helpers — they all return an object
 * containing only the *derived* values, never mutate the input. Callers then
 * spread:  { ...pos, ...computeLeveragedDerived(pos, priceMap) }.
 */

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

/**
 * Stablecoins always priced at $1. Used inside resolvePrice so that USDC/USDT
 * holdings don't show as "$0 — missing price" the moment the Prices entity
 * doesn't carry an explicit row for them.
 */
export const STABLECOINS = new Set([
  "USDC", "USDT", "DAI", "BUSD", "TUSD", "FDUSD", "GUSD", "USDP",
]);

/**
 * Wrapped tokens, aTokens (Aave receipt tokens), and liquid-staking tokens
 * cascade off the price of their underlying asset. The mapping is the union of
 * what the prior PriceHub.jsx + reconciler used. Keys and values are
 * uppercased — callers must uppercase the symbol before lookup.
 */
export const TOKEN_ALIAS_TO_BASE = {
  // BTC-flavored
  BTC: "BTC", WBTC: "BTC", AWBTC: "BTC", CBBTC: "BTC",
  // ETH-flavored (incl. liquid-staking)
  ETH: "ETH", WETH: "ETH", AETH: "ETH", AWETH: "ETH", STETH: "ETH", WSTETH: "ETH",
  // AAVE
  AAVE: "AAVE", AAAVE: "AAVE",
  // Equities (no aliasing — direct symbol)
  MSTR: "MSTR", MARA: "MARA", BMNR: "BMNR", SBET: "SBET", STRC: "STRC",
  // Other
  UNI: "UNI", AUNI: "UNI",
};

// Standard option contract multiplier (1 contract = 100 underlying shares).
const OPT_MULT = 100;

// ──────────────────────────────────────────────────────────────────────────
// Price resolution
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve a token / ticker symbol to a USD price.
 *
 * Precedence (top to bottom):
 *   1. Stablecoin ($1)
 *   2. Manual override entered by the user (key = uppercased symbol)
 *   3. Alias map → base symbol → priceMap[base]   (e.g. AWBTC → BTC)
 *   4. Direct lookup in priceMap by the symbol itself
 *
 * Returns { price, source }. `price` is null when nothing matched.
 *
 * The `source` is purely informational so a UI can show e.g. "from BTC base"
 * vs "manual override". UI never depends on it for math — that's `price`.
 */
export function resolvePrice(symbol, priceMap = {}, manualOverrides = {}) {
  if (!symbol) return { price: null, source: null };
  const upper = String(symbol).toUpperCase();

  if (STABLECOINS.has(upper)) {
    return { price: 1, source: "stablecoin" };
  }

  const overrideRaw = manualOverrides[upper];
  if (overrideRaw != null && overrideRaw !== "") {
    const n = parseFloat(overrideRaw);
    if (!isNaN(n) && n > 0) return { price: n, source: "manual" };
  }

  const base = TOKEN_ALIAS_TO_BASE[upper];
  if (base) {
    const basePrice = priceMap[base];
    if (basePrice > 0) return { price: basePrice, source: `alias:${base}` };
  }

  const direct = priceMap[upper];
  if (direct > 0) return { price: direct, source: "direct" };

  return { price: null, source: null };
}

// ──────────────────────────────────────────────────────────────────────────
// Stock positions (IB equities)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Derive the live-value fields for a single StockPosition row.
 *
 * Ticker → price uses a *direct* priceMap lookup (no alias map): equity
 * tickers like MSTR/MARA/BMNR don't have wrapped variants. If the priceMap
 * doesn't carry the ticker, we fall back to the entity's stored
 * `current_price` and surface `priceMissing: true` so the UI can hint at
 * staleness.
 *
 * Canonical formulas (matches StockPositionForm.jsx create-time logic so
 * historical rows continue to make sense):
 *   invested_value = average_cost × shares
 *   gain_loss      = current_value − invested_value
 *   gain_loss_pct  = invested_value > 0 ? gain_loss / invested_value : 0
 *
 * NOTE: gain_loss_pct is stored / returned as a *fraction* (0.05 means 5%),
 * not a percentage. UIs that want "5%" should multiply by 100.
 */
export function computeStockDerived(stock, priceMap = {}) {
  const ticker = String(stock?.ticker || "").toUpperCase();
  const livePrice = ticker ? priceMap[ticker] : null;
  const fallback = stock?.current_price ?? null;

  const current_price = livePrice > 0 ? livePrice : fallback;
  const priceMissing = !(livePrice > 0);

  const shares = Number(stock?.shares || 0);
  const average_cost = Number(stock?.average_cost || 0);

  const invested_value = average_cost * shares;
  const current_value = current_price != null ? current_price * shares : 0;
  const gain_loss = current_value - invested_value;
  const gain_loss_pct = invested_value > 0 ? gain_loss / invested_value : 0;

  return {
    current_price,
    current_value,
    invested_value,
    gain_loss,
    gain_loss_pct,
    priceMissing,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Leveraged positions (HyperLiquid)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Derive live mark-based fields for an open LeveragedPosition.
 *
 *   mark_price            = priceMap[asset] ?? pos.mark_price
 *   position_value_usd    = size × mark_price                        (notional)
 *   pnl_usd  Long  = (mark − entry) × size
 *            Short = (entry − mark) × size
 *   roe_pct           = (pnl_usd / margin_usd) × 100   (percent units)
 *   distance_to_liq_pct = |mark − liq| / mark × 100    (percent units, null if missing)
 *
 * Funding accruals are ignored (per spec) — user updates margin_usd manually
 * when material.
 */
export function computeLeveragedDerived(pos, priceMap = {}) {
  const asset = String(pos?.asset || "").toUpperCase();
  const livePrice = asset ? priceMap[asset] : null;
  const fallback = pos?.mark_price ?? null;

  const mark_price = livePrice > 0 ? livePrice : fallback;
  const priceMissing = !(livePrice > 0);

  const size = Number(pos?.size || 0);
  const entry = Number(pos?.entry_price || 0);
  const margin = Number(pos?.margin_usd || 0);
  const liq = pos?.liquidation_price ?? null;

  const safeMark = mark_price ?? 0;
  const position_value_usd = size * safeMark;

  let pnl_usd = 0;
  if (mark_price != null && entry > 0 && size !== 0) {
    pnl_usd = pos.direction === "Long"
      ? (mark_price - entry) * size
      : (entry - mark_price) * size;
  }

  const roe_pct = margin > 0 ? (pnl_usd / margin) * 100 : 0;
  const distance_to_liq_pct = (mark_price > 0 && liq != null)
    ? Math.abs((mark_price - liq) / mark_price) * 100
    : null;

  return {
    mark_price,
    position_value_usd,
    pnl_usd,
    roe_pct,
    distance_to_liq_pct,
    priceMissing,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Crypto wallet assets (CryptoAsset entity)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Derive live USD values for a CryptoAsset row. Resolves price via the alias
 * map so aTokens (aWBTC/aETH/aUNI…) and wrapped tokens get the underlying
 * price automatically. Falls back to the stored `current_price_usd` and flags
 * `priceSource = "stale"` when nothing else matched.
 */
export function computeCryptoAssetDerived(asset, priceMap = {}, manualOverrides = {}) {
  const token = asset?.token;
  const { price, source } = resolvePrice(token, priceMap, manualOverrides);

  let current_price_usd = price;
  let priceSource = source;

  if (current_price_usd == null) {
    const stored = asset?.current_price_usd ?? null;
    if (stored != null) {
      current_price_usd = stored;
      priceSource = "stale";
    }
  }

  const amount = Number(asset?.amount || 0);
  const current_value_usd = current_price_usd != null ? current_price_usd * amount : 0;

  return {
    current_price_usd,
    current_value_usd,
    priceSource,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Aave collateral row
// ──────────────────────────────────────────────────────────────────────────

/**
 * Single AaveCollateral row → derived USD values.
 *
 * The collateral row stores the underlying-asset symbol in `asset_name` (or
 * `price_key`). We use that to look up the price — this is the SAME price the
 * dashboard uses, no separate Asset/AaveAccount entity in the loop.
 *
 * weighted_threshold_value = value_usd × liquidation_threshold
 * (used by the aggregate to compute Health Factor).
 */
export function computeAaveCollateralDerived(coll, priceMap = {}) {
  const key = String(coll?.price_key || coll?.asset_name || "").toUpperCase();
  const price = key ? (priceMap[key] || 0) : 0;
  const units = Number(coll?.units || 0);
  const liquidation_threshold = Number(coll?.liquidation_threshold || 0);
  const value_usd = units * price;
  const weighted_threshold_value = value_usd * liquidation_threshold;

  return {
    value_usd,
    weighted_threshold_value,
    price,
    priceMissing: !(price > 0),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Aave aggregate — replaces calculateAavePosition Deno function
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pure-client replacement for the calculateAavePosition server function.
 *
 * Inputs:
 *   collaterals — full AaveCollateral list (will be deduped by asset_name,
 *                 keeping the latest by updated_date / created_date).
 *   borrows     — full AaveBorrow list (the first row is treated as canonical;
 *                 matches the original server behavior).
 *   priceMap    — uppercased symbol → USD price.
 *
 * Returns the same shape calculateAavePosition returned, plus the
 * `totalWeightedThreshold` field (additive — consumers that ignored unknown
 * fields are unaffected).
 */
export function computeAaveAggregate(collaterals = [], borrows = [], priceMap = {}) {
  // Dedupe collaterals — keep latest by updated_date (or created_date) per asset
  const uniq = {};
  for (const c of collaterals) {
    const key = c?.asset_name;
    if (!key) continue;
    const cur = uniq[key];
    if (!cur) { uniq[key] = c; continue; }
    const aDate = new Date(c.updated_date || c.created_date || 0).getTime();
    const bDate = new Date(cur.updated_date || cur.created_date || 0).getTime();
    if (aDate > bDate) uniq[key] = c;
  }

  const collateralDetails = Object.values(uniq).map((c) => {
    const derived = computeAaveCollateralDerived(c, priceMap);
    return {
      asset_name: c.asset_name,
      units: c.units,
      price: derived.price,
      value_usd: derived.value_usd,
      supply_apy: c.supply_apy || 0,
      liquidation_threshold: c.liquidation_threshold || 0,
      weighted_threshold_value: derived.weighted_threshold_value,
      is_collateral_enabled: c.is_collateral_enabled,
    };
  });

  const totalCollateral = collateralDetails.reduce((s, c) => s + c.value_usd, 0);
  const totalWeightedThreshold = collateralDetails.reduce((s, c) => s + c.weighted_threshold_value, 0);

  // Borrow — match server: first row treated as the canonical USDC borrow
  const borrow = (borrows && borrows.length > 0)
    ? borrows[0]
    : { asset_name: "USDC", borrowed_amount: 0, borrow_apy: 0, e_mode: "Disabled" };
  const borrowedAmount = Number(borrow.borrowed_amount || 0);
  const borrowApy = Number(borrow.borrow_apy || 0);

  const healthFactor = totalWeightedThreshold > 0
    ? totalWeightedThreshold / Math.max(borrowedAmount, 1)
    : 999;
  const borrowPowerUsed = totalWeightedThreshold > 0
    ? (borrowedAmount / totalWeightedThreshold) * 100
    : 0;
  const availableToBorrow = Math.max(0, totalWeightedThreshold - borrowedAmount);
  const maxBorrowCapacity = totalWeightedThreshold;
  const netWorth = totalCollateral - borrowedAmount;

  const weightedSupplyApy = totalCollateral > 0
    ? collateralDetails.reduce((s, c) => s + (c.value_usd * c.supply_apy), 0) / totalCollateral
    : 0;
  const netApy = totalCollateral > 0
    ? weightedSupplyApy - (borrowApy * borrowedAmount / totalCollateral)
    : 0;

  // lastUpdated = max(updated_date | created_date) across both lists
  let lastUpdatedMs = 0;
  for (const item of [...collaterals, ...borrows]) {
    const d = new Date(item.updated_date || item.created_date || 0).getTime();
    if (d > lastUpdatedMs) lastUpdatedMs = d;
  }
  const lastUpdated = new Date(lastUpdatedMs || 0).toISOString();

  return {
    collateralDetails,
    totalCollateral,
    borrowedAmount,
    borrowApy,
    totalWeightedThreshold,
    healthFactor,
    borrowPowerUsed,
    availableToBorrow,
    maxBorrowCapacity,
    netWorth,
    supplyApy: weightedSupplyApy,
    netApy,
    eMode: borrow.e_mode || "Disabled",
    lastUpdated,
  };
}
