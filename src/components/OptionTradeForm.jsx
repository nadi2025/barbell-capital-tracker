import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import MobileSelect from "@/components/ui/MobileSelect";
import {
  CATEGORIES, CATEGORY_LABELS,
  getCanonicalCategory, getDirection,
  getLongStrike, getShortStrike,
  hasLongLeg, hasShortLeg, isSpread,
  validateStrikes, computeCollateral, computeRealizedPL,
} from "@/lib/optionsHelpers";

const fmtUSD = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function OptionTradeForm({ open, onClose, editTrade, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    category: "cash_secured_put",
    open_date: "", expiration_date: "", close_date: "",
    ticker: "",
    long_strike: "", short_strike: "",
    quantity: "", fill_price: "", close_price: "", fee: "",
    status: "Open", notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Load editTrade — map legacy fields to new schema for the form state.
  useEffect(() => {
    if (editTrade) {
      const canon = getCanonicalCategory(editTrade) || "cash_secured_put";
      setForm({
        category: canon,
        open_date: editTrade.open_date || "",
        expiration_date: editTrade.expiration_date || "",
        close_date: editTrade.close_date || "",
        ticker: editTrade.ticker || "",
        long_strike: getLongStrike(editTrade) ?? "",
        short_strike: getShortStrike(editTrade) ?? "",
        quantity: editTrade.quantity || "",
        fill_price: editTrade.fill_price || "",
        close_price: editTrade.close_price ?? "",
        fee: editTrade.fee || "",
        status: editTrade.status || "Open",
        notes: editTrade.notes || "",
      });
    } else {
      setForm({
        category: "cash_secured_put",
        open_date: "", expiration_date: "", close_date: "",
        ticker: "",
        long_strike: "", short_strike: "",
        quantity: "", fill_price: "", close_price: "", fee: "",
        status: "Open", notes: "",
      });
    }
  }, [editTrade, open]);

  // Derived: direction and which strike fields are visible.
  const direction = useMemo(() => getDirection({ category: form.category }), [form.category]);
  const showLong = useMemo(() => hasLongLeg({ category: form.category }), [form.category]);
  const showShort = useMemo(() => hasShortLeg({ category: form.category }), [form.category]);
  const isSpreadForm = useMemo(() => isSpread({ category: form.category }), [form.category]);

  // Live strike-order validation (spreads only).
  const strikeError = useMemo(() => validateStrikes(
    form.category,
    form.long_strike,
    form.short_strike,
  ), [form.category, form.long_strike, form.short_strike]);

  // Live collateral preview for the read-only display.
  const collateralPreview = useMemo(() => computeCollateral({
    category: form.category,
    quantity: form.quantity,
    long_strike: form.long_strike,
    short_strike: form.short_strike,
    fill_price: form.fill_price,
  }), [form.category, form.quantity, form.long_strike, form.short_strike, form.fill_price]);

  const fillLabel = direction === "debit"
    ? "Fill Price (Debit Paid, $/share)"
    : direction === "credit"
      ? "Fill Price (Credit Received, $/share)"
      : "Fill Price ($/share)";

  const handleSave = async () => {
    // Validate close fields when status flipping to closed.
    const isClosed = form.status === "Closed" || form.status === "Expired" || form.status === "Assigned";
    if (form.status === "Closed") {
      if (!form.close_date) { toast.error("Close Date required when status is Closed"); return; }
      if (form.close_price === "" || form.close_price == null) {
        toast.error("Close Price required when status is Closed"); return;
      }
    }
    if (strikeError) { toast.error(strikeError); return; }

    setSaving(true);
    const qty = parseFloat(form.quantity) || 0;
    const longStrike = parseFloat(form.long_strike) || 0;
    const shortStrike = parseFloat(form.short_strike) || 0;
    const fill = parseFloat(form.fill_price) || 0;
    const closeRaw = parseFloat(form.close_price);
    const close = form.status === "Expired" && (isNaN(closeRaw) || form.close_price === "")
      ? 0
      : (isNaN(closeRaw) ? null : closeRaw);
    const fee = parseFloat(form.fee) || 0;

    // Build a normalized trade object for helpers.
    const tradeForCalc = {
      category: form.category,
      net_direction: direction,
      quantity: qty,
      long_strike: showLong ? longStrike : null,
      short_strike: showShort ? shortStrike : null,
      fill_price: fill,
      close_price: close,
      fee,
      status: form.status,
    };

    const collateral = computeCollateral(tradeForCalc);
    const realized_pl = computeRealizedPL(tradeForCalc);

    // Derived metrics retained from before — only meaningful when closed.
    let daysHeld = null, ppd = null, roc = null, annualizedRoc = null;
    if (isClosed && form.open_date && form.close_date) {
      daysHeld = Math.ceil((new Date(form.close_date) - new Date(form.open_date)) / (1000 * 60 * 60 * 24));
      if (daysHeld > 0 && realized_pl != null) {
        ppd = realized_pl / daysHeld;
        if (collateral > 0) {
          roc = realized_pl / collateral;
          annualizedRoc = roc * (365 / daysHeld);
        }
      }
    }

    // For maximum backwards compat, also write the legacy `type` and `strike`
    // fields. Consumers that haven't been migrated to optionsHelpers still work,
    // and the `type` field gives us a sensible Sell/Buy for the existing IB
    // reconciler / CSV parser.
    const legacyType = direction === "credit" ? "Sell" : direction === "debit" ? "Buy" : undefined;
    const legacyStrike = showLong ? longStrike : (showShort ? shortStrike : undefined);

    const data = {
      category: form.category,
      net_direction: direction,
      type: legacyType,
      open_date: form.open_date,
      expiration_date: form.expiration_date || undefined,
      close_date: form.close_date || undefined,
      ticker: form.ticker.toUpperCase(),
      long_strike: showLong ? longStrike : undefined,
      short_strike: showShort ? shortStrike : undefined,
      strike: legacyStrike, // legacy mirror
      strike_2: showLong && showShort ? shortStrike : undefined, // legacy mirror for spreads
      quantity: qty,
      fill_price: fill,
      close_price: close ?? undefined,
      fee: fee || undefined,
      status: form.status,
      collateral,
      realized_pl,
      pnl: realized_pl, // legacy mirror so consumers reading o.pnl keep working
      days_held: daysHeld,
      ppd, roc, annualized_roc: annualizedRoc,
      notes: form.notes || undefined,
    };

    if (editTrade) {
      await base44.entities.OptionsTrade.update(editTrade.id, data);
      toast.success("Trade updated");
    } else {
      const created = await base44.entities.OptionsTrade.create(data);

      // Auto-create stock position for Assigned trades (CSP / naked put assignment).
      if (form.status === "Assigned") {
        const assignmentStrike = shortStrike || longStrike;
        const stockData = {
          ticker: form.ticker.toUpperCase(),
          source: "Assignment",
          entry_date: form.close_date || form.expiration_date || form.open_date,
          shares: qty * 100,
          average_cost: assignmentStrike,
          status: "Holding",
          invested_value: assignmentStrike * qty * 100,
          linked_option_id: created.id,
          notes: `Assigned from ${CATEGORY_LABELS[form.category] || form.category}`,
        };
        const stockPos = await base44.entities.StockPosition.create(stockData);
        await base44.entities.OptionsTrade.update(created.id, { linked_stock_id: stockPos.id });
      }

      toast.success("Trade added");
    }

    queryClient.invalidateQueries({ queryKey: ["entity", "OptionsTrade"] });
    queryClient.invalidateQueries({ queryKey: ["entity", "StockPosition"] });
    queryClient.invalidateQueries({ queryKey: ["function"] });

    setSaving(false);
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>{editTrade ? "Edit Trade" : "New Options Trade"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Category</Label>
              {direction && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  direction === "credit" ? "bg-emerald-500/15 text-emerald-600" : "bg-blue-500/15 text-blue-600"
                }`}>
                  {direction === "credit" ? "Credit (you receive)" : "Debit (you pay)"}
                </span>
              )}
            </div>
            <MobileSelect
              value={form.category}
              onValueChange={v => setForm(f => ({ ...f, category: v }))}
              placeholder="Category"
              options={CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABELS[c] }))}
            />
          </div>
          <div>
            <Label className="text-xs">Ticker</Label>
            <Input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="AAPL" />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <MobileSelect
              value={form.status}
              onValueChange={v => setForm(f => ({ ...f, status: v }))}
              placeholder="Status"
              options={[
                { value: "Open", label: "Open" },
                { value: "Closed", label: "Closed" },
                { value: "Assigned", label: "Assigned" },
                { value: "Expired", label: "Expired" },
              ]}
            />
          </div>
          <div>
            <Label className="text-xs">Open Date</Label>
            <Input type="date" value={form.open_date} onChange={e => setForm(f => ({ ...f, open_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Expiration Date</Label>
            <Input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Close Date</Label>
            <Input type="date" value={form.close_date} onChange={e => setForm(f => ({ ...f, close_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Quantity</Label>
            <Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          {showLong && (
            <div>
              <Label className="text-xs">Long Strike</Label>
              <Input type="number" step="0.01" value={form.long_strike}
                onChange={e => setForm(f => ({ ...f, long_strike: e.target.value }))} />
            </div>
          )}
          {showShort && (
            <div>
              <Label className="text-xs">Short Strike</Label>
              <Input type="number" step="0.01" value={form.short_strike}
                onChange={e => setForm(f => ({ ...f, short_strike: e.target.value }))} />
            </div>
          )}
          {isSpreadForm && strikeError && (
            <div className="col-span-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">
              {strikeError}
            </div>
          )}
          <div>
            <Label className="text-xs">{fillLabel}</Label>
            <Input type="number" step="0.01" value={form.fill_price}
              onChange={e => setForm(f => ({ ...f, fill_price: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Close Price ($/share)</Label>
            <Input type="number" step="0.01" value={form.close_price}
              onChange={e => setForm(f => ({ ...f, close_price: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Fee ($)</Label>
            <Input type="number" step="0.01" value={form.fee}
              onChange={e => setForm(f => ({ ...f, fee: e.target.value }))} />
          </div>
          <div className="col-span-2 flex items-center justify-between text-xs bg-muted/40 rounded px-3 py-2">
            <span className="text-muted-foreground">
              Collateral (auto-calculated)
              {strikeError && <span className="ml-2 text-destructive/80">— fix strike error first</span>}
            </span>
            <span className="font-mono font-semibold">{strikeError ? "—" : fmtUSD(collateralPreview)}</span>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.ticker || !form.open_date || !!strikeError}>
            {saving ? "Saving..." : editTrade ? "Update" : "Add Trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
