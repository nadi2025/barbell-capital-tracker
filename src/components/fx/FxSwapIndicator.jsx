import { ArrowLeftRight } from "lucide-react";

export default function FxSwapIndicator({ size = 12, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-cyan-600 ${className}`}
      title="חלק מ-Swap"
    >
      <ArrowLeftRight style={{ width: size, height: size }} />
    </span>
  );
}