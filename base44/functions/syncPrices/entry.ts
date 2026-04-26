import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncPrices — single source of truth for fetching live prices.
 *
 * Behavior:
 * 1. Accepts optional payload { stockTickers?: string[], cryptoSymbols?: string[] }.
 * 2. If stockTickers omitted, derives them from StockPosition (status =
 *    Holding ∪ Partially Sold).
 * 3. Fetches crypto via LLM+internet (BTC/ETH/AAVE always, plus any extras
 *    requested via cryptoSymbols).
 * 4. Fetches each stock ticker from Yahoo Finance.
 * 5. Upserts every retrieved price to the Prices entity.
 *    last_updated = new Date().toISOString().
 * 6. Returns { prices, fetchedAt, errors }.
 *
 * Explicitly does NOT cascade to LeveragedPosition, StockPosition,
 * CryptoAsset, AaveCollateral, or Asset. The dashboard now derives those
 * values on-the-fly from priceMap × entity, so a Prices update is enough.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let payload = {};
    try { payload = await req.json(); } catch { /* empty body is fine */ }

    const errors = [];
    const fetchedPrices = {};

    // ── Crypto (LLM + internet) ──
    const cryptoSymbols = Array.from(new Set(['BTC', 'ETH', 'AAVE', ...(payload.cryptoSymbols || [])]));
    try {
      const schemaProps = {};
      cryptoSymbols.forEach((s) => { schemaProps[s] = { type: 'number' }; });

      const cryptoRes = await base44.integrations.Core.InvokeLLM({
        prompt: `Get current market prices in USD for these crypto assets: ${cryptoSymbols.join(', ')}. Return ONLY a JSON object with keys as ticker symbols and their USD prices as numbers.`,
        add_context_from_internet: true,
        response_json_schema: { type: 'object', properties: schemaProps },
      });

      for (const sym of cryptoSymbols) {
        const p = cryptoRes?.[sym];
        if (typeof p === 'number' && p > 0) {
          fetchedPrices[sym] = p;
        } else {
          errors.push({ symbol: sym, reason: 'LLM returned no valid price' });
        }
      }
    } catch (e) {
      errors.push({ symbol: 'crypto-batch', reason: `LLM fetch failed: ${e.message}` });
    }

    // ── Stocks (Yahoo Finance) ──
    let stockTickers = payload.stockTickers;
    if (!stockTickers || stockTickers.length === 0) {
      const [holding, partial] = await Promise.all([
        base44.entities.StockPosition.filter({ status: 'Holding' }),
        base44.entities.StockPosition.filter({ status: 'Partially Sold' }),
      ]);
      const allStocks = [...holding, ...partial];
      stockTickers = Array.from(new Set(
        allStocks.map((s) => s.ticker).filter(Boolean)
      ));
    }

    await Promise.all(
      stockTickers.map(async (ticker) => {
        const upper = String(ticker).toUpperCase();
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${upper}?interval=1d&range=1d`;
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const data = await res.json();
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (typeof price === 'number' && price > 0) {
            fetchedPrices[upper] = price;
          } else {
            errors.push({ symbol: upper, reason: 'Yahoo returned no valid price' });
          }
        } catch (e) {
          errors.push({ symbol: upper, reason: `Yahoo fetch failed: ${e.message}` });
        }
      })
    );

    // ── Upsert to Prices entity ──
    const fetchedAt = new Date().toISOString();
    for (const [asset, price] of Object.entries(fetchedPrices)) {
      try {
        const existing = await base44.entities.Prices.filter({ asset });
        if (existing.length > 0) {
          await base44.entities.Prices.update(existing[0].id, {
            price_usd: price,
            last_updated: fetchedAt,
          });
        } else {
          await base44.entities.Prices.create({
            asset,
            price_usd: price,
            last_updated: fetchedAt,
          });
        }
      } catch (e) {
        errors.push({ symbol: asset, reason: `Prices upsert failed: ${e.message}` });
      }
    }

    return Response.json({
      prices: fetchedPrices,
      fetchedAt,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});