import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import moment from "moment";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function CryptoDebtPage() {
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [lending, setLending] = useState([]);
  const [loanDialog, setLoanDialog] = useState(false);
  const [editLoan, setEditLoan] = useState(null);
  const [loanForm, setLoanForm] = useState({ lender: "", principal_usd: "", annual_interest_rate: "", next_payment_date: "", collateral_description: "", platform: "", borrow_power_used: "", status: "Active" });
  const [payDialog, setPayDialog] = useState(false);
  const [payForm, setPayForm] = useState({ payment_date: "", amount_usd: "", quarter: "", status: "Scheduled", notes: "", loan_id: "" });
  const [lendingDialog, setLendingDialog] = useState(false);
  const [editLending, setEditLending] = useState(null);
  const [lendingForm, setLendingForm] = useState({ borrower: "", amount_usd: "", interest_rate: "", maturity_date: "", notes: "", status: "Active" });

  const load = async () => {
    const [lo, pa, le] = await Promise.all([
      base44.entities.CryptoLoan.list(),
      base44.entities.InterestPayment.list("-payment_date"),
      base44.entities.CryptoLending.list(),
    ]);
    setLoans(lo); setPayments(pa); setLending(le);
  };
  useEffect(() => { load(); }, []);

  const saveLoan = async () => {
    const data = { ...loanForm, principal_usd: parseFloat(loanForm.principal_usd) || 0, annual_interest_rate: parseFloat(loanForm.annual_interest_rate) || 0, borrow_power_used: parseFloat(loanForm.borrow_power_used) || 0 };
    if (editLoan) await base44.entities.CryptoLoan.update(editLoan.id, data);
    else await base44.entities.CryptoLoan.create(data);
    toast.success("Loan saved"); setLoanDialog(false); load();
  };

  const savePay = async () => {
    const data = { ...payForm, amount_usd: parseFloat(payForm.amount_usd) || 0, loan_id: loans[0]?.id || "" };
    await base44.entities.InterestPayment.create(data);
    toast.success("Payment recorded"); setPayDialog(false); load();
  };

  const markPaid = async (pay) => {
    await base44.entities.InterestPayment.update(pay.id, { status: "Paid" });
    toast.success("Marked as paid"); load();
  };

  const saveLending = async () => {
    const data = { ...lendingForm, amount_usd: parseFloat(lendingForm.amount_usd) || 0, interest_rate: parseFloat(lendingForm.interest_rate) || null };
    if (editLending) await base44.entities.CryptoLending.update(editLending.id, data);
    else await base44.entities.CryptoLending.create(data);
    toast.success("Saved"); setLendingDialog(false); load();
  };

  const totalDebt = loans.filter(l => l.status === "Active").reduce((s, l) => s + (l.principal_usd || 0), 0);
  const totalLent = lending.filter(l => l.status === "Active").reduce((s, l) => s + (l.amount_usd || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-xs bg-orange-500/15 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium">On-Chain</span>
        <h1 className="text-2xl font-bold">Debt & Interest</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Active Debt</p>
          <p className="text-2xl font-bold font-mono text-loss">{fmt(totalDebt)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Lent Out</p>
          <p className="text-2xl font-bold font-mono text-chart-2">{fmt(totalLent)}</p>
        </div>
      </div>

      {/* Loans */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Loans Received</h2>
          <Button size="sm" onClick={() => { setEditLoan(null); setLoanForm({ lender: "", principal_usd: "", annual_interest_rate: "", next_payment_date: "", collateral_description: "", platform: "", borrow_power_used: "", status: "Active" }); setLoanDialog(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Loan
          </Button>
        </div>
        <div className="space-y-3">
          {loans.map(loan => (
            <div key={loan.id} className="border border-border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{loan.lender}</p>
                  <p className="text-xs text-muted-foreground">{loan.platform} · Collateral: {loan.collateral_description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${loan.status === "Active" ? "bg-loss/10 text-loss border-loss/20" : "bg-muted text-muted-foreground border-border"}`}>{loan.status}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditLoan(loan); setLoanForm({ lender: loan.lender, principal_usd: loan.principal_usd, annual_interest_rate: loan.annual_interest_rate, next_payment_date: loan.next_payment_date || "", collateral_description: loan.collateral_description || "", platform: loan.platform || "", borrow_power_used: loan.borrow_power_used || "", status: loan.status }); setLoanDialog(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div><p className="text-xs text-muted-foreground">Principal</p><p className="font-mono font-bold text-loss">{fmt(loan.principal_usd)}</p></div>
                <div><p className="text-xs text-muted-foreground">Annual Rate</p><p className="font-mono">{((loan.annual_interest_rate || 0) * 100).toFixed(0)}%</p></div>
                <div><p className="text-xs text-muted-foreground">Quarterly Payment</p><p className="font-mono">{fmt((loan.principal_usd || 0) * (loan.annual_interest_rate || 0) / 4)}</p></div>
              </div>
              {loan.borrow_power_used > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Borrow Power Used</span>
                    <span className={loan.borrow_power_used > 0.7 ? "text-loss font-bold" : "text-foreground"}>{((loan.borrow_power_used || 0) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${loan.borrow_power_used > 0.7 ? "bg-loss" : "bg-profit"}`} style={{ width: `${Math.min(100, loan.borrow_power_used * 100)}%` }} />
                  </div>
                </div>
              )}
              {loan.next_payment_date && (
                <p className="text-xs text-muted-foreground mt-2">
                  Next payment: <span className={moment(loan.next_payment_date).diff(moment(), "days") <= 30 ? "text-amber-500 font-semibold" : ""}>{moment(loan.next_payment_date).format("DD/MM/YYYY")} (in {moment(loan.next_payment_date).diff(moment(), "days")} days)</span>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Interest Payments */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Interest Payments</h2>
          <Button size="sm" onClick={() => { setPayForm({ payment_date: "", amount_usd: "", quarter: "", status: "Scheduled", notes: "" }); setPayDialog(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Payment
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left pb-2">Date</th>
                <th className="text-left pb-2">Quarter</th>
                <th className="text-left pb-2">Amount</th>
                <th className="text-left pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="py-2 font-mono">{p.payment_date}</td>
                  <td className="py-2 text-xs">{p.quarter}</td>
                  <td className="py-2 font-mono">{fmt(p.amount_usd)}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${p.status === "Paid" ? "bg-profit/10 text-profit border-profit/20" : p.status === "Overdue" ? "bg-loss/10 text-loss border-loss/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}>{p.status}</span>
                  </td>
                  <td className="py-2 text-right">
                    {p.status !== "Paid" && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => markPaid(p)}>
                        <CheckCircle className="w-3 h-3" /> Mark Paid
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No payments recorded</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lending */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Loans Given</h2>
          <Button size="sm" onClick={() => { setEditLending(null); setLendingForm({ borrower: "", amount_usd: "", interest_rate: "", maturity_date: "", notes: "", status: "Active" }); setLendingDialog(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Loan
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left pb-2">Borrower</th>
                <th className="text-left pb-2">Amount</th>
                <th className="text-left pb-2">Maturity</th>
                <th className="text-left pb-2">Notes</th>
                <th className="text-left pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {lending.map(l => (
                <tr key={l.id} className="border-b border-border/40">
                  <td className="py-2 font-semibold">{l.borrower}</td>
                  <td className="py-2 font-mono">{fmt(l.amount_usd)}</td>
                  <td className="py-2 text-xs">{l.maturity_date || "—"}</td>
                  <td className="py-2 text-xs text-muted-foreground">{l.notes || "—"}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${l.status === "Active" ? "bg-chart-2/10 text-chart-2 border-chart-2/20" : "bg-muted text-muted-foreground border-border"}`}>{l.status}</span>
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditLending(l); setLendingForm({ borrower: l.borrower, amount_usd: l.amount_usd, interest_rate: l.interest_rate || "", maturity_date: l.maturity_date || "", notes: l.notes || "", status: l.status }); setLendingDialog(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Loan Dialog */}
      <Dialog open={loanDialog} onOpenChange={setLoanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editLoan ? "Edit Loan" : "New Loan"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[{ label: "Lender", key: "lender" }, { label: "Principal ($)", key: "principal_usd", type: "number" }, { label: "Annual Rate (0.08=8%)", key: "annual_interest_rate", type: "number" }, { label: "Next Payment Date", key: "next_payment_date", type: "date" }, { label: "Platform", key: "platform" }, { label: "Collateral", key: "collateral_description" }, { label: "Borrow Power Used (0-1)", key: "borrow_power_used", type: "number" }].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={loanForm[f.key]} onChange={e => setLoanForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={loanForm.status} onValueChange={v => setLoanForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Paid Off">Paid Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full mt-2" onClick={saveLoan}>Save</Button>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Interest Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            {[{ label: "Date", key: "payment_date", type: "date" }, { label: "Amount ($)", key: "amount_usd", type: "number" }, { label: "Quarter (e.g. Q1 2026)", key: "quarter" }, { label: "Notes", key: "notes" }].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={payForm[f.key]} onChange={e => setPayForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <Select value={payForm.status} onValueChange={v => setPayForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={savePay}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lending Dialog */}
      <Dialog open={lendingDialog} onOpenChange={setLendingDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editLending ? "Edit" : "New Loan Given"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            {[{ label: "Borrower", key: "borrower" }, { label: "Amount ($)", key: "amount_usd", type: "number" }, { label: "Interest Rate", key: "interest_rate", type: "number" }, { label: "Maturity Date", key: "maturity_date", type: "date" }, { label: "Notes", key: "notes" }].map(f => (
              <div key={f.key}>
                <Label className="text-xs mb-1 block">{f.label}</Label>
                <Input type={f.type || "text"} value={lendingForm[f.key]} onChange={e => setLendingForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <Select value={lendingForm.status} onValueChange={v => setLendingForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Repaid">Repaid</SelectItem>
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={saveLending}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}