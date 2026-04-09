import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function PnlBadge({ value, showIcon = true, className }) {
  const num = typeof value === "number" ? value : parseFloat(value);
  const isPositive = num > 0;
  const isNegative = num < 0;
  const isZero = num === 0 || isNaN(num);

  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-sm font-mono font-medium",
      isPositive && "text-profit",
      isNegative && "text-loss",
      isZero && "text-muted-foreground",
      className
    )}>
      {showIcon && <Icon className="w-3.5 h-3.5" />}
      {isPositive && "+"}
      {typeof num === "number" && !isNaN(num) ? num.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }) : "$0"}
    </span>
  );
}