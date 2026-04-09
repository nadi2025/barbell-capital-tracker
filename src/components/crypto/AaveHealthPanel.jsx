import { Shield, AlertTriangle } from "lucide-react";

const fmt = (v) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function AaveHealthPanel({ aave }) {
  if (!aave) return (
    <div className="bg-card border border-border rounded-xl p-5 col-span-2 lg:col-span-4">
      <p className="text-sm text-muted-foreground">No Aave position data — add one in the Debt page.</p>
    </div>
  );

  const hf = aave.health_factor;
  const bp = aave.borrow_power_used; // percent 0-100
  const hfColor = hf >= 2.0 ? "text-profit" : hf >= 1.5 ? "text-amber-400" : "text-loss";
  const hfBg = hf >= 2.0 ? "border-profit/30 bg-profit/5" : hf >= 1.5 ? "border-amber-400/30 bg-amber-400/5" : "border-loss/30 bg-loss/5";
  const bpColor = bp < 50 ? "bg-profit" : bp < 70 ? "bg-amber-400" : "bg-loss";
  const bpText = bp < 50 ? "text-profit" : bp < 70 ? "text-amber-400" : "text-loss";
  const collateralRatio = aave.total_borrowed_usd > 0 ? (aave.total_collateral_usd / aave.total_borrowed_usd).toFixed(2) : "—";

  return (
    <div className={`border rounded-xl p-5 col-span-2 lg:col-span-4 ${hfBg}`}>
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Aave Leverage Status — מצב מינוף Aave</h3>
        {hf < 2.0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-auto ${hf < 1.5 ? "bg-loss/15 text-loss" : "bg-amber-400/15 text-amber-500"}`}>
            {hf < 1.5 ? "⚠ HIGH RISK" : "⚠ Monitor"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Health Factor */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Health Factor</p>
          <p className={`text-3xl font-bold font-mono ${hfColor}`}>{hf?.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Safe &gt; 2.0</p>
        </div>

        {/* Borrow Power */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Borrow Power Used</p>
          <p className={`text-xl font-bold font-mono ${bpText}`}>{bp?.toFixed(1)}%</p>
          <div className="w-full bg-muted rounded-full h-1.5 mt-2">
            <div className={`h-1.5 rounded-full ${bpColor}`} style={{ width: `${Math.min(100, bp)}%` }} />
          </div>
        </div>

        {/* Collateral vs Debt */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Collateral / Borrowed</p>
          <p className="text-xl font-bold font-mono">{fmt(aave.total_collateral_usd)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Debt: {fmt(aave.total_borrowed_usd)} · Ratio {collateralRatio}x</p>
        </div>

        {/* APY */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Net APY</p>
          <p className={`text-xl font-bold font-mono ${(aave.net_apy || 0) >= 0 ? "text-profit" : "text-loss"}`}>
            {aave.net_apy != null ? `${aave.net_apy > 0 ? "+" : ""}${aave.net_apy.toFixed(2)}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Supply {aave.supply_apy?.toFixed(2)}% · Borrow {aave.borrow_apy?.toFixed(2)}%
          </p>
        </div>
      </div>

      {aave.last_updated && (
        <p className="text-xs text-muted-foreground mt-3">Last updated: {aave.last_updated}</p>
      )}
    </div>
  );
}