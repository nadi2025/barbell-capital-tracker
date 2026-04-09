// Section 4: Active Strategies — 2×2 grid
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

function SectionCard({ title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

export default function DashSection4({ leveraged = [], assets = [], ryskPositions = [], lending = [], lpPositions = [] }) {
  const totalMargin = leveraged.reduce((s, l) => s + (l.margin_usd || 0), 0);
  const totalNotional = leveraged.reduce((s, l) => s + (l.position_value_usd || 0), 0);

  const vaultAssets = assets.filter(a => a.asset_category === "Vault");
  const stableAssets = assets.filter(a => a.asset_category === "Stablecoin");
  const totalVault = vaultAssets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const totalStable = stableAssets.reduce((s, a) => s + (a.current_value_usd || 0), 0);

  const activeRysk = ryskPositions.filter(p => p.status === "Open");
  const avgApr = activeRysk.length > 0 ? activeRysk.reduce((s, p) => s + (p.apr_percent || 0), 0) / activeRysk.length : 0;
  const totalNotionalRysk = activeRysk.reduce((s, p) => s + (p.notional_usd || 0), 0);

  const today = new Date();
  const soon = new Date(); soon.setDate(today.getDate() + 30);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">אסטרטגיות פעילות</h2>
      <p className="text-xs text-muted-foreground -mt-2">Active Strategies</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* HyperLiquid */}
        <SectionCard title="HyperLiquid Positions">
          <div className="flex gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Total Margin</p><p className="font-mono font-bold">{fmt(totalMargin)}</p></div>
            <div><p className="text-xs text-muted-foreground">Notional Exposure</p><p className="font-mono font-bold">{fmt(totalNotional)}</p></div>
          </div>
          {leveraged.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open positions</p>
          ) : (
            <div className="space-y-1.5">
              {leveraged.map(p => {
                const near = p.liquidation_price && p.entry_price &&
                  Math.abs((p.mark_price || p.entry_price) - p.liquidation_price) / (p.mark_price || p.entry_price) < 0.15;
                return (
                  <div key={p.id} className={`flex items-center justify-between text-xs rounded-lg px-2 py-1.5 ${near ? "bg-red-50 border border-red-200" : "bg-muted/30"}`}>
                    <div className="flex items-center gap-2">
                      {near && <AlertTriangle className="w-3 h-3 text-loss" />}
                      <span className="font-medium">{p.asset}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${p.direction === "Long" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{p.direction}</span>
                      <span className="text-muted-foreground">{p.leverage}x</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono">{fmt(p.position_value_usd)}</span>
                      {p.liquidation_price && <span className="text-muted-foreground ml-2">Liq: {fmt(p.liquidation_price, 0)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link to="/crypto/leveraged" className="text-xs text-primary flex items-center gap-1 hover:underline mt-1">
            View all <ExternalLink className="w-3 h-3" />
          </Link>
        </SectionCard>

        {/* DeFi Vaults & Cash */}
        <SectionCard title="DeFi Vaults & Cash Reserves">
          <div className="flex gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Vaults Deployed</p><p className="font-mono font-bold">{fmt(totalVault)}</p></div>
            <div><p className="text-xs text-muted-foreground">Cash / Stablecoins</p><p className="font-mono font-bold">{fmt(totalStable)}</p></div>
          </div>
          {vaultAssets.length > 0 && (
            <div className="space-y-1.5">
              {vaultAssets.map(a => (
                <div key={a.id} className="flex justify-between text-xs bg-muted/30 rounded-lg px-2 py-1.5">
                  <span className="font-medium">{a.token} <span className="text-muted-foreground">({a.wallet_name})</span></span>
                  <span className="font-mono">{fmt(a.current_value_usd)}</span>
                </div>
              ))}
            </div>
          )}
          {stableAssets.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Cash reserves:</p>
              {stableAssets.map(a => (
                <div key={a.id} className="flex justify-between text-xs bg-teal-50 rounded-lg px-2 py-1.5">
                  <span className="font-medium text-teal-700">{a.token} ({a.wallet_name})</span>
                  <span className="font-mono text-teal-700">{fmt(a.current_value_usd)}</span>
                </div>
              ))}
            </div>
          )}
          <Link to="/crypto/wallets" className="text-xs text-primary flex items-center gap-1 hover:underline mt-1">
            View wallets <ExternalLink className="w-3 h-3" />
          </Link>
        </SectionCard>

        {/* Options Rysk */}
        <SectionCard title="Options — Rysk Finance">
          <div className="flex gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Total Notional</p><p className="font-mono font-bold">{fmt(totalNotionalRysk)}</p></div>
            <div><p className="text-xs text-muted-foreground">Avg APR</p><p className="font-mono font-bold text-profit">{avgApr.toFixed(1)}%</p></div>
            <div><p className="text-xs text-muted-foreground">Active</p><p className="font-mono font-bold">{activeRysk.length}</p></div>
          </div>
          {activeRysk.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open options positions</p>
          ) : (
            <div className="space-y-1.5">
              {activeRysk.slice(0, 4).map(p => {
                const maturity = new Date(p.maturity_date);
                const expiringSoon = maturity <= soon;
                return (
                  <div key={p.id} className={`flex justify-between text-xs rounded-lg px-2 py-1.5 ${expiringSoon ? "bg-amber-50 border border-amber-200" : "bg-muted/30"}`}>
                    <span className="font-medium">{p.asset} {p.option_type}</span>
                    <div className="text-right">
                      <span className="font-mono">{fmt(p.notional_usd)}</span>
                      <span className={`ml-2 ${expiringSoon ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>{p.maturity_date}</span>
                    </div>
                  </div>
                );
              })}
              {activeRysk.length > 4 && <p className="text-xs text-muted-foreground">+{activeRysk.length - 4} more</p>}
            </div>
          )}
          <Link to="/crypto/rysk" className="text-xs text-primary flex items-center gap-1 hover:underline mt-1">
            View all options <ExternalLink className="w-3 h-3" />
          </Link>
        </SectionCard>

        {/* Lending */}
        <SectionCard title="Lending — Money Lent Out">
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">Total Lent</p>
            <p className="font-mono font-bold text-blue-600">{fmt(lending.reduce((s, l) => s + (l.amount_usd || 0), 0))}</p>
          </div>
          {lending.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active lending positions</p>
          ) : (
            <div className="space-y-1.5">
              {lending.map(l => {
                const maturity = l.maturity_date ? new Date(l.maturity_date) : null;
                const expiringSoon = maturity && maturity <= soon;
                return (
                  <div key={l.id} className={`flex justify-between text-xs rounded-lg px-2 py-1.5 ${expiringSoon ? "bg-amber-50 border border-amber-200" : "bg-muted/30"}`}>
                    <span className="font-medium">{l.borrower}</span>
                    <div className="text-right">
                      <span className="font-mono">{fmt(l.amount_usd)}</span>
                      {l.maturity_date && <span className={`ml-2 ${expiringSoon ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>{l.maturity_date}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link to="/crypto/debt" className="text-xs text-primary flex items-center gap-1 hover:underline mt-1">
            View debt page <ExternalLink className="w-3 h-3" />
          </Link>
        </SectionCard>
      </div>
    </div>
  );
}