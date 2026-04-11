import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, differenceInDays, subDays } from "date-fns";
import { FileText, Plus, Trash2, Send, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ReportWizard from "@/components/weeklyreport/ReportWizard";
import { generateReportHTML } from "@/components/weeklyreport/generateReportHTML";

const fmtUSD = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function WeeklyReportPage() {
  const [step, setStep] = useState(null); // null | "wizard" | "generating"
  const [reports, setReports] = useState([]);
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [
      reportsList, assets, leveraged, aaveAccounts, aaveCollateral,
      optionsList, investors, payments, snapshots
    ] = await Promise.all([
      base44.entities.WeeklyReport.list("-report_date", 50),
      base44.entities.CryptoAsset.list("-last_updated", 50),
      base44.entities.LeveragedPosition.list("-updated_date", 20),
      base44.entities.AaveAccount.list("-updated_date", 1),
      base44.entities.AaveCollateral.list(),
      base44.entities.CryptoOptionsPosition.list("-opened_date", 50),
      base44.entities.OffChainInvestor.list(),
      base44.entities.InvestorPayment.list("-payment_date", 200),
      base44.entities.PortfolioSnapshot.list("-snapshot_date", 5),
    ]);

    setReports(reportsList);

    // Extract current prices from assets
    const getPrice = (token) => {
      const asset = assets.find(a => a.token?.toUpperCase() === token.toUpperCase());
      return asset?.current_price_usd || null;
    };

    const lastReport = reportsList[0];

    setAppData({
      assets,
      leveraged: leveraged.filter(l => l.status === "Open"),
      aaveAccount: aaveAccounts[0] || null,
      aaveCollateral,
      options: optionsList,
      investors,
      payments,
      // Defaults for wizard
      defaults: {
        ib_nav: lastReport?.ib_nav || snapshots[0]?.nav || null,
        ib_options_pnl: lastReport?.wizard_ib_options_pnl || 0,
        ib_stocks_pnl: lastReport?.wizard_ib_stocks_pnl || 0,
        ib_premium_total: lastReport?.wizard_ib_premium_total || null,
        ib_win_rate: lastReport?.wizard_ib_win_rate || null,
        btc_price: getPrice("BTC") || lastReport?.wizard_btc_price || null,
        eth_price: getPrice("ETH") || lastReport?.wizard_eth_price || null,
        aave_price: getPrice("AAVE") || lastReport?.wizard_aave_price || null,
        mstr_price: getPrice("MSTR") || lastReport?.wizard_mstr_price || null,
        aave_borrowed: aaveAccounts[0]?.borrow_usd || lastReport?.wizard_aave_borrowed || null,
        aave_hf: aaveAccounts[0]?.health_factor || lastReport?.wizard_aave_hf || null,
        manager_notes: "",
        on_chain_nav: null,
      },
      prevReport: lastReport ? {
        ib_nav: lastReport.ib_nav,
        btc_price: lastReport.wizard_btc_price,
        eth_price: lastReport.wizard_eth_price,
        on_chain_nav: lastReport.wizard_on_chain_nav,
      } : null,
    });

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleWizardComplete = async (answers) => {
    setStep("generating");
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const periodStart = format(subDays(new Date(), 7), "yyyy-MM-dd");

      // Recalculate on-chain NAV for saving
      const ethUnits = appData.aaveCollateral.find(a => a.token?.includes("ETH"))?.units || 0;
      const wbtcUnits = appData.aaveCollateral.find(a => a.token?.includes("BTC") || a.token?.includes("WBTC"))?.units || 0;
      const aaveTokenUnits = appData.aaveCollateral.find(a => a.token === "AAVE")?.units || 0;
      const collateral = (ethUnits * (answers.eth_price || 0)) + (wbtcUnits * (answers.btc_price || 0)) + (aaveTokenUnits * (answers.aave_price || 0));
      const onChainNav = collateral - (answers.aave_borrowed || 0);

      // Generate HTML report
      const html = generateReportHTML({
        wizardAnswers: answers,
        prevReport: appData.prevReport,
        investors: appData.investors,
        investorPayments: appData.payments,
        options: appData.options,
        leveraged: appData.leveraged,
        aaveCollateral: appData.aaveCollateral,
        periodStart,
        periodEnd: today,
      });

      // Save report record with all wizard answers
      await base44.entities.WeeklyReport.create({
        report_date: today,
        period_start: periodStart,
        period_end: today,
        ib_nav: answers.ib_nav,
        nav_at_report: (answers.ib_nav || 0) + onChainNav,
        notes: answers.manager_notes,
        status: "Draft",
        // Store wizard answers for next-run defaults
        wizard_ib_options_pnl: answers.ib_options_pnl,
        wizard_ib_stocks_pnl: answers.ib_stocks_pnl,
        wizard_ib_premium_total: answers.ib_premium_total,
        wizard_ib_win_rate: answers.ib_win_rate,
        wizard_btc_price: answers.btc_price,
        wizard_eth_price: answers.eth_price,
        wizard_aave_price: answers.aave_price,
        wizard_mstr_price: answers.mstr_price,
        wizard_aave_borrowed: answers.aave_borrowed,
        wizard_aave_hf: answers.aave_hf,
        wizard_on_chain_nav: onChainNav,
      });

      // Update Aave account with fresh data
      if (appData.aaveAccount) {
        await base44.entities.AaveAccount.update(appData.aaveAccount.id, {
          borrow_usd: answers.aave_borrowed,
          health_factor: answers.aave_hf,
        });
      }

      // Update crypto asset prices
      const priceUpdates = [
        { token: "BTC", price: answers.btc_price },
        { token: "ETH", price: answers.eth_price },
        { token: "AAVE", price: answers.aave_price },
        { token: "MSTR", price: answers.mstr_price },
      ];
      for (const { token, price } of priceUpdates) {
        if (!price) continue;
        const asset = appData.assets.find(a => a.token?.toUpperCase() === token);
        if (asset) {
          await base44.entities.CryptoAsset.update(asset.id, {
            current_price_usd: price,
            current_value_usd: asset.amount ? asset.amount * price : asset.current_value_usd,
            last_updated: today,
          });
        }
      }

      // Create portfolio snapshot
      await base44.entities.PortfolioSnapshot.create({
        snapshot_date: today,
        total_assets_usd: collateral,
        net_value_usd: (answers.ib_nav || 0) + onChainNav,
        btc_price: answers.btc_price,
        eth_price: answers.eth_price,
        aave_price: answers.aave_price,
        notes: `Auto-snapshot from weekly report ${today}`,
      });

      // Open HTML in new window for print-to-PDF
      const win = window.open("", "_blank");
      win.document.write(html);
      win.document.close();

      toast.success("הדוח נפתח בחלון חדש — השתמש ב-Ctrl+P לשמירה כ-PDF");
      setStep(null);
      load();
    } catch (e) {
      toast.error("שגיאה: " + e.message);
      setStep(null);
    }
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
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">דוח שבועי</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Weekly Investment Management Report</p>
        </div>
        {!step && (
          <Button onClick={() => setStep("wizard")} className="gap-2">
            <Plus className="w-4 h-4" /> הפק דוח שבועי
          </Button>
        )}
      </div>

      {/* Wizard */}
      {step === "wizard" && appData && (
        <ReportWizard
          defaults={appData.defaults}
          onComplete={handleWizardComplete}
          onCancel={() => setStep(null)}
        />
      )}

      {/* Generating state */}
      {step === "generating" && (
        <div className="bg-card border border-border rounded-2xl p-12 text-center" dir="rtl">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-5" />
          <p className="text-lg font-bold">מפיק דוח...</p>
          <p className="text-sm text-muted-foreground mt-2">שומר נתונים ומכין את הדוח</p>
        </div>
      )}

      {/* History */}
      {!step && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">דוחות קודמים</h2>
          </div>

          {reports.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm" dir="rtl">
              אין דוחות עדיין. לחץ "הפק דוח שבועי" כדי להתחיל.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">תאריך</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">תקופה</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">NAV בדוח</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">IB NAV</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">סטטוס</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, i) => (
                    <tr key={r.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`} dir="rtl">
                      <td className="px-4 py-3 font-mono text-xs">{format(new Date(r.report_date), "d.M.yyyy")}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {format(new Date(r.period_start), "d.M")} — {format(new Date(r.period_end), "d.M.yy")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{fmtUSD(r.nav_at_report)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{fmtUSD(r.ib_nav)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={r.status === "Sent" ? "text-emerald-600 border-emerald-300 bg-emerald-50" : "text-muted-foreground"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-start">
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