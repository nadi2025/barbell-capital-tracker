// Section 1: Portfolio Overview — NAV, Capital, Allocation bar
const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

const ALLOC_COLORS = {
  BTC: { bg: "bg-amber-500", text: "text-amber-600", label: "BTC" },
  ETH: { bg: "bg-blue-500", text: "text-blue-600", label: "ETH" },
  AAVE: { bg: "bg-purple-500", text: "text-purple-600", label: "AAVE" },
  Stablecoins: { bg: "bg-teal-500", text: "text-teal-600", label: "Stablecoins" },
  Other: { bg: "bg-gray-400", text: "text-gray-500", label: "Other" },
};

export default function DashSection1({ assets = [], loans = [], lending = [], leveraged = [], lpPositions = [] }) {
  const investorLoans = loans.filter(l => l.loan_type === "Investor Debt" || !l.loan_type);
  const totalInvestorDebt = investorLoans.reduce((s, l) => s + (l.principal_usd || 0), 0);
  const totalLent = lending.reduce((s, l) => s + (l.amount_usd || 0), 0);
  const walletAssets = assets.reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const leveragedVal = leveraged.reduce((s, l) => s + (l.position_value_usd || l.margin_usd || 0), 0);
  const lpVal = lpPositions.reduce((s, l) => s + (l.current_value_usd || 0), 0);
  const totalAssets = walletAssets + leveragedVal + lpVal + totalLent;
  const nav = totalAssets - totalInvestorDebt;
  const pctVsCapital = totalInvestorDebt > 0 ? ((totalAssets - totalInvestorDebt) / totalInvestorDebt) * 100 : 0;

  // Allocation
  const btcVal = assets.filter(a => ["awBTC","wBTC","BTC"].includes(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0)
    + leveraged.filter(l => l.asset?.toUpperCase().includes("BTC")).reduce((s, l) => s + (l.position_value_usd || 0), 0);
  const ethVal = assets.filter(a => ["aETH","ETH","WETH"].includes(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0)
    + leveraged.filter(l => l.asset?.toUpperCase().includes("ETH")).reduce((s, l) => s + (l.position_value_usd || 0), 0);
  const aaveVal = assets.filter(a => ["aAAVE","AAVE"].includes(a.token)).reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const stableVal = assets.filter(a => a.asset_category === "Stablecoin").reduce((s, a) => s + (a.current_value_usd || 0), 0);
  const otherVal = Math.max(0, totalAssets - btcVal - ethVal - aaveVal - stableVal);
  const totalForBar = btcVal + ethVal + aaveVal + stableVal + otherVal || 1;
  const effectiveLeverage = nav > 0 ? (totalAssets / nav).toFixed(2) : "—";

  const allocSlices = [
    { key: "BTC", val: btcVal },
    { key: "ETH", val: ethVal },
    { key: "AAVE", val: aaveVal },
    { key: "Stablecoins", val: stableVal },
    { key: "Other", val: otherVal },
  ].filter(s => s.val > 0);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* NAV */}
        <div className="col-span-2 lg:col-span-1">
          <p className="text-xs text-muted-foreground font-medium mb-1">Net Asset Value (NAV)</p>
          <p className={`text-4xl font-bold font-mono leading-none ${nav >= 0 ? "text-profit" : "text-loss"}`}>
            {fmt(nav)}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Assets <span className="font-mono">{fmt(totalAssets)}</span> − Debt <span className="font-mono">{fmt(totalInvestorDebt)}</span>
          </p>
        </div>

        {/* Initial Capital */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-1">Initial Capital Raised</p>
          <p className="text-2xl font-bold font-mono text-foreground">{fmt(totalInvestorDebt)}</p>
          <p className="text-xs text-muted-foreground mt-1.5">{investorLoans.length} investor{investorLoans.length !== 1 ? "s" : ""}</p>
        </div>

        {/* Total Assets */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-1">Total Assets Today</p>
          <p className="text-2xl font-bold font-mono text-foreground">{fmt(totalAssets)}</p>
          <p className={`text-xs mt-1.5 font-mono font-medium ${pctVsCapital >= 0 ? "text-profit" : "text-loss"}`}>
            {pctVsCapital >= 0 ? "+" : ""}{pctVsCapital.toFixed(1)}% vs initial
          </p>
        </div>

        {/* Lent Out */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-1">Money Lent Out</p>
          <p className="text-2xl font-bold font-mono text-blue-600">{fmt(totalLent)}</p>
          <p className="text-xs text-muted-foreground mt-1.5">{lending.length} active loan{lending.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Allocation Bar */}
      <div>
        <p className="text-xs text-muted-foreground font-medium mb-2">Portfolio Allocation</p>
        <div className="flex w-full h-3 rounded-full overflow-hidden gap-0.5">
          {allocSlices.map(s => (
            <div
              key={s.key}
              className={`${ALLOC_COLORS[s.key]?.bg || "bg-gray-400"} transition-all`}
              style={{ width: `${(s.val / totalForBar * 100).toFixed(1)}%` }}
              title={`${s.key}: ${fmt(s.val)}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
          {allocSlices.map(s => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs">
              <div className={`w-2 h-2 rounded-full ${ALLOC_COLORS[s.key]?.bg || "bg-gray-400"}`} />
              <span className="text-muted-foreground">{s.key}</span>
              <span className={`font-mono font-medium ${ALLOC_COLORS[s.key]?.text || "text-gray-500"}`}>
                {(s.val / totalForBar * 100).toFixed(0)}%
              </span>
            </div>
          ))}
          <div className="ml-auto text-xs font-mono font-medium text-muted-foreground">
            Effective Leverage: <span className="text-foreground font-bold">{effectiveLeverage}x</span>
          </div>
        </div>
      </div>
    </div>
  );
}