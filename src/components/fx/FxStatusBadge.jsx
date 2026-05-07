import { Badge } from "@/components/ui/badge";

const STYLES = {
  OPEN: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40",
  SETTLED: "bg-slate-100 text-slate-700 border-slate-300",
  CANCELLED: "bg-red-50 text-red-700 border-red-300",
};

const LABELS = {
  OPEN: "פתוח",
  SETTLED: "נסגר",
  CANCELLED: "בוטל",
};

export default function FxStatusBadge({ status }) {
  const cls = STYLES[status] || STYLES.SETTLED;
  return (
    <Badge variant="outline" className={`text-xs ${cls}`}>
      {LABELS[status] || status}
    </Badge>
  );
}