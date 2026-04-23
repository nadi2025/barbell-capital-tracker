import moment from "moment";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import PnlBadge from "../PnlBadge";

function getDteColor(dte) {
  if (dte <= 14) return "text-loss font-semibold";
  if (dte <= 45) return "text-amber-400";
  return "text-muted-foreground";
}

export default function OpenOptionsTable({ options }) {
  const sorted = [...options].sort((a, b) => {
    const da = a.expiration_date ? new Date(a.expiration_date) : new Date("2099-01-01");
    const db = b.expiration_date ? new Date(b.expiration_date) : new Date("2099-01-01");
    return da - db;
  });

  const totalCollateral = options.reduce((s, o) => s + (o.collateral || 0), 0);
  const totalPremium = options
    .filter(o => o.type === "Sell")
    .reduce((s, o) => s + (o.fill_price || 0) * (o.quantity || 0) * 100, 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Open Positions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {options.length} trades · Collateral: ${totalCollateral.toLocaleString()} · Premium: ${totalPremium.toLocaleString()}
          </p>
        </div>
        <Link to="/options" className="flex items-center gap-1 text-xs text-primary hover:underline">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Ticker</th>
              <th className="text-left px-4 py-2.5 font-medium">Strategy</th>
              <th className="text-right px-4 py-2.5 font-medium">Strike</th>
              <th className="text-right px-4 py-2.5 font-medium">Qty</th>
              <th className="text-right px-4 py-2.5 font-medium">Premium</th>
              <th className="text-right px-4 py-2.5 font-medium">DTE</th>
              <th className="text-right px-4 py-2.5 font-medium">Collateral</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">No open positions</td></tr>
            ) : sorted.map((opt) => {
              const dte = opt.expiration_date ? moment(opt.expiration_date).diff(moment(), "days") : null;
              const premium = (opt.fill_price || 0) * (opt.quantity || 0) * 100;
              const stratLabel = `${opt.type} ${opt.category}`;
              return (
                <tr key={opt.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-semibold text-sm">{opt.ticker}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${opt.type === 'Sell' ? 'bg-profit/10 text-profit' : 'bg-chart-2/10 text-chart-2'}`}>
                      {stratLabel}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    ${opt.strike}{opt.strike_2 ? `/$${opt.strike_2}` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{opt.quantity}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-profit">${premium.toLocaleString()}</td>
                  <td className={`px-4 py-2.5 text-right font-mono text-xs ${dte !== null ? getDteColor(dte) : ''}`}>
                    {dte !== null ? `${dte}d` : "LEAPS"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    ${(opt.collateral || 0).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-border">
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted-foreground text-xs">No open positions</p>
        ) : sorted.map((opt) => {
          const dte = opt.expiration_date ? moment(opt.expiration_date).diff(moment(), "days") : null;
          const premium = (opt.fill_price || 0) * (opt.quantity || 0) * 100;
          const stratLabel = `${opt.type} ${opt.category}`;
          return (
            <div key={opt.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-base">{opt.ticker}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${opt.type === 'Sell' ? 'bg-profit/10 text-profit' : 'bg-chart-2/10 text-chart-2'}`}>
                  {stratLabel}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Strike</p>
                  <p className="font-mono">${opt.strike}{opt.strike_2 ? `/$${opt.strike_2}` : ""}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Qty</p>
                  <p className="font-mono">{opt.quantity}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">DTE</p>
                  <p className={`font-mono ${dte !== null ? getDteColor(dte) : ''}`}>{dte !== null ? `${dte}d` : "LEAPS"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Premium</p>
                  <p className="font-mono text-profit">${premium.toLocaleString()}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Collateral</p>
                  <p className="font-mono text-muted-foreground">${(opt.collateral || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}