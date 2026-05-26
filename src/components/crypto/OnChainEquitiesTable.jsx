import { useEntityList } from "@/hooks/useEntityQuery";

const fmt = (v, d = 0) =>
  v == null || isNaN(v)
    ? "$0"
    : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * OnChainEquitiesTable — tokenized stocks (e.g. BMNR, MSTR) held in a crypto
 * wallet but priced from the underlying NASDAQ stock via Yahoo Finance.
 *
 * Data: CryptoAsset rows where asset_category === "On-Chain Equity".
 * Price: live Prices entity, keyed by UPPER(token).
 *
 * Rendered below the HyperLiquid positions table on /crypto/leveraged.
 * Intentionally kept as a separate table — tokenized equities have no
 * Entry / Mark / Liq. Price / Leverage, so merging with HL positions would
 * be lossy and confusing.
 */
export default function OnChainEquitiesTable() {
  const { data: assets = [] } = useEntityList("CryptoAsset");
  const { data: pricesData = [] } = useEntityList("Prices");

  const equities = assets.filter((a) => a.asset_category === "On-Chain Equity");

  const priceMap = {};
  pricesData.forEach((p) => {
    if (p.asset) priceMap[p.asset.toUpperCase()] = p.price_usd;
  });

  const rows = equities.map((a) => {
    const token = (a.token || "").toUpperCase();
    const price = priceMap[token] || 0;
    const value = (a.amount || 0) * price;
    const cost = (a.amount || 0) * (a.average_cost_usd || 0);
    const pnl = value - cost;
    return { ...a, token, price, value, pnl };
  });

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mt-4">
      <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="text-sm font-bold">On-Chain Equities</h3>
        {rows.length > 0 && (
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Value: </span>
              <span className="font-mono font-semibold">{fmt(totalValue)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">P&L: </span>
              <span className={`font-mono font-semibold ${totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
                {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)}
              </span>
            </div>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No on-chain equities yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/20">
                <th className="text-right px-4 py-2 font-medium">Asset</th>
                <th className="text-right px-4 py-2 font-medium">Shares</th>
                <th className="text-right px-4 py-2 font-medium">Avg Cost</th>
                <th className="text-right px-4 py-2 font-medium">Price</th>
                <th className="text-right px-4 py-2 font-medium">Value</th>
                <th className="text-right px-4 py-2 font-medium">P&L</th>
                <th className="text-right px-4 py-2 font-medium">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-bold">{r.token}</td>
                  <td className="px-4 py-2.5 font-mono text-right">
                    {(r.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right text-muted-foreground">
                    {r.average_cost_usd != null
                      ? `$${r.average_cost_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right">
                    {r.price ? `$${r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right">{fmt(r.value)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-mono font-semibold ${r.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                      {r.pnl >= 0 ? "+" : ""}{fmt(r.pnl)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                    {r.wallet_name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}