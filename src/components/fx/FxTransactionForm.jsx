import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const CURRENCIES = ["EUR", "USD", "ILS", "GBP", "CHF", "JPY"];
const TYPES = ["SPOT", "FORWARD"];
const DIRECTIONS = ["BUY", "SELL"];
const STATUSES = ["OPEN", "SETTLED", "CANCELLED"];
const BROKERS = ["Meitav Trade", "Other"];

const blank = {
  reference: "",
  broker: "Meitav Trade",
  account: "",
  trader: "",
  project: "",
  transaction_type: "FORWARD",
  trade_date: "",
  value_date: "",
  base_currency: "EUR",
  quote_currency: "USD",
  direction: "SELL",
  base_amount: "",
  quote_amount: "",
  locked_rate: "",
  linked_to_reference: "",
  status: "OPEN",
  manual_close_date: "",
  notes: "",
};

export default function FxTransactionForm({ open, onClose, editTransaction }) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    if (editTransaction) {
      setForm({ ...blank, ...editTransaction });
    } else {
      setForm({ ...blank, trade_date: new Date().toISOString().slice(0, 10) });
    }
  }, [open, editTransaction]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reference || !form.trade_date || !form.value_date || !form.base_amount || !form.quote_amount || !form.locked_rate) {
      toast.error("יש למלא את כל שדות החובה");
      return;
    }
    if (form.base_currency === form.quote_currency) {
      toast.error("מטבע בסיס ומטבע ציטוט חייבים להיות שונים");
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        base_amount: parseFloat(form.base_amount) || 0,
        quote_amount: parseFloat(form.quote_amount) || 0,
        locked_rate: parseFloat(form.locked_rate) || 0,
      };
      // Strip empty optional date strings so Base44 doesn't reject them
      ["manual_close_date", "trader", "project", "linked_to_reference", "notes"].forEach((k) => {
        if (data[k] === "") delete data[k];
      });
      if (editTransaction?.id) {
        await base44.entities.FxHedgeTransaction.update(editTransaction.id, data);
        toast.success("עסקה עודכנה");
      } else {
        await base44.entities.FxHedgeTransaction.create(data);
        toast.success("עסקה נוצרה");
      }
      queryClient.invalidateQueries({ queryKey: ["entity", "FxHedgeTransaction"] });
      onClose();
    } catch (err) {
      toast.error(err.message || "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTransaction ? "עריכת עסקת FX" : "עסקת FX חדשה"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <Label className="text-xs">אסמכתא *</Label>
            <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="07052025Y2" />
          </div>
          <div>
            <Label className="text-xs">ברוקר *</Label>
            <Select value={form.broker} onValueChange={(v) => set("broker", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BROKERS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">חשבון *</Label>
            <Input value={form.account} onChange={(e) => set("account", e.target.value)} placeholder="211927" />
          </div>
          <div>
            <Label className="text-xs">סוחר</Label>
            <Input value={form.trader} onChange={(e) => set("trader", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">פרויקט / תת-חשבון</Label>
            <Input value={form.project} onChange={(e) => set("project", e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">סוג עסקה *</Label>
            <Select value={form.transaction_type} onValueChange={(v) => set("transaction_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">כיוון (של מטבע הבסיס) *</Label>
            <Select value={form.direction} onValueChange={(v) => set("direction", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">תאריך ביצוע *</Label>
            <Input type="date" value={form.trade_date} onChange={(e) => set("trade_date", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">יום ערך / פירעון *</Label>
            <Input type="date" value={form.value_date} onChange={(e) => set("value_date", e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">מטבע בסיס *</Label>
            <Select value={form.base_currency} onValueChange={(v) => set("base_currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">מטבע ציטוט *</Label>
            <Select value={form.quote_currency} onValueChange={(v) => set("quote_currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">סכום בסיס *</Label>
            <Input type="number" step="0.01" value={form.base_amount} onChange={(e) => set("base_amount", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">סכום ציטוט *</Label>
            <Input type="number" step="0.01" value={form.quote_amount} onChange={(e) => set("quote_amount", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">שער ננעל *</Label>
            <Input type="number" step="0.0001" value={form.locked_rate} onChange={(e) => set("locked_rate", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">סטטוס *</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">אסמכתא של עסקה מקושרת (Swap)</Label>
            <Input value={form.linked_to_reference} onChange={(e) => set("linked_to_reference", e.target.value)} placeholder="ריק אם זו לא חלק מ-Swap" />
          </div>
          <div>
            <Label className="text-xs">תאריך סגירה ידנית</Label>
            <Input type="date" value={form.manual_close_date} onChange={(e) => set("manual_close_date", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">הערות</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={onClose}>בטל</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "שומר…" : editTransaction ? "עדכן" : "צור"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}