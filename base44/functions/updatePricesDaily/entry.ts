import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Fetch live prices for crypto and stocks
    const res = await base44.integrations.Core.InvokeLLM({
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

    // Update Prices entity with each asset
    const prices = res;
    for (const [asset, price] of Object.entries(prices || {})) {
      if (price && price > 0) {
        const existing = await base44.entities.Prices.filter({ asset });
        if (existing.length > 0) {
          await base44.entities.Prices.update(existing[0].id, { price_usd: price, last_updated: new Date().toISOString() });
        } else {
          await base44.entities.Prices.create({ asset, price_usd: price, last_updated: new Date().toISOString() });
        }
      }
    }

    return Response.json({ success: true, prices });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});