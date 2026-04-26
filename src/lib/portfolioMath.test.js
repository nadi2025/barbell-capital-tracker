/**
 * portfolioMath — smoke checks.
 *
 * Not a real test suite — just hand-crafted inputs and console.log so we can
 * eyeball the outputs while iterating. Run with:
 *   node src/lib/portfolioMath.test.js
 *
 * Each block prints a labeled object. Expected values are noted in the
 * comments; mismatches are loud failures via `console.error`.
 */

import {
  STABLECOINS,
  TOKEN_ALIAS_TO_BASE,
  resolvePrice,
  computeStockDerived,
  computeLeveragedDerived,
  computeCryptoAssetDerived,
  computeAaveCollateralDerived,
  computeAaveAggregate,
} from "./portfolioMath.js";

let failures = 0;
const eq = (got, want, label) => {
  const ok = Math.abs((got ?? 0) - (want ?? 0)) < 0.0001 || got === want;
  if (!ok) {
    failures++;
    console.error(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else {
    console.log(`  ✓ ${label}: ${JSON.stringify(got)}`);
  }
};

console.log("\n=== resolvePrice ===");
{
  const map = { BTC: 65000, ETH: 3500, AAVE: 100, MSTR: 180 };
  // 1. Stablecoin
  eq(resolvePrice("USDC", map).price, 1, "USDC → $1");
  eq(resolvePrice("usdt", map).source, "stablecoin", "lowercase usdt → stablecoin");
  // 2. Manual override beats alias/direct
  eq(resolvePrice("BTC", map, { BTC: "70000" }).price, 70000, "manual override wins over priceMap");
  // 3. Alias map: AWBTC → BTC
  const r = resolvePrice("AWBTC", map);
  eq(r.price, 65000, "AWBTC → BTC price");
  eq(r.source, "alias:BTC", "AWBTC source label");
  // 4. Direct lookup
  eq(resolvePrice("MSTR", map).price, 180, "MSTR direct");
  eq(resolvePrice("MSTR", map).source, "alias:MSTR", "MSTR via alias self-map");
  // 5. Unknown
  const unk = resolvePrice("XRP", map);
  eq(unk.price, null, "XRP unknown → null price");
  eq(unk.source, null, "XRP unknown → null source");
}

console.log("\n=== computeStockDerived ===");
{
  // 100 shares MSTR @ avg $150, current $180 → +$3,000 / +20%
  const stock = { ticker: "MSTR", shares: 100, average_cost: 150, current_price: 175 };
  const map = { MSTR: 180 };
  const d = computeStockDerived(stock, map);
  eq(d.invested_value, 15000, "invested_value");
  eq(d.current_price, 180, "current_price uses live");
  eq(d.current_value, 18000, "current_value");
  eq(d.gain_loss, 3000, "gain_loss");
  eq(d.gain_loss_pct, 0.2, "gain_loss_pct (fraction)");
  eq(d.priceMissing, false, "priceMissing false");

  // Missing live price → fall back to stored
  const d2 = computeStockDerived(stock, {});
  eq(d2.current_price, 175, "fallback to stored when no live");
  eq(d2.priceMissing, true, "priceMissing true when no live");

  // Zero invested → no NaN%
  const d3 = computeStockDerived({ ticker: "MSTR", shares: 0, average_cost: 0 }, map);
  eq(d3.gain_loss_pct, 0, "0/0 → 0 not NaN");
}

console.log("\n=== computeLeveragedDerived ===");
{
  // Long BTC: 0.5 BTC, entry $60k, mark $65k, $5k margin
  // pnl = (65000 - 60000) × 0.5 = +$2,500
  // roe = 2500 / 5000 × 100 = 50%
  const longPos = {
    asset: "BTC", direction: "Long", size: 0.5,
    entry_price: 60000, margin_usd: 5000, liquidation_price: 30000,
  };
  const map = { BTC: 65000 };
  const d = computeLeveragedDerived(longPos, map);
  eq(d.mark_price, 65000, "long mark");
  eq(d.position_value_usd, 32500, "long notional");
  eq(d.pnl_usd, 2500, "long pnl");
  eq(d.roe_pct, 50, "long ROE %");
  // distance = |65000-30000|/65000 × 100 ≈ 53.85%
  eq(Math.round(d.distance_to_liq_pct * 100) / 100, 53.85, "distance to liq %");

  // Short ETH: 2 ETH, entry $3000, mark $2800 → +$400 profit
  const shortPos = {
    asset: "ETH", direction: "Short", size: 2,
    entry_price: 3000, margin_usd: 1000, liquidation_price: 4000,
  };
  const d2 = computeLeveragedDerived(shortPos, { ETH: 2800 });
  eq(d2.pnl_usd, 400, "short pnl");
  eq(d2.roe_pct, 40, "short ROE %");
}

console.log("\n=== computeCryptoAssetDerived ===");
{
  const map = { BTC: 65000, ETH: 3500 };
  // aWBTC alias → BTC price
  const aBtc = computeCryptoAssetDerived({ token: "awBTC", amount: 0.1 }, map);
  eq(aBtc.current_price_usd, 65000, "aWBTC resolves to BTC");
  eq(aBtc.current_value_usd, 6500, "aWBTC value");
  eq(aBtc.priceSource, "alias:BTC", "aWBTC source");

  // Stablecoin → $1 ignoring stored
  const usdc = computeCryptoAssetDerived({ token: "USDC", amount: 50000, current_price_usd: 0.99 }, map);
  eq(usdc.current_price_usd, 1, "USDC always $1");
  eq(usdc.priceSource, "stablecoin", "USDC source");

  // Unknown token, has stored price → "stale"
  const xrp = computeCryptoAssetDerived({ token: "XRP", amount: 100, current_price_usd: 0.5 }, map);
  eq(xrp.current_price_usd, 0.5, "unknown falls back to stored");
  eq(xrp.priceSource, "stale", "unknown source = stale");
}

console.log("\n=== computeAaveCollateralDerived ===");
{
  const c = { asset_name: "ETH", price_key: "ETH", units: 10, liquidation_threshold: 0.78 };
  const d = computeAaveCollateralDerived(c, { ETH: 3500 });
  eq(d.price, 3500, "ETH price");
  eq(d.value_usd, 35000, "ETH value");
  eq(d.weighted_threshold_value, 27300, "weighted threshold");
}

console.log("\n=== computeAaveAggregate ===");
{
  // Two collaterals (BTC, ETH), one borrow $10k USDC
  const collaterals = [
    { asset_name: "BTC", price_key: "BTC", units: 0.5, liquidation_threshold: 0.75, supply_apy: 1.2, is_collateral_enabled: true, updated_date: "2026-04-25" },
    { asset_name: "ETH", price_key: "ETH", units: 5, liquidation_threshold: 0.78, supply_apy: 1.5, is_collateral_enabled: true, updated_date: "2026-04-25" },
    // Older duplicate of BTC — should be deduped out
    { asset_name: "BTC", price_key: "BTC", units: 0.4, liquidation_threshold: 0.75, supply_apy: 1.2, is_collateral_enabled: true, updated_date: "2025-01-01" },
  ];
  const borrows = [{ asset_name: "USDC", borrowed_amount: 10000, borrow_apy: 5, e_mode: "Disabled" }];
  const map = { BTC: 60000, ETH: 3500 };

  const agg = computeAaveAggregate(collaterals, borrows, map);
  // Total: 0.5 × 60000 + 5 × 3500 = 30000 + 17500 = $47,500
  eq(agg.totalCollateral, 47500, "total collateral (deduped)");
  // Weighted: 30000 × 0.75 + 17500 × 0.78 = 22500 + 13650 = 36150
  eq(agg.totalWeightedThreshold, 36150, "weighted threshold");
  eq(agg.borrowedAmount, 10000, "borrowed");
  // Health = 36150 / 10000 = 3.615
  eq(Math.round(agg.healthFactor * 1000) / 1000, 3.615, "health factor");
  // BorrowPowerUsed = 10000 / 36150 × 100 ≈ 27.66%
  eq(Math.round(agg.borrowPowerUsed * 100) / 100, 27.66, "borrow power used %");
  eq(agg.availableToBorrow, 26150, "available to borrow");
  eq(agg.maxBorrowCapacity, 36150, "max borrow capacity");
  eq(agg.netWorth, 37500, "net worth");
  eq(agg.collateralDetails.length, 2, "deduped to 2 rows");

  // Empty case — no collaterals, no borrows
  const emptyAgg = computeAaveAggregate([], [], {});
  eq(emptyAgg.totalCollateral, 0, "empty total");
  eq(emptyAgg.borrowedAmount, 0, "empty borrow");
  eq(emptyAgg.healthFactor, 999, "empty health factor = 999");
}

console.log("\n=== Constants sanity ===");
{
  eq(STABLECOINS.has("USDC"), true, "USDC in stablecoins");
  eq(TOKEN_ALIAS_TO_BASE.AWBTC, "BTC", "AWBTC alias");
  eq(TOKEN_ALIAS_TO_BASE.WSTETH, "ETH", "wstETH alias");
}

console.log(`\n${failures === 0 ? "✓ All smoke checks passed" : `✗ ${failures} check(s) failed`}\n`);
if (failures > 0) process.exit(1);
