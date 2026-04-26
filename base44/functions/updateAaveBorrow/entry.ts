import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { newAmount, newApy } = body;

    if (newAmount == null) {
      return Response.json({ error: 'Missing newAmount' }, { status: 400 });
    }

    const borrows = await base44.entities.AaveBorrow.list();
    if (borrows.length === 0) {
      return Response.json({ error: 'Borrow record not found' }, { status: 404 });
    }

    const oldAmount = borrows[0].borrowed_amount;
    await base44.entities.AaveBorrow.update(borrows[0].id, {
      borrowed_amount: newAmount,
      borrow_apy: newApy !== undefined ? newApy : borrows[0].borrow_apy,
      // Stamp every save so ManualEntriesPanel staleness check works.
      last_updated: new Date().toISOString()
    });

    const description = `Aave: הלוואה עדכנה מ-$${oldAmount} ל-$${newAmount}`;
    try {
      await base44.entities.CryptoActivityLog.create({
        date: new Date().toISOString(),
        action_type: 'Borrow Adjustment',
        description,
        amount_usd: null
      });
    } catch {
      // ActivityLog not critical
    }

    return Response.json({ success: true, borrowed_amount: newAmount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});