import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { toast } from "sonner";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";

/**
 * DepositsPage — capital ledger (deposits + withdrawals tagged by source).
 *
 * Migrated to React Query: deposit list reads via useEntityList, mutations
 * via useEntityMutation. The Capital Structure tile on the dashboard
 * (which separates Equity Investment / Equity Cash Flow / Debt Investment)
 * picks up changes here automatically — no imperative reload chain.
 */
export default function DepositsPage() {
  const depositsQ = useEntityList("Deposit", { sort: "-date" });
  const deposits = depositsQ.data || [];
  const createDeposit = useEntityMutation("Deposit", "create");
  const updateDeposit = useEntityMutation("Deposit", "update");
  const deleteDeposit = useEntityMutation("Deposit", "delete");

  const [formOpen, setFormOpen] = useState(false);
  const [editDeposit, setEditDeposit] = useState(null);
  const [form, setForm] = useState({ date: "", type: "Deposit", amount: "", capital_source: "Equity", notes: "" });
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const isReadOnly = user?.role === "partner" || user?.role === "investor";

  // Migrate legacy capital_source values on read so old records still display correctly.
  const normalizeCapitalSource = (cs) => {
    if (cs === "Equity Investment" || cs === "Equity Cash Flow") return "Equity";
    if (cs === "Debt Investment") return "Off-Chain Debt";
    return cs || "Equity";
  };

  const openNew = () => { setEditDeposit(null); setForm({ date: "", type: "Deposit", amount: "", capital_source: "Equity", notes: "" }); setFormOpen(true); };
  const openEdit = (dep) => { setEditDeposit(dep); setForm({ date: dep.date, type: dep.type, amount: String(dep.amount), capital_source: normalizeCapitalSource(dep.capital_source), notes: dep.notes || "" }); setFormOpen(true); };

  const handleSave = async () => {
    const data = { date: form.date, type: form.type, amount: parseFloat(form.amount), capital_source: form.capital_source, notes: form.notes || undefined };
    if (editDeposit) {
      await updateDeposit.mutateAsync({ id: editDeposit.id, data });
      toast.success("Updated");
    } else {
      await createDeposit.mutateAsync(data);
      toast.success(`${form.type} recorded`);
    }
    setFormOpen(false);
    setForm({ date: "", type: "Deposit", amount: "", capital_source: "Equity", notes: "" });
    setEditDeposit(null);
  };

  const handleDelete = async (dep) => {
    if (!confirm("Delete this transaction?")) return;
    await deleteDeposit.mutateAsync(dep.id);
    toast.success("Deleted");
  };

  if (depositsQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalDeposits = deposits.filter((d) => d.type === "Deposit").reduce((s, d) => s + d.amount, 0);
  const totalWithdrawals = deposits.filter((d) => d.type === "Withdrawal").reduce((s, d) => s + d.amount, 0);
  const net = totalDeposits - totalWithdrawals;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deposits & Withdrawals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Net invested: <span className="text-foreground font-medium">${net.toLocaleString()}</span>
          </p>
        </div>
        {!isReadOnly && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Add Transaction
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Deposits</p>
          <p className="text-xl font-bold text-profit mt-1">${totalDeposits.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Withdrawals</p>
          <p className="text-xl font-bold text-loss mt-1">${totalWithdrawals.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Net Invested</p>
          <p className="text-xl font-bold mt-1">${net.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Capital Source</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Notes</th>
                {!isReadOnly && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{d.date}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      {d.type === "Deposit"
                        ? <ArrowDownLeft className="w-3.5 h-3.5 text-profit" />
                        : <ArrowUpRight className="w-3.5 h-3.5 text-loss" />}
                      {d.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const cs = normalizeCapitalSource(d.capital_source);
                      const label = cs === "Off-Chain Debt" ? "חוב Off-Chain" : "הון עצמי";
                      const cls = cs === "Off-Chain Debt"
                        ? "bg-loss/10 text-loss border-loss/20"
                        : "bg-profit/10 text-profit border-profit/20";
                      return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    <span className={d.type === "Deposit" ? "text-profit" : "text-loss"}>
                      {d.type === "Deposit" ? "+" : "-"}${d.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.notes || "-"}</td>
                  {!isReadOnly && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader>
            <DialogTitle>{editDeposit ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Deposit">Deposit</SelectItem>
                  <SelectItem value="Withdrawal">Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Capital Source</Label>
              <Select value={form.capital_source} onValueChange={(v) => setForm((f) => ({ ...f, capital_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Equity">הון עצמי</SelectItem>
                  <SelectItem value="Off-Chain Debt">חוב Off-Chain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount ($)</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.date || !form.amount}>{editDeposit ? "Update" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}