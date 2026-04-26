import { useState } from "react";
import { Plus, Users, TrendingDown, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MonthlyInvestorCard from "@/components/offchain/MonthlyInvestorCard";
import MaturityInvestorCard from "@/components/offchain/MaturityInvestorCard";
import RecordPaymentDialog from "@/components/offchain/RecordPaymentDialog";
import AddInvestorDialog from "@/components/offchain/AddInvestorDialog";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";

const fmtUSD = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

function SummaryCard({ icon: Icon, label, value, sub, valueClass = "" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function OffChainInvestorsPage() {
  const investorsQ = useEntityList("OffChainInvestor", { sort: "-start_date" });
  const paymentsQ = useEntityList("InvestorPayment", { sort: "-payment_date", limit: 500 });
  const investors = investorsQ.data || [];
  const payments = paymentsQ.data || [];
  const loading = investorsQ.isLoading || paymentsQ.isLoading;

  const createInvestor = useEntityMutation("OffChainInvestor", "create");
  const updateInvestor = useEntityMutation("OffChainInvestor", "update");
  const createPayment = useEntityMutation("InvestorPayment", "create");
  const createActivityLog = useEntityMutation("CryptoActivityLog", "create");

  const [recordTarget, setRecordTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const getPayments = (investorId) => payments.filter((p) => p.investor_id === investorId);

  // KPIs
  const totalCapital = investors.reduce((s, i) => s + (i.principal_usd || 0), 0);
  const annualObligation = investors.reduce((s, i) => s + (i.principal_usd * i.interest_rate / 100), 0);
  const monthlyObligation = investors.filter(i => i.interest_schedule === "Monthly").reduce((s, i) => s + (i.monthly_payment || i.principal_usd * i.interest_rate / 100 / 12), 0);
  const accruingAnnual = investors.filter(i => i.interest_schedule === "At Maturity").reduce((s, i) => s + (i.principal_usd * i.interest_rate / 100), 0);

  const interestPaidToDate = investors.reduce((sum, inv) => {
    if (inv.interest_schedule === "Monthly") {
      const invPayments = getPayments(inv.id);
      const monthly = inv.monthly_payment || inv.principal_usd * inv.interest_rate / 100 / 12;
      return sum + invPayments.length * monthly;
    }
    return sum;
  }, 0);

  const elinor = investors.find(i => i.interest_schedule === "Monthly");
  const elinorPayments = elinor ? getPayments(elinor.id).length : 0;

  const handleRecordPayment = async (data) => {
    await createPayment.mutateAsync(data);
    await createActivityLog.mutateAsync({
      date: data.payment_date,
      action_type: "Interest Payment",
      description: `Paid ${fmtUSD(data.amount)} interest to ${data.investor_name} (${data.payment_date})`,
      amount_usd: data.amount,
    });
    toast.success(`Payment of ${fmtUSD(data.amount)} recorded`);
    setRecordTarget(null);
  };

  const handleAdd = async (data) => {
    await createInvestor.mutateAsync(data);
    setShowAdd(false);
    toast.success("Investor added");
  };

  const handleEdit = async (data) => {
    await updateInvestor.mutateAsync({ id: editTarget.id, data });
    setEditTarget(null);
    toast.success("Investor updated");
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Off-Chain Investors</h1>
          <p className="text-xs text-muted-foreground mt-0.5">ניהול חוב למשקיעים — Interactive Brokers & Leumi Notes</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף משקיע
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          icon={Users}
          label="סה״כ גיוס הון (Off-Chain)"
          value={fmtUSD(totalCapital)}
          sub={`${investors.length} investors`}
        />
        <SummaryCard
          icon={TrendingDown}
          label="חובת ריבית שנתית"
          value={fmtUSD(annualObligation)}
          valueClass="text-orange-500"
          sub={`Monthly: ${fmtUSD(monthlyObligation)} · Accruing: ${fmtUSD(accruingAnnual)}/year`}
        />
        <SummaryCard
          icon={DollarSign}
          label="ריבית ששולמה עד היום"
          value={fmtUSD(interestPaidToDate)}
          valueClass="text-emerald-500"
          sub={elinorPayments > 0 ? `Elinor: ${elinorPayments} monthly payments` : "No payments recorded yet"}
        />
      </div>

      {/* Investor cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {investors.map(investor => (
          investor.interest_schedule === "Monthly"
            ? <MonthlyInvestorCard
                key={investor.id}
                investor={investor}
                payments={getPayments(investor.id)}
                onRecordPayment={setRecordTarget}
                onEdit={setEditTarget}
              />
            : <MaturityInvestorCard
                key={investor.id}
                investor={investor}
                onEdit={setEditTarget}
              />
        ))}
        {investors.length === 0 && (
          <div className="col-span-2 text-center py-16 text-muted-foreground text-sm">
            אין משקיעים רשומים. לחץ "הוסף משקיע" להוספה.
          </div>
        )}
      </div>

      {/* Dialogs */}
      <RecordPaymentDialog
        open={!!recordTarget}
        investor={recordTarget}
        paymentsCount={recordTarget ? getPayments(recordTarget.id).length : 0}
        onClose={() => setRecordTarget(null)}
        onSave={handleRecordPayment}
      />
      <AddInvestorDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleAdd}
      />
      <AddInvestorDialog
        open={!!editTarget}
        initialData={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleEdit}
      />
    </div>
  );
}