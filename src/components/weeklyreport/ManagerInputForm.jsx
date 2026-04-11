import { useState } from "react";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function ManagerInputForm({ onSubmit, onBack }) {
  const today = new Date();
  const [form, setForm] = useState({
    period_start: format(subDays(today, 7), "yyyy-MM-dd"),
    period_end: format(today, "yyyy-MM-dd"),
    manager_summary: "",
    actions_taken: "",
    next_week_plan: "",
    risks_notes: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-card border border-border rounded-xl p-6 max-w-xl mx-auto space-y-4" dir="rtl">
      <div>
        <h2 className="text-lg font-bold">הערות המנהל</h2>
        <p className="text-sm text-muted-foreground mt-1">כל השדות אופציונליים — ניתן להשאיר ריק</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>תחילת תקופה</Label>
          <Input type="date" value={form.period_start} onChange={e => set("period_start", e.target.value)} />
        </div>
        <div>
          <Label>סוף תקופה</Label>
          <Input type="date" value={form.period_end} onChange={e => set("period_end", e.target.value)} />
        </div>
      </div>

      {[
        { key: "manager_summary", label: "סיכום שבועי", placeholder: "מה קרה השבוע? אירועי שוק, החלטות מפתח..." },
        { key: "actions_taken", label: "פעולות שבוצעו השבוע", placeholder: "עסקאות, ריאורגניזציה, תשלומים..." },
        { key: "next_week_plan", label: "תכנית לשבוע הבא", placeholder: "מה מתוכנן? מה לצפות?" },
        { key: "risks_notes", label: "סיכונים ודגשים", placeholder: "סיכונים ספציפיים, פריטים לתשומת לב ההנהלה..." },
      ].map(f => (
        <div key={f.key}>
          <Label>{f.label}</Label>
          <textarea
            className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm bg-transparent resize-none min-h-[70px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder={f.placeholder}
            value={form[f.key]}
            onChange={e => set(f.key, e.target.value)}
          />
        </div>
      ))}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">חזור</Button>
        <Button onClick={() => onSubmit(form)} className="flex-1">הפק דוח PDF</Button>
      </div>
    </div>
  );
}