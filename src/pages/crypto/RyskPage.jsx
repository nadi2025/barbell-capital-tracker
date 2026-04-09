import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, Bell, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const fmt = (v) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtPct = (v) => v == null ? "—" : `${v.toFixed(2)}%`;

const ASSET_COLORS = {
  UETH: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-500" },
  UBTC: { bg: "bg-orange-500/15", text: "text-orange-400", dot: "bg-orange-500" },
};

const STATUS_COLORS = {
  Open: "bg-profit/10 text-profit border-profit/20",
  Closed: "bg-muted text-muted-foreground border-border",
  "Expired OTM": "bg-profit/10 text-profit border-profit/20",
  "Expired ITM": "bg-loss/10 text-loss border-loss/20",
  Exercised: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const emptyForm = {
  asset: "UETH", option_type: "Cash secured put", status: "Open",
  created_date: new Date().toISOString().split("T")[0],
  maturity_date: "", apr_percent: "", income_usd: "", size: "",
  notional_usd: "", current_price: "", maturity_price: "", target_price: "",
  outcome: "", wallet_id: "", notes: ""
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function MaturityBadge({ date }) {
  const days = daysUntil(date);
  if (days == null) return null;
  if (days < 0) return <span className="text-xs text-muted-foreground">Expired</span>;
  if (days <= 3) return (
    <span className="inline-flex items-center gap-1 text-xs text-loss font-semibold">
      <AlertTriangle className="w-3 h-3" /> {days}d
    </span>
  );
  if (days <= 7) return <span className="text-xs text-amber-400 font-medium">{days}d</span>;
  return <span className="text-xs text-muted-foreground">{days}d</span>;
}

export default function RyskPage() {
  const [positions, setPositions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [closingPos, setClosingPos] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [closeForm, setCloseForm] = useState({ status: "Expired OTM", maturity_price: "", outcome: "" });
  const [tab, setTab] = useState("positions");

  const load = async () => {
    const [pos, w] = await Promise.all([
      base44.entities.RyskPosition.list("-maturity_date"),
      base44.entities.CryptoWallet.list()
    ]);
    setPositions(pos);
    setWallets(w);
  };
  useEffect(() => { load(); }, []);

  // Alert for upcoming maturities
  useEffect(() => {
    if (!positions.length) return;
    const urgent = positions.filter(p => p.status === "Open" && daysUntil(p.maturity_date) !== null && daysUntil(p.maturity_date) <= 3);
    if (urgent.length > 0) {
      toast.warning(`${urgent.length} option(s) expire within 3 days!`, { duration: 6000 });
    }
  }, [positions]);

  const save = async () => {
    const data = {
      ...form,
      apr_percent: parseFloat(form.apr_percent) || null,
      income_usd: parseFloat(form.income_usd) || null,
      size: parseFloat(form.size) || null,
      notional_usd: parseFloat(form.notional_usd) || null,
      current_price: parseFloat(form.current_price) || null,
      maturity_price: parseFloat(form.maturity_price) || null,
      target_price: parseFloat(form.target_price) || null,
    };
    if (editPos) await base44.entities.RyskPosition.update(editPos.id, data);
    else await base44.entities.RyskPosition.create(data);
    toast.success("Position saved");
    setDialog(false);
    load();
  };

  const del = async (id) => {
    if (!confirm("Delete this position?")) return;
    await base44.entities.RyskPosition.delete(id);
    toast.success("Deleted");
    load();
  };

  // Close/expire a position and optionally update wallet assets
  const closePosition = async () => {
    const mPrice = parseFloat(closeForm.maturity_price) || null;
    await base44.entities.RyskPosition.update(closingPos.id, {
      status: closeForm.status,
      maturity_price: mPrice,
      outcome: closeForm.outcome,
    });

    // If exercised/ITM → update linked wallet crypto assets with income received
    if ((closeForm.status === "Expired ITM" || closeForm.status === "Exercised") && closingPos.wallet_id) {
      const assets = await base44.entities.CryptoAsset.filter({ wallet_id: closingPos.wallet_id, token: "USDC" });
      if (assets.length > 0) {
        const usdcAsset = assets[0];
        await base44.entities.CryptoAsset.update(usdcAsset.id, {
          amount: (usdcAsset.amount || 0) + (closingPos.income_usd || 0),
          current_value_usd: ((usdcAsset.amount || 0) + (closingPos.income_usd || 0)) * 1,
          last_updated: new Date().toISOString().split("T")[0],
        });
        toast.success(`Wallet updated: +${fmt(closingPos.income_usd)} USDC income added`);
      }
    }

    // Always log activity
    await base44.entities.CryptoActivityLog.create({
      date: new Date().toISOString().split("T")[0],
      action_type: "Trade",
      description: `Rysk ${closingPos.asset} ${closingPos.option_type} expired — ${closeForm.status}. Maturity: ${mPrice ? fmt(mPrice) : "—"}`,
      amount_usd: closingPos.income_usd || null,
      related_entity: `RyskPosition:${closingPos.id}`,
    });

    toast.success("Position closed & activity logged");
    setCloseDialog(false);
    load();
  };

  const openPositions = positions.filter(p => p.status === "Open");
  const closedPositions = positions.filter(p => p.status !== "Open");
  const totalNotional = openPositions.reduce((s, p) => s + (p.notional_usd || 0), 0);
  const totalIncome = openPositions.reduce((s, p) => s + (p.income_usd || 0), 0);

  const upcomingAlerts = openPositions
    .map(p => ({ ...p, days: daysUntil(p.maturity_date) }))
    .filter(p => p.days !== null && p.days <= 7)
    .sort((a, b) => a.days - b.days);

  const displayPositions = tab === "history" ? closedPositions : openPositions;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
          <h1 className="text-2xl font-bold">Rysk Finance Options</h1>
        </div>
        <Button onClick={() => { setEditPos(null); setForm(emptyForm); setDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Position
        </Button>
      </div>

      {/* Upcoming maturities alert */}
      {upcomingAlerts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">Upcoming Maturities</span>
          </div>
          <div className="space-y-1">
            {upcomingAlerts.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="font-mono">{p.asset} · {p.option_type} · Strike {fmt(p.target_price)}</span>
                <span className={p.days <= 3 ? "text-loss font-bold" : "text-amber-400"}>
                  {p.days === 0 ? "Today!" : p.days === 1 ? "Tomorrow!" : `${p.days} days`} · {p.maturity_date}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Open Notional</p>
          <p className="text-xl font-bold font-mono">{fmt(totalNotional)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Earned (open)</p>
          <p className="text-xl font-bold font-mono text-profit">{fmt(totalIncome)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Open Positions</p>
          <p className="text-xl font-bold font-mono">{openPositions.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: "positions", label: "Positions" },
          { key: "total", label: "Total View" },
          { key: "history", label: "History" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Positions Table */}
      {tab !== "total" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {tab === "positions" && (
            <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground font-semibold">
              Total: {fmt(totalNotional)}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3">Asset</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3">Maturity</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">APR</th>
                  <th className="text-right px-4 py-3">Income</th>
                  <th className="text-right px-4 py-3">Size</th>
                  <th className="text-right px-4 py-3">Notional</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {displayPositions.map(p => {
                  const c = ASSET_COLORS[p.asset] || {};
                  const days = daysUntil(p.maturity_date);
                  return (
                    <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 ${days !== null && days <= 3 && p.status === "Open" ? "bg-loss/3" : ""}`}>
                      <td className="px-4 py-3">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${c.bg}`}>
                          <span className={`w-2 h-2 rounded-full ${c.dot}`}></span>
                          <span className={`text-xs font-bold ${c.text}`}>{p.asset}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.option_type}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.created_date}</td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs">{p.maturity_date}</div>
                        {p.status === "Open" && <MaturityBadge date={p.maturity_date} />}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[p.status] || ""}`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-profit">{fmtPct(p.apr_percent)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmt(p.income_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {p.size != null ? `${p.size.toLocaleString()} 💲` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmt(p.notional_usd)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {p.status === "Open" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-profit" title="Close / Expire position"
                              onClick={() => { setClosingPos(p); setCloseForm({ status: "Expired OTM", maturity_price: "", outcome: "" }); setCloseDialog(true); }}>
                              <CheckCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditPos(p);
                            setForm({ asset: p.asset, option_type: p.option_type, status: p.status, created_date: p.created_date || "", maturity_date: p.maturity_date || "", apr_percent: p.apr_percent || "", income_usd: p.income_usd || "", size: p.size || "", notional_usd: p.notional_usd || "", current_price: p.current_price || "", maturity_price: p.maturity_price || "", target_price: p.target_price || "", outcome: p.outcome || "", wallet_id: p.wallet_id || "", notes: p.notes || "" });
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
                {displayPositions.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-8 text-muted-foreground text-sm">No positions</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Total View */}
      {tab === "total" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground font-semibold">
            Total Notional: {fmt(totalNotional)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3">Asset</th>
                  <th className="text-right px-4 py-3">APR</th>
                  <th className="text-right px-4 py-3">Income</th>
                  <th className="text-right px-4 py-3">Size</th>
                  <th className="text-right px-4 py-3">Notional</th>
                  <th className="text-right px-4 py-3">Current Price</th>
                  <th className="text-right px-4 py-3">Maturity Price</th>
                  <th className="text-right px-4 py-3">Target</th>
                  <th className="text-right px-4 py-3">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map(p => {
                  const c = ASSET_COLORS[p.asset] || {};
                  const atRisk = p.current_price && p.target_price && p.asset === "UETH" && p.current_price <= p.target_price;
                  const atRiskBtc = p.current_price && p.target_price && p.asset === "UBTC" && p.current_price <= p.target_price;
                  return (
                    <tr key={p.id} className={`border-b border-border/40 hover:bg-muted/20 ${atRisk || atRiskBtc ? "bg-loss/5" : ""}`}>
                      <td className="px-4 py-3">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${c.bg}`}>
                          <span className={`w-2 h-2 rounded-full ${c.dot}`}></span>
                          <span className={`text-xs font-bold ${c.text}`}>{p.asset}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-profit">{fmtPct(p.apr_percent)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmt(p.income_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.size != null ? `${p.size.toLocaleString()} 💲` : "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmt(p.notional_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmt(p.current_price)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.maturity_price ? fmt(p.maturity_price) : "—"}</td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${atRisk || atRiskBtc ? "text-loss font-bold" : ""}`}>{fmt(p.target_price)}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">{p.outcome || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  <SelectItem value="UETH">UETH</SelectItem>
                  <SelectItem value="UBTC">UBTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Type</Label>
              <Select value={form.option_type} onValueChange={v => setForm(p => ({ ...p, option_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash secured put">Cash secured put</SelectItem>
                  <SelectItem value="Covered call">Covered call</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {[
              { label: "Created Date", key: "created_date", type: "date" },
              { label: "Maturity Date", key: "maturity_date", type: "date" },
              { label: "APR (%)", key: "apr_percent", type: "number" },
              { label: "Income ($)", key: "income_usd", type: "number" },
              { label: "Size (USDC)", key: "size", type: "number" },
              { label: "Notional ($)", key: "notional_usd", type: "number" },
              { label: "Current Price", key: "current_price", type: "number" },
              { label: "Target / Strike", key: "target_price", type: "number" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">Linked Wallet (for auto-update)</Label>
              <Select value={form.wallet_id} onValueChange={v => setForm(p => ({ ...p, wallet_id: v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
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

      {/* Close / Expire Dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close Position</DialogTitle>
          </DialogHeader>
          {closingPos && (
            <div className="space-y-4 pt-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="font-semibold">{closingPos.asset} · {closingPos.option_type}</div>
                <div className="text-xs text-muted-foreground">Maturity: {closingPos.maturity_date} · Income: {fmt(closingPos.income_usd)}</div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Outcome</Label>
                <Select value={closeForm.status} onValueChange={v => setCloseForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Expired OTM">Expired OTM (premium kept ✓)</SelectItem>
                    <SelectItem value="Expired ITM">Expired ITM (assigned)</SelectItem>
                    <SelectItem value="Exercised">Exercised</SelectItem>
                    <SelectItem value="Closed">Closed early</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Maturity Price (optional)</Label>
                <Input type="number" value={closeForm.maturity_price} onChange={e => setCloseForm(p => ({ ...p, maturity_price: e.target.value }))} placeholder="e.g. 2150.86" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Outcome description (optional)</Label>
                <Input value={closeForm.outcome} onChange={e => setCloseForm(p => ({ ...p, outcome: e.target.value }))} placeholder="e.g. Get 900.00 USDC" />
              </div>
              {closingPos.wallet_id && (
                <p className="text-xs text-profit bg-profit/10 border border-profit/20 rounded-lg px-3 py-2">
                  ✓ Linked wallet will be automatically updated with income on ITM/Exercised outcomes.
                </p>
              )}
              <Button className="w-full" onClick={closePosition}>Confirm Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}