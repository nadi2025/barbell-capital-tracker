import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // 1. Fetch crypto prices from base44 LLM with internet
  const cryptoResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: 'Return the current market prices in USD for: Bitcoin (BTC), Ethereum (ETH), AAVE token. Return ONLY a JSON object like: {"BTC": 83000, "ETH": 1600, "AAVE": 130}. No other text.',
    add_context_from_internet: true,
    response_json_schema: {
      type: 'object',
      properties: {
        BTC: { type: 'number' },
        ETH: { type: 'number' },
        AAVE: { type: 'number' },
      }
    }
  });

  const cryptoPrices = {
    BTC: cryptoResult?.BTC || null,
    ETH: cryptoResult?.ETH || null,
    AAVE: cryptoResult?.AAVE || null,
    MSTR: null,
  };

  // 2. Fetch stock positions to know which tickers to update
  const stocks = await base44.asServiceRole.entities.StockPosition.filter({ status: "Holding" });
  const tickers = [...new Set(stocks.map(s => s.ticker).filter(Boolean))];

  const stockPrices = {};
  for (const ticker of tickers) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) stockPrices[ticker] = price;
    } catch (_) {
      // skip if fetch fails for a ticker
    }
  }

  // 3. Update CryptoAsset prices in the app
  const assets = await base44.asServiceRole.entities.CryptoAsset.list();
  const today = new Date().toISOString().split('T')[0];

  for (const asset of assets) {
    const token = asset.token?.toUpperCase();
    const newPrice = cryptoPrices[token];
    if (newPrice && newPrice !== asset.current_price_usd) {
      await base44.asServiceRole.entities.CryptoAsset.update(asset.id, {
        current_price_usd: newPrice,
        current_value_usd: asset.amount ? asset.amount * newPrice : asset.current_value_usd,
        last_updated: today,
      });
    }
  }

  // 4. Update StockPosition current prices
  for (const stock of stocks) {
    const newPrice = stockPrices[stock.ticker];
    if (newPrice) {
      const currentValue = (stock.shares || 0) * newPrice;
      const gainLoss = currentValue - (stock.invested_value || 0);
      const gainLossPct = stock.invested_value ? (gainLoss / stock.invested_value) * 100 : 0;
      await base44.asServiceRole.entities.StockPosition.update(stock.id, {
        current_price: newPrice,
        current_value: currentValue,
        gain_loss: gainLoss,
        gain_loss_pct: gainLossPct,
      });
    }
  }

  // 5. Update Asset entity with all fetched prices
  const assetRecords = await base44.asServiceRole.entities.Asset.list();
  const now = new Date().toISOString();
  for (const asset of assetRecords) {
    const sym = asset.symbol?.toUpperCase();
    const newPrice = cryptoPrices[sym] || stockPrices[sym];
    if (newPrice) {
      await base44.asServiceRole.entities.Asset.update(asset.id, {
        current_price_usd: newPrice,
        last_updated: now,
      });
    }
  }

  return Response.json({
    crypto: cryptoPrices,
    stocks: stockPrices,
    tickers_updated: Object.keys(stockPrices),
    tickers_failed: tickers.filter(t => !stockPrices[t]),
    updated_at: new Date().toISOString(),
  });
});