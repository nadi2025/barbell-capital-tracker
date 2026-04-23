import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown,
  Wallet, DollarSign, Layers, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  reconcileCsv, openOptionToEntity, closedOptionToEntity, stockToEntity,
} from "@/components/ib-reconcile/reconciler";

const fmtUSD = (v) =>
  v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtUSD2 = (v) =>
  v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const statusColor = {
  Open: "bg-primary/10 text-primary border-primary/20",
  Closed: "bg-muted text-foreground border-border",
  Assigned: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "Expired OTM": "bg-profit/10 text-profit border-profit/20",
};

function SummaryTile({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground/50" />}
      </div>
      <p className={`text-xl font-bold font-mono ${accent || ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function IBReconcilePage() {
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState("");
  const [recon, setRecon] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setRecon(null);
    setError(null);
    setResult(null);
  };

  const handlePreview = () => {
    setError(null);
    setResult(null);
    try {
      const r = reconcileCsv(csvText, new Date());
      setRecon(r);
      toast.success(
        `פוענחו ${r.summary.txCount} טרנזקציות · ${r.stocks.length} מניות · ${r.openOptions.length} אופציות פתוחות · ${r.closedOptions.length} סגורות`
      );
    } catch (e) {
      setError(e.message || "שגיאה בפענוח");
      toast.error(e.message);
    }
  };

  const handleApply = async () => {
    if (!recon || !confirmWipe) return;
    setApplying(true);
    const counts = { optionsDeleted: 0, stocksDeleted: 0, optionsCreated: 0, stocksCreated: 0, errors: [] };
    try {
      // 1. Wipe existing OptionsTrade and StockPosition
      const [existingOpts, existingStocks] = await Promise.all([
        base44.entities.OptionsTrade.list(),
        base44.entities.StockPosition.list(),
      ]);
      for (const o of existingOpts) {
        try {
          await base44.entities.OptionsTrade.delete(o.id);
          counts.optionsDeleted++;
        } catch (e) { counts.errors.push(`delete opt ${o.id}: ${e.message}`); }
      }
      for (const s of existingStocks) {
        try {
          await base44.entities.StockPosition.delete(s.id);
          counts.stocksDeleted++;
        } catch (e) { counts.errors.push(`delete stock ${s.id}: ${e.message}`); }
      }

      // 2. Create all stocks first (so we can link options by id later if needed)
      const stockIdByTicker = {};
      for (const s of recon.stocks) {
        try {
          const created = await base44.entities.StockPosition.create(stockToEntity(s));
          stockIdByTicker[s.ticker] = created?.id;
          counts.stocksCreated++;
        } catch (e) { counts.errors.push(`create stock ${s.ticker}: ${e.message}`); }
      }

      // 3. Create options (open then closed/assigned/expired)
      for (const o of recon.openOptions) {
        try {
          await base44.entities.OptionsTrade.create(openOptionToEntity(o));
          counts.optionsCreated++;
        } catch (e) { counts.errors.push(`create open opt ${o.ticker} ${o.strike}: ${e.message}`); }
      }
      for (const o of recon.closedOptions) {
        try {
          const payload = closedOptionToEntity(o);
          if (o.status === "Assigned" && stockIdByTicker[o.ticker]) {
            payload.linked_stock_id = stockIdByTicker[o.ticker];
          }
          await base44.entities.OptionsTrade.create(payload);
          counts.optionsCreated++;
        } catch (e) { counts.errors.push(`create closed opt ${o.ticker} ${o.strike}: ${e.message}`); }
      }

      // 4. AccountSnapshot with the final cash + stocks + options=0 baseline
      const stocksValue = recon.stocks
        .filter((s) => s.status !== "Closed")
        .reduce((t, s) => t + s.current_value, 0);
      try {
        await base44.entities.AccountSnapshot.create({
          snapshot_date: new Date().toISOString().slice(0, 10),
          nav: recon.summary.endingCash + stocksValue,
          cash: recon.summary.endingCash,
          stocks_value: stocksValue,
          options_value: 0,
        });
        counts.snapshotCreated = true;
      } catch (e) { counts.errors.push(`create snapshot: ${e.message}`); }

      // 5. Invalidate every cache
      queryClient.invalidateQueries({ queryKey: ["entity"] });
      queryClient.invalidateQueries({ queryKey: ["function"] });

      setResult(counts);
      toast.success(`Reconciliation הושלם · ${counts.stocksCreated} מניות · ${counts.optionsCreated} אופציות`);
    } catch (e) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  // Top-level summary tiles
  const sum = recon?.summary;

  // Helpful aggregations for previews
  const totalRealized = useMemo(
    () => (recon?.closedOptions || []).reduce((s, o) => s + (o.pnl || 0), 0),
    [recon]
  );
  const openPremium = useMemo(
    () => (recon?.openOptions || []).reduce((s, o) => {
      const prem = o.avgFillPrice * o.initial_qty * 100;
      return s + (o.direction === "Short" ? prem : -prem);
    }, 0),
    [recon]
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">IB Reconciliation — בנייה מחדש מההיסטוריה</h1>
        <p className="text-sm text-muted-foreground mt-1">
          העלה Flex Query CSV של היסטוריית טרנזקציות מלאה. המערכת תחשב את מצב התיק הסופי
          (מניות, אופציות, מזומן) ותאפשר לך לאשר מחיקה של ה-DB הקיים ובנייה מחדש.
        </p>
      </div>

      {/* Step 1: Input */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span>
          <h2 className="text-sm font-semibold">העלה CSV מלא מ-IB</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="הדבק כאן את תוכן הקובץ..."
              className="font-mono text-xs min-h-[140px]"
            />
          </div>
          <div className="flex sm:flex-col gap-2">
            <label className="flex-1 sm:flex-initial">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
              <Button asChild variant="outline" className="w-full gap-2 cursor-pointer">
                <span><Upload className="w-4 h-4" /> העלה קובץ</span>
              </Button>
            </label>
            <Button onClick={handlePreview} disabled={!csvText.trim()} className="gap-2">
              <FileText className="w-4 h-4" /> נתח קובץ
            </Button>
          </div>
        </div>
      </div>

      {/* Step 2: Preview */}
      {recon && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <SummaryTile
              label="תקופה"
              value={`${sum.periodStart?.split(",")[0] || "?"}`}
              sub={`עד ${sum.periodEnd?.split(",")[0] || "?"}`}
              icon={FileText}
            />
            <SummaryTile
              label="הפקדות סה״כ"
              value={fmtUSD(sum.totalDeposits)}
              sub={`מ-$${sum.startingCash.toLocaleString()} התחלתי`}
              accent="text-profit"
              icon={Wallet}
            />
            <SummaryTile
              label="מזומן סופי"
              value={fmtUSD(sum.endingCash)}
              sub={Math.abs(sum.endingCash - (sum.csvEndingCash || sum.endingCash)) < 1
                ? "תואם CSV ✓"
                : `CSV אמר ${fmtUSD(sum.csvEndingCash)}`}
              icon={DollarSign}
            />
            <SummaryTile
              label="דיבידנדים נטו"
              value={fmtUSD2(sum.totalDividends + sum.totalTaxes)}
              sub={`גולמי ${fmtUSD2(sum.totalDividends)} · מס ${fmtUSD2(sum.totalTaxes)}`}
              accent="text-profit"
            />
            <SummaryTile
              label="P&L אופציות ממומש"
              value={fmtUSD(totalRealized)}
              accent={totalRealized >= 0 ? "text-profit" : "text-loss"}
              sub={`${recon.closedOptions.length} עסקאות סגורות`}
              icon={totalRealized >= 0 ? TrendingUp : TrendingDown}
            />
            <SummaryTile
              label="פרמיה פתוחה נטו"
              value={fmtUSD(openPremium)}
              sub={`${recon.openOptions.length} פוזיציות פתוחות`}
              icon={Layers}
            />
          </div>

          {/* Stocks table */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-semibold">מניות — {recon.stocks.length} tickers</h3>
            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-right px-3 py-2 font-medium">Ticker</th>
                    <th className="text-right px-3 py-2 font-medium">מקור</th>
                    <th className="text-right px-3 py-2 font-medium">מניות</th>
                    <th className="text-right px-3 py-2 font-medium">עלות ממוצעת</th>
                    <th className="text-right px-3 py-2 font-medium">שווי (עלות)</th>
                    <th className="text-right px-3 py-2 font-medium">P&L ממומש (ממכירות)</th>
                    <th className="text-right px-3 py-2 font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.stocks.map((s) => (
                    <tr key={s.ticker} className="border-t border-border/40">
                      <td className="px-3 py-2 font-mono font-bold">{s.ticker}</td>
                      <td className="px-3 py-2">
                        {s.linked_assignment && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Assignment
                          </span>
                        )}
                        {!s.linked_assignment && <span className="text-[10px] text-muted-foreground">Direct Buy</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-right">{s.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 font-mono text-right">{fmtUSD2(s.avgCost)}</td>
                      <td className="px-3 py-2 font-mono text-right">{fmtUSD(s.invested_value)}</td>
                      <td className={`px-3 py-2 font-mono text-right ${s.realizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
                        {fmtUSD2(s.realizedPnl)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${s.status === "Closed" ? "bg-muted text-muted-foreground" : "bg-profit/10 text-profit border-profit/20"}`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Open options table */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-semibold">אופציות פתוחות — {recon.openOptions.length}</h3>
            <div className="overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-right px-3 py-2 font-medium">Ticker</th>
                    <th className="text-right px-3 py-2 font-medium">Cat</th>
                    <th className="text-right px-3 py-2 font-medium">Strike</th>
                    <th className="text-right px-3 py-2 font-medium">Dir</th>
                    <th className="text-right px-3 py-2 font-medium">פקיעה</th>
                    <th className="text-right px-3 py-2 font-medium">Qty</th>
                    <th className="text-right px-3 py-2 font-medium">Fill $</th>
                    <th className="text-right px-3 py-2 font-medium">פרמיה</th>
                    <th className="text-right px-3 py-2 font-medium">Open Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.openOptions.map((o, i) => {
                    const prem = o.avgFillPrice * o.initial_qty * 100;
                    return (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-3 py-2 font-mono font-bold">{o.ticker}</td>
                        <td className="px-3 py-2">{o.category}</td>
                        <td className="px-3 py-2 font-mono text-right">${o.strike}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${o.direction === "Short" ? "bg-loss/10 text-loss" : "bg-primary/10 text-primary"}`}>
                            {o.direction}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px]">{o.expiration_date}</td>
                        <td className="px-3 py-2 font-mono text-right">{o.initial_qty}</td>
                        <td className="px-3 py-2 font-mono text-right">{fmtUSD2(o.avgFillPrice)}</td>
                        <td className={`px-3 py-2 font-mono text-right ${o.direction === "Short" ? "text-profit" : "text-loss"}`}>
                          {fmtUSD(o.direction === "Short" ? prem : -prem)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px]">{o.open_date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Closed options (includes assigned + expired OTM auto-classified) */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">אופציות סגורות — {recon.closedOptions.length}</h3>
              {recon.expiredOtm.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  {recon.expiredOtm.length} סווגו אוטומטית כ-Expired OTM
                </span>
              )}
            </div>
            <div className="overflow-x-auto border border-border rounded-xl max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="text-right px-3 py-2 font-medium">Ticker</th>
                    <th className="text-right px-3 py-2 font-medium">Cat</th>
                    <th className="text-right px-3 py-2 font-medium">Strike</th>
                    <th className="text-right px-3 py-2 font-medium">Dir</th>
                    <th className="text-right px-3 py-2 font-medium">Open → Close</th>
                    <th className="text-right px-3 py-2 font-medium">Qty</th>
                    <th className="text-right px-3 py-2 font-medium">Fill</th>
                    <th className="text-right px-3 py-2 font-medium">Close</th>
                    <th className="text-right px-3 py-2 font-medium">P&L</th>
                    <th className="text-right px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.closedOptions
                    .slice()
                    .sort((a, b) => (b.close_date || "").localeCompare(a.close_date || ""))
                    .map((o, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-3 py-2 font-mono font-bold">{o.ticker}</td>
                        <td className="px-3 py-2">{o.category}</td>
                        <td className="px-3 py-2 font-mono text-right">${o.strike}</td>
                        <td className="px-3 py-2 text-[10px]">{o.direction}</td>
                        <td className="px-3 py-2 font-mono text-[10px]">
                          {o.open_date} → {o.close_date}
                        </td>
                        <td className="px-3 py-2 font-mono text-right">{o.initial_qty}</td>
                        <td className="px-3 py-2 font-mono text-right">{fmtUSD2(o.avgFillPrice)}</td>
                        <td className="px-3 py-2 font-mono text-right">
                          {o.close_price != null ? fmtUSD2(o.close_price) : "—"}
                        </td>
                        <td className={`px-3 py-2 font-mono text-right ${(o.pnl || 0) >= 0 ? "text-profit" : "text-loss"}`}>
                          {fmtUSD(o.pnl)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusColor[o.status] || ""}`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Apply confirmation */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-amber-700">אזהרה — פעולה לא הפיכה</h3>
                <p className="text-xs text-amber-700/80 mt-1">
                  לחיצה על "החל" תבצע:
                </p>
                <ul className="text-xs text-amber-700/80 mt-2 space-y-0.5 list-disc mr-5">
                  <li>מחיקת כל ה-OptionsTrade הקיימות (כולל הכפולות שייצרת בטעות)</li>
                  <li>מחיקת כל ה-StockPosition הקיימות</li>
                  <li>יצירת {recon.stocks.length} מניות חדשות ו-{recon.openOptions.length + recon.closedOptions.length} אופציות מההיסטוריה</li>
                  <li>יצירת AccountSnapshot עם ${sum.endingCash.toFixed(0)} מזומן</li>
                </ul>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmWipe}
                onChange={(e) => setConfirmWipe(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">אני מבין — בצע wipe & rebuild</span>
            </label>

            <Button
              onClick={handleApply}
              disabled={!confirmWipe || applying}
              className="w-full gap-2"
              variant="default"
            >
              {applying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {applying ? "מבצע..." : "החל — מחק ובנה מחדש"}
            </Button>
          </div>
        </>
      )}

      {/* Result */}
      {result && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-profit" />
            <h3 className="text-sm font-semibold">הושלם</h3>
          </div>
          <ul className="text-xs space-y-1">
            <li>🗑️ נמחקו {result.optionsDeleted} אופציות ישנות</li>
            <li>🗑️ נמחקו {result.stocksDeleted} מניות ישנות</li>
            <li>✅ נוצרו {result.stocksCreated} מניות חדשות</li>
            <li>✅ נוצרו {result.optionsCreated} אופציות (פתוחות + סגורות + Expired OTM)</li>
            {result.snapshotCreated && <li>✅ נוצר AccountSnapshot</li>}
          </ul>
          {result.errors.length > 0 && (
            <div className="bg-loss/10 border border-loss/20 rounded-lg p-3 space-y-1 max-h-[200px] overflow-y-auto">
              <p className="text-loss text-xs font-semibold">שגיאות ({result.errors.length}):</p>
              {result.errors.map((e, i) => <p key={i} className="text-xs text-loss">{e}</p>)}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            כל הדשבורדים והעמודים מתעדכנים מיד. ניתן לסגור את העמוד הזה.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-loss/10 border border-loss/20 rounded-2xl p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-loss mt-0.5 flex-shrink-0" />
          <p className="text-sm text-loss">{error}</p>
        </div>
      )}
    </div>
  );
}
