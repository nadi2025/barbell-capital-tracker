import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [collaterals, borrows, prices] = await Promise.all([
      base44.entities.AaveCollateral.list(),
      base44.entities.AaveBorrow.list(),
      base44.entities.Prices.list()
    ]);

    const priceMap = {};
    prices.forEach(p => { priceMap[p.asset] = p.price_usd; });

    // Deduplicate collaterals by asset_name (keep latest)
    const uniqueCollaterals = {};
    collaterals.forEach(c => {
      const key = c.asset_name;
      if (!uniqueCollaterals[key] || new Date(c.updated_date || c.created_date) > new Date(uniqueCollaterals[key].updated_date || uniqueCollaterals[key].created_date)) {
        uniqueCollaterals[key] = c;
      }
    });

    const collateralDetails = Object.values(uniqueCollaterals).map(c => {
      const price = priceMap[c.price_key] || 0;
      const value = c.units * price;
      return {
        asset_name: c.asset_name,
        units: c.units,
        price,
        value_usd: value,
        supply_apy: c.supply_apy || 0,
        liquidation_threshold: c.liquidation_threshold || 0,
        weighted_threshold_value: value * (c.liquidation_threshold || 0),
        is_collateral_enabled: c.is_collateral_enabled
      };
    });

    const totalCollateral = collateralDetails.reduce((s, c) => s + c.value_usd, 0);
    const totalWeightedThreshold = collateralDetails.reduce((s, c) => s + c.weighted_threshold_value, 0);

    const borrow = borrows.length > 0 ? borrows[0] : { asset_name: 'USDC', borrowed_amount: 0, borrow_apy: 0, e_mode: 'Disabled' };
    const borrowedAmount = borrow.borrowed_amount || 0;
    const borrowApy = borrow.borrow_apy || 0;

    const healthFactor = totalWeightedThreshold > 0 ? totalWeightedThreshold / Math.max(borrowedAmount, 1) : 999;
    const borrowPowerUsed = totalWeightedThreshold > 0 ? (borrowedAmount / totalWeightedThreshold) * 100 : 0;
    const availableToBorrow = Math.max(0, totalWeightedThreshold - borrowedAmount);
    const maxBorrowCapacity = totalWeightedThreshold;
    const netWorth = totalCollateral - borrowedAmount;

    const weightedSupplyApy = totalCollateral > 0 
      ? collateralDetails.reduce((s, c) => s + (c.value_usd * c.supply_apy), 0) / totalCollateral 
      : 0;
    const netApy = totalCollateral > 0
      ? weightedSupplyApy - (borrowApy * borrowedAmount / totalCollateral)
      : 0;

    const lastUpdated = [...collaterals, ...borrows].reduce((latest, item) => {
      const itemDate = new Date(item.updated_date || item.created_date || 0);
      const latestDate = new Date(latest);
      return itemDate > latestDate ? itemDate : latestDate;
    }, new Date(0));

    return Response.json({
      collateralDetails,
      totalCollateral,
      borrowedAmount,
      borrowApy,
      healthFactor,
      borrowPowerUsed,
      availableToBorrow,
      maxBorrowCapacity,
      netWorth,
      supplyApy: weightedSupplyApy,
      netApy,
      eMode: borrow.e_mode || 'Disabled',
      lastUpdated: lastUpdated.toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});