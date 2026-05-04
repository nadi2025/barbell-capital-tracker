import { useState } from "react";
import { differenceInDays, format } from "date-fns";
import { AlertTriangle, Calendar, TrendingDown, Clock, ChevronDown, CheckCircle2, StickyNote, Plus, Trash2, X } from "lucide-react";
import { calcDashboard, fmt } from "./dashboardCalcs";
import { base44 } from "@/api/base44Client";
import { useEntityList } from "@/hooks/useEntityQuery";
import { useQueryClient } from "@tanstack/react-query";

function buildAlerts(data, c) {
  const alerts = [];
  const today = new Date();

  // Options expiry
  const sorted = [...c.openOptions].sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
  const next = sorted[0];
  if (next?.expiration_date) {
    const d = differenceInDays(new Date(next.expiration_date), today);
    if (d <= 30) {
      alerts.push({
        urgency: d <= 7 ? "red" : "amber",
        icon: Calendar,
        title: `פקיעת ${next.ticker} $${next.strike}`,
        text: `${format(new Date(next.expiration_date), "d.M.yy")} · ${d} ימים`,
      });
    }
  }

  // Crypto options expiry
  (data.openCryptoOptions || []).forEach((o) => {
    if (!o.maturity_date) return;
    const d = differenceInDays(new Date(o.maturity_date), today);
    if (d >= 0 && d <= 14) {
      alerts.push({
        urgency: d <= 7 ? "red" : "amber",
        icon: Calendar,
        title: `${o.asset} ${o.option_type} (Crypto)`,
        text: `${format(new Date(o.maturity_date), "d.M.yy")} · ${d} ימים`,
      });
    }
  });

  // Aave health
  if (c.healthFactor > 0 && c.healthFactor < 2) {
    alerts.push({
      urgency: c.healthFactor < 1.5 ? "red" : "amber",
      icon: AlertTriangle,
      title: `Aave Health Factor`,
      text: `${c.healthFactor.toFixed(2)} ${c.healthFactor < 1.5 ? "· סכנת חיסול!" : "· שמור על מרחק"}`,
    });
  }

  // HL liquidation distance
  (data.leveraged || []).forEach((l) => {
    if (!l.mark_price || !l.liquidation_price) return;
    const dist = Math.abs((l.mark_price - l.liquidation_price) / l.mark_price) * 100;
    if (dist < 25) {
      alerts.push({
        urgency: dist < 15 ? "red" : "amber",
        icon: AlertTriangle,
        title: `HL ${l.asset} ${l.direction}`,
        text: `מרחק חיסול ${dist.toFixed(1)}%`,
      });
    }
  });

  // Investor payments — only alert if no payment was recorded this month yet
  const payments = data.investorPayments || [];
  (data.offChainInvestors || [])
    .filter((inv) => inv.interest_schedule === "Monthly" && inv.status === "Active")
    .forEach((inv) => {
      const payDay = inv.payment_day_of_month || 1;
      let next = new Date(today.getFullYear(), today.getMonth(), payDay);
      if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + 1, payDay);
      const d = differenceInDays(next, today);
      if (d > 14) return;

      const nextMonth = next.getMonth();
      const nextYear = next.getFullYear();
      const alreadyPaid = payments.some((p) => {
        if (p.investor_id !== inv.id) return false;
        const pd = new Date(p.payment_date);
        return pd.getMonth() === nextMonth && pd.getFullYear() === nextYear;
      });
      if (alreadyPaid) return;

      const amount = inv.interest_currency === "ILS"
        ? `₪${Math.abs(inv.monthly_payment || 0).toLocaleString("he-IL")}`
        : fmt(inv.monthly_payment);
      alerts.push({
        urgency: d <= 5 ? "red" : "amber",
        icon: Clock,
        title: `ריבית ${inv.name}`,
        text: `${amount} · ${format(next, "d.M.yy")}`,
      });
    });

  // Big stock loss
  const bigLoss = (data.stocks || []).find((s) => s.gain_loss_pct && s.gain_loss_pct < -0.3);
  if (bigLoss) {
    alerts.push({
      urgency: "red",
      icon: TrendingDown,
      title: bigLoss.ticker,
      text: `הפסד ${fmt(bigLoss.gain_loss)}`,
    });
  }

  return alerts.sort((a, b) => (a.urgency === "red" ? -1 : 1) - (b.urgency === "red" ? -1 : 1));
}

const urgencyStyles = {
  red: "border-red-500/30 bg-red-500/10 text-red-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-400",
};

const urgencyLabels = {
  red: "דחוף",
  amber: "שים לב",
  info: "מידע",
};

function AddNoteForm({ onClose }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [urgency, setUrgency] = useState("info");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    await base44.entities.DashboardNote.create({ text: text.trim(), urgency });
    queryClient.invalidateQueries({ queryKey: ["entity", "DashboardNote"] });
    setSaving(false);
    onClose();
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">הערה חדשה</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="כתוב הערה..."
        className="w-full text-sm bg-muted/30 border border-border rounded-lg px-3 py-2 resize-none min-h-[70px] focus:outline-none focus:ring-1 focus:ring-ring"
        dir="rtl"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">רמה:</span>
        {["info", "amber", "red"].map((u) => (
          <button
            key={u}
            onClick={() => setUrgency(u)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${urgency === u ? urgencyStyles[u] + " font-bold" : "border-border text-muted-foreground"}`}
          >
            {urgencyLabels[u]}
          </button>
        ))}
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          className="mr-auto text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {saving ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );
}

export default function AlertsSection({ data }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [showAddNote, setShowAddNote] = useState(false);
  const { data: notes = [] } = useEntityList("DashboardNote", { sort: "-created_date" });

  const c = calcDashboard(data);
  const alerts = buildAlerts(data, c);
  const redCount = alerts.filter((a) => a.urgency === "red").length;
  const totalCount = alerts.length + notes.length;

  const handleDeleteNote = async (id) => {
    await base44.entities.DashboardNote.delete(id);
    queryClient.invalidateQueries({ queryKey: ["entity", "DashboardNote"] });
  };

  const accentBorder = redCount > 0 ? "border-red-500/40" : notes.some(n => n.urgency === "red") ? "border-red-500/40" : "border-amber-500/40";

  if (totalCount === 0 && !showAddNote) {
    return (
      <div className="bg-card border border-border rounded-2xl px-5 py-3 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-profit" />
        <span className="text-xs text-muted-foreground">אין התראות פעילות</span>
        <button
          onClick={() => setShowAddNote(true)}
          className="mr-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> הוסף הערה
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-card border ${totalCount > 0 ? accentBorder : "border-border"} rounded-2xl overflow-hidden`}>
      <div className="px-5 py-3 flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1"
        >
          <AlertTriangle className={`w-4 h-4 ${redCount > 0 ? "text-red-400" : "text-amber-400"}`} />
          <span className="text-sm font-semibold">
            {alerts.length} התראות{notes.length > 0 ? ` · ${notes.length} הערות` : ""}
          </span>
          {redCount > 0 && (
            <span className="text-[10px] uppercase tracking-wide font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
              {redCount} דחוף
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform mr-1 ${expanded ? "rotate-180" : ""}`} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowAddNote((v) => !v); }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/30"
        >
          <StickyNote className="w-3.5 h-3.5" />
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-4 pt-1 space-y-3">
          {showAddNote && (
            <AddNoteForm onClose={() => setShowAddNote(false)} />
          )}

          {/* Manual notes */}
          {notes.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {notes.map((note) => (
                <div key={note.id} className={`flex items-start gap-2.5 text-xs px-3 py-2 rounded-lg border group ${urgencyStyles[note.urgency || "info"]}`}>
                  <StickyNote className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <p className="flex-1 min-w-0 break-words">{note.text}</p>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Auto alerts */}
          {alerts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2.5 text-xs px-3 py-2 rounded-lg border ${urgencyStyles[a.urgency]}`}>
                  <a.icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{a.title}</p>
                    <p className="opacity-80 truncate">{a.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}