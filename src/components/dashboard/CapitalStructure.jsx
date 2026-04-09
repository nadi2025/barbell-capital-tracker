import { Building2, Landmark, TrendingDown } from "lucide-react";
import moment from "moment";

function calcExpectedTotalInterest(debt) {
  if (!debt.outstanding_balance || !debt.interest_rate_pct || !debt.maturity_date) return null;
  const yearsRemaining = moment(debt.maturity_date).diff(moment(), "days") / 365;
  if (yearsRemaining <= 0) return 0;
  return debt.outstanding_balance * (debt.interest_rate_pct / 100) * yearsRemaining;
}

export default function CapitalStructure({ debts, nav, totalDeposited }) {
  const activeDebts = debts.filter(d => d.status === "Active");
  const totalDebt = activeDebts.reduce((s, d) => s + (d.outstanding_balance || 0), 0);
  const equity = nav - totalDebt;
  const debtRatio = nav > 0 ? totalDebt / nav : 0;
  const equityRatio = 1 - debtRatio;

  const totalInterestPaid = debts.reduce((s, d) => s + (d.interest_paid_to_date || 0), 0);
  const totalExpectedInterest = activeDebts.reduce((s, d) => {
    const exp = calcExpectedTotalInterest(d);
    return s + (exp || 0);
  }, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-chart-4" />
        <h3 className="text-sm font-semibold">Capital Structure</h3>
      </div>

      {/* Bar */}
      <div className="flex rounded-lg overflow-hidden h-4 mb-3">
        <div
          className="bg-profit transition-all"
          style={{ width: `${Math.max(0, Math.min(100, equityRatio * 100)).toFixed(1)}%` }}
        />
        <div
          className="bg-loss transition-all"
          style={{ width: `${Math.max(0, Math.min(100, debtRatio * 100)).toFixed(1)}%` }}
        />
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-profit" />
          <span className="text-muted-foreground">Equity</span>
          <span className="font-mono font-medium text-foreground">{(equityRatio * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-loss" />
          <span className="text-muted-foreground">Debt</span>
          <span className="font-mono font-medium text-foreground">{(debtRatio * 100).toFixed(0)}%</span>
          <span className="font-mono text-loss">(${totalDebt.toLocaleString("en-US", { maximumFractionDigits: 0 })})</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-profit/10 border border-profit/20 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Equity (NAV − Debt)
          </p>
          <p className="text-lg font-bold text-profit font-mono">
            ${equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Deposited: ${totalDeposited.toLocaleString()}</p>
        </div>
        <div className="bg-loss/10 border border-loss/20 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Landmark className="w-3 h-3" /> Total Debt
          </p>
          <p className="text-lg font-bold text-loss font-mono">
            ${totalDebt.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{activeDebts.length} active facilit{activeDebts.length === 1 ? 'y' : 'ies'}</p>
        </div>
      </div>

      {/* Interest */}
      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="w-3.5 h-3.5 text-chart-3" />
          <span className="text-xs font-semibold">Interest</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Paid to Date</p>
            <p className="text-sm font-mono font-semibold text-chart-3">
              ${totalInterestPaid.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expected Remaining</p>
            <p className="text-sm font-mono font-semibold text-amber-400">
              ${totalExpectedInterest.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        {activeDebts.length > 0 && (
          <div className="mt-2 space-y-1">
            {activeDebts.map(d => {
              const annual = (d.outstanding_balance || 0) * (d.interest_rate_pct / 100);
              const remaining = calcExpectedTotalInterest(d);
              return (
                <div key={d.id} className="flex justify-between text-xs text-muted-foreground border-t border-border/40 pt-1">
                  <span>{d.name}</span>
                  <span className="font-mono">{d.interest_rate_pct}% · ${annual.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr
                    {remaining !== null && <span className="text-amber-400"> · ${remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} rem.</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {activeDebts.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">No active debt facilities. Add one in the Debt page.</p>
        )}
      </div>
    </div>
  );
}