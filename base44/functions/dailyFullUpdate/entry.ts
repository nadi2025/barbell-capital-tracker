import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Master daily update function - runs all price and recalculation steps in order:
 * 1. Fetch live prices (crypto + stocks) → saves to Prices entity
 * 2. Recalculate all positions (leveraged, crypto options, Aave) from Prices entity
 * 3. Update StockPosition values from Prices entity
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Step 1: Fetch live prices from internet → save to Prices entity
    const pricesRes = await base44.integrations.Core.InvokeLLM({
      prompt: 'Get current market prices in USD for: BTC, ETH, AAVE (crypto), MSTR, MARA, BMNR, SBET, STRC (stocks). Return ONLY a JSON object with keys as ticker symbols and their USD prices as numbers.',
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          BTC: { type: 'number' },
          ETH: { type: 'number' },
          AAVE: { type: 'number' },
          MSTR: { type: 'number' },
          MARA: { type: 'number' },
          BMNR: { type: 'number' },
          SBET: { type: 'number' },
          STRC: { type: 'number' }
        }
      }
    });

    const fetchedPrices = pricesRes || {};
    for (const [asset, price] of Object.entries(fetchedPrices)) {
      if (price && price > 0) {
        const existing = await base44.entities.Prices.filter({ asset });
        if (existing.length > 0) {
          await base44.entities.Prices.update(existing[0].id, { price_usd: price, last_updated: new Date().toISOString() });
        } else {
          await base44.entities.Prices.create({ asset, price_usd: price, last_updated: new Date().toISOString() });
        }
      }
    }

    // Step 2: Read updated prices from DB
    const prices = await base44.entities.Prices.list();
    const priceMap = {};
    prices.forEach(p => { priceMap[p.asset?.toUpperCase()] = p.price_usd; });

    // Step 3: Update Leveraged Positions
    const leveraged = await base44.entities.LeveragedPosition.list();
    for (const position of leveraged) {
      const price = priceMap[position.asset?.toUpperCase()];
      if (price && position.size) {
        await base44.entities.LeveragedPosition.update(position.id, {
          mark_price: price,
          position_value_usd: position.size * price
        });
      }
    }

    // Step 4: Update Crypto Options positions
    const cryptoOptions = await base44.entities.CryptoOptionsPosition.list();
    for (const option of cryptoOptions) {
      const price = priceMap[option.asset?.toUpperCase()];
      if (price) {
        await base44.entities.CryptoOptionsPosition.update(option.id, { current_price: price });
      }
    }

    // Step 5: Update Stock Positions
    const stockPositions = await base44.entities.StockPosition.filter({ status: 'Holding' });
    const stockPositionsPartial = await base44.entities.StockPosition.filter({ status: 'Partially Sold' });
    const allStocks = [...stockPositions, ...stockPositionsPartial];

    for (const stock of allStocks) {
      const price = priceMap[stock.ticker?.toUpperCase()];
      if (price && stock.shares) {
        const currentValue = price * stock.shares;
        const investedValue = stock.average_cost * stock.shares;
        const gainLoss = currentValue - investedValue;
        const gainLossPct = investedValue > 0 ? gainLoss / investedValue : 0;
        await base44.entities.StockPosition.update(stock.id, {
          current_price: price,
          current_value: currentValue,
          gain_loss: gainLoss,
          gain_loss_pct: gainLossPct
        });
      }
    }

    return Response.json({
      success: true,
      message: 'Full daily update completed',
      pricesUpdated: Object.keys(fetchedPrices).length,
      leveragedUpdated: leveraged.length,
      cryptoOptionsUpdated: cryptoOptions.length,
      stocksUpdated: allStocks.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});