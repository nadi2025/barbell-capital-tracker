import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileEdit, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  AVAILABLE_PLACEHOLDERS,
  DEFAULT_BODY_TEMPLATE,
  DEFAULT_SUBJECT_TEMPLATE,
  PRIVATE_TEMPLATE_KEY,
} from "@/lib/emailTemplate";

/**
 * Editor for the base email template. Saves to EmailTemplate entity by key.
 * onSaved(template) — called with the saved template so the parent can refresh.
 */
export default function EmailTemplateEditorDialog({ open, onClose, onSaved }) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT_TEMPLATE);
  const [body, setBody] = useState(DEFAULT_BODY_TEMPLATE);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    base44.entities.EmailTemplate.filter({ key: PRIVATE_TEMPLATE_KEY })
      .then((rows) => {
        const found = rows?.[0];
        if (found) {
          setExisting(found);
          setSubject(found.subject_template || DEFAULT_SUBJECT_TEMPLATE);
          setBody(found.body_template || DEFAULT_BODY_TEMPLATE);
        } else {
          setExisting(null);
          setSubject(DEFAULT_SUBJECT_TEMPLATE);
          setBody(DEFAULT_BODY_TEMPLATE);
        }
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("נושא וגוף התבנית חייבים להיות מלאים");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key: PRIVATE_TEMPLATE_KEY,
        subject_template: subject,
        body_template: body,
      };
      let saved;
      if (existing) {
        saved = await base44.entities.EmailTemplate.update(existing.id, payload);
      } else {
        saved = await base44.entities.EmailTemplate.create(payload);
      }
      toast.success("התבנית נשמרה");
      onSaved?.(saved || payload);
      onClose();
    } catch (e) {
      toast.error("שגיאה: " + e.message);
    }
    setSaving(false);
  };

  const handleResetDefaults = () => {
    if (!confirm("לשחזר לתבנית ברירת המחדל? השינויים הלא שמורים יאבדו.")) return;
    setSubject(DEFAULT_SUBJECT_TEMPLATE);
    setBody(DEFAULT_BODY_TEMPLATE);
  };

  const insertPlaceholder = (key) => {
    const token = `{${key}}`;
    // Insert at the end of body — simple and predictable
    setBody((prev) => (prev ? `${prev}${token}` : token));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="w-5 h-5" /> פורמט מייל — תבנית בסיס
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-2">
            {/* Left: editor */}
            <div className="lg:col-span-2 space-y-3">
              <div>
                <Label className="text-xs">נושא המייל (תבנית)</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">גוף המייל (תבנית)</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={22}
                  className="font-sans text-sm leading-relaxed"
                />
              </div>
              <div className="text-[11px] text-muted-foreground">
                השתמש ב-<code className="bg-muted px-1 rounded">{"{placeholder}"}</code> להוספת ערכים שיוחלפו לפי המשקיע.
                לדוגמה: <code className="bg-muted px-1 rounded">{"{investor_name}"}</code>.
              </div>
            </div>

            {/* Right: placeholders reference */}
            <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-2 h-fit lg:sticky lg:top-0">
              <div className="text-xs font-semibold">משתנים זמינים</div>
              <div className="text-[11px] text-muted-foreground mb-1">לחץ להוספה בסוף הגוף</div>
              <div className="space-y-1 max-h-[520px] overflow-y-auto">
                {AVAILABLE_PLACEHOLDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => insertPlaceholder(p.key)}
                    className="w-full text-right text-[11px] px-2 py-1.5 rounded bg-background hover:bg-accent border border-border transition-colors"
                  >
                    <div className="font-mono text-primary" dir="ltr">{`{${p.key}}`}</div>
                    <div className="text-muted-foreground">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center gap-2 mt-4">
          <Button variant="ghost" onClick={handleResetDefaults} className="gap-1.5" disabled={loading || saving}>
            <RotateCcw className="w-4 h-4" /> שחזר ברירת מחדל
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>ביטול</Button>
            <Button onClick={handleSave} disabled={loading || saving} className="gap-1.5">
              <Save className="w-4 h-4" /> {saving ? "שומר..." : "שמור תבנית"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}