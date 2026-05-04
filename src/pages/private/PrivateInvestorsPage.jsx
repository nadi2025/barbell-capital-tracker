import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, DollarSign, Lock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { useEntityMutation } from "@/hooks/useEntityQuery";
import { usePrivateData } from "@/hooks/usePrivateData";
import { fmtCurrency, projectScheduledPayments } from "@/lib/privateMath";
import PrivateInvestorForm from "@/components/private/PrivateInvestorForm";
import PrivatePaymentDialog from "@/components/private/PrivatePaymentDialog";

export default function PrivateInvestorsPage() {
  const { data, isLoading } = usePrivateData();
  const deleteInvestor = useEntityMutation("PrivateDebtInvestor", "delete");

  const [formOpen, setFormOpen] = useState(false);
  const [editInvestor, setEditInvestor] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentFor, setPaymentFor] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const enriched = useMemo(() => {
    return data.investors.map((inv) => {
      const paid = data.payments.filter((p) => p.investor_id === inv.id && p.status === "Paid");
      const totalPaid = paid.reduce((s, p) => s + (p.amount || 0), 0);
      const projected = projectScheduledPayments(inv);
      const nextDate = projected.length ? projected[0].date : null;
      const daysToMaturity = inv.maturity_date
        ? differenceInDays(parseISO(inv.maturity_date), today)
        : null;
      return { ...inv, totalPaid, nextDate, daysToMaturity };
    });
  }, [data.investors, data.payments]);

  const handleDelete = async (inv) => {
    if (!confirm(`למחוק את "${inv.name}"? פעולה לא הפיכה.`)) return;
    await deleteInvestor.mutateAsync(inv.id);
    toast.success("משקיע נמחק");
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
        משקיעי חוב פרטיים — נפרדים מ־Off-Chain Investors הראשיים
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">משקיעי חוב פרטיים</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.investors.length} משקיעים · {data.investors.filter((i) => i.status === "Active").length} פעילים
          </p>
        </div>
        <Button onClick={() => { setEditInvestor(null); setFormOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Investor
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Linked Investment</th>
                <th className="text-right px-4 py-3 font-medium">Principal</th>
                <th className="text-right px-4 py-3 font-medium">Rate</th>
                <th className="text-left px-4 py-3 font-medium">Frequency</th>
                <th className="text-left px-4 py-3 font-medium">Maturity</th>
                <th className="text-right px-4 py-3 font-medium">Total Paid</th>
                <th className="text-left px-4 py-3 font-medium">Next Payment</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                    אין משקיעים — לחץ "Add Investor" כדי להתחיל
                  </td>
                </tr>
              ) : enriched.map((inv) => {
                const matured = inv.daysToMaturity != null && inv.daysToMaturity < 0;
                return (
                  <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{inv.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{inv.linked_investment_name || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtCurrency(inv.principal, inv.currency)}</td>
                    <td className="px-4 py-3 text-right font-mono">{inv.interest_rate?.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-xs">{inv.payment_frequency}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {inv.maturity_date}
                      {inv.daysToMaturity != null && (
                        <div className={`text-[10px] ${matured ? "text-red-400" : inv.daysToMaturity <= 90 ? "text-amber-400" : "text-muted-foreground"}`}>
                          {matured ? `פג ${Math.abs(inv.daysToMaturity)}d` : `${inv.daysToMaturity} ימים`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmtCurrency(inv.totalPaid, inv.currency)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {inv.nextDate
                        ? <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {inv.nextDate.toISOString().slice(0, 10)}</span>
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        inv.status === "Active" ? "bg-emerald-500/10 text-emerald-600"
                          : inv.status === "Repaid" ? "bg-blue-500/10 text-blue-600"
                            : "bg-red-500/10 text-red-600"
                      }`}>{inv.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Record Payment"
                          onClick={() => { setPaymentFor(inv); setPaymentOpen(true); }}>
                          <DollarSign className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit"
                          onClick={() => { setEditInvestor(inv); setFormOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete"
                          onClick={() => handleDelete(inv)}>
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

      <PrivateInvestorForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editInvestor={editInvestor}
        onSaved={() => {}}
      />
      <PrivatePaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        investor={paymentFor}
        editPayment={null}
        onSaved={() => {}}
      />
    </div>
  );
}
