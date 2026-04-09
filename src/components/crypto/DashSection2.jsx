// Section 2: Investor Debt & Interest Schedule
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function getQuarterDates(year) {
  return [
    { q: "Q1", label: "Q1 2026", start: `${year}-01-01`, end: `${year}-03-31`, month: "Mar" },
    { q: "Q2", label: "Q2 2026", start: `${year}-04-01`, end: `${year}-06-30`, month: "Jun" },
    { q: "Q3", label: "Q3 2026", start: `${year}-07-01`, end: `${year}-09-30`, month: "Sep" },
    { q: "Q4", label: "Q4 2026", start: `${year}-10-01`, end: `${year}-12-31`, month: "Dec" },
  ];
}

function QuarterBox({ quarter, payment, paidPayments, today }) {
  const quarterEnd = new Date(quarter.end);
  const isPast = quarterEnd < today;
  const paid = paidPayments.some(p => {
    const pd = new Date(p.payment_date);
    return pd >= new Date(quarter.start) && pd <= quarterEnd && p.status === "Paid";
  });
  const isNext = !paid && !isPast && paidPayments.filter(p => new Date(p.payment_date) >= today).length === 0;

  let bg, textColor, border, label;
  if (paid) {
    bg = "bg-emerald-50"; textColor = "text-emerald-700"; border = "border-emerald-200"; label = "✓ Paid";
  } else if (isPast) {
    bg = "bg-red-50"; textColor = "text-red-700"; border = "border-red-200"; label = "Overdue";
  } else {
    // find if this is the NEXT upcoming quarter
    const nowQ = Math.floor((today.getMonth()) / 3); // 0-indexed quarter
    const thisQ = ["Q1","Q2","Q3","Q4"].indexOf(quarter.q);
    const isUpcoming = thisQ === nowQ;
    if (isUpcoming) {
      bg = "bg-amber-50"; textColor = "text-amber-700"; border = "border-amber-300"; label = "Upcoming";
    } else {
      bg = "bg-muted/40"; textColor = "text-muted-foreground"; border = "border-border"; label = "Scheduled";
    }
  }

  return (
    <div className={`flex-1 min-w-[80px] border rounded-lg p-3 text-center ${bg} ${border}`}>
      <p className={`text-xs font-semibold ${textColor}`}>{quarter.q}</p>
      <p className={`text-sm font-bold font-mono mt-0.5 ${textColor}`}>{fmt(payment)}</p>
      <p className={`text-xs mt-0.5 ${textColor} opacity-80`}>{label}</p>
    </div>
  );
}

export default function DashSection2({ loans = [], interestPayments = [], onRefresh }) {
  const [addDialog, setAddDialog] = useState(false);
  const [form, setForm] = useState({ lender: "", principal_usd: "", annual_interest_rate: "", next_payment_date: "" });
  const [saving, setSaving] = useState(false);

  const investorLoans = loans.filter(l => l.loan_type === "Investor Debt" || !l.loan_type);
  const today = new Date();
  const year = today.getFullYear();
  const quarters = getQuarterDates(year);

  const annualTotal = investorLoans.reduce((s, l) => s + (l.principal_usd || 0) * (l.annual_interest_rate || 0), 0);
  const paidYTD = interestPayments
    .filter(p => p.status === "Paid" && p.payment_date?.startsWith(String(year)))
    .reduce((s, p) => s + (p.amount_usd || 0), 0);

  const save = async () => {
    setSaving(true);
    await base44.entities.CryptoLoan.create({
      ...form,
      loan_type: "Investor Debt",
      principal_usd: parseFloat(form.principal_usd) || 0,
      annual_interest_rate: parseFloat(form.annual_interest_rate) || 0,
      status: "Active",
    });
    toast.success("Investor added");
    setSaving(false);
    setAddDialog(false);
    onRefresh && onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">חוב ותשלומי ריבית למשקיעים</h2>
          <p className="text-xs text-muted-foreground">Investor Debt & Interest Payments</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <span className="text-profit font-mono font-medium">Paid YTD: {fmt(paidYTD)}</span>
          <span className="mx-2">·</span>
          <span>Annual: {fmt(annualTotal)}</span>
        </div>
      </div>

      {investorLoans.map(loan => {
        const qPayment = (loan.principal_usd || 0) * (loan.annual_interest_rate || 0) / 4;
        const loanPayments = interestPayments.filter(p => p.loan_id === loan.id || !p.loan_id);
        const annualLoan = (loan.principal_usd || 0) * (loan.annual_interest_rate || 0);
        const paidThisLoan = loanPayments.filter(p => p.status === "Paid" && p.payment_date?.startsWith(String(year))).reduce((s, p) => s + (p.amount_usd || 0), 0);

        return (
          <div key={loan.id} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {getInitials(loan.lender)}
                </div>
                <div>
                  <p className="font-semibold text-sm">{loan.lender}</p>
                  <p className="text-xs text-muted-foreground font-mono">{fmt(loan.principal_usd)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{((loan.annual_interest_rate || 0) * 100).toFixed(1)}% p.a.</p>
                <p className="text-sm font-mono font-semibold">{fmt(qPayment)} / quarter</p>
              </div>
            </div>

            {/* Quarterly timeline */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {quarters.map(q => (
                <QuarterBox key={q.q} quarter={q} payment={qPayment} paidPayments={loanPayments} today={today} />
              ))}
            </div>

            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span>Paid YTD: <span className="text-profit font-mono font-medium">{fmt(paidThisLoan)}</span></span>
              <span>Remaining: <span className="font-mono font-medium">{fmt(annualLoan - paidThisLoan)}</span></span>
              <span>Annual total: <span className="font-mono">{fmt(annualLoan)}</span></span>
            </div>
          </div>
        );
      })}

      {/* Add investor placeholder */}
      <button
        onClick={() => setAddDialog(true)}
        className="w-full border-2 border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Add investor
      </button>

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Investor Debt</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            {[
              { label: "Lender Name", key: "lender" },
              { label: "Principal ($)", key: "principal_usd", type: "number" },
              { label: "Annual Interest Rate (e.g. 0.07 for 7%)", key: "annual_interest_rate", type: "number" },
              { label: "Next Payment Date", key: "next_payment_date", type: "date" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Saving..." : "Add Investor"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}