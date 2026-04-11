import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, subDays, differenceInDays } from "date-fns";
import { FileText, Plus, Download, Send, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import FreshnessCheck from "@/components/weeklyreport/FreshnessCheck";
import ManagerInputForm from "@/components/weeklyreport/ManagerInputForm";
import { generateWeeklyPDF } from "@/components/weeklyreport/generatePDF";

const fmtUSD = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function WeeklyReportPage() {
  const [step, setStep] = useState(null); // null | "freshness" | "input" | "generating"
  const [reports, setReports] = useState([]);
  const [freshnessDates, setFreshnessDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // All portfolio data needed for PDF
  const [portfolioData, setPortfolioData] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [investorPayments, setInvestorPayments] = useState([]);
  const [options, setOptions] = useState([]);
  const [leveraged, setLeveraged] = useState([]);
  const [aave, setAave] = useState(null);
  const [activities, setActivities] = useState([]);

  const load = async () => {
    const [
      reportsList, assets, leveragedList, aaveAccounts,
      optionsList, invList, payList, actList, snapshots, stocksList, deposits
    ] = await Promise.all([
      base44.entities.WeeklyReport.list("-report_date", 50),
      base44.entities.CryptoAsset.list("-last_updated", 20),
      base44.entities.LeveragedPosition.list("-updated_date", 20),
      base44.entities.AaveAccount.list("-updated_date", 1),
      base44.entities.CryptoOptionsPosition.list("-opened_date", 50),
      base44.entities.OffChainInvestor.list(),
      base44.entities.InvestorPayment.list("-payment_date", 200),
      base44.entities.CryptoActivityLog.list("-date", 50),
      base44.entities.PortfolioSnapshot.list("-snapshot_date", 10),
      base44.entities.StockPosition.list(),
      base44.entities.Deposit.list("-date", 100),
    ]);

    setReports(reportsList);
    setInvestors(invList);
    setInvestorPayments(payList);
    setOptions(optionsList);
    setLeveraged(leveragedList);
    setAave(aaveAccounts[0] || null);
    setActivities(actList);

    // Freshness dates
    const cryptoLatest = assets.reduce((latest, a) => {
      const d = a.last_updated ? new Date(a.last_updated) : null;
      return d && (!latest || d > latest) ? d : latest;
    }, null);
    const hlLatest = leveragedList.filter(l => l.status === "Open").reduce((latest, l) => {
      const d = new Date(l.updated_date);
      return !latest || d > latest ? d : latest;
    }, null);
    const optLatest = optionsList.filter(o => o.status === "Open").reduce((latest, o) => {
      const d = new Date(o.updated_date);
      return !latest || d > latest ? d : latest;
    }, null);
    const payLatest = payList.reduce((latest, p) => {
      const d = new Date(p.payment_date);
      return !latest || d > latest ? d : latest;
    }, null);
    const snapshotLatest = snapshots[0]?.snapshot_date ? new Date(snapshots[0].snapshot_date) : null;

    setFreshnessDates({
      crypto_prices: cryptoLatest,
      hyperliquid: hlLatest,
      aave: aaveAccounts[0]?.updated_date ? new Date(aaveAccounts[0].updated_date) : null,
      options: optLatest,
      ib_nav: snapshotLatest,
      interest_payments: payLatest,
    });

    // Portfolio data for PDF
    const totalCryptoAssets = assets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
    const aaveData = aaveAccounts[0] || {};
    const totalDebt = (aaveData.borrow_usd || 0);
    const hlMargin = leveragedList.filter(l => l.status === "Open").reduce((s, l) => s + (l.margin_usd || 0), 0);
    const onChainNet = totalCryptoAssets - totalDebt;

    const ibDeposits = deposits.filter(d => d.type === "Deposit").reduce((s, d) => s + (d.amount || 0), 0);
    const ibWithdrawals = deposits.filter(d => d.type === "Withdrawal").reduce((s, d) => s + (d.amount || 0), 0);
    const ibDeposited = ibDeposits - ibWithdrawals;
    const ibSnapshot = snapshots[0];
    const ibNav = ibSnapshot?.nav || 0;

    const optsPremium = optionsList.reduce((s, o) => s + (o.income_usd || 0), 0);
    const closedOpts = optionsList.filter(o => ["Expired OTM", "Expired ITM", "Exercised"].includes(o.status));
    const winRate = closedOpts.length > 0 ? (closedOpts.filter(o => o.status === "Expired OTM").length / closedOpts.length) * 100 : 0;

    const prevSnapshot = snapshots[1];

    // Asset allocation
    const btcAssets = assets.filter(a => a.token?.includes("BTC")).reduce((s, a) => s + (a.current_value_usd || 0), 0);
    const ethAssets = assets.filter(a => a.token?.includes("ETH")).reduce((s, a) => s + (a.current_value_usd || 0), 0);
    const aaveToken = assets.filter(a => a.token?.includes("AAVE")).reduce((s, a) => s + (a.current_value_usd || 0), 0);
    const mstr = assets.filter(a => a.token?.includes("MSTR")).reduce((s, a) => s + (a.current_value_usd || 0), 0);
    const stables = assets.filter(a => ["USDC", "USDT", "DAI"].some(t => a.token?.includes(t))).reduce((s, a) => s + (a.current_value_usd || 0), 0);
    const otherAssets = totalCryptoAssets - btcAssets - ethAssets - aaveToken - mstr - stables;

    const btcPrice = assets.find(a => a.token === "BTC")?.current_price_usd;
    const ethPrice = assets.find(a => a.token === "ETH")?.current_price_usd;

    setPortfolioData({
      current: {
        nav: ibNav + onChainNet,
        ib_nav: ibNav,
        ib_deposited: ibDeposited,
        options_premium_total: optsPremium,
        options_win_rate: winRate,
        btc_price: btcPrice,
        eth_price: ethPrice,
        allocation: { BTC: btcAssets, ETH: ethAssets, AAVE: aaveToken, MSTR: mstr, Stablecoins: stables, Other: Math.max(0, otherAssets) },
      },
      prev: prevSnapshot ? {
        nav: prevSnapshot.net_value_usd,
        ib_nav: prevSnapshot.net_value_usd,
        btc_price: prevSnapshot.btc_price,
        eth_price: prevSnapshot.eth_price,
      } : null,
    });

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async (managerInputs) => {
    setGenerating(true);
    try {
      // Filter activities for report period
      const periodActivities = activities.filter(a =>
        a.date >= managerInputs.period_start && a.date <= managerInputs.period_end
      );

      const doc = await generateWeeklyPDF({
        managerInputs,
        portfolioData,
        activityLogs: periodActivities,
        investors,
        investorPayments,
        options,
        leveraged,
        aave,
      });

      // Save PDF as blob URL + upload
      const pdfBlob = doc.output("blob");
      const pdfFile = new File([pdfBlob], `weekly-report-${managerInputs.period_end}.pdf`, { type: "application/pdf" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file: pdfFile });

      // Save report record
      await base44.entities.WeeklyReport.create({
        report_date: format(new Date(), "yyyy-MM-dd"),
        period_start: managerInputs.period_start,
        period_end: managerInputs.period_end,
        pdf_url: file_url,
        nav_at_report: portfolioData?.current?.nav,
        notes: managerInputs.manager_summary,
        manager_summary: managerInputs.manager_summary,
        actions_taken: managerInputs.actions_taken,
        next_week_plan: managerInputs.next_week_plan,
        risks_notes: managerInputs.risks_notes,
        status: "Draft",
      });

      // Create portfolio snapshot
      await base44.entities.PortfolioSnapshot.create({
        snapshot_date: managerInputs.period_end,
        total_assets_usd: portfolioData?.current?.ib_nav,
        net_value_usd: portfolioData?.current?.nav,
        btc_price: portfolioData?.current?.btc_price,
        eth_price: portfolioData?.current?.eth_price,
        notes: `Auto-snapshot from weekly report ${managerInputs.period_end}`,
      });

      // Download PDF
      doc.save(`weekly-report-${managerInputs.period_end}.pdf`);

      toast.success("Report generated and saved!");
      setStep(null);
      load();
    } catch (e) {
      toast.error("Error generating report: " + e.message);
    }
    setGenerating(false);
  };

  const handleMarkSent = async (id) => {
    await base44.entities.WeeklyReport.update(id, { status: "Sent" });
    toast.success("Marked as sent");
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.WeeklyReport.delete(id);
    toast.success("Report deleted");
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
          <p className="text-xs text-muted-foreground mt-0.5">Weekly Investment Management Report — PDF Generator</p>
        </div>
        {step === null && (
          <Button onClick={() => setStep("freshness")} className="gap-2">
            <Plus className="w-4 h-4" /> הפק דוח חדש
          </Button>
        )}
      </div>

      {/* Step flow */}
      {step === "freshness" && (
        <FreshnessCheck
          dates={freshnessDates}
          onSkip={() => setStep("input")}
        />
      )}

      {step === "input" && (
        <ManagerInputForm
          onBack={() => setStep("freshness")}
          onSubmit={handleGenerate}
        />
      )}

      {generating && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="font-semibold">מפיק דוח PDF...</p>
          <p className="text-xs text-muted-foreground mt-1">אוסף נתונים ויוצר PDF מקצועי</p>
        </div>
      )}

      {/* Report history */}
      {step === null && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">דוחות קודמים</h2>
          </div>

          {reports.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground text-sm">
              אין דוחות עדיין. לחץ "הפק דוח חדש" כדי להתחיל.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">תאריך</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">תקופה</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">NAV</th>
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
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={r.status === "Sent" ? "text-emerald-600 border-emerald-300" : "text-muted-foreground"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {r.pdf_url && (
                            <a href={r.pdf_url} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
                                <Eye className="w-3 h-3" /> View
                              </Button>
                            </a>
                          )}
                          {r.status !== "Sent" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-emerald-600" onClick={() => handleMarkSent(r.id)}>
                              <Send className="w-3 h-3" /> Send
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