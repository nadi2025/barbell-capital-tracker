import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEntityList } from "@/hooks/useEntityQuery";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Save, X, Wallet } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "./dashboardCalcs";

/**
 * FreeCashTile — מזומן פנוי, עדכון ידני בלבד.
 * נשמר ב-ManualCash entity (רשומה יחידה — נוצרת בעדכון הראשון).
 * אינו מסתנכרן לשום חישוב/דשבורד אחר.
 */
export default function FreeCashTile() {
  const { data: rows = [] } = useEntityList("ManualCash", { sort: "-updated_date", limit: 1 });
  const queryClient = useQueryClient();
  const record = rows[0];

  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (record?.amount != null) setInput(String(record.amount));
  }, [record?.id]);

  const handleSave = async () => {
    const val = parseFloat(input);
    if (isNaN(val)) { toast.error("ערך לא תקין"); return; }
    setSaving(true);
    try {
      if (record?.id) {
        await base44.entities.ManualCash.update(record.id, { amount: val });
      } else {
        await base44.entities.ManualCash.create({ amount: val });
      }
      toast.success("מזומן פנוי עודכן");
      queryClient.invalidateQueries({ queryKey: ["entity", "ManualCash"] });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setInput(record?.amount != null ? String(record.amount) : "");
    setEditing(false);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">מזומן פנוי</p>
        <Wallet className="w-3.5 h-3.5 text-muted-foreground/50" />
      </div>
      {!editing ? (
        <>
          <p className="text-xl font-bold font-mono">{fmt(record?.amount || 0, 0)}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-muted-foreground">עדכון ידני בלבד</p>
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] text-primary hover:underline flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" /> ערוך
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0"
            className="h-8 font-mono text-sm"
            autoFocus
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 px-2 gap-1 text-xs flex-1">
              <Save className="w-3 h-3" /> {saving ? "שומר..." : "שמור"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 px-2 gap-1 text-xs">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}