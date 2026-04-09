import StatusBadge from "../StatusBadge";
import PnlBadge from "../PnlBadge";
import moment from "moment";

export default function OpenOptionsTable({ options }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold">Open Options</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{options.length} active trades</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Ticker</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium">Strike</th>
              <th className="text-right px-4 py-3 font-medium">Fill $</th>
              <th className="text-right px-4 py-3 font-medium">DTE</th>
              <th className="text-right px-4 py-3 font-medium">Collateral</th>
            </tr>
          </thead>
          <tbody>
            {options.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-xs">No open options</td></tr>
            ) : options.map((opt) => {
              const dte = opt.expiration_date ? moment(opt.expiration_date).diff(moment(), "days") : "-";
              return (
                <tr key={opt.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium">{opt.ticker}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs">{opt.type} {opt.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    ${opt.strike}
                    {opt.strike_2 ? `/$${opt.strike_2}` : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">${opt.fill_price}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={dte <= 7 ? "text-loss" : dte <= 30 ? "text-amber-400" : ""}>
                      {dte}d
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    ${(opt.collateral || 0).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}