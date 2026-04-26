import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";
import { usePrices } from "@/hooks/usePrices";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const COLORS = ["#f7931a", "#627eea", "#b6509e"];

const emptyForm = { name: "", initial_investment_usd: "", wallet: "", btc_amount: "", eth_amount: "", aave_amount: "", current_total_value_usd: "", notes: "" };

/**
 * crypto/InvestorsPage — on-chain crypto investors.
 *
 * Migrated to React Query (useEntityList / useEntityMutation). Hardcoded
 * BTC/ETH/AAVE prices replaced with the live priceMap from usePrices, so
 * the per-investor Current Value column updates automatically when prices
 * refresh through PriceHub.
 *
 * If a row has an explicit current_total_value_usd override (manually
 * entered), we honor it. Otherwise we compute total = (btc × BTC) +
 * (eth × ETH) + (aave × AAVE) using the live priceMap.
 */
export default function InvestorsPage() {
  const investorsQ = useEntityList("CryptoInvestor");
  const investors = investorsQ.data || [];
  const { priceMap } = usePrices();

  const createInvestor = useEntityMutation("CryptoInvestor", "create");
  const updateInvestor = useEntityMutation("CryptoInvestor", "update");
  const deleteInvestor = useEntityMutation("CryptoInvestor", "delete");

  const [dialog, setDialog] = useState(false);
  const [editInv, setEditInv] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const save = async () => {
    const data = {
      ...form,
      initial_investment_usd: parseFloat(form.initial_investment_usd) || null,
      btc_amount: parseFloat(form.btc_amount) || null,
      eth_amount: parseFloat(form.eth_amount) || null,
      aave_amount: parseFloat(form.aave_amount) || null,
      current_total_value_usd: parseFloat(form.current_total_value_usd) || null,
      last_updated: new Date().toISOString().split("T")[0],
    };
    if (editInv) await updateInvestor.mutateAsync({ id: editInv.id, data });
    else await createInvestor.mutateAsync(data);
    toast.success("Investor saved");
    setDialog(false);
  };

  const del = async (id) => {
    if (!confirm("Delete this investor?")) return;
    await deleteInvestor.mutateAsync(id);
    toast.success("Deleted");
  };

  const btcPrice = priceMap.BTC || 0;
  const ethPrice = priceMap.ETH || 0;
  const aavePrice = priceMap.AAVE || 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
          <h1 className="text-2xl font-bold">Investors</h1>
        </div>
        <Button onClick={() => { setEditInv(null); setForm(emptyForm); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Investor
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {investors.map((inv) => {
          const btcVal = (inv.btc_amount || 0) * btcPrice;
          const ethVal = (inv.eth_amount || 0) * ethPrice;
          const aaveVal = (inv.aave_amount || 0) * aavePrice;
          const total = inv.current_total_value_usd || (btcVal + ethVal + aaveVal);
          const initial = inv.initial_investment_usd || 0;
          const pnl = total - initial;
          const pnlPct = initial > 0 ? pnl / initial * 100 : 0;

          const pieData = [
            { name: "BTC", value: btcVal },
            { name: "ETH", value: ethVal },
            { name: "AAVE", value: aaveVal },
          ].filter((d) => d.value > 0);

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
                  <p className="text-xs text-muted-foreground">Current Value</p>
                  <p className="font-bold font-mono text-lg">{fmt(total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Initial Investment</p>
                  <p className="font-mono">{fmt(initial)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">P&L</p>
                  <p className={`font-mono font-semibold ${pnl >= 0 ? "text-profit" : "text-loss"}`}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Return</p>
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
                      <Tooltip formatter={(v) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1">
                    {[{ name: "BTC", amount: inv.btc_amount }, { name: "ETH", amount: inv.eth_amount }, { name: "AAVE", amount: inv.aave_amount }].filter((t) => t.amount).map((t, i) => (
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
        {investors.length === 0 && <p className="text-sm text-muted-foreground text-center py-10 col-span-3">No investors yet</p>}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editInv ? "Edit Investor" : "New Investor"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[{ label: "Name", key: "name" }, { label: "Initial Investment ($)", key: "initial_investment_usd", type: "number" }, { label: "Wallet", key: "wallet" }, { label: "BTC Amount", key: "btc_amount", type: "number" }, { label: "ETH Amount", key: "eth_amount", type: "number" }, { label: "AAVE Amount", key: "aave_amount", type: "number" }, { label: "Current Value ($)", key: "current_total_value_usd", type: "number" }, { label: "Notes", key: "notes" }].map((f) => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <Button className="w-full mt-2" onClick={save}>Save</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
