import { cn } from "@/lib/utils";

export default function KpiCard({ title, value, subtitle, icon: Icon, trend, className }) {
  const isPositive = trend === "up";
  const isNegative = trend === "down";

  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-5 transition-all duration-200 hover:border-primary/20",
      className
    )}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
      <p className={cn(
        "text-2xl font-bold tracking-tight",
        isPositive && "text-profit",
        isNegative && "text-loss",
        !isPositive && !isNegative && "text-foreground"
      )}>
        {value}
      </p>
      {subtitle && (
        <p className={cn(
          "text-xs mt-1",
          isPositive ? "text-profit" : isNegative ? "text-loss" : "text-muted-foreground"
        )}>
          {subtitle}
        </p>
      )}
    </div>
  );
}