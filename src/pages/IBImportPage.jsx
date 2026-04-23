import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowDownToLine, ArrowUpToLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parseIbCsv, decideActions } from "@/components/ib-import/csvParser";
import { useEntityList } from "@/hooks/useEntityQuery";

const fmtUSD = (v) =>
  v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const actionMeta = {
  close_short: { label: "סגירת Short", icon: ArrowUpToLine, color: "text-amber-500", bg: "bg-amber-500/10" },
  close_long: { label: "סגירת Long", icon: ArrowUpToLine, color: "text-amber-500", bg: "bg-amber-500/10" },
  open_short: { label: "פתיחת Short", icon: ArrowDownToLine, color: "text-blue-500", bg: "bg-blue-500/10" },
  open_long: { label: "פתיחת Long", icon: ArrowDownToLine, color: "text-blue-500", bg: "bg-blue-500/10" },
  skip: { label: "מדלג", icon: Trash2, color: "text-muted-foreground", bg: "bg-muted" },
};

export default function IBImportPage() {
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [snapshotDate, setSnapshotDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: openOptions = [], refetch: refetchOptions } = useEntityList(
    "OptionsTrade",
    { filter: { status: "Open" }, queryOptions: { refetchInterval: false } }
  );

  const canPreview = csvText.trim().length > 0;
  const canApply = decisions.length > 0 && !applying;

  // Summary breakdown of what will happen
  const summary = useMemo(() => {
    const counts = { close_short: 0, close_long: 0, open_short: 0, open_long: 0, skip: 0 };
    let totalPnl = 0;
    for (const d of decisions) {
      counts[d.action] = (counts[d.action] || 0) + 1;
      if (d.updates?.pnl) totalPnl += d.updates.pnl;
    }
    return { counts, totalPnl };
  }, [decisions]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setParsed(null);
    setDecisions([]);
    setResult(null);
  };

  const handlePreview = () => {
    setResult(null);
    try {
      const p = parseIbCsv(csvText);
      setParsed(p);
      const d = decideActions(p.transactions, openOptions);
      setDecisions(d);
      if (!d.length) {
        toast.info("לא זוהו פעולות אופציות ב-CSV");
      } else {
        toast.success(`זוהו ${d.length} פעולות`);
      }
    } catch (e) {
      toast.error(`שגיאה בפענוח: ${e.message}`);
    }
  };

  const removeDecision = (idx) => {
    setDecisions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleApply = async () => {
    if (!decisions.length) return;
    setApplying(true);
    const results = { closed: 0, opened: 0, skipped: 0, errors: [] };
    try {
      for (const d of decisions) {
        try {
          if (d.action === "close_short" || d.action === "close_long") {
            await base44.entities.OptionsTrade.update(d.matched.id, d.updates);
            results.closed++;
          } else if (d.action === "open_short" || d.action === "open_long") {
            await base44.entities.OptionsTrade.create(d.newTrade);
            results.opened++;
          } else {
            results.skipped++;
          }
        } catch (e) {
          results.errors.push(`${d.tx.symbol}: ${e.message}`);
        }
      }

      // Update AccountSnapshot cash (if provided in CSV summary)
      if (parsed?.summary?.endingCash != null) {
        try {
          await base44.entities.AccountSnapshot.create({
            snapshot_date: snapshotDate,
            nav: parsed.summary.endingCash, // will be recomputed by dashboard from cash+stocks+options
            cash: parsed.summary.endingCash,
          });
          results.snapshotCreated = true;
        } catch (e) {
          results.errors.push(`Snapshot: ${e.message}`);
        }
      }

      // Invalidate everything so dashboards refresh immediately
      queryClient.invalidateQueries({ queryKey: ["entity"] });
      queryClient.invalidateQueries({ queryKey: ["function"] });
      refetchOptions();

      setResult(results);
      toast.success(`יובא בהצלחה: ${results.closed} סגירות, ${results.opened} פתיחות`);
    } finally {
      setApplying(false);
    }
  };

  const reset = () => {
    setCsvText("");
    setParsed(null);
    setDecisions([]);
    setResult(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ייבוא טרנזקציות מ-Interactive Brokers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          העלה CSV של Flex Query (Transaction History). המערכת תתאים אוטומטית סגירות לפוזיציות קיימות ותייצר פוזיציות חדשות לפתיחות.
        </p>
      </div>

      {/* Step 1: Input */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span>
          <h2 className="text-sm font-semibold">הדבק או העלה CSV</h2>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="הדבק כאן את תוכן קובץ ה-CSV מ-IB Flex Query..."
              className="font-mono text-xs min-h-[150px]"
            />
          </div>
          <div className="flex sm:flex-col gap-2">
            <label className="flex-1 sm:flex-initial">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
              <Button asChild variant="outline" className="w-full gap-2 cursor-pointer">
                <span><Upload className="w-4 h-4" /> העלה קובץ</span>
              </Button>
            </label>
            <Button onClick={handlePreview} disabled={!canPreview} className="flex-1 sm:flex-initial gap-2">
              <FileText className="w-4 h-4" /> תצוגה מקדימה
            </Button>
          </div>
        </div>
      </div>

      {/* Step 2: Preview */}
      {parsed && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">2</span>
              <h2 className="text-sm font-semibold">בדוק מה יקרה</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {parsed.period?.start && parsed.period?.end ? `${parsed.period.start} — ${parsed.period.end}` : ""}
            </span>
          </div>

          {/* Cash summary */}
          {parsed.summary.endingCash != null && (
            <div className="bg-muted/30 border border-border rounded-xl p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">סיכום מזומן (IB)</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Starting Cash</p>
                  <p className="font-mono font-semibold">{fmtUSD(parsed.summary.startingCash)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Change</p>
                  <p className={`font-mono font-semibold ${(parsed.summary.change || 0) >= 0 ? "text-profit" : "text-loss"}`}>
                    {fmtUSD(parsed.summary.change)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ending Cash</p>
                  <p className="font-mono font-semibold text-lg">{fmtUSD(parsed.summary.endingCash)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-muted-foreground">תאריך snapshot:</label>
                <Input
                  type="date"
                  value={snapshotDate}
                  onChange={(e) => setSnapshotDate(e.target.value)}
                  className="h-8 w-40 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">ייווצר AccountSnapshot חדש עם מזומן זה</span>
              </div>
            </div>
          )}

          {/* Action summary */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.counts).map(([k, n]) => {
              if (!n) return null;
              const m = actionMeta[k];
              return (
                <span key={k} className={`text-xs px-3 py-1.5 rounded-full ${m.bg} ${m.color} font-medium`}>
                  {m.label}: {n}
                </span>
              );
            })}
            {summary.totalPnl !== 0 && (
              <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${summary.totalPnl >= 0 ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>
                P&L ממומש: {fmtUSD(summary.totalPnl)}
              </span>
            )}
          </div>

          {/* Decisions table — desktop */}
          {decisions.length > 0 && (
            <>
              <div className="hidden md:block overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="text-right px-3 py-2 font-medium">תאריך</th>
                      <th className="text-right px-3 py-2 font-medium">פעולה</th>
                      <th className="text-right px-3 py-2 font-medium">Ticker</th>
                      <th className="text-right px-3 py-2 font-medium">סוג</th>
                      <th className="text-right px-3 py-2 font-medium">Strike</th>
                      <th className="text-right px-3 py-2 font-medium">פקיעה</th>
                      <th className="text-right px-3 py-2 font-medium">כמות</th>
                      <th className="text-right px-3 py-2 font-medium">מחיר</th>
                      <th className="text-right px-3 py-2 font-medium">נטו</th>
                      <th className="text-right px-3 py-2 font-medium">P&L</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.map((d, i) => {
                      const m = actionMeta[d.action];
                      const Icon = m.icon;
                      return (
                        <tr key={i} className="border-t border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono text-[11px]">{d.tx.date}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 ${m.color}`}>
                              <Icon className="w-3 h-3" /> {m.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono font-bold">{d.tx.ticker}</td>
                          <td className="px-3 py-2">{d.tx.category}</td>
                          <td className="px-3 py-2 font-mono text-right">${d.tx.strike}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">{d.tx.expiration_date}</td>
                          <td className="px-3 py-2 font-mono text-right">{Math.abs(d.tx.quantity)}</td>
                          <td className="px-3 py-2 font-mono text-right">{fmtUSD(d.tx.price)}</td>
                          <td className="px-3 py-2 font-mono text-right">{fmtUSD(d.tx.net)}</td>
                          <td className="px-3 py-2 font-mono text-right">
                            {d.updates?.pnl != null ? (
                              <span className={d.updates.pnl >= 0 ? "text-profit" : "text-loss"}>
                                {fmtUSD(d.updates.pnl)}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => removeDecision(i)}
                              className="text-muted-foreground hover:text-destructive p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              aria-label="remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile decision cards */}
              <div className="md:hidden space-y-2">
                {decisions.map((d, i) => {
                  const m = actionMeta[d.action];
                  const Icon = m.icon;
                  return (
                    <div key={i} className="border border-border rounded-xl px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.color}`}>
                            <Icon className="w-3.5 h-3.5" /> {m.label}
                          </span>
                          <span className="font-mono font-bold">{d.tx.ticker}</span>
                          <span className="text-xs text-muted-foreground">{d.tx.category}</span>
                        </div>
                        <button
                          onClick={() => removeDecision(i)}
                          className="text-muted-foreground hover:text-destructive h-11 w-11 flex items-center justify-center"
                          aria-label="remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Strike</p>
                          <p className="font-mono">${d.tx.strike}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">פקיעה</p>
                          <p className="font-mono">{d.tx.expiration_date}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">כמות</p>
                          <p className="font-mono">{Math.abs(d.tx.quantity)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">נטו</p>
                          <p className="font-mono">{fmtUSD(d.tx.net)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">P&L</p>
                          {d.updates?.pnl != null ? (
                            <p className={`font-mono font-semibold ${d.updates.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                              {fmtUSD(d.updates.pnl)}
                            </p>
                          ) : <p className="text-muted-foreground">—</p>}
                        </div>
                        <div>
                          <p className="text-muted-foreground">תאריך</p>
                          <p className="font-mono text-[11px]">{d.tx.date}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {parsed.otherRows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {parsed.otherRows.length} שורות שאינן אופציות יתעלמו (למשל מניות, דיבידנדים וכו׳).
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>נקה הכל</Button>
            <Button onClick={handleApply} disabled={!canApply} className="flex-1 gap-2">
              <CheckCircle2 className="w-4 h-4" /> {applying ? "מייבא..." : `ייבא ${decisions.length} פעולות`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {result && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-profit" />
            <h2 className="text-sm font-semibold">הייבוא הושלם</h2>
          </div>
          <ul className="text-xs space-y-1">
            <li>✓ {result.closed} פוזיציות נסגרו</li>
            <li>✓ {result.opened} פוזיציות חדשות נפתחו</li>
            {result.skipped > 0 && <li>· {result.skipped} דולגו</li>}
            {result.snapshotCreated && <li>✓ נוצר AccountSnapshot חדש עם מזומן IB</li>}
          </ul>
          {result.errors.length > 0 && (
            <div className="bg-loss/10 border border-loss/20 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-loss text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> שגיאות
              </div>
              {result.errors.map((e, i) => <p key={i} className="text-xs text-loss">{e}</p>)}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={reset}>ייבוא נוסף</Button>
          </div>
        </div>
      )}
    </div>
  );
}