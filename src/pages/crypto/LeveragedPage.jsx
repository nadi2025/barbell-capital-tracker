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

const emptyForm = { asset: "", platform: "HyperLiquid", leverage: "", margin_usd: "", position_value_usd: "", liquidation_price: "", direction: "Long", entry_price: "", status: "Open", opened_date: "", pnl_usd: "" };

export default function LeveragedPage() {
  const [positions, setPositions] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("Open");

  const load = async () => setPositions(await base44.entities.LeveragedPosition.list("-opened_date"));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data = { ...form, leverage: parseFloat(form.leverage) || null, margin_usd: parseFloat(form.margin_usd) || null, position_value_usd: parseFloat(form.position_value_usd) || null, liquidation_price: parseFloat(form.liquidation_price) || null, entry_price: parseFloat(form.entry_price) || null, pnl_usd: parseFloat(form.pnl_usd) || null };
    if (editPos) await base44.entities.LeveragedPosition.update(editPos.id, data);
    else await base44.entities.LeveragedPosition.create(data);
    toast.success("פוזיציה נשמרה"); setDialog(false); load();
  };

  const del = async (id) => {
    if (!confirm("למחוק פוזיציה זו?")) return;
    await base44.entities.LeveragedPosition.delete(id);
    toast.success("נמחק"); load();
  };

  const filtered = filter === "all" ? positions : positions.filter(p => p.status === filter);
  const open = positions.filter(p => p.status === "Open");
  const totalMargin = open.reduce((s, p) => s + (p.margin_usd || 0), 0);
  const totalNotional = open.reduce((s, p) => s + (p.position_value_usd || 0), 0);
  const avgLev = open.length > 0 ? open.reduce((s, p) => s + (p.leverage || 0), 0) / open.length : 0;

  const liqWarning = (pos) => {
    if (!pos.liquidation_price || !pos.entry_price) return false;
    return Math.abs(pos.entry_price - pos.liquidation_price) / pos.entry_price < 0.15;
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
            <h1 className="text-2xl font-bold">פוזיציות ממונפות</h1>
          </div>
        </div>
        <Button onClick={() => { setEditPos(null); setForm(emptyForm); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> פוזיציה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">מרג'ין פרוס</p>
          <p className="text-xl font-bold font-mono text-foreground">{fmt(totalMargin)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">שווי נומינלי</p>
          <p className="text-xl font-bold font-mono text-foreground">{fmt(totalNotional)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">מינוף ממוצע</p>
          <p className="text-xl font-bold font-mono text-foreground">{avgLev.toFixed(1)}x</p>
        </div>
      </div>

      <div className="flex gap-2">
        {["Open", "Closed", "all"].map(s => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
            {s === "all" ? "הכל" : s === "Open" ? "פתוחות" : "סגורות"}
          </Button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-right px-4 py-3">נכס</th>
                <th className="text-right px-4 py-3">כיוון</th>
                <th className="text-right px-4 py-3">מינוף</th>
                <th className="text-right px-4 py-3">מרג'ין</th>
                <th className="text-right px-4 py-3">שווי פוזיציה</th>
                <th className="text-right px-4 py-3">מחיר כניסה</th>
                <th className="text-right px-4 py-3">מחיר חיסול</th>
                <th className="text-right px-4 py-3">PnL</th>
                <th className="text-right px-4 py-3">סטטוס</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 ${liqWarning(p) ? "bg-loss/5" : ""}`}>
                  <td className="px-4 py-3 font-mono font-bold">{p.asset}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.direction === "Long" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>
                      {p.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{p.leverage}x</td>
                  <td className="px-4 py-3 font-mono">{fmt(p.margin_usd)}</td>
                  <td className="px-4 py-3 font-mono">{fmt(p.position_value_usd)}</td>
                  <td className="px-4 py-3 font-mono">${(p.entry_price || 0).toLocaleString()}</td>
                  <td className={`px-4 py-3 font-mono ${liqWarning(p) ? "text-loss font-bold" : ""}`}>
                    ${(p.liquidation_price || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {p.pnl_usd != null ? (
                      <span className={`font-mono font-semibold ${p.pnl_usd >= 0 ? "text-profit" : "text-loss"}`}>
                        {p.pnl_usd >= 0 ? "+" : ""}{fmt(p.pnl_usd)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${p.status === "Open" ? "bg-profit/10 text-profit border-profit/20" : "bg-muted text-muted-foreground border-border"}`}>
                      {p.status === "Open" ? "פתוחה" : "סגורה"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditPos(p); setForm({ asset: p.asset, platform: p.platform, leverage: p.leverage || "", margin_usd: p.margin_usd || "", position_value_usd: p.position_value_usd || "", liquidation_price: p.liquidation_price || "", direction: p.direction, entry_price: p.entry_price || "", status: p.status, opened_date: p.opened_date || "", pnl_usd: p.pnl_usd || "" }); setDialog(true); }}>
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
                <tr><td colSpan={10} className="text-center py-8 text-muted-foreground text-sm">אין פוזיציות</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>{editPos ? "עריכת פוזיציה" : "פוזיציה חדשה"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[{ label: "נכס", key: "asset" }, { label: "מינוף", key: "leverage", type: "number" }, { label: "מרג'ין ($)", key: "margin_usd", type: "number" }, { label: "שווי פוזיציה ($)", key: "position_value_usd", type: "number" }, { label: "מחיר כניסה", key: "entry_price", type: "number" }, { label: "מחיר חיסול", key: "liquidation_price", type: "number" }, { label: "PnL ($)", key: "pnl_usd", type: "number" }, { label: "תאריך פתיחה", key: "opened_date", type: "date" }].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">כיוון</Label>
              <Select value={form.direction} onValueChange={v => setForm(p => ({ ...p, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Long">Long</SelectItem>
                  <SelectItem value="Short">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">סטטוס</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
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