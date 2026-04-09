import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const empty = {
  name: "", lender: "", principal: "", outstanding_balance: "",
  interest_rate_pct: "", start_date: "", maturity_date: "",
  interest_paid_to_date: "", payment_frequency: "Monthly", status: "Active", notes: ""
};

export default function DebtPage() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => base44.entities.DebtFacility.list("-start_date").then(d => { setDebts(d); setLoading(false); });

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditing(null); setOpen(true); };
  const openEdit = (d) => {
    setForm({ ...d, principal: d.principal || "", outstanding_balance: d.outstanding_balance || "",
      interest_rate_pct: d.interest_rate_pct || "", interest_paid_to_date: d.interest_paid_to_date || "" });
    setEditing(d);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = {
      ...form,
      principal: parseFloat(form.principal) || 0,
      outstanding_balance: parseFloat(form.outstanding_balance) || 0,
      interest_rate_pct: parseFloat(form.interest_rate_pct) || 0,
      interest_paid_to_date: parseFloat(form.interest_paid_to_date) || 0,
      maturity_date: form.maturity_date || undefined,
      notes: form.notes || undefined,
    };
    if (editing) {
      await base44.entities.DebtFacility.update(editing.id, data);
      toast.success("Updated");
    } else {
      await base44.entities.DebtFacility.create(data);
      toast.success("Added");
    }
    setSaving(false);
    setOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.DebtFacility.delete(id);
    toast.success("Deleted");
    load();
  };

  const totalDebt = debts.filter(d => d.status === "Active").reduce((s, d) => s + (d.outstanding_balance || 0), 0);
  const totalInterestPaid = debts.reduce((s, d) => s + (d.interest_paid_to_date || 0), 0);
  const totalExpected = debts.filter(d => d.status === "Active").reduce((s, d) => {
    if (!d.maturity_date || !d.outstanding_balance || !d.interest_rate_pct) return s;
    const yrs = moment(d.maturity_date).diff(moment(), "days") / 365;
    return s + (yrs > 0 ? d.outstanding_balance * (d.interest_rate_pct / 100) * yrs : 0);
  }, 0);

  if (loading) return <div className="flex justify-center h-64 items-center"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Debt & Capital</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Track loan facilities, interest paid and expected</p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Facility</Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Outstanding Debt", value: totalDebt, color: "text-loss" },
          { label: "Interest Paid to Date", value: totalInterestPaid, color: "text-chart-3" },
          { label: "Expected Remaining Interest", value: totalExpected, color: "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>
              ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              {["Facility", "Lender", "Principal", "Balance", "Rate", "Start", "Maturity", "Interest Paid", "Status", ""].map(h => (
                <th key={h} className={`px-4 py-3 font-medium ${h === "" ? "" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {debts.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground text-sm">
                No debt facilities yet. Add one to start tracking.
              </td></tr>
            ) : debts.map(d => (
              <tr key={d.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{d.lender || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">${(d.principal || 0).toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-loss">${(d.outstanding_balance || 0).toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs">{d.interest_rate_pct}%</td>
                <td className="px-4 py-3 text-xs">{d.start_date}</td>
                <td className="px-4 py-3 text-xs">{d.maturity_date || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-chart-3">${(d.interest_paid_to_date || 0).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    d.status === "Active" ? "bg-profit/10 text-profit border-profit/20"
                    : d.status === "Paid Off" ? "bg-muted text-muted-foreground border-border"
                    : "bg-loss/10 text-loss border-loss/20"
                  }`}>{d.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(d.id)} className="text-muted-foreground hover:text-loss"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader><DialogTitle>{editing ? "Edit Facility" : "New Debt Facility"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2">
              <Label className="text-xs">Facility Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Bank Hapoalim Credit Line" />
            </div>
            <div>
              <Label className="text-xs">Lender</Label>
              <Input value={form.lender} onChange={e => setForm(f => ({ ...f, lender: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Paid Off">Paid Off</SelectItem>
                  <SelectItem value="Defaulted">Defaulted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Principal Amount ($)</Label>
              <Input type="number" value={form.principal} onChange={e => setForm(f => ({ ...f, principal: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Outstanding Balance ($)</Label>
              <Input type="number" value={form.outstanding_balance} onChange={e => setForm(f => ({ ...f, outstanding_balance: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Annual Interest Rate (%)</Label>
              <Input type="number" step="0.01" value={form.interest_rate_pct} onChange={e => setForm(f => ({ ...f, interest_rate_pct: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Payment Frequency</Label>
              <Select value={form.payment_frequency} onValueChange={v => setForm(f => ({ ...f, payment_frequency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Monthly","Quarterly","Semi-Annual","Annual","Bullet"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Maturity Date</Label>
              <Input type="date" value={form.maturity_date} onChange={e => setForm(f => ({ ...f, maturity_date: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Interest Paid to Date ($)</Label>
              <Input type="number" value={form.interest_paid_to_date} onChange={e => setForm(f => ({ ...f, interest_paid_to_date: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>{saving ? "Saving..." : editing ? "Update" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}