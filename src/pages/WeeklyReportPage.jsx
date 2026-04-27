import { useState, useMemo } from "react";
import { format } from "date-fns";
import { FileText, Plus, Trash2, Send, Eye } from "lucide-react";
import { calcDashboard } from "@/components/dashboard2/dashboardCalcs.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ReportWizard from "@/components/weeklyreport/ReportWizard";
import { buildReportHTML } from "@/components/weeklyreport/buildReportHTML";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";
import { useAavePosition } from "@/hooks/useAavePosition";
import { calcDashboard } from "@/components/dashboard2/dashboardCalcs.jsx";

const fmtUSD = (v) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

function openHtmlInTab(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, "_blank");
  if (!newWin || newWin.closed || typeof newWin.closed === "undefined") {
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-report-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    toast.info("הדפדפן חסם את הפופאפ — הדוח הורד כקובץ HTML. פתח אותו בדפדפן ולחץ Ctrl+P");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * WeeklyReportPage — generate / view / archive weekly investor reports.
 *
 * Migrated from a 12-entity Promise.all + calculateAavePosition Deno round-
 * trip to React Query: each entity gets its own useEntityList, the Aave
 * aggregate comes from useAavePosition (client-derived). The appData
 * payload passed to ReportWizard and buildReportHTML keeps the same shape,
 * so the report generator is unchanged — only the data plumbing is.
 *
 * The "עדכן מחירים" button (which called the deleted dailyFullUpdate) was
 * removed; Phase 4 routes that interaction through the top-bar PriceHub.
 * appData stays fresh automatically because every consumed entity is a
 * React Query subscription — opening PriceHub and changing a price flows
 * through here without an explicit refresh call.
 */
export default function WeeklyReportPage() {
  const reportsQ = useEntityList("WeeklyReport", { sort: "-report_date", limit: 50 });
  const assetsQ = useEntityList("CryptoAsset", { sort: "-last_updated", limit: 100 });
  const leveragedQ = useEntityList("LeveragedPosition", { filter: { status: "Open" } });
  const aaveCollateralQ = useEntityList("AaveCollateral");
  const cryptoOptionsQ = useEntityList("CryptoOptionsPosition", { sort: "-opened_date", limit: 100 });
  const investorsQ = useEntityList("OffChainInvestor");
  const paymentsQ = useEntityList("InvestorPayment", { sort: "-payment_date", limit: 200 });
  const ibOptionsQ = useEntityList("OptionsTrade", { sort: "-open_date", limit: 200 });
  const stocksQ = useEntityList("StockPosition", { sort: "-entry_date", limit: 500 });
  const hlTradesQ = useEntityList("HLTrade", { sort: "-trade_date", limit: 500 });
  const pricesQ = useEntityList("Prices");
  // ── Extra entities calcDashboard requires that the report wasn't fetching ──
  // calcDashboard also reads Deposit, DebtFacility, CryptoLoan, CryptoLending,
  // LpPosition, and AccountSnapshot. Without these the totals diverge from the
  // Dashboard. Sources of divergence the bug spec called out:
  //   · totalDeposited (Deposit ledger) vs hardcoded $413k
  //   · investorDebt (CryptoLoan) vs hardcoded $1.7M
  //   · debts (DebtFacility) — was missing entirely from the report
  const depositsQ = useEntityList("Deposit");
  const debtsQ = useEntityList("DebtFacility");
  const cryptoLoansQ = useEntityList("CryptoLoan");
  const cryptoLendingQ = useEntityList("CryptoLending");
  const lpPositionsQ = useEntityList("LpPosition");
  const snapshotsQ = useEntityList("AccountSnapshot", { sort: "-snapshot_date", limit: 1 });
  const aave = useAavePosition();

  const createReport = useEntityMutation("WeeklyReport", "create");
  const updateReport = useEntityMutation("WeeklyReport", "update");
  const deleteReportM = useEntityMutation("WeeklyReport", "delete");

  const reports = reportsQ.data || [];

  const isLoading =
    reportsQ.isLoading || assetsQ.isLoading || leveragedQ.isLoading || aaveCollateralQ.isLoading ||
    cryptoOptionsQ.isLoading || investorsQ.isLoading || paymentsQ.isLoading || ibOptionsQ.isLoading ||
    stocksQ.isLoading || hlTradesQ.isLoading || pricesQ.isLoading || aave.isLoading ||
    depositsQ.isLoading || debtsQ.isLoading || cryptoLoansQ.isLoading ||
    cryptoLendingQ.isLoading || lpPositionsQ.isLoading || snapshotsQ.isLoading;

  // Reassemble appData. Two consumers:
  //   1. ReportWizard — uses legacy keys (assets / investors / cryptoOptions).
  //   2. buildReportHTML, which now passes appData to calcDashboard. That
  //      function expects Dashboard-style keys (cryptoAssets, options,
  //      offChainInvestors, openCryptoOptions, healthFactor, borrowPowerUsed,
  //      snapshot, deposits, debts, cryptoLoans, cryptoLending, lpPositions).
  // We populate BOTH in the same object so both consumers work without
  // either having to translate keys.
  const appData = useMemo(() => {
    const assets = assetsQ.data || [];
    const leveraged = leveragedQ.data || [];
    const aaveCollateral = aaveCollateralQ.data || [];
    const cryptoOptions = cryptoOptionsQ.data || [];
    const investors = investorsQ.data || [];
    const investorPayments = paymentsQ.data || [];
    const ibOptions = ibOptionsQ.data || [];
    const stocks = stocksQ.data || [];
    const hlTrades = hlTradesQ.data || [];
    const prices = pricesQ.data || [];
    const deposits = depositsQ.data || [];
    const debts = debtsQ.data || [];
    const cryptoLoans = cryptoLoansQ.data || [];
    const cryptoLending = cryptoLendingQ.data || [];
    const lpPositions = lpPositionsQ.data || [];
    const snapshot = (snapshotsQ.data || [])[0] || null;

    return {
      // ── Legacy keys (ReportWizard + buildReportHTML's display code) ──
      assets, leveraged, aaveCollateral, cryptoOptions, investors,
      investorPayments, ibOptions, stocks, hlTrades, prices,
      aaveBorrowUsd: aave.borrowedAmount || 0,
      aaveHealthFactor: aave.healthFactor || 0,
      aaveCollateralDetails: aave.collateralDetails || [],

      // ── calcDashboard input contract — aliases + extras ──
      cryptoAssets: assets,                  // alias: calcDashboard reads `cryptoAssets`
      options: ibOptions,                    // alias: calcDashboard reads `options`
      offChainInvestors: investors,          // alias
      openCryptoOptions: cryptoOptions.filter((o) => o.status === "Open"),
      deposits, debts, cryptoLoans, cryptoLending, lpPositions, snapshot,
      healthFactor: aave.healthFactor || 0,
      borrowPowerUsed: aave.borrowPowerUsed || 0,
    };
  }, [
    assetsQ.data, leveragedQ.data, aaveCollateralQ.data, cryptoOptionsQ.data,
    investorsQ.data, paymentsQ.data, ibOptionsQ.data, stocksQ.data,
    hlTradesQ.data, pricesQ.data,
    aave.borrowedAmount, aave.healthFactor, aave.collateralDetails, aave.borrowPowerUsed,
    depositsQ.data, debtsQ.data, cryptoLoansQ.data, cryptoLendingQ.data,
    lpPositionsQ.data, snapshotsQ.data,
  ]);

  const [showWizard, setShowWizard] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleWizardComplete = async (answers) => {
    setShowWizard(false);
    setGenerating(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const lastReport = reports[0];

      const warnings = [];
      if (!answers.btc_price && !answers.eth_price) warnings.push("מחירי קריפטו חסרים — חלק מהטבלאות יהיה ריק");
      const aaveTotal = (appData.aaveCollateral || []).reduce((s, c) => s + (c.units || 0), 0);
      if (aaveTotal === 0) warnings.push("נתוני Aave חסרים — קטע Aave יופיע ריק");
      if (warnings.length > 0) toast.warning(warnings.join(" · "));

      const prevReport = lastReport ? {
        ib_nav: lastReport.ib_nav,
        wizard_on_chain_nav: lastReport.wizard_on_chain_nav,
      } : null;

      const html = buildReportHTML({ answers, appData, prevReport });
      openHtmlInTab(html);

      // Snapshot the cryptoTotalAssets for next week's "vs week" comparison.
      // Mirrors what buildReportHTML uses as `cryptoAssetsValue` so the
      // stored value is comparable to the report's gross totalAssets metric.
      // calcDashboard is pure — calling it twice (here and in buildReportHTML)
      // is harmless and avoids threading the value back out of the HTML.
      const calcForSave = calcDashboard({
        ...appData,
        snapshot: answers.ib_nav
          ? { ...(appData.snapshot || {}), nav: parseFloat(answers.ib_nav) || 0, cash: null }
          : appData.snapshot,
      });

      await createReport.mutateAsync({
        report_date: today,
        period_start: format(new Date(new Date().setDate(new Date().getDate() - 7)), "yyyy-MM-dd"),
        period_end: today,
        ib_nav: answers.ib_nav,
        nav_at_report: answers.ib_nav,
        notes: answers.notes,
        status: "Draft",
        wizard_ib_options_pnl: answers.ib_options_pnl,
        wizard_ib_stocks_pnl: answers.ib_stocks_pnl,
        wizard_ib_win_rate: answers.ib_win_rate,
        wizard_btc_price: answers.btc_price,
        wizard_eth_price: answers.eth_price,
        wizard_aave_price: answers.aave_price,
        wizard_mstr_price: answers.mstr_price,
        // Used by NEXT week's "vs week" change indicator (prevTotal = ib_nav
        // + wizard_on_chain_nav). Storing cryptoTotalAssets makes prevTotal
        // comparable to totalAssets in the new KPI row.
        wizard_on_chain_nav: calcForSave.cryptoTotalAssets || 0,
      });

      toast.success("הדוח נפתח בלשונית חדשה — לחץ Ctrl+P לשמירה כ-PDF");
    } catch (e) {
      toast.error("שגיאה: " + e.message);
    }
    setGenerating(false);
  };

  const handleViewReport = (r) => {
    if (!appData) return;
    const answers = {
      ib_nav: r.ib_nav || 0,
      ib_options_pnl: r.wizard_ib_options_pnl || 0,
      ib_win_rate: r.wizard_ib_win_rate || 0,
      ib_stocks_pnl: r.wizard_ib_stocks_pnl || 0,
      notes: r.notes || "",
      btc_price: r.wizard_btc_price || 0,
      eth_price: r.wizard_eth_price || 0,
      aave_price: r.wizard_aave_price || 0,
      mstr_price: r.wizard_mstr_price || 0,
    };
    const html = buildReportHTML({ answers, appData, prevReport: null });
    openHtmlInTab(html);
  };

  const handleMarkSent = async (id) => {
    await updateReport.mutateAsync({ id, data: { status: "Sent" } });
    toast.success("סומן כנשלח");
  };

  const handleDelete = async (id) => {
    await deleteReportM.mutateAsync(id);
    toast.success("נמחק");
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">דוח שבועי</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Weekly Investment Management Report</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowWizard(true)} disabled={generating} className="gap-2">
            <Plus className="w-4 h-4" /> הפק דוח שבועי
          </Button>
        </div>
      </div>

      {/* Wizard */}
      {showWizard && appData && (
        <ReportWizard
          appData={appData}
          lastReport={reports[0] || null}
          onComplete={handleWizardComplete}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {/* Generating */}
      {generating && (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-5" />
          <p className="text-lg font-bold">מפיק דוח...</p>
        </div>
      )}

      {/* Report history */}
      {!showWizard && !generating && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">דוחות קודמים</h2>
          </div>
          {reports.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">
              אין דוחות עדיין. לחץ "הפק דוח שבועי" כדי להתחיל.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">תאריך</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">תקופה</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">IB NAV</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">BTC</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">סטטוס</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, i) => (
                    <tr key={r.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                      <td className="px-4 py-3 font-mono text-xs">{format(new Date(r.report_date), "d.M.yyyy")}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {format(new Date(r.period_start), "d.M")} — {format(new Date(r.period_end), "d.M.yy")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{fmtUSD(r.ib_nav)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.wizard_btc_price ? `$${r.wizard_btc_price.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={r.status === "Sent" ? "text-emerald-600 border-emerald-300 bg-emerald-50" : "text-muted-foreground"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-blue-500 hover:text-blue-700" onClick={() => handleViewReport(r)}>
                            <Eye className="w-3 h-3" /> פתח
                          </Button>
                          {r.status !== "Sent" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-emerald-600" onClick={() => handleMarkSent(r.id)}>
                              <Send className="w-3 h-3" /> שלח
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => handleDelete(r.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}