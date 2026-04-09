import { cn } from "@/lib/utils";

const statusStyles = {
  Open: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Closed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Assigned: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Expired: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  Holding: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Partially Sold": "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export default function StatusBadge({ status }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
      statusStyles[status] || "bg-muted text-muted-foreground border-border"
    )}>
      {status}
    </span>
  );
}