import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, RefreshCw, Activity, Calendar, DollarSign, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useFxHedgeData } from "@/hooks/useFxHedgeData";
import {
  buildRatesMap,
  calcNetExposure,
  calcTotalUnrealizedPnl,
  deriveStatus,
  daysToMaturity,
  fmtCurrency,
} from "@/lib/fxMath";
import FxKpiCard from "@/components/fx/FxKpiCard";
import FxNetExposureChart from "@/components/fx/FxNetExposureChart";
import FxTransactionTable from "@/components/fx/FxTransactionTable";

export default function FxDashboard() {
  const { data, isLoading, refetchAll } = useFxHedgeData();
  const [syncing, setSyncing] = useState(false);

  const today = new Date();
  const ratesMap = useMemo(() => buildRatesMap(data.rates), [data.rates]);
  const exposure = useMemo(() => calcNetExposure(data.transactions, today), [data.transactions]);
  const pnlByCcy = useMemo(() => calcTotalUnrealizedPnl(data.transactions, ratesMap, today), [data.transactions, ratesMap]);

  const openTxs = data.transactions.filter((tx) => deriveStatus(tx, today) === "OPEN");
  const dueIn30 = openTxs.filter((tx) => {
    const d = daysToMaturity(tx, today);
    return d != null && d >= 0 && d <= 30;
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("syncFxRates", {});
      const errors = res?.data?.errors || [];
      const rates = res?.data?.rates || {};
      const count = Object.keys(rates).length;
      if (count > 0) toast.success(`עודכנו ${count} שערים`);
      if (errors.length > 0) toast.warning(`${errors.length} שערים נכשלו`);
      refetchAll();
    } catch (e) {
      toast.error(`עדכון שערים נכשל: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Isolation banner */}
      <div className="bg-cyan-50 border border-cyan-300 rounded-xl px-4 py-3 text-cyan-900">
        <div className="flex items-start gap-2">
          <span className="text-lg">💱</span>
          <div className="flex-1">
            <p className="font-semibold text-sm">מודול גידורי מט"ח — נפרד מהדשבורד הראשי</p>
            <p className="text-xs text-cyan-800/80">נתונים ידניים · אינם משתתפים בחישוב NAV הראשי</p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard גידורי מט"ח</h1>
          <p className="text-xs text-muted-foreground mt-0.5">מעקב Spot &amp; Forward מול ברוקרים בישראל</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "מעדכן…" : "עדכן שערים"}
          </Button>
          <Button asChild>
            <Link to="/fx/transactions" className="gap-2">
              <ArrowLeftRight className="w-4 h-4" /> לכל העסקאות
            </Link>
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <FxKpiCard
          icon={Activity}
          label="עסקאות פתוחות"
          value={openTxs.length}
          sub={`מתוך ${data.transactions.length} סה"כ`}
        />
        <FxKpiCard
          icon={DollarSign}
          label="P&L לא-ממומש (לפי מטבע ציטוט)"
          value={
            Object.keys(pnlByCcy).length === 0
              ? "—"
              : Object.entries(pnlByCcy).map(([c, v]) => fmtCurrency(v, c, 0)).join(" · ")
          }
          valueClass="text-base"
          sub={Object.keys(ratesMap).length > 0 ? `${Object.keys(ratesMap).length} זוגות עם שער` : "אין שערים — לחץ עדכן"}
        />
        <FxKpiCard
          icon={Calendar}
          label="פירעון ב-30 ימים הקרובים"
          value={dueIn30.length}
          valueClass={dueIn30.length > 0 ? "text-amber-600" : ""}
          sub="עסקאות שמגיעות לפירעון בקרוב"
        />
        <FxKpiCard
          icon={TrendingUp}
          label="חשיפה — מטבעות"
          value={Object.keys(exposure).length}
          sub="מטבעות עם חשיפה נטו"
        />
      </div>

      {/* Net exposure detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FxNetExposureChart exposure={exposure} />
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-semibold mb-3">חשיפה נטו — מספרים</p>
          <div className="space-y-1.5">
            {Object.entries(exposure).length === 0 && (
              <p className="text-xs text-muted-foreground">אין חשיפה פתוחה</p>
            )}
            {Object.entries(exposure)
              .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
              .map(([ccy, val]) => (
                <div key={ccy} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{ccy}</span>
                  <span className={`font-mono ${val >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtCurrency(val, ccy, 0)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Open transactions table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">עסקאות פתוחות</p>
          {openTxs.length > 0 && (
            <Link to="/fx/transactions" className="text-xs text-primary hover:underline">צפה בכל העסקאות →</Link>
          )}
        </div>
        <FxTransactionTable
          transactions={openTxs}
          ratesMap={ratesMap}
          compact
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </div>
    </div>
  );
}