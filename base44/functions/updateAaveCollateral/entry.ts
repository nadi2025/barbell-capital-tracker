import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { assetName, newUnits, newApy } = body;

    if (!assetName || newUnits == null) {
      return Response.json({ error: 'Missing assetName or newUnits' }, { status: 400 });
    }

    const existing = await base44.entities.AaveCollateral.filter({ asset_name: assetName });
    if (existing.length === 0) {
      return Response.json({ error: 'Collateral not found' }, { status: 404 });
    }

    const oldUnits = existing[0].units;
    await base44.entities.AaveCollateral.update(existing[0].id, {
      units: newUnits,
      supply_apy: newApy !== undefined ? newApy : existing[0].supply_apy,
      // Stamp every save so ManualEntriesPanel knows when this row was
      // last touched (drives the staleness traffic light).
      last_updated: new Date().toISOString()
    });

    const description = `Aave: ${assetName} תוקן מ-${oldUnits} ל-${newUnits}`;
    try {
      await base44.entities.CryptoActivityLog.create({
        date: new Date().toISOString(),
        action_type: 'Collateral Adjustment',
        description,
        amount_usd: null
      });
    } catch {
      // ActivityLog not critical, continue
    }

    const prices = await base44.entities.Prices.list();
    const priceMap = {};
    prices.forEach(p => { priceMap[p.asset] = p.price_usd; });

    const collaterals = await base44.entities.AaveCollateral.list();
    const collateralDetails = collaterals.map(c => {
      const price = priceMap[c.price_key] || 0;
      const value = c.units * price;
      return {
        asset_name: c.asset_name,
        units: c.units,
        price,
        value_usd: value,
        supply_apy: c.supply_apy || 0
      };
    });

    return Response.json({ success: true, collateralDetails });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});