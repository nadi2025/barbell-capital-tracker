import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import MobileSelect from "@/components/ui/MobileSelect";
import { Copy, Check, AlertTriangle, Mail } from "lucide-react";
import {
  computeInvestorAccrual,
  aggregateByCurrency,
  buildEmailBody,
  fmtAmount,
  fmtDateDMY,
  EMAIL_SUBJECT,
} from "./emailGeneratorMath";

const SYMBOL = { USD: "$", ILS: "₪", EUR: "€" };

export default function InvestorEmailGeneratorDialog({ open, onClose, investors = [], payments = [], initialInvestor = null }) {
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [selectionMode, setSelectionMode] = useState("single"); // "single" | "all"
  const [selectedInvestorId, setSelectedInvestorId] = useState("");
  const [subject, setSubject] = useState(EMAIL_SUBJECT);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState({ subject: false, body: false, all: false });

  // Group investors by name (Hebrew). One name can have multiple investments.
  const grouped = useMemo(() => {
    const map = {};
    investors.forEach((inv) => {
      const key = (inv.name || "").trim();
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(inv);
    });
    return map;
  }, [investors]);

  const nameOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(grouped)
      .filter(([name, list]) => {
        if (!q) return true;
        const en = list[0]?.name_en?.toLowerCase() || "";
        return name.toLowerCase().includes(q) || en.includes(q);
      })
      .map(([name, list]) => {
        const totalsByCcy = {};
        list.forEach((i) => {
          totalsByCcy[i.currency || "USD"] = (totalsByCcy[i.currency || "USD"] || 0) + (Number(i.principal) || 0);
        });
        const summary = Object.entries(totalsByCcy)
          .map(([c, v]) => `${SYMBOL[c] || ""}${Math.round(v).toLocaleString("en-US")}`)
          .join(" · ");
        return {
          value: name,
          label: `${name}${list.length > 1 ? ` · ${list.length} השקעות` : ""} · ${summary}`,
        };
      });
  }, [grouped, search]);

  // Initialize when dialog opens
  useEffect(() => {
    if (!open) return;
    if (initialInvestor) {
      const name = (initialInvestor.name || "").trim();
      setSelectedName(name);
      const sameName = grouped[name] || [];
      if (sameName.length > 1) {
        setSelectionMode("single");
        setSelectedInvestorId(initialInvestor.id);
      } else {
        setSelectionMode("single");
        setSelectedInvestorId(initialInvestor.id);
      }
    } else {
      setSelectedName("");
      setSelectedInvestorId("");
      setSelectionMode("single");
    }
    setSubject(EMAIL_SUBJECT);
    setCopied({ subject: false, body: false, all: false });
  }, [open, initialInvestor, grouped]);

  const investmentsForName = selectedName ? (grouped[selectedName] || []) : [];
  const hasMultiple = investmentsForName.length > 1;

  // Compute accrual data
  const result = useMemo(() => {
    if (!selectedName) return null;
    const today = new Date();
    if (selectionMode === "all" && hasMultiple) {
      const accruals = investmentsForName.map((inv) => computeInvestorAccrual(inv, payments, today));
      const missing = accruals.filter((a) => a?.missingStartDate);
      const valid = accruals.filter((a) => a && !a.missingStartDate);
      const groups = aggregateByCurrency(valid);
      return { mode: "all", items: groups, missing, accruals };
    }
    // single mode
    const inv = investmentsForName.find((i) => i.id === selectedInvestorId)
      || investmentsForName[0];
    if (!inv) return null;
    const a = computeInvestorAccrual(inv, payments, today);
    if (a.missingStartDate) return { mode: "single", missing: [a], items: [] };
    return {
      mode: "single",
      items: [{
        ...a,
        weightedRate: a.interestRate,
        earliestStart: a.startDate,
      }],
      missing: [],
    };
  }, [selectedName, selectionMode, selectedInvestorId, investmentsForName, payments, hasMultiple]);

  // Auto-build body whenever result changes
  useEffect(() => {
    if (!result || result.items.length === 0) {
      setBody("");
      return;
    }
    setBody(buildEmailBody({
      investorName: selectedName,
      items: result.items,
      todayDate: new Date(),
    }));
  }, [result, selectedName]);

  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied((p) => ({ ...p, [key]: true }));
      setTimeout(() => setCopied((p) => ({ ...p, [key]: false })), 1500);
    } catch (e) {
      // ignore
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" /> מחולל מייל עדכון למשקיע
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Investor picker */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">חיפוש משקיע</Label>
              <Input
                placeholder="הקלד שם (עברית/אנגלית)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">בחירת משקיע</Label>
              <MobileSelect
                value={selectedName}
                onValueChange={(v) => { setSelectedName(v); setSelectedInvestorId(""); setSelectionMode("single"); }}
                placeholder="בחר משקיע"
                options={nameOptions}
              />
            </div>
          </div>

          {/* Investment selector when investor has multiple */}
          {hasMultiple && (
            <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-2">
              <div className="text-xs font-medium">למשקיע זה יש {investmentsForName.length} השקעות</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={selectionMode === "single"}
                    onChange={() => setSelectionMode("single")}
                  />
                  השקעה ספציפית
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={selectionMode === "all"}
                    onChange={() => setSelectionMode("all")}
                  />
                  אחד את כל ההשקעות (פר מטבע)
                </label>
              </div>
              {selectionMode === "single" && (
                <MobileSelect
                  value={selectedInvestorId}
                  onValueChange={setSelectedInvestorId}
                  placeholder="בחר השקעה"
                  options={investmentsForName.map((inv) => ({
                    value: inv.id,
                    label: `${fmtAmount(inv.principal, inv.currency)} · ${inv.interest_rate}% · ${inv.linked_investment_name || "—"} · החל מ-${inv.start_date || "?"}`,
                  }))}
                />
              )}
            </div>
          )}

          {/* Missing start date warning */}
          {result?.missing?.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 flex items-start gap-2 text-xs text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                חסר תאריך השקעה ב-{result.missing.length} השקעה(ות) — לא ניתן לחשב ריבית שנצברה.
                ערוך את המשקיע והוסף Start Date.
              </div>
            </div>
          )}

          {/* Calculation table */}
          {result?.items?.length > 0 && (
            <div className="bg-muted/20 border border-border rounded-lg overflow-hidden">
              <div className="text-xs font-medium px-3 py-2 border-b border-border bg-muted/40">פירוט החישוב</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-right px-3 py-2 font-medium">מטבע</th>
                    <th className="text-right px-3 py-2 font-medium">קרן</th>
                    <th className="text-right px-3 py-2 font-medium">תאריך השקעה</th>
                    <th className="text-right px-3 py-2 font-medium">ריבית</th>
                    <th className="text-right px-3 py-2 font-medium">ימים</th>
                    <th className="text-right px-3 py-2 font-medium">ריבית שנצברה</th>
                    <th className="text-right px-3 py-2 font-medium">שולם</th>
                    <th className="text-right px-3 py-2 font-medium">יתרה נוכחית</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="px-3 py-2 font-mono">{it.currency}</td>
                      <td className="px-3 py-2 font-mono">{fmtAmount(it.principal, it.currency)}</td>
                      <td className="px-3 py-2 font-mono">{fmtDateDMY(it.startDate || it.earliestStart)}</td>
                      <td className="px-3 py-2 font-mono">{(it.interestRate ?? it.weightedRate).toFixed(2)}%</td>
                      <td className="px-3 py-2 font-mono">{it.daysElapsed}</td>
                      <td className="px-3 py-2 font-mono text-emerald-600">{fmtAmount(it.accrued, it.currency)}</td>
                      <td className="px-3 py-2 font-mono">{fmtAmount(it.totalPaid, it.currency)}</td>
                      <td className="px-3 py-2 font-mono font-semibold">{fmtAmount(it.balance, it.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Subject */}
          {body && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">נושא המייל</Label>
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5"
                    onClick={() => handleCopy(subject, "subject")}>
                    {copied.subject ? <><Check className="w-3 h-3" /> הועתק</> : <><Copy className="w-3 h-3" /> העתק נושא</>}
                  </Button>
                </div>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">גוף המייל (ניתן לעריכה)</Label>
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5"
                    onClick={() => handleCopy(body, "body")}>
                    {copied.body ? <><Check className="w-3 h-3" /> הועתק</> : <><Copy className="w-3 h-3" /> העתק גוף</>}
                  </Button>
                </div>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={16}
                  className="font-sans text-sm leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>סגור</Button>
                <Button onClick={() => handleCopy(`${subject}\n\n${body}`, "all")} className="gap-1.5">
                  {copied.all ? <><Check className="w-4 h-4" /> הועתק</> : <><Copy className="w-4 h-4" /> העתק הכל</>}
                </Button>
              </div>
            </>
          )}

          {!selectedName && (
            <div className="text-xs text-muted-foreground text-center py-8">
              בחר משקיע כדי להתחיל
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}