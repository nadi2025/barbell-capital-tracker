import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useEntityMutation } from "@/hooks/useEntityQuery";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivateData } from "@/hooks/usePrivateData";
import { fmtCurrency, toUsd } from "@/lib/privateMath";
import PrivateInvestmentForm from "@/components/private/PrivateInvestmentForm";
import PrivateValuationDialog from "@/components/private/PrivateValuationDialog";

export default function PrivateInvestmentsPage() {
  const { data, isLoading } = usePrivateData();
  const queryClient = useQueryClient();
  const deleteInv = useEntityMutation("PrivateInvestment", "delete");

  const [formOpen, setFormOpen] = useState(false);
  const [editInv, setEditInv] = useState(null);
  const [valuationOpen, setValuationOpen] = useState(false);
  const [valuationFor, setValuationFor] = useState(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    return data.investments.filter((i) => {
      if (filterCategory !== "all" && i.category !== filterCategory) return false;
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (filterCurrency !== "all" && i.currency !== filterCurrency) return false;
      return true;
    });
  }, [data.investments, filterCategory, filterStatus, filterCurrency]);

  const handleDelete = async (inv) => {
    if (!confirm(`למחוק את "${inv.name}"? פעולה לא הפיכה.`)) return;
    await deleteInv.mutateAsync(inv.id);
    // Best-effort: also delete its valuation history. Failures are non-fatal.
    try {
      const valuations = (data.valuations || []).filter((v) => v.investment_id === inv.id);
      for (const v of valuations) {
        await base44.entities.PrivateInvestmentValuation.delete(v.id);
      }
    } catch (_) {}
    queryClient.invalidateQueries({ queryKey: ["entity", "PrivateInvestmentValuation"] });
    toast.success("השקעה נמחקה");
  };

  const valuationsForInvestment = (id) =>
    (data.valuations || [])
      .filter((v) => v.investment_id === id)
      .sort((a, b) => a.valuation_date.localeCompare(b.valuation_date))
      .map((v) => ({
        date: v.valuation_date,
        label: format(parseISO(v.valuation_date), "d.M.yy"),
        value: toUsd(v.value, v.currency),
      }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-purple-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 flex items-center gap-2 text-xs text-purple-300">
        <Lock className="w-4 h-4" />
        תיק פרטי — נפרד מהדשבורד הראשי
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">השקעות פרטיות</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} / {data.investments.length} השקעות
          </p>
        </div>
        <Button onClick={() => { setEditInv(null); setFormOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Investment
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="Real Estate">Real Estate</SelectItem>
            <SelectItem value="Venture Capital">Venture Capital</SelectItem>
            <SelectItem value="Internal Product">Internal Product</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Realized">Realized</SelectItem>
            <SelectItem value="Written Off">Written Off</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCurrency} onValueChange={setFilterCurrency}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Currency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="ILS">ILS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="w-8 px-2"></th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Funding</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Initial</th>
                <th className="text-right px-4 py-3 font-medium">Current</th>
                <th className="text-right px-4 py-3 font-medium">P&L</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                    אין השקעות — לחץ "Add Investment" כדי להתחיל
                  </td>
                </tr>
              ) : filtered.map((i) => {
                const initUsd = toUsd(i.initial_cost, i.currency);
                const valUsd = toUsd(i.current_value, i.currency);
                const pnl = valUsd - initUsd;
                const pnlPct = initUsd > 0 ? (pnl / initUsd) * 100 : 0;
                const expanded = expandedId === i.id;
                const series = expanded ? valuationsForInvestment(i.id) : [];
                return (
                  <>
                    <tr key={i.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-2">
                        <button onClick={() => setExpandedId(expanded ? null : i.id)} className="text-muted-foreground p-1">
                          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium">{i.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{i.category}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{i.funding_source}</td>
                      <td className="px-4 py-3 font-mono text-xs">{i.investment_date}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtCurrency(i.initial_cost, i.currency)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtCurrency(i.current_value, i.currency)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${pnl >= 0 ? "text-profit" : "text-loss"}`}>
                        {pnl >= 0 ? "+" : ""}{fmtCurrency(pnl, "USD")}
                        <div className="text-[10px] text-muted-foreground">{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          i.status === "Active" ? "bg-emerald-500/10 text-emerald-600"
                            : i.status === "Realized" ? "bg-blue-500/10 text-blue-600"
                              : "bg-red-500/10 text-red-600"
                        }`}>{i.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Update Valuation"
                            onClick={() => { setValuationFor(i); setValuationOpen(true); }}>
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit"
                            onClick={() => { setEditInv(i); setFormOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete"
                            onClick={() => handleDelete(i)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-muted/10">
                        <td colSpan={10} className="p-4">
                          <p className="text-xs font-semibold mb-2">Valuation history</p>
                          {series.length === 0 ? (
                            <p className="text-xs text-muted-foreground">אין היסטוריה — לחץ "Update Valuation" כדי להוסיף.</p>
                          ) : (
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={series}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                                  <XAxis dataKey="label" stroke="#94a3b8" style={{ fontSize: 11 }} />
                                  <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`} />
                                  <Tooltip formatter={(v) => [fmtCurrency(v, "USD"), "שווי"]} contentStyle={{ fontSize: 11 }} />
                                  <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                          {i.notes && <p className="text-xs text-muted-foreground mt-3 italic">{i.notes}</p>}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <PrivateInvestmentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editInvestment={editInv}
        onSaved={() => {}}
      />
      <PrivateValuationDialog
        open={valuationOpen}
        onClose={() => setValuationOpen(false)}
        investment={valuationFor}
        onSaved={() => {}}
      />
    </div>
  );
}
