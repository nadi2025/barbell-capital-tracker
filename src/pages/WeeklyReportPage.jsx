import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { FileText, Plus, Trash2, Send, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ReportWizard from "@/components/weeklyreport/ReportWizard";
import { buildReportHTML } from "@/components/weeklyreport/buildReportHTML";

const fmtUSD = (v) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

function openHtmlInTab(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function WeeklyReportPage() {
  const [showWizard, setShowWizard] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reports, setReports] = useState([]);
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [
      reportsList, assets, leveraged, aaveCollateral,
      cryptoOptions, investors, payments, ibOptions, stocks, hlTrades,
      prices, aaveRes
    ] = await Promise.all([
      base44.entities.WeeklyReport.list("-report_date", 50),
      base44.entities.CryptoAsset.list("-last_updated", 100),
      base44.entities.LeveragedPosition.filter({ status: "Open" }),
      base44.entities.AaveCollateral.list(),
      base44.entities.CryptoOptionsPosition.list("-opened_date", 100),
      base44.entities.OffChainInvestor.list(),
      base44.entities.InvestorPayment.list("-payment_date", 200),
      base44.entities.OptionsTrade.list("-open_date", 200),
      base44.entities.StockPosition.list("-entry_date", 500),
      base44.entities.HLTrade.list("-trade_date", 500),
      base44.entities.Prices.list(),
      base44.functions.invoke("calculateAavePosition", {}),
    ]);
    const aave = aaveRes?.data || {};
    setReports(reportsList);
    setAppData({
      assets, leveraged, aaveCollateral, cryptoOptions, investors,
      investorPayments: payments, ibOptions, stocks, hlTrades, prices,
      aaveBorrowUsd: aave.borrowedAmount || 0,
      aaveHealthFactor: aave.healthFactor || 0,
      aaveCollateralDetails: aave.collateralDetails || [],
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    try {
      await base44.functions.invoke("dailyFullUpdate", {});
      toast.success("מחירים עודכנו");
      load();
    } catch (e) {
      toast.error("שגיאה בעדכון מחירים: " + e.message);
    }
    setRefreshing(false);
  };

  const handleWizardComplete = async (answers) => {
    setShowWizard(false);
    setGenerating(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const lastReport = reports[0];

      // Validate critical data
      if (!answers.btc_price || !answers.eth_price) throw new Error("מחירי קריפטו חסרים — לא ניתן להפיק דוח");
      const aaveTotal = appData.aaveCollateral.reduce((s, c) => s + (c.units || 0), 0);
      if (aaveTotal === 0) throw new Error("נתוני Aave חסרים — עדכן באמוד Aave");

      const prevReport = lastReport ? {
        ib_nav: lastReport.ib_nav,
        wizard_on_chain_nav: lastReport.wizard_on_chain_nav,
      } : null;

      const html = buildReportHTML({ answers, appData, prevReport });
      openHtmlInTab(html);

      // Save report record
      await base44.entities.WeeklyReport.create({
        report_date: today,
        period_start: format(new Date(new Date().setDate(new Date().getDate() - 7)), "yyyy-MM-dd"),
        period_end: today,
        ib_nav: answers.ib_nav,
        nav_at_report: answers.ib_nav, // simplified
        notes: answers.notes,
        status: "Draft",
        wizard_ib_options_pnl: answers.ib_options_pnl,
        wizard_ib_stocks_pnl: answers.ib_stocks_pnl,
        wizard_ib_win_rate: answers.ib_win_rate,
        wizard_btc_price: answers.btc_price,
        wizard_eth_price: answers.eth_price,
        wizard_aave_price: answers.aave_price,
        wizard_mstr_price: answers.mstr_price,
        wizard_on_chain_nav: 0, // calculated inside buildReportHTML
      });

      toast.success("הדוח נפתח בלשונית חדשה — לחץ Ctrl+P לשמירה כ-PDF");
      load();
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
    await base44.entities.WeeklyReport.update(id, { status: "Sent" });
    toast.success("סומן כנשלח");
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.WeeklyReport.delete(id);
    toast.success("נמחק");
    load();
  };

  if (loading) return (
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
          <Button variant="outline" onClick={handleRefreshPrices} disabled={refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "מעדכן..." : "עדכן מחירים"}
          </Button>
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