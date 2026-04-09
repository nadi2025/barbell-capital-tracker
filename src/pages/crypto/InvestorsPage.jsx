import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const COLORS = ["#f7931a", "#627eea", "#b6509e"];

const emptyForm = { name: "", initial_investment_usd: "", wallet: "", btc_amount: "", eth_amount: "", aave_amount: "", current_total_value_usd: "", notes: "" };

export default function InvestorsPage() {
  const [investors, setInvestors] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [editInv, setEditInv] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => setInvestors(await base44.entities.CryptoInvestor.list());
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data = { ...form, initial_investment_usd: parseFloat(form.initial_investment_usd) || null, btc_amount: parseFloat(form.btc_amount) || null, eth_amount: parseFloat(form.eth_amount) || null, aave_amount: parseFloat(form.aave_amount) || null, current_total_value_usd: parseFloat(form.current_total_value_usd) || null, last_updated: new Date().toISOString().split("T")[0] };
    if (editInv) await base44.entities.CryptoInvestor.update(editInv.id, data);
    else await base44.entities.CryptoInvestor.create(data);
    toast.success("משקיע נשמר"); setDialog(false); load();
  };

  const del = async (id) => {
    if (!confirm("למחוק משקיע?")) return;
    await base44.entities.CryptoInvestor.delete(id);
    toast.success("נמחק"); load();
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
          <h1 className="text-2xl font-bold">משקיעים</h1>
        </div>
        <Button onClick={() => { setEditInv(null); setForm(emptyForm); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> משקיע חדש
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {investors.map(inv => {
          const btcVal = (inv.btc_amount || 0) * 70794;
          const ethVal = (inv.eth_amount || 0) * 2165;
          const aaveVal = (inv.aave_amount || 0) * 177;
          const total = inv.current_total_value_usd || (btcVal + ethVal + aaveVal);
          const initial = inv.initial_investment_usd || 0;
          const pnl = total - initial;
          const pnlPct = initial > 0 ? pnl / initial * 100 : 0;

          const pieData = [
            { name: "BTC", value: btcVal },
            { name: "ETH", value: ethVal },
            { name: "AAVE", value: aaveVal },
          ].filter(d => d.value > 0);

          return (
            <div key={inv.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold">{inv.name?.[0]}</div>
                  <div>
                    <p className="font-bold">{inv.name}</p>
                    <p className="text-xs text-muted-foreground">{inv.wallet}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditInv(inv); setForm({ name: inv.name, initial_investment_usd: inv.initial_investment_usd || "", wallet: inv.wallet || "", btc_amount: inv.btc_amount || "", eth_amount: inv.eth_amount || "", aave_amount: inv.aave_amount || "", current_total_value_usd: inv.current_total_value_usd || "", notes: inv.notes || "" }); setDialog(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del(inv.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">שווי נוכחי</p>
                  <p className="font-bold font-mono text-lg">{fmt(total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">השקעה ראשונית</p>
                  <p className="font-mono">{fmt(initial)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">רווח/הפסד</p>
                  <p className={`font-mono font-semibold ${pnl >= 0 ? "text-profit" : "text-loss"}`}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">תשואה</p>
                  <p className={`font-mono font-semibold ${pnlPct >= 0 ? "text-profit" : "text-loss"}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%</p>
                </div>
              </div>

              {pieData.length > 0 && (
                <div className="flex items-center gap-3">
                  <ResponsiveContainer width="50%" height={80}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={20} outerRadius={35} dataKey="value">
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                      </Pie>
                      <Tooltip formatter={v => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1">
                    {[{ name: "BTC", amount: inv.btc_amount }, { name: "ETH", amount: inv.eth_amount }, { name: "AAVE", amount: inv.aave_amount }].filter(t => t.amount).map((t, i) => (
                      <div key={t.name} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                        <span className="text-muted-foreground">{t.name}</span>
                        <span className="font-mono">{t.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {investors.length === 0 && <p className="text-sm text-muted-foreground text-center py-10 col-span-3">אין משקיעים עדיין</p>}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>{editInv ? "עריכת משקיע" : "משקיע חדש"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[{ label: "שם", key: "name" }, { label: "השקעה ראשונית ($)", key: "initial_investment_usd", type: "number" }, { label: "ארנק", key: "wallet" }, { label: "BTC כמות", key: "btc_amount", type: "number" }, { label: "ETH כמות", key: "eth_amount", type: "number" }, { label: "AAVE כמות", key: "aave_amount", type: "number" }, { label: "שווי נוכחי ($)", key: "current_total_value_usd", type: "number" }, { label: "הערות", key: "notes" }].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <Button className="w-full mt-2" onClick={save}>שמור</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}