import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncHL — pull open positions from HyperLiquid's public API and reconcile
 * them with the LeveragedPosition entity.
 *
 * HL has no auth requirement for read endpoints. We POST to
 * https://api.hyperliquid.xyz/info with { type: "clearinghouseState",
 * user: "<wallet>" } and get back the full account state including
 * assetPositions[] (size, entry, mark, liquidation, leverage, margin).
 *
 * Reconciliation:
 *   - For each position returned by HL: match LeveragedPosition by
 *     (asset, status="Open"). If found, update size/entry/mark/leverage/
 *     liquidation/margin/position_value + last_updated. If not found,
 *     create a new row.
 *   - For each LeveragedPosition currently "Open" with no HL match:
 *     mark as "Closed" with closed_date = today. (Position was closed
 *     on HL but the app didn't know.)
 *
 * Payload: { wallet: "0x..." } — required.
 * Returns: { updated, created, closed, errors }.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const wallet = body?.wallet;
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return Response.json({ error: 'Valid Ethereum wallet address required (0x...)' }, { status: 400 });
    }

    // ── Fetch from HL public API ──
    const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: wallet }),
    });
    if (!hlRes.ok) {
      return Response.json({ error: `HL API error: ${hlRes.status}` }, { status: 502 });
    }
    const state = await hlRes.json();
    const apiPositions = state?.assetPositions || [];

    // Normalize HL's structure: each entry has { type: "oneWay"|..., position: {coin, szi, entryPx, leverage, liquidationPx, marginUsed, ...} }
    const live = apiPositions
      .map((entry) => entry?.position)
      .filter((p) => p && p.szi && Number(p.szi) !== 0)
      .map((p) => {
        const size = Number(p.szi);
        return {
          asset: p.coin,
          direction: size > 0 ? 'Long' : 'Short',
          size: Math.abs(size),
          entry_price: Number(p.entryPx) || null,
          leverage: Number(p.leverage?.value) || null,
          liquidation_price: Number(p.liquidationPx) || null,
          margin_usd: Number(p.marginUsed) || null,
          mark_price: null, // HL doesn't include mark in clearinghouseState; client will use priceMap
        };
      });

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const existing = await base44.entities.LeveragedPosition.list();
    const counters = { updated: 0, created: 0, closed: 0, errors: [] };

    // Track which existing Open rows we matched so we can close the rest
    const matchedExistingIds = new Set();

    for (const livePos of live) {
      try {
        const match = existing.find((e) =>
          e.status === 'Open' && (e.asset || '').toUpperCase() === (livePos.asset || '').toUpperCase()
        );
        if (match) {
          await base44.entities.LeveragedPosition.update(match.id, {
            size: livePos.size,
            direction: livePos.direction,
            entry_price: livePos.entry_price,
            leverage: livePos.leverage,
            liquidation_price: livePos.liquidation_price,
            margin_usd: livePos.margin_usd,
            last_updated: now,
          });
          matchedExistingIds.add(match.id);
          counters.updated++;
        } else {
          await base44.entities.LeveragedPosition.create({
            asset: livePos.asset,
            platform: 'HyperLiquid',
            direction: livePos.direction,
            size: livePos.size,
            entry_price: livePos.entry_price,
            leverage: livePos.leverage,
            liquidation_price: livePos.liquidation_price,
            margin_usd: livePos.margin_usd,
            status: 'Open',
            opened_date: today,
            last_updated: now,
          });
          counters.created++;
        }
      } catch (e) {
        counters.errors.push({ asset: livePos.asset, reason: (e as Error).message });
      }
    }

    // Anything currently Open that we didn't match — HL says it's gone, mark as Closed
    for (const e of existing) {
      if (e.status !== 'Open') continue;
      if (matchedExistingIds.has(e.id)) continue;
      try {
        await base44.entities.LeveragedPosition.update(e.id, {
          status: 'Closed',
          closed_date: today,
          last_updated: now,
        });
        counters.closed++;
      } catch (err) {
        counters.errors.push({ asset: e.asset, reason: `auto-close: ${(err as Error).message}` });
      }
    }

    return Response.json({
      ...counters,
      fetchedAt: now,
      walletScanned: wallet,
      livePositionsCount: live.length,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
