import { AlertTriangle, Shield } from "lucide-react";

export default function MarginPanel({ snapshot }) {
  if (!snapshot) return null;

  const marginUsedPct = snapshot.initial_margin > 0 ?
  snapshot.initial_margin / (snapshot.nav + snapshot.initial_margin - snapshot.available_funds) * 100 :
  0;

  const utilizationPct = snapshot.nav > 0 ?
  Math.min(100, snapshot.initial_margin / snapshot.nav * 100) :
  0;

  const isWarning = snapshot.available_funds < snapshot.nav * 0.05;
  const isDanger = snapshot.excess_liquidity < 15000;

  return null;











































}