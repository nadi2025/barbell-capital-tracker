import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { btcDropPct = 0, ethDropPct = 0 } = body;

    const [collaterals, borrows, prices] = await Promise.all([
      base44.entities.AaveCollateral.list(),
      base44.entities.AaveBorrow.list(),
      base44.entities.Prices.list()
    ]);

    const priceMap = {};
    prices.forEach(p => { priceMap[p.asset] = p.price_usd; });

    const btcPrice = priceMap['BTC'] || 0;
    const ethPrice = priceMap['ETH'] || 0;
    const aavePrice = priceMap['AAVE'] || 0;

    const newBtcPrice = btcPrice * (1 - btcDropPct / 100);
    const newEthPrice = ethPrice * (1 - ethDropPct / 100);
    const aaveDropPct = (btcDropPct + ethDropPct) / 2;
    const newAavePrice = aavePrice * (1 - aaveDropPct / 100);

    let newCollateral = 0;
    let newWeighted = 0;

    collaterals.forEach(c => {
      let price = 0;
      if (c.price_key === 'BTC') price = newBtcPrice;
      else if (c.price_key === 'ETH') price = newEthPrice;
      else if (c.price_key === 'AAVE') price = newAavePrice;

      const value = c.units * price;
      newCollateral += value;
      newWeighted += value * (c.liquidation_threshold || 0);
    });

    const borrow = borrows.length > 0 ? borrows[0] : { borrowed_amount: 0 };
    const borrowedAmount = borrow.borrowed_amount || 0;

    const newHealthFactor = borrowedAmount > 0 ? newWeighted / borrowedAmount : 999;
    const status = newHealthFactor > 2 ? 'safe' : newHealthFactor > 1.5 ? 'caution' : newHealthFactor > 1.0 ? 'danger' : 'liquidation';

    return Response.json({
      newCollateral,
      newHealthFactor,
      borrowedAmount,
      status
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});