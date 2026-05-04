import { Link } from "react-router-dom";
import { ArrowUpRight, Plus, Wallet, Landmark, TrendingUp, TrendingDown } from "lucide-react";
import { calcDashboard, fmt } from "./dashboardCalcs";

/**
 * Capital Structure — three hero tiles answering:
 *
 *   1. שווי נכסים  (Assets)         — what we hold today (off-chain + on-chain)
 *   2. מקורות הון  (Capital Sources) — WHERE the money came from:
 *                                       · הון עצמי        (Deposit entity)
 *                                       · חוב Off-Chain   (DebtFacility)
 *                                       · חוב On-Chain    (CryptoLoan / S&T)
 *                                       · מינוף Aave      (calculateAavePosition)
 *   3. P&L כולל   (Total P&L)       — difference between assets and capital, split:
 *                                       · Off-Chain = ibNav − (ownEquity + offDebt)
 *                                       · On-Chain  = cryptoAssets − (onDebt + Aave)
 *
 * Below the heroes we keep the risk/activity strip (Aave HF · Premium · HL P&L).
 *
 * Assumption for the P&L split: off-chain capital funds the IB account and
 * on-chain capital funds the DeFi side. If the user has cases where funds
 * crossed between sides, the totals are still correct — only the per-side
 * split is approximate.
 */
export default function CapitalStructureSection({ data }) {
  const c = calcDashboard(data);

  // ── Capital sources ──
  // Own equity = Deposit rows flagged as "Equity Investment" / "Equity Cash Flow".
  // Off-chain debt = OffChainInvestor (private investors) + DebtFacility (banks).
  const ownEquity = c.ownEquity;
  const offChainDebt = c.totalOffChainDebt;
  const onChainDebt = c.investorDebt;              // CryptoLoan (active, S&T)
  const aaveLeverage = c.aaveBorrowUsd;            // from calculateAavePosition
  const totalCapital = ownEquity + offChainDebt + onChainDebt + aaveLeverage;

  // Sanity check: if Deposit ledger has "Debt Investment" flows that don't
  // match the OffChainInvestor total, flag a reconcile gap.
  const depositDebtGap = c.debtFundedDeposits - c.offChainInvestorDebt;

  // ── P&L split — capital deployed per side ──
  // Off-Chain P&L: IB NAV minus ALL capital that funded the off-chain side.
  // We use totalDeposited (all flows into IB) as the cost basis for IB,
  // because offChainDebt is also tracked separately in totalDebt.
  // Simple: totalPnl = totalNAV - totalDeposited (from calcDashboard)
  // Split: offChainPnl = ibNav - totalDeposited (IB funded by all deposits)
  //        onChainPnl  = onChainNAV - (onChainDebt + aaveLeverage)
  const offChainCapital = ownEquity + offChainDebt;
  const onChainCapital = onChainDebt + aaveLeverage;
  const offChainPnl = c.ibNav - offChainCapital;
  const onChainPnl = c.onChainNAV - onChainCapital;
  const totalPnl = c.totalPnl; // canonical — totalNAV - totalDeposited

  return (
    <div className="space-y-3">
      {/* Three-column hero */}
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

        {/* Capital Sources (4-way breakdown) */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              מקורות הון
            </p>
            <Landmark className="w-4 h-4 text-muted-foreground/50" />
          </div>
          <p className="text-3xl font-bold font-mono leading-tight">{fmt(totalCapital)}</p>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">הון עצמי</span>
              <span className="font-mono font-semibold">{fmt(ownEquity)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground" title="משקיעים פרטיים (OffChainInvestor) + הלוואות מוסדיות (DebtFacility)">
                חוב Off-Chain
              </span>
              <span className="font-mono font-semibold">{fmt(offChainDebt)}</span>
            </div>
            {(c.offChainInvestorDebt > 0 || c.offChainFacilityDebt > 0) && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 pl-3">
                <span>· משקיעים {fmt(c.offChainInvestorDebt, 0)} · בנקים {fmt(c.offChainFacilityDebt, 0)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">חוב On-Chain (S&T)</span>
              <span className="font-mono font-semibold">{fmt(onChainDebt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">מינוף Aave</span>
              <span className="font-mono font-semibold">{fmt(aaveLeverage)}</span>
            </div>
          </div>
          {Math.abs(depositDebtGap) > 100 && (
            <div className="mt-2 text-[10px] text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
              ⚠ פער של {fmt(Math.abs(depositDebtGap), 0)} בין הפקדות Debt ל-OffChainInvestor
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
            <Link to="/deposits" className="text-primary hover:underline flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> הפקדות
            </Link>
            <Link to="/offchain-investors" className="text-primary hover:underline flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> משקיעים
            </Link>
            <Link to="/debt" className="text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> נהל חוב
            </Link>
          </div>
        </div>

        {/* Total P&L — Off-Chain + On-Chain split */}
        <div className={`border rounded-2xl p-5 ${totalPnl >= 0 ? "bg-gradient-to-br from-emerald-500/5 to-emerald-500/0 border-emerald-500/20" : "bg-gradient-to-br from-red-500/5 to-red-500/0 border-red-500/20"}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              P&L כולל
            </p>
            {totalPnl >= 0 ? <TrendingUp className="w-4 h-4 text-profit" /> : <TrendingDown className="w-4 h-4 text-loss" />}
          </div>
          <p className={`text-3xl font-bold font-mono leading-tight ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
            {fmt(totalPnl)}
          </p>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Off-Chain</span>
              <span className={`font-mono font-semibold ${offChainPnl >= 0 ? "text-profit" : "text-loss"}`}>
                {fmt(offChainPnl)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">On-Chain</span>
              <span className={`font-mono font-semibold ${onChainPnl >= 0 ? "text-profit" : "text-loss"}`}>
                {fmt(onChainPnl)}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-border/40 text-[10px] text-muted-foreground space-y-0.5 leading-relaxed">
            <p>Off-Chain = IB NAV ({fmt(c.ibNav, 0)}) − הון עצמי+חוב ({fmt(offChainCapital, 0)})</p>
            <p className="text-[9px] opacity-70">cash {fmt(c.ibCash,0)} · stocks {fmt(c.ibStocksValue,0)} · options {fmt(c.ibOptionsValue,0)}</p>
            <p>On-Chain = Crypto NAV ({fmt(c.onChainNAV, 0)}) − חוב on+Aave ({fmt(onChainCapital, 0)})</p>
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