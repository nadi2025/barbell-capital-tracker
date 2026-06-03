import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Phone, Calendar, DollarSign, Percent, Link2, FileText, Tag } from "lucide-react";
import { fmtCurrency, projectScheduledPayments } from "@/lib/privateMath";
import { differenceInDays, parseISO } from "date-fns";

const Row = ({ icon: Icon, label, value, mono = false }) => {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-sm ${mono ? "font-mono" : ""} break-words`}>{value}</div>
      </div>
    </div>
  );
};

export default function PrivateInvestorDetailsDialog({ open, onClose, investor, payments = [] }) {
  if (!investor) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToMaturity = investor.maturity_date
    ? differenceInDays(parseISO(investor.maturity_date), today)
    : null;

  const myPayments = payments.filter((p) => p.investor_id === investor.id);
  const totalPaid = myPayments.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);
  const projected = projectScheduledPayments(investor);
  const projectedTotal = projected.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2 flex-wrap">
            <span>{investor.name}</span>
            {investor.name_en && (
              <span className="text-sm text-muted-foreground font-normal">{investor.name_en}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 mt-2 mb-3">
          <div className="bg-muted/30 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Principal</div>
            <div className="font-mono text-sm font-medium">{fmtCurrency(investor.principal, investor.currency)}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Rate</div>
            <div className="font-mono text-sm font-medium">{investor.interest_rate}%</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Days to Maturity</div>
            <div className="font-mono text-sm font-medium">
              {daysToMaturity != null ? `${daysToMaturity}d` : "—"}
            </div>
          </div>
        </div>

        <div className="space-y-0">
          <Row icon={Mail} label="Email" value={investor.email} />
          <Row icon={Phone} label="Phone" value={investor.phone} mono />
          <Row icon={Calendar} label="Start Date" value={investor.start_date} mono />
          <Row icon={Calendar} label="Maturity Date" value={investor.maturity_date} mono />
          <Row icon={Percent} label="Interest Type" value={`${investor.interest_type || "Simple"}${investor.interest_type === "Compound" ? ` · ${investor.compound_frequency || "Annual"}` : ""}`} />
          <Row icon={DollarSign} label="Payment Frequency" value={investor.payment_frequency} />
          <Row icon={Tag} label="Status" value={investor.status} />
          <Row icon={Link2} label="Linked Investment" value={investor.linked_investment_name} />
          {investor.fx_rate_at_conversion && (
            <Row icon={DollarSign} label="FX at Conversion" value={investor.fx_rate_at_conversion} mono />
          )}
          <Row icon={FileText} label="Notes" value={investor.notes} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-border">
          <div className="bg-muted/30 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Total Paid ({myPayments.filter((p) => p.status === "Paid").length} payments)</div>
            <div className="font-mono text-sm font-medium">{fmtCurrency(totalPaid, investor.currency)}</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Projected Interest</div>
            <div className="font-mono text-sm font-medium text-emerald-600">{fmtCurrency(projectedTotal, investor.currency)}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}