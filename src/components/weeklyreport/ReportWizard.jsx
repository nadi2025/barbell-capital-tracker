import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, ChevronLeft, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { differenceInHours } from "date-fns";

// Is a date string stale (older than 48h)?
function isStale(dateStr) {
  if (!dateStr) return true;
  return differenceInHours(new Date(), new Date(dateStr)) > 48;
}

export default function ReportWizard({ appData, lastReport, onComplete, onCancel }) {
  const { assets, aaveAccount, aaveCollateral } = appData;

  // Derive staleness
  const btcAsset = assets.find(a => ["BTC", "WBTC"].includes(a.token?.toUpperCase()));
  const ethAsset = assets.find(a => ["ETH", "WETH"].includes(a.token?.toUpperCase()));
  const aaveAsset = assets.find(a => a.token?.toUpperCase() === "AAVE");
  const mstrAsset = assets.find(a => a.token?.toUpperCase() === "MSTR");

  const pricesStale = isStale(btcAsset?.last_updated) || isStale(ethAsset?.last_updated) || isStale(aaveAsset?.last_updated);
  const aaveStale = isStale(aaveAccount?.updated_date);

  const [step, setStep] = useState(0); // 0-3 = wizard questions, 4 = validation, 5 = review
  const [answers, setAnswers] = useState({
    ib_nav: lastReport?.ib_nav ? String(lastReport.ib_nav) : "",
    ib_options_pnl: lastReport?.wizard_ib_options_pnl != null ? String(lastReport.wizard_ib_options_pnl) : "",
    ib_win_rate: lastReport?.wizard_ib_win_rate != null ? String(lastReport.wizard_ib_win_rate) : "",
    ib_stocks_pnl: lastReport?.wizard_ib_stocks_pnl != null ? String(lastReport.wizard_ib_stocks_pnl) : "",
    notes: lastReport?.notes || "",
    // manual price overrides (only if stale)
    btc_price: btcAsset?.current_price_usd ? String(btcAsset.current_price_usd) : "",
    eth_price: ethAsset?.current_price_usd ? String(ethAsset.current_price_usd) : "",
    aave_price: aaveAsset?.current_price_usd ? String(aaveAsset.current_price_usd) : "",
    mstr_price: mstrAsset?.current_price_usd ? String(mstrAsset.current_price_usd) : "",
  });
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  const set = (key, val) => setAnswers(a => ({ ...a, [key]: val }));

  const handleRefreshPrices = async () => {
    setRefreshingPrices(true);
    try {
      const res = await base44.functions.invoke("fetchLivePrices", {});
      const cr = res.data?.crypto || {};
      if (cr.BTC) set("btc_price", String(cr.BTC));
      if (cr.ETH) set("eth_price", String(cr.ETH));
      if (cr.AAVE) set("aave_price", String(cr.AAVE));
      if (cr.MSTR || res.data?.stocks?.MSTR) set("mstr_price", String(cr.MSTR || res.data.stocks.MSTR));
    } catch (e) {
      // ignore, user can type manually
    }
    setRefreshingPrices(false);
  };

  const handleNext = () => {
    if (step < 3) { setStep(s => s + 1); return; }
    if (step === 3) {
      // After Q4 (notes), check if validation screen needed
      if (pricesStale) { setStep(4); return; }
      setStep(5); return;
    }
    if (step === 4) { setStep(5); return; }
  };

  const handleSubmit = () => {
    const parsed = {
      ib_nav: parseFloat(answers.ib_nav) || 0,
      ib_options_pnl: parseFloat(answers.ib_options_pnl) || 0,
      ib_win_rate: parseFloat(answers.ib_win_rate) || 0,
      ib_stocks_pnl: parseFloat(answers.ib_stocks_pnl) || 0,
      notes: answers.notes,
      btc_price: parseFloat(answers.btc_price) || btcAsset?.current_price_usd || 0,
      eth_price: parseFloat(answers.eth_price) || ethAsset?.current_price_usd || 0,
      aave_price: parseFloat(answers.aave_price) || aaveAsset?.current_price_usd || 0,
      mstr_price: parseFloat(answers.mstr_price) || mstrAsset?.current_price_usd || 0,
    };
    onComplete(parsed);
  };

  const progress = Math.min(100, (step / 5) * 100);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 max-w-lg mx-auto" dir="rtl">
      {/* Progress */}
      <div className="flex justify-between text-xs text-muted-foreground mb-3">
        <span>{step < 4 ? `שאלה ${step + 1} מתוך 4` : step === 4 ? "עדכון מחירים" : "סיכום"}</span>
        <button onClick={onCancel} className="hover:text-foreground">ביטול</button>
      </div>
      <div className="w-full bg-muted rounded-full h-1 mb-6">
        <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* Step 0: IB NAV */}
      {step === 0 && (
        <div className="space-y-4">
          <label className="text-lg font-bold block">מה ה-NAV של תיק IB?</label>
          <p className="text-sm text-muted-foreground">היכנס ל-Interactive Brokers ובדוק את שווי התיק הכולל</p>
          <div className="relative">
            <Input type="number" value={answers.ib_nav} onChange={e => set("ib_nav", e.target.value)}
              className="text-xl h-14 pl-16 font-mono" placeholder="0" autoFocus
              onKeyDown={e => e.key === "Enter" && answers.ib_nav && setStep(1)} />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">USD</span>
          </div>
        </div>
      )}

      {/* Step 1: IB Options */}
      {step === 1 && (
        <div className="space-y-4">
          <label className="text-lg font-bold block">IB אופציות — P&L ו-Win Rate</label>
          <p className="text-sm text-muted-foreground">P&L ממומש מאופציות השבוע (יכול להיות שלילי)</p>
          <div className="space-y-3">
            <div className="relative">
              <Input type="number" value={answers.ib_options_pnl} onChange={e => set("ib_options_pnl", e.target.value)}
                className="h-12 pl-16 font-mono" placeholder="P&L ממומש" autoFocus />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">USD</span>
            </div>
            <div className="relative">
              <Input type="number" value={answers.ib_win_rate} onChange={e => set("ib_win_rate", e.target.value)}
                className="h-12 pl-12 font-mono" placeholder="Win Rate" min="0" max="100" />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: IB Stocks PnL */}
      {step === 2 && (
        <div className="space-y-4">
          <label className="text-lg font-bold block">P&L לא ממומש — מניות IB</label>
          <p className="text-sm text-muted-foreground">עמדת המניות הפתוחות (יכול להיות שלילי)</p>
          <div className="relative">
            <Input type="number" value={answers.ib_stocks_pnl} onChange={e => set("ib_stocks_pnl", e.target.value)}
              className="text-xl h-14 pl-16 font-mono" placeholder="0" autoFocus
              onKeyDown={e => e.key === "Enter" && setStep(3)} />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">USD</span>
          </div>
        </div>
      )}

      {/* Step 3: Notes */}
      {step === 3 && (
        <div className="space-y-4">
          <label className="text-lg font-bold block">הערות לדוח (אופציונלי)</label>
          <p className="text-sm text-muted-foreground">כל הערה שתופיע בדוח — ניתן לדלג</p>
          <textarea value={answers.notes} onChange={e => set("notes", e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-transparent resize-none min-h-[100px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="(אופציונלי)" autoFocus />
        </div>
      )}

      {/* Step 4: Price validation */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <label className="text-lg font-bold">מחירי קריפטו לא עודכנו לאחרונה</label>
          </div>
          <p className="text-sm text-muted-foreground">עדכן מחירים ממקור חי או הזן ידנית</p>
          <Button variant="outline" onClick={handleRefreshPrices} disabled={refreshingPrices} className="w-full gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshingPrices ? "animate-spin" : ""}`} />
            {refreshingPrices ? "מעדכן..." : "עדכן מחירים אוטומטית"}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            {[["btc_price", "BTC"], ["eth_price", "ETH"], ["aave_price", "AAVE"], ["mstr_price", "MSTR"]].map(([k, label]) => (
              <div key={k}>
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <Input type="number" value={answers[k]} onChange={e => set(k, e.target.value)}
                  className="h-9 font-mono text-sm" placeholder="0" />
              </div>
            ))}
          </div>
          {aaveStale && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>נתוני Aave לא עודכנו. <a href="/crypto/aave" className="underline font-semibold">עבור לעמוד Aave</a></span>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="space-y-3">
          <label className="text-lg font-bold block">סיכום — בדוק ואשר</label>
          <div className="space-y-1.5 text-sm">
            {[
              ["IB NAV", `$${parseFloat(answers.ib_nav || 0).toLocaleString()}`],
              ["IB Options P&L", `$${parseFloat(answers.ib_options_pnl || 0).toLocaleString()}`],
              ["IB Win Rate", `${answers.ib_win_rate || 0}%`],
              ["IB Stocks P&L", `$${parseFloat(answers.ib_stocks_pnl || 0).toLocaleString()}`],
              ["BTC", `$${parseFloat(answers.btc_price || btcAsset?.current_price_usd || 0).toLocaleString()}`],
              ["ETH", `$${parseFloat(answers.eth_price || ethAsset?.current_price_usd || 0).toLocaleString()}`],
              ["AAVE", `$${parseFloat(answers.aave_price || aaveAsset?.current_price_usd || 0).toLocaleString()}`],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-border/30 py-1">
                <span className="text-muted-foreground">{l}</span>
                <span className="font-mono font-semibold">{v}</span>
              </div>
            ))}
            {answers.notes && <div className="mt-2 text-xs text-muted-foreground">{answers.notes}</div>}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            לאחר הלחיצה על "הפק דוח" — ייפתח חלון עם הדוח המוכן. לחץ Ctrl+P / Cmd+P לשמירה כ-PDF.
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-2 mt-6">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> הקודם
          </Button>
        )}
        {step < 5 ? (
          <Button className="flex-1 gap-1" onClick={handleNext}
            disabled={step === 0 && (!answers.ib_nav || parseFloat(answers.ib_nav) <= 0)}>
            {step === 3 ? (pricesStale ? "הבא: עדכון מחירים" : "סיכום") : step === 4 ? "סיכום" : "הבא"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button className="flex-1" onClick={handleSubmit}>הפק דוח ✓</Button>
        )}
      </div>
    </div>
  );
}