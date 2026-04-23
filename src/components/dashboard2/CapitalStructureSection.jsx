import { Link } from "react-router-dom";
import { ArrowUpRight, Plus, Wallet, Landmark, PiggyBank } from "lucide-react";
import { calcDashboard, fmt } from "./dashboardCalcs";

/**
 * Capital Structure — the single source of truth for how much the business
 * holds, owes, and who put the capital in.
 *
 *   Assets  =  everything we hold (off-chain + on-chain)
 *   Debt    =  everything we owe, broken down by source
 *              (Investor loans, Aave leverage, Other facilities)
 *   Equity  =  Assets − Debt, compared to owner deposits
 *
 * Replaces the earlier aggregate KPI tiles that mixed investor debt with
 * portfolio returns and produced a confusing "total loss" number.
 */
export default function CapitalStructureSection({ data }) {
  const c = calcDashboard(data);

  // Debt sources
  const investorDebtOnChain = c.investorDebt; // from CryptoLoan entity (S&T)
  const aaveBorrow = c.aaveBorrowUsd;
  const otherDebt = c.totalOffChainDebt; // DebtFacility entries (banks / other loans)
  const totalDebt = investorDebtOnChain + aaveBorrow + otherDebt;

  // Own equity deposited via the Deposit entity (excludes investor loans)
  const ownDeposits = c.totalDeposited;

  // Net equity = Assets − all debt
  const netEquity = c.totalAssets - totalDebt;
  const effectivePnl = netEquity - ownDeposits;

  return (
    <div className="space-y-3">
      {/* Three-column hero: Assets | Debt | Equity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Assets */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              שווי נכסים
            </p>
            <Wallet className="w-4 h-4 text-muted-foreground/50" />
          </div>
          <p className="text-3xl font-bold font-mono leading-tight">{fmt(c.totalAssets)}</p>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Off-Chain (IB)</span>
              <span className="font-mono font-semibold">{fmt(c.ibNav)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">On-Chain (DeFi)</span>
              <span className="font-mono font-semibold">{fmt(c.cryptoTotalAssets)}</span>
            </div>
          </div>
        </div>

        {/* Debt breakdown */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              חוב חיצוני
            </p>
            <Landmark className="w-4 h-4 text-muted-foreground/50" />
          </div>
          <p className="text-3xl font-bold font-mono leading-tight text-loss">{fmt(totalDebt)}</p>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">משקיעים (S&T)</span>
              <span className="font-mono font-semibold">{fmt(investorDebtOnChain)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Aave (מינוף)</span>
              <span className="font-mono font-semibold">{fmt(aaveBorrow)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">אחר (הלוואות/בנקים)</span>
              <span className="font-mono font-semibold">{fmt(otherDebt)}</span>
            </div>
          </div>
          <Link to="/debt" className="mt-3 text-[11px] text-primary hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" /> הוסף / נהל חוב
          </Link>
        </div>

        {/* Owner Equity */}
        <div className={`border rounded-2xl p-5 ${netEquity >= 0 ? "bg-gradient-to-br from-emerald-500/5 to-emerald-500/0 border-emerald-500/20" : "bg-gradient-to-br from-red-500/5 to-red-500/0 border-red-500/20"}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              הון עצמי (Assets − Debt)
            </p>
            <PiggyBank className="w-4 h-4 text-muted-foreground/50" />
          </div>
          <p className={`text-3xl font-bold font-mono leading-tight ${netEquity >= 0 ? "text-profit" : "text-loss"}`}>
            {fmt(netEquity)}
          </p>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">הפקדות עצמיות</span>
              <span className="font-mono font-semibold">{fmt(ownDeposits)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">P&L אפקטיבי</span>
              <span className={`font-mono font-semibold ${effectivePnl >= 0 ? "text-profit" : "text-loss"}`}>
                {fmt(effectivePnl)}
              </span>
            </div>
            <Link to="/deposits" className="text-[11px] text-primary hover:underline flex items-center gap-1 pt-1">
              <ArrowUpRight className="w-3 h-3" /> פירוט הפקדות
            </Link>
          </div>
        </div>
      </div>

      {/* Secondary risk/activity metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Aave Health</p>
          </div>
          <p className={`text-xl font-bold font-mono ${c.healthFactor > 2 ? "text-profit" : c.healthFactor > 1.5 ? "text-amber-500" : c.healthFactor > 0 ? "text-loss" : ""}`}>
            {c.healthFactor > 0 ? c.healthFactor.toFixed(2) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {c.aaveBorrowUsd > 0 ? `Borrow ${fmt(c.aaveBorrowUsd, 0)}` : "ללא חוב"}
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
            פרמיה שנגבתה (IB)
          </p>
          <p className="text-xl font-bold font-mono text-profit">{fmt(c.premiumCollected, 0)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {c.openOptions.length} פתוחות · {c.closedOptions.length} סגורות
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
            HL Live P&L
          </p>
          <p className={`text-xl font-bold font-mono ${c.hlUnrealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
            {fmt(c.hlUnrealizedPnl, 0)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {data.leveraged?.length || 0} פוזיציות · Margin {fmt(c.totalMargin, 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
