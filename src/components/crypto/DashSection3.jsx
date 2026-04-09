// Section 3: Aave V3 — Collateral & On-Chain Leverage
import { Lock, TrendingDown } from "lucide-react";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

// Aave liquidation thresholds
const LT = { ETH: 0.86, aETH: 0.86, WBTC: 0.82, awBTC: 0.82, wBTC: 0.82, AAVE: 0.73, aAAVE: 0.73 };
const DEFAULT_LT = 0.80;

function stressTest(collateralAssets, aavePosition, btcDropPct) {
  const ethDropPct = btcDropPct * 0.6;
  const aaveDropPct = btcDropPct * 0.8;
  let newCollateral = 0;
  let weightedLT = 0;
  collateralAssets.forEach(a => {
    const tok = a.token || "";
    let mult = 1;
    if (["BTC","wBTC","awBTC"].some(t => tok.includes(t))) mult = 1 - btcDropPct;
    else if (["ETH","aETH","WETH"].some(t => tok.includes(t))) mult = 1 - ethDropPct;
    else if (["AAVE","aAAVE"].some(t => tok.includes(t))) mult = 1 - aaveDropPct;
    const newVal = (a.current_value_usd || 0) * mult;
    const lt = LT[tok] || DEFAULT_LT;
    newCollateral += newVal;
    weightedLT += newVal * lt;
  });
  const avgLT = newCollateral > 0 ? weightedLT / newCollateral : DEFAULT_LT;
  const borrowed = aavePosition?.total_borrowed_usd || 1;
  return (newCollateral * avgLT) / borrowed;
}

export default function DashSection3({ aavePosition, assets = [] }) {
  if (!aavePosition) return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">מינוף Aave V3 — בטוחות ואשראי</h2>
      <div className="bg-card border border-border rounded-xl p-5 text-sm text-muted-foreground">
        No Aave position data. Add one via the Crypto Debt page.
      </div>
    </div>
  );

  const collateralAssets = assets.filter(a => a.asset_category === "Collateral on Aave");
  const hf = aavePosition.health_factor;
  const bp = aavePosition.borrow_power_used || 0;
  const hfColor = hf >= 2.0 ? "text-profit" : hf >= 1.5 ? "text-amber-500" : "text-loss";
  const hfBg = hf >= 2.0 ? "bg-emerald-50 border-emerald-200" : hf >= 1.5 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const bpBarColor = bp < 50 ? "bg-profit" : bp < 75 ? "bg-amber-400" : "bg-loss";

  const stresses = [
    { label: "BTC −20%", drop: 0.20 },
    { label: "BTC −40%", drop: 0.40 },
    { label: "BTC −60%", drop: 0.60 },
  ].map(s => ({ ...s, hf: stressTest(collateralAssets, aavePosition, s.drop) }));

  const totalCollateral = collateralAssets.reduce((s, a) => s + (a.current_value_usd || 0), 0) || aavePosition.total_collateral_usd;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">מינוף Aave V3 — בטוחות ואשראי</h2>
      <p className="text-xs text-muted-foreground -mt-2">Aave V3 Leverage — Collateral & Credit</p>

      {/* Alerts */}
      {hf < 1.5 && <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-2 text-red-700 text-sm font-medium">⚠ URGENT: Liquidation risk approaching — Health Factor {hf.toFixed(2)}</div>}
      {hf >= 1.5 && hf < 2.0 && <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 text-amber-700 text-sm">Consider reducing borrow or adding collateral — HF {hf.toFixed(2)}</div>}
      {(aavePosition.borrow_apy || 0) > 5 && <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-amber-700 text-sm">Borrow APY is high: {aavePosition.borrow_apy?.toFixed(2)}%</div>}

      {/* Health Factor Hero */}
      <div className={`border rounded-xl p-5 ${hfBg}`}>
        <div className="grid grid-cols-3 gap-6 items-center">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Health Factor</p>
            <p className={`text-4xl font-bold font-mono ${hfColor}`}>{hf.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Safe &gt; 2.0</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Borrow Power Used</p>
            <div className="relative w-full bg-white/60 rounded-full h-3 border border-border/40">
              <div className={`h-3 rounded-full ${bpBarColor}`} style={{ width: `${Math.min(100, bp)}%` }} />
              <div className="absolute top-0 bottom-0 w-px bg-amber-400" style={{ left: "50%" }} title="50% caution" />
              <div className="absolute top-0 bottom-0 w-px bg-red-400" style={{ left: "75%" }} title="75% danger" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0%</span><span className="text-amber-500">50%</span><span className="text-red-500">75%</span><span>100%</span>
            </div>
            <p className={`text-lg font-bold font-mono mt-1 ${bp >= 75 ? "text-loss" : bp >= 50 ? "text-amber-500" : "text-profit"}`}>{bp.toFixed(1)}%</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Net APY</p>
            <p className={`text-2xl font-bold font-mono ${(aavePosition.net_apy || 0) >= 0 ? "text-profit" : "text-loss"}`}>
              {aavePosition.net_apy != null ? `${aavePosition.net_apy > 0 ? "+" : ""}${aavePosition.net_apy.toFixed(2)}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Supply {aavePosition.supply_apy?.toFixed(2)}% · Borrow {aavePosition.borrow_apy?.toFixed(2)}%</p>
          </div>
        </div>
      </div>

      {/* Two-column detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Collateral */}
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-3">Collateral Supplied</p>
          {collateralAssets.length > 0 ? (
            <div className="space-y-2">
              {collateralAssets.map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" />
                    <span className="font-medium">{a.token}</span>
                    <span className="text-xs text-muted-foreground">({(a.amount || 0).toFixed(4)})</span>
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Aave Collateral</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">{fmt(a.current_value_usd)}</p>
                    <p className="text-xs text-muted-foreground">{totalCollateral > 0 ? ((a.current_value_usd || 0) / totalCollateral * 100).toFixed(0) : 0}%</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
                <span>Total Collateral</span>
                <span className="font-mono">{fmt(totalCollateral)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Showing from Aave position record:</p>
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Collateral</span>
                <span className="font-mono">{fmt(aavePosition.total_collateral_usd)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Add assets with category "Collateral on Aave" for a breakdown</p>
            </div>
          )}
        </div>

        {/* Borrow + Stress Test */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">USDC Borrowed</p>
            <p className="text-2xl font-bold font-mono text-blue-700">{fmt(aavePosition.total_borrowed_usd)}</p>
            <p className="text-xs text-blue-600 mt-0.5">Borrow APY: {aavePosition.borrow_apy?.toFixed(2)}% variable</p>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-muted-foreground" /> Stress Test
            </p>
            <div className="space-y-2">
              {stresses.map(s => {
                const color = s.hf >= 2.0 ? "text-profit" : s.hf >= 1.5 ? "text-amber-500" : "text-loss";
                const bg = s.hf >= 2.0 ? "bg-emerald-50" : s.hf >= 1.5 ? "bg-amber-50" : "bg-red-50";
                return (
                  <div key={s.label} className={`flex justify-between items-center rounded-lg px-3 py-2 text-sm ${bg}`}>
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className={`font-bold font-mono ${color}`}>HF {s.hf.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">ETH correlated at 60%, AAVE at 80% of BTC drop. LTs: ETH 86%, WBTC 82%, AAVE 73%</p>
          </div>
        </div>
      </div>
    </div>
  );
}