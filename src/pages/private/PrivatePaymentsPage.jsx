import { useState, useMemo } from "react";
import { Pencil, Trash2, CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseISO, isAfter, isBefore } from "date-fns";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useEntityMutation } from "@/hooks/useEntityQuery";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivateData } from "@/hooks/usePrivateData";
import { fmtCurrency, toUsd } from "@/lib/privateMath";
import PrivateKpiCard from "@/components/private/PrivateKpiCard";
import PrivatePaymentDialog from "@/components/private/PrivatePaymentDialog";

export default function PrivatePaymentsPage() {
  const { data, isLoading } = usePrivateData();
  const queryClient = useQueryClient();
  const deletePayment = useEntityMutation("PrivateInterestPayment", "delete");

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterInvestor, setFilterInvestor] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editPayment, setEditPayment] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ninetyDaysOut = new Date(today);
  ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

  const filtered = useMemo(() => {
    return data.payments.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterInvestor !== "all" && p.investor_id !== filterInvestor) return false;
      if (dateFrom && p.payment_date < dateFrom) return false;
      if (dateTo && p.payment_date > dateTo) return false;
      return true;
    });
  }, [data.payments, filterStatus, filterInvestor, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const ytdYear = today.getFullYear();
    const totalPaidYtd = data.payments
      .filter((p) => p.status === "Paid" && p.payment_date && parseISO(p.payment_date).getFullYear() === ytdYear)
      .reduce((s, p) => s + toUsd(p.amount, p.currency), 0);
    const totalScheduled90d = data.payments
      .filter((p) => p.status === "Scheduled" && p.payment_date)
      .filter((p) => {
        const d = parseISO(p.payment_date);
        return !isAfter(d, ninetyDaysOut) && !isBefore(d, today);
      })
      .reduce((s, p) => s + toUsd(p.amount, p.currency), 0);
    const totalOverdue = data.payments
      .filter((p) => p.status === "Scheduled" && p.payment_date && isBefore(parseISO(p.payment_date), today))
      .reduce((s, p) => s + toUsd(p.amount, p.currency), 0);
    return { totalPaidYtd, totalScheduled90d, totalOverdue };
  }, [data.payments]);

  const investorOptions = useMemo(
    () => data.investors.map((i) => ({ value: i.id, label: i.name })),
    [data.investors],
  );

  const handleMarkPaid = async (p) => {
    await base44.entities.PrivateInterestPayment.update(p.id, { status: "Paid" });
    queryClient.invalidateQueries({ queryKey: ["entity", "PrivateInterestPayment"] });
    toast.success("סומן כשולם");
  };

  const handleDelete = async (p) => {
    if (!confirm(`למחוק תשלום של ${fmtCurrency(p.amount, p.currency)} למ${p.investor_name}?`)) return;
    await deletePayment.mutateAsync(p.id);
    toast.success("תשלום נמחק");
  };

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
        תשלומי ריבית למשקיעי חוב פרטיים — נפרדים מהחוב הראשי
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">תשלומי ריבית פרטיים</h1>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} / {data.payments.length} תשלומים</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <PrivateKpiCard label="שולם השנה (YTD)" value={fmtCurrency(kpis.totalPaidYtd, "USD")} />
        <PrivateKpiCard
          label="מתוזמן (90 יום)"
          value={fmtCurrency(kpis.totalScheduled90d, "USD")}
          accent={kpis.totalScheduled90d > 0 ? "text-amber-400" : ""}
        />
        <PrivateKpiCard
          label="באיחור"
          value={fmtCurrency(kpis.totalOverdue, "USD")}
          accent={kpis.totalOverdue > 0 ? "text-loss" : ""}
        />
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterInvestor} onValueChange={setFilterInvestor}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Investor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Investors</SelectItem>
            {investorOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Investor</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Period</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">אין תשלומים</td>
                </tr>
              ) : filtered
                .slice()
                .sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || ""))
                .map((p) => {
                  const overdue = p.status === "Scheduled" && p.payment_date && isBefore(parseISO(p.payment_date), today);
                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.investor_name || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.payment_date}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtCurrency(p.amount, p.currency)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.period_covered || "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          p.status === "Paid" ? "bg-emerald-500/10 text-emerald-600"
                            : overdue ? "bg-red-500/10 text-red-600"
                              : "bg-amber-500/10 text-amber-600"
                        }`}>
                          {overdue ? "Overdue" : p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {p.status === "Scheduled" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Mark as Paid"
                              onClick={() => handleMarkPaid(p)}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit"
                            onClick={() => { setEditPayment(p); setEditOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete"
                            onClick={() => handleDelete(p)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <PrivatePaymentDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        investor={data.investors.find((i) => i.id === editPayment?.investor_id) || null}
        editPayment={editPayment}
        onSaved={() => {}}
      />
    </div>
  );
}
