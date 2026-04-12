import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, subDays } from "date-fns";
import { FileText, Plus, Trash2, Send, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    const res = await base44.functions.invoke('fetchLivePrices', {});
    setRefreshResult(res.data);
    setRefreshing(false);
    load();
  };

  const load = async () => {
    const [
      reportsList, assets, leveraged, aaveAccounts, aaveCollateral,
      optionsList, investors, payments, snapshots, ibOptions
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
      base44.entities.OptionsTrade.list("-open_date", 200),
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
        ib_win_rate: (() => {
          const closed = ibOptions.filter(o => o.status === "Closed" || o.status === "Expired" || o.status === "Assigned");
          if (closed.length === 0) return null;
          const wins = closed.filter(o => (o.pnl || 0) > 0).length;
          return Math.round((wins / closed.length) * 100);
        })(),

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

      // Get live prices from app data
      const getPrice = (token) => appData.assets.find(a => a.token?.toUpperCase() === token)?.current_price_usd || 0;
      const btc_price = getPrice("BTC");
      const eth_price = getPrice("ETH");
      const aave_price = getPrice("AAVE");
      const mstr_price = getPrice("MSTR");

      // Merge prices into answers
      const fullAnswers = { ...answers, btc_price, eth_price, aave_price, mstr_price };

      // Recalculate on-chain NAV for saving
      const ethUnits = appData.aaveCollateral.find(a => a.token?.includes("ETH"))?.units || 0;
      const wbtcUnits = appData.aaveCollateral.find(a => a.token?.includes("BTC") || a.token?.includes("WBTC"))?.units || 0;
      const aaveTokenUnits = appData.aaveCollateral.find(a => a.token === "AAVE")?.units || 0;
      const collateral = (ethUnits * eth_price) + (wbtcUnits * btc_price) + (aaveTokenUnits * aave_price);
      const onChainNav = collateral - (answers.aave_borrowed || 0);

      // Generate HTML report
      const html = generateReportHTML({
        wizardAnswers: fullAnswers,
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
        wizard_btc_price: btc_price,
        wizard_eth_price: eth_price,
        wizard_aave_price: aave_price,
        wizard_mstr_price: mstr_price,
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

      // Prices are updated via fetchLivePrices — no manual update needed here

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
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefreshPrices} disabled={refreshing} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "מעדכן..." : "עדכן מחירים"}
            </Button>
            <Button onClick={() => setStep("wizard")} className="gap-2">
              <Plus className="w-4 h-4" /> הפק דוח שבועי
            </Button>
          </div>
        )}
      </div>

      {/* Price refresh result */}
      {refreshResult && !step && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2" dir="rtl">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            מחירים עודכנו בהצלחה
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(refreshResult.crypto || {}).map(([k, v]) => v && (
              <div key={k} className="bg-muted/40 rounded-lg px-3 py-2">
                <p className="text-muted-foreground">{k}</p>
                <p className="font-mono font-bold">${v?.toLocaleString()}</p>
              </div>
            ))}
          </div>
          {Object.keys(refreshResult.stocks || {}).length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
              {Object.entries(refreshResult.stocks).map(([ticker, price]) => (
                <div key={ticker} className="bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-muted-foreground">{ticker}</p>
                  <p className="font-mono font-bold">${price?.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
          {refreshResult.tickers_failed?.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              לא עודכנו: {refreshResult.tickers_failed.join(", ")} — ייתכן שהטיקר שונה
            </div>
          )}
        </div>
      )}

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