import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const emptyForm = { position_number: "", token_a: "", token_b: "", first_opened: "", original_value_usd: "", last_rebalanced: "", current_value_usd: "", total_fees_earned_usd: "", rebalance_count: "", rebalance_strategy: "", status: "Active", managed_for: "", notes: "" };

export default function LpPage() {
  const [positions, setPositions] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState("Active");
  const [filterInvestor, setFilterInvestor] = useState("all");

  const load = async () => setPositions(await base44.entities.LpPosition.list("-first_opened"));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data = { ...form, position_number: parseFloat(form.position_number) || null, original_value_usd: parseFloat(form.original_value_usd) || null, current_value_usd: parseFloat(form.current_value_usd) || null, total_fees_earned_usd: parseFloat(form.total_fees_earned_usd) || null, rebalance_count: parseFloat(form.rebalance_count) || null };
    if (editPos) await base44.entities.LpPosition.update(editPos.id, data);
    else await base44.entities.LpPosition.create(data);
    toast.success("פוזיציה נשמרה"); setDialog(false); load();
  };

  const del = async (id) => {
    if (!confirm("למחוק?")) return;
    await base44.entities.LpPosition.delete(id);
    toast.success("נמחק"); load();
  };

  const investors = [...new Set(positions.map(p => p.managed_for).filter(Boolean))];
  const filtered = positions.filter(p => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterInvestor !== "all" && p.managed_for !== filterInvestor) return false;
    return true;
  });

  const active = positions.filter(p => p.status === "Active");
  const totalLpValue = active.reduce((s, p) => s + (p.current_value_usd || 0), 0);
  const totalFees = active.reduce((s, p) => s + (p.total_fees_earned_usd || 0), 0);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
            <h1 className="text-2xl font-bold">בריכות נזילות (LP)</h1>
          </div>
        </div>
        <Button onClick={() => { setEditPos(null); setForm(emptyForm); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> פוזיציה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">שווי LP כולל</p>
          <p className="text-xl font-bold font-mono text-profit">{fmt(totalLpValue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">עמלות שנצברו</p>
          <p className="text-xl font-bold font-mono text-chart-3">{fmt(totalFees)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["Active", "Closed", "all"].map(s => (
          <Button key={s} variant={filterStatus === s ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(s)}>
            {s === "all" ? "הכל" : s === "Active" ? "פעילות" : "סגורות"}
          </Button>
        ))}
        {investors.length > 0 && (
          <Select value={filterInvestor} onValueChange={setFilterInvestor}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="משקיע" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המשקיעים</SelectItem>
              {investors.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-right px-4 py-3">#</th>
                <th className="text-right px-4 py-3">זוג</th>
                <th className="text-right px-4 py-3">אסטרטגיה</th>
                <th className="text-right px-4 py-3">ערך מקורי</th>
                <th className="text-right px-4 py-3">ערך נוכחי</th>
                <th className="text-right px-4 py-3">עמלות</th>
                <th className="text-right px-4 py-3">איזונים</th>
                <th className="text-right px-4 py-3">מנוהל עבור</th>
                <th className="text-right px-4 py-3">נפתח</th>
                <th className="text-right px-4 py-3">סטטוס</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono">{p.position_number || "—"}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{p.token_a}/{p.token_b}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.rebalance_strategy || "—"}</td>
                  <td className="px-4 py-3 font-mono">{fmt(p.original_value_usd)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-profit">{fmt(p.current_value_usd)}</td>
                  <td className="px-4 py-3 font-mono text-chart-3">{fmt(p.total_fees_earned_usd)}</td>
                  <td className="px-4 py-3 font-mono text-center">{p.rebalance_count || 0}</td>
                  <td className="px-4 py-3 text-xs">{p.managed_for || "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono">{p.first_opened || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${p.status === "Active" ? "bg-profit/10 text-profit border-profit/20" : "bg-muted text-muted-foreground border-border"}`}>
                      {p.status === "Active" ? "פעיל" : "סגור"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditPos(p); setForm({ position_number: p.position_number || "", token_a: p.token_a, token_b: p.token_b, first_opened: p.first_opened || "", original_value_usd: p.original_value_usd || "", last_rebalanced: p.last_rebalanced || "", current_value_usd: p.current_value_usd || "", total_fees_earned_usd: p.total_fees_earned_usd || "", rebalance_count: p.rebalance_count || "", rebalance_strategy: p.rebalance_strategy || "", status: p.status, managed_for: p.managed_for || "", notes: p.notes || "" }); setDialog(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del(p.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-muted-foreground text-sm">אין פוזיציות LP</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>{editPos ? "עריכת LP" : "LP חדש"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2 max-h-[70vh] overflow-y-auto">
            {[
              { label: "מספר פוזיציה", key: "position_number", type: "number" },
              { label: "טוקן A", key: "token_a" }, { label: "טוקן B", key: "token_b" },
              { label: "נפתח", key: "first_opened", type: "date" },
              { label: "ערך מקורי ($)", key: "original_value_usd", type: "number" },
              { label: "איזון אחרון", key: "last_rebalanced", type: "date" },
              { label: "ערך נוכחי ($)", key: "current_value_usd", type: "number" },
              { label: "עמלות ($)", key: "total_fees_earned_usd", type: "number" },
              { label: "מספר איזונים", key: "rebalance_count", type: "number" },
              { label: "אסטרטגיה", key: "rebalance_strategy" },
              { label: "מנוהל עבור", key: "managed_for" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">סטטוס</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full mt-2" onClick={save}>שמור</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}