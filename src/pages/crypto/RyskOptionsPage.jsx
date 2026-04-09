import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, Bell, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import moment from "moment";

const fmt = (v) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtBig = (v) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const ASSET_ICON = {
  UETH: "🔵",
  UBTC: "🟠",
  Other: "⚪",
};

const emptyForm = {
  asset: "UETH", option_type: "Cash secured put", created_date: "", maturity_date: "",
  status: "Open", apr_percent: "", income_usd: "", size_usdc: "", notional_usd: "",
  current_price: "", maturity_price: "", target_price: "", outcome: "", linked_wallet_id: "", notes: ""
};

export default function RyskOptionsPage() {
  const [positions, setPositions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState("positions");
  const [settleDialog, setSettleDialog] = useState(false);
  const [settlePos, setSettlePos] = useState(null);
  const [settleOutcome, setSettleOutcome] = useState("");
  const [settleMaturityPrice, setSettleMaturityPrice] = useState("");

  const load = async () => {
    const [pos, w] = await Promise.all([
      base44.entities.RyskPosition.list("-maturity_date"),
      base44.entities.CryptoWallet.list(),
    ]);
    setPositions(pos);
    setWallets(w);
  };

  useEffect(() => { load(); }, []);

  // Alert: positions maturing in ≤7 days
  const upcoming = positions.filter(p =>
    p.status === "Open" &&
    moment(p.maturity_date).diff(moment(), "days") <= 7 &&
    moment(p.maturity_date).diff(moment(), "days") >= 0
  );

  const save = async () => {
    const data = {
      ...form,
      apr_percent: parseFloat(form.apr_percent) || null,
      income_usd: parseFloat(form.income_usd) || null,
      size_usdc: parseFloat(form.size_usdc) || null,
      notional_usd: parseFloat(form.notional_usd) || null,
      current_price: parseFloat(form.current_price) || null,
      maturity_price: parseFloat(form.maturity_price) || null,
      target_price: parseFloat(form.target_price) || null,
    };
    if (editPos) await base44.entities.RyskPosition.update(editPos.id, data);
    else await base44.entities.RyskPosition.create(data);
    toast.success("Position saved"); setDialog(false); load();
  };

  const del = async (id) => {
    if (!confirm("Delete?")) return;
    await base44.entities.RyskPosition.delete(id);
    toast.success("Deleted"); load();
  };

  // Settle: mark closed + auto-update wallet if exercised
  const handleSettle = async () => {
    const matPrice = parseFloat(settleMaturityPrice) || null;
    const isExercised = settlePos.option_type === "Cash secured put"
      ? matPrice != null && settlePos.target_price != null && matPrice < settlePos.target_price
      : false;
    const outcome = settleOutcome || (isExercised ? `Get ${settlePos.size_usdc} USDC` : "Expired OTM");
    const status = isExercised ? "Exercised" : "Closed";

    await base44.entities.RyskPosition.update(settlePos.id, {
      status,
      maturity_price: matPrice,
      outcome,
    });

    // Auto-update wallet: if a wallet is linked and position is exercised, add USDC to wallet
    if (settlePos.linked_wallet_id && isExercised) {
      // Find existing USDC asset in wallet
      const assets = await base44.entities.CryptoAsset.filter({ wallet_id: settlePos.linked_wallet_id, token: "USDC" });
      const usdcAmount = settlePos.size_usdc || 0;
      if (assets.length > 0) {
        const existing = assets[0];
        const newAmount = (existing.amount || 0) + usdcAmount;
        await base44.entities.CryptoAsset.update(existing.id, {
          amount: newAmount,
          current_value_usd: newAmount * 1,
          last_updated: new Date().toISOString().split("T")[0],
        });
      } else {
        await base44.entities.CryptoAsset.create({
          wallet_id: settlePos.linked_wallet_id,
          wallet_name: wallets.find(w => w.id === settlePos.linked_wallet_id)?.name || "",
          token: "USDC",
          amount: usdcAmount,
          current_price_usd: 1,
          current_value_usd: usdcAmount,
          asset_category: "Stablecoin",
          last_updated: new Date().toISOString().split("T")[0],
        });
      }
      toast.success(`Position settled — ${usdcAmount} USDC added to wallet`);
    } else {
      toast.success(`Position settled as: ${outcome}`);
    }

    setSettleDialog(false); load();
  };

  const filtered = tab === "positions"
    ? positions.filter(p => p.status === "Open")
    : tab === "history"
    ? positions.filter(p => p.status !== "Open")
    : positions;

  const totalNotional = filtered.reduce((s, p) => s + (p.notional_usd || 0), 0);
  const totalIncome = positions.filter(p => p.status === "Open").reduce((s, p) => s + (p.income_usd || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
          <h1 className="text-2xl font-bold">Rysk Finance — Options</h1>
        </div>
        <Button onClick={() => { setEditPos(null); setForm(emptyForm); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Position
        </Button>
      </div>

      {/* Maturity Alerts */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          {upcoming.map(p => {
            const days = moment(p.maturity_date).diff(moment(), "days");
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-600 text-sm">
                <Bell className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{p.asset}</strong> {p.option_type} matures in <strong>{days} day{days !== 1 ? "s" : ""}</strong> — {moment(p.maturity_date).format("DD/MM/YYYY")}
                  {p.target_price && ` · Target: ${fmt(p.target_price)}`}
                </span>
                <Button size="sm" variant="outline" className="ml-auto h-6 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                  onClick={() => { setSettlePos(p); setSettleOutcome(""); setSettleMaturityPrice(""); setSettleDialog(true); }}>
                  Settle
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Notional (shown)</p>
          <p className="text-xl font-bold font-mono">{fmtBig(totalNotional)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Open Income</p>
          <p className="text-xl font-bold font-mono text-profit">{fmt(totalIncome)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Open Positions</p>
          <p className="text-xl font-bold font-mono">{positions.filter(p => p.status === "Open").length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {["positions", "total", "history"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3">Asset</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-left px-4 py-3">Maturity</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">APR</th>
                <th className="text-left px-4 py-3">Income</th>
                <th className="text-left px-4 py-3">Size (USDC)</th>
                <th className="text-left px-4 py-3">Notional</th>
                {tab !== "positions" && <th className="text-left px-4 py-3">Current Price</th>}
                {tab !== "positions" && <th className="text-left px-4 py-3">Maturity Price</th>}
                <th className="text-left px-4 py-3">Target</th>
                {tab === "history" && <th className="text-left px-4 py-3">Outcome</th>}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const daysLeft = moment(p.maturity_date).diff(moment(), "days");
                const isExpiringSoon = p.status === "Open" && daysLeft <= 7 && daysLeft >= 0;
                return (
                  <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 ${isExpiringSoon ? "bg-amber-500/5" : ""}`}>
                    <td className="px-4 py-3">
                      <span className="font-bold">{ASSET_ICON[p.asset] || "⚪"} {p.asset}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.option_type}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.created_date || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className={isExpiringSoon ? "text-amber-500 font-bold" : ""}>{p.maturity_date || "—"}</span>
                      {isExpiringSoon && <span className="ml-1 text-xs text-amber-500">({daysLeft}d)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                        ${p.status === "Open" ? "bg-profit/10 text-profit border-profit/20"
                          : p.status === "Exercised" ? "bg-chart-3/10 text-chart-3 border-chart-3/20"
                          : "bg-muted text-muted-foreground border-border"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">{p.apr_percent != null ? `${p.apr_percent.toFixed(2)}%` : "—"}</td>
                    <td className="px-4 py-3 font-mono text-profit">{fmt(p.income_usd)}</td>
                    <td className="px-4 py-3 font-mono">{p.size_usdc != null ? `${p.size_usdc.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-3 font-mono">{fmt(p.notional_usd)}</td>
                    {tab !== "positions" && <td className="px-4 py-3 font-mono">{fmt(p.current_price)}</td>}
                    {tab !== "positions" && <td className="px-4 py-3 font-mono">{fmt(p.maturity_price)}</td>}
                    <td className="px-4 py-3 font-mono">{fmt(p.target_price)}</td>
                    {tab === "history" && <td className="px-4 py-3 text-xs text-muted-foreground">{p.outcome || "—"}</td>}
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {p.status === "Open" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500" title="Settle position"
                            onClick={() => { setSettlePos(p); setSettleOutcome(""); setSettleMaturityPrice(""); setSettleDialog(true); }}>
                            <CheckCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => {
                            setEditPos(p);
                            setForm({
                              asset: p.asset, option_type: p.option_type, created_date: p.created_date || "",
                              maturity_date: p.maturity_date || "", status: p.status,
                              apr_percent: p.apr_percent || "", income_usd: p.income_usd || "",
                              size_usdc: p.size_usdc || "", notional_usd: p.notional_usd || "",
                              current_price: p.current_price || "", maturity_price: p.maturity_price || "",
                              target_price: p.target_price || "", outcome: p.outcome || "",
                              linked_wallet_id: p.linked_wallet_id || "", notes: p.notes || ""
                            });
                            setDialog(true);
                          }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="text-center py-8 text-muted-foreground text-sm">No positions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New/Edit Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editPos ? "Edit Position" : "New Rysk Position"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <Label className="text-xs mb-1 block">Asset</Label>
              <Select value={form.asset} onValueChange={v => setForm(p => ({ ...p, asset: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["UETH", "UBTC", "Other"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Option Type</Label>
              <Select value={form.option_type} onValueChange={v => setForm(p => ({ ...p, option_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Cash secured put", "Covered call", "Other"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {[
              { label: "Created Date", key: "created_date", type: "date" },
              { label: "Maturity Date", key: "maturity_date", type: "date" },
              { label: "APR (%)", key: "apr_percent", type: "number" },
              { label: "Income (USD)", key: "income_usd", type: "number" },
              { label: "Size (USDC)", key: "size_usdc", type: "number" },
              { label: "Notional (USD)", key: "notional_usd", type: "number" },
              { label: "Current Price", key: "current_price", type: "number" },
              { label: "Target Price", key: "target_price", type: "number" },
              { label: "Maturity Price", key: "maturity_price", type: "number" },
              { label: "Outcome", key: "outcome" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Open", "Closed", "Exercised"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Linked Wallet (for auto-update)</Label>
              <Select value={form.linked_wallet_id} onValueChange={v => setForm(p => ({ ...p, linked_wallet_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select wallet..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full mt-2" onClick={save}>Save</Button>
        </DialogContent>
      </Dialog>

      {/* Settle Dialog */}
      <Dialog open={settleDialog} onOpenChange={setSettleDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Settle Position</DialogTitle></DialogHeader>
          {settlePos && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Settling <strong>{settlePos.asset}</strong> {settlePos.option_type} · Target: <strong>{fmt(settlePos.target_price)}</strong>
              </p>
              <div>
                <Label className="text-xs mb-1 block">Maturity Price</Label>
                <Input type="number" value={settleMaturityPrice} onChange={e => setSettleMaturityPrice(e.target.value)} placeholder="e.g. 2150.86" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Outcome (optional — auto-calculated)</Label>
                <Input value={settleOutcome} onChange={e => setSettleOutcome(e.target.value)} placeholder={`e.g. Get ${settlePos.size_usdc} USDC`} />
              </div>
              {settlePos.linked_wallet_id && (
                <p className="text-xs text-profit bg-profit/5 border border-profit/20 rounded-lg px-3 py-2">
                  If exercised, <strong>{settlePos.size_usdc} USDC</strong> will be added automatically to the linked wallet.
                </p>
              )}
              <Button className="w-full" onClick={handleSettle}>Confirm Settle</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}