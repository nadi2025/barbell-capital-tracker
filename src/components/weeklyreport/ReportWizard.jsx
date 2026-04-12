import { useState } from "react";
import { ChevronRight, ChevronLeft, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

const QUESTIONS = [
  { key: "ib_nav", label: "מה ה-NAV הנוכחי בתיק IB?", type: "number", unit: "USD", hint: "היכנס ל-IB ובדוק את שווי התיק הנוכחי" },
  { key: "ib_options_pnl", label: "מה ה-P&L הממומש על אופציות ב-IB השבוע?", type: "number", unit: "USD", hint: "יכול להיות שלילי. בדוק ב-IB תחת Realized P&L" },
  { key: "ib_win_rate", label: "מה ה-Win Rate על אופציות ב-IB?", type: "number", unit: "%", hint: "אחוז עסקאות שהסתיימו ברווח" },
  { key: "manager_notes", label: "הערות או דגשים לדוח? (אופציונלי)", type: "textarea", unit: "", hint: "כל הערה שתרצה שתופיע בדוח" },
];

export default function ReportWizard({ defaults, dataSources, onComplete, onCancel }) {
  const [phase, setPhase] = useState("checklist"); // "checklist" | "questions" | "summary"
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => {
    const init = {};
    const d = defaults || {};
    QUESTIONS.forEach(q => { init[q.key] = d[q.key] != null ? String(d[q.key]) : ""; });
    return init;
  });

  const current = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  const handleGenerate = () => {
    const parsed = {};
    QUESTIONS.forEach(q => {
      const v = answers[q.key];
      parsed[q.key] = q.type === "number" ? (v !== "" ? parseFloat(v) : null) : v;
    });
    onComplete(parsed);
  };

  if (phase === "checklist") {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 max-w-lg mx-auto space-y-4" dir="rtl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">לפני הפקת הדוח</h2>
            <p className="text-sm text-muted-foreground mt-1">וודא שהנתונים הבאים מעודכנים לפני שתמשיך</p>
          </div>
          <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">ביטול</button>
        </div>

        <div className="space-y-2">
          {(dataSources || []).map(src => (
            <div key={src.label} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">{src.label}</p>
                {src.lastUpdated && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    עודכן: {format(new Date(src.lastUpdated), "d.M.yy HH:mm")}
                  </p>
                )}
              </div>
              <a href={src.path} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                  <ExternalLink className="w-3 h-3" /> עדכן
                </Button>
              </a>
            </div>
          ))}
        </div>

        <Button className="w-full gap-2" onClick={() => setPhase("questions")}>
          המשך לשאלון <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 max-w-lg mx-auto space-y-4" dir="rtl">
        <h2 className="text-lg font-bold">סיכום לפני הפקת דוח</h2>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {QUESTIONS.map(q => (
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
          <Button variant="outline" onClick={() => setPhase("questions")} className="flex-1 gap-1">
            <ChevronLeft className="w-4 h-4" /> ערוך
          </Button>
          <Button onClick={handleGenerate} className="flex-1">הפק דוח ✓</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-8 max-w-lg mx-auto space-y-6" dir="rtl">
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>שאלה {step + 1} מתוך {QUESTIONS.length}</span>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">ביטול</button>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
        </div>
      </div>

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
              onKeyDown={e => { if (e.key === "Enter") isLast ? setPhase("summary") : setStep(s => s + 1); }}
            />
            {current.unit && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">{current.unit}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> הקודם
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setPhase("checklist")} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> חזור
          </Button>
        )}
        <Button onClick={() => isLast ? setPhase("summary") : setStep(s => s + 1)} className="flex-1 gap-1">
          {isLast ? "סיכום →" : "הבא"} <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}