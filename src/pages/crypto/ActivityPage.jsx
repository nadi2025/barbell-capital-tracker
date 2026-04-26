import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";

const fmt = (v) => v == null ? "" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const ACTION_TYPES = ["Deposit", "Withdrawal", "Rebalance", "Interest Payment", "Trade", "Collateral Adjustment", "Other"];
const ACTION_LABELS = { Deposit: "Deposit", Withdrawal: "Withdrawal", Rebalance: "Rebalance", "Interest Payment": "Interest Payment", Trade: "Trade", "Collateral Adjustment": "Collateral Adjustment", Other: "Other" };

const emptyForm = { date: new Date().toISOString().split("T")[0], action_type: "Other", description: "", amount_usd: "", related_entity: "" };

/**
 * crypto/ActivityPage — running ledger of on-chain activity (deposits,
 * withdrawals, rebalances, etc.). Migrated to React Query for read + writes.
 */
export default function ActivityPage() {
  const logsQ = useEntityList("CryptoActivityLog", { sort: "-date" });
  const logs = logsQ.data || [];
  const createLog = useEntityMutation("CryptoActivityLog", "create");
  const deleteLog = useEntityMutation("CryptoActivityLog", "delete");

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filterType, setFilterType] = useState("all");

  const save = async () => {
    await createLog.mutateAsync({ ...form, amount_usd: parseFloat(form.amount_usd) || null });
    toast.success("Activity recorded");
    setDialog(false);
  };

  const del = async (id) => {
    if (!confirm("Delete?")) return;
    await deleteLog.mutateAsync(id);
    toast.success("Deleted");
  };

  const typeColor = { Deposit: "text-profit", Withdrawal: "text-loss", Trade: "text-chart-3", "LP Open": "text-chart-2", "LP Close": "text-muted-foreground", "Interest Payment": "text-amber-500" };
  const filtered = filterType === "all" ? logs : logs.filter((l) => l.action_type === filterType);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
          <h1 className="text-2xl font-bold">Activity Log</h1>
        </div>
        <Button onClick={() => { setForm(emptyForm); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Activity
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={filterType === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterType("all")}>All</Button>
        {ACTION_TYPES.map((t) => (
          <Button key={t} variant={filterType === t ? "default" : "outline"} size="sm" onClick={() => setFilterType(t)}>
            {ACTION_LABELS[t]}
          </Button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Related To</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{l.date}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${typeColor[l.action_type] || "text-foreground"}`}>
                      {ACTION_LABELS[l.action_type] || l.action_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{l.description}</td>
                  <td className="px-4 py-3 font-mono">{l.amount_usd ? fmt(l.amount_usd) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{l.related_entity || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del(l.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No activities recorded</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Activity</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs mb-1 block">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Action Type</Label>
              <Select value={form.action_type} onValueChange={(v) => setForm((p) => ({ ...p, action_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{ACTION_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {[{ label: "Description", key: "description" }, { label: "Amount ($)", key: "amount_usd", type: "number" }, { label: "Related To", key: "related_entity" }].map((f) => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <Button className="w-full" onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
