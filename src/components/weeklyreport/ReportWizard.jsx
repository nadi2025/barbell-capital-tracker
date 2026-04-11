import { useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fmtUSD = (v) => v == null ? "" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function ReportWizard({ defaults, onComplete, onCancel }) {
  const QUESTIONS = [
    { key: "ib_nav", label: "מה ה-NAV הנוכחי בתיק IB?", type: "number", unit: "USD", hint: "היכנס ל-IB ובדוק את שווי התיק הנוכחי" },
    { key: "ib_options_pnl", label: "מה ה-P&L הממומש על אופציות ב-IB השבוע?", type: "number", unit: "USD", hint: "יכול להיות שלילי. בדוק ב-IB תחת Realized P&L" },
    { key: "ib_stocks_pnl", label: "מה ה-P&L הלא ממומש על מניות ב-IB?", type: "number", unit: "USD", hint: "Unrealized P&L על פוזיציות מניות פתוחות" },
    { key: "ib_premium_total", label: "מה סכום הפרמיה שנגבתה ב-IB (מצטבר)?", type: "number", unit: "USD", hint: "סה״כ פרמיה שנגבה מתחילת הפעילות" },
    { key: "ib_win_rate", label: "מה ה-Win Rate על אופציות ב-IB?", type: "number", unit: "%", hint: "אחוז עסקאות שהסתיימו ברווח" },
    { key: "btc_price", label: "מה מחיר ה-BTC הנוכחי?", type: "number", unit: "USD", hint: "מחיר Bitcoin עכשיו" },
    { key: "eth_price", label: "מה מחיר ה-ETH הנוכחי?", type: "number", unit: "USD", hint: "מחיר Ethereum עכשיו" },
    { key: "aave_price", label: "מה מחיר ה-AAVE הנוכחי?", type: "number", unit: "USD", hint: "מחיר AAVE עכשיו" },
    { key: "mstr_price", label: "מה מחיר ה-MSTR הנוכחי?", type: "number", unit: "USD", hint: "מחיר MicroStrategy עכשיו" },
    { key: "aave_borrowed", label: "מה סכום החוב הנוכחי ב-Aave? (USDC)", type: "number", unit: "USD", hint: "כמה USDC לווית ב-Aave כרגע" },
    { key: "aave_hf", label: "מה ה-Health Factor הנוכחי ב-Aave?", type: "number", unit: "", hint: "מספר עשרוני, לדוגמה: 2.55" },
    { key: "manager_notes", label: "הערות או דגשים לדוח? (אופציונלי)", type: "textarea", unit: "", hint: "כל הערה שתרצה שתופיע בדוח — אירועים, החלטות, דגשים" },
  ];

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => {
    const init = {};
    QUESTIONS.forEach(q => { init[q.key] = defaults[q.key] != null ? String(defaults[q.key]) : ""; });
    return init;
  });
  const [showSummary, setShowSummary] = useState(false);

  const current = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  const handleNext = () => {
    if (isLast) setShowSummary(true);
    else setStep(s => s + 1);
  };

  const handleBack = () => {
    if (showSummary) { setShowSummary(false); return; }
    if (step > 0) setStep(s => s - 1);
  };

  const handleGenerate = () => {
    const parsed = {};
    QUESTIONS.forEach(q => {
      const v = answers[q.key];
      if (q.type === "number") parsed[q.key] = v !== "" ? parseFloat(v) : null;
      else parsed[q.key] = v;
    });
    onComplete(parsed);
  };

  if (showSummary) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 max-w-lg mx-auto space-y-4" dir="rtl">
        <h2 className="text-lg font-bold">סיכום לפני הפקת דוח</h2>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {QUESTIONS.map((q, i) => (
            <div key={q.key} className="flex justify-between items-start text-sm py-1.5 border-b border-border/30">
              <span className="text-muted-foreground text-xs flex-1 ml-4">{q.label}</span>
              <span className="font-mono font-medium text-right">
                {answers[q.key] || <span className="text-muted-foreground italic">ריק</span>}
                {q.unit && answers[q.key] ? ` ${q.unit}` : ""}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={handleBack} className="flex-1 gap-1"><ChevronLeft className="w-4 h-4" /> ערוך</Button>
          <Button onClick={handleGenerate} className="flex-1">הפק דוח ✓</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-8 max-w-lg mx-auto space-y-6" dir="rtl">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>שאלה {step + 1} מתוך {QUESTIONS.length}</span>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">ביטול</button>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
        </div>
      </div>

      {/* Question */}
      <div className="space-y-3">
        <label className="text-lg font-bold leading-snug block">{current.label}</label>
        {current.hint && <p className="text-sm text-muted-foreground">{current.hint}</p>}

        {current.type === "textarea" ? (
          <textarea
            className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-transparent resize-none min-h-[100px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={answers[current.key]}
            onChange={e => setAnswers(a => ({ ...a, [current.key]: e.target.value }))}
            placeholder="(אופציונלי)"
            autoFocus
          />
        ) : (
          <div className="relative">
            <Input
              type="number"
              value={answers[current.key]}
              onChange={e => setAnswers(a => ({ ...a, [current.key]: e.target.value }))}
              className="text-lg h-12 pr-3 pl-16 font-mono"
              placeholder="0"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleNext()}
            />
            {current.unit && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">{current.unit}</span>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={handleBack} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> הקודם
          </Button>
        )}
        <Button onClick={handleNext} className="flex-1 gap-1">
          {isLast ? "סיכום →" : "הבא"} <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}