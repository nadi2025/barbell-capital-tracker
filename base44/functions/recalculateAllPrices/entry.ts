import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch prices, Aave data, and leveraged positions
    const [prices, collaterals, borrows, leveraged, options] = await Promise.all([
      base44.entities.Prices.list(),
      base44.entities.AaveCollateral.list(),
      base44.entities.AaveBorrow.list(),
      base44.entities.LeveragedPosition.list(),
      base44.entities.CryptoOptionsPosition.list()
    ]);

    const priceMap = {};
    prices.forEach(p => { priceMap[p.asset] = p.price_usd; });

    // Update Aave Collateral values
    const uniqueCollaterals = {};
    collaterals.forEach(c => {
      if (!uniqueCollaterals[c.asset_name] || new Date(c.updated_date) > new Date(uniqueCollaterals[c.asset_name].updated_date)) {
        uniqueCollaterals[c.asset_name] = c;
      }
    });

    for (const collateral of Object.values(uniqueCollaterals)) {
      const price = priceMap[collateral.price_key] || 0;
      // Collateral entity doesn't store value_usd, but calculateAavePosition computes it on the fly
    }

    // Update Leveraged Positions with new mark prices
    for (const position of leveraged) {
      const price = priceMap[position.asset?.toUpperCase()] || position.mark_price || 0;
      if (price) {
        const newValue = position.size * price;
        const newPnL = position.direction === 'Long'
          ? (price - position.entry_price) * position.size
          : (position.entry_price - price) * position.size;
        
        await base44.entities.LeveragedPosition.update(position.id, {
          mark_price: price,
          position_value_usd: newValue
          // Note: PnL calculation is done in the UI, not stored
        });
      }
    }

    // Update Crypto Options prices
    for (const option of options) {
      const assetPrice = priceMap[option.asset?.toUpperCase()] || option.current_price;
      if (assetPrice) {
        await base44.entities.CryptoOptionsPosition.update(option.id, {
          current_price: assetPrice
        });
      }
    }

    return Response.json({
      success: true,
      message: "Prices recalculated across all entities",
      pricesUpdated: prices.length,
      leveragedUpdated: leveraged.length,
      optionsUpdated: options.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});