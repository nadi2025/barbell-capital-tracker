import { Lightbulb } from "lucide-react";
import moment from "moment";

export default function StrategyInsights({ options, stocks, snapshot }) {
  const insights = [];

  // Check margin safety
  if (snapshot?.excess_liquidity < 15000) {
    insights.push({
      type: "danger",
      text: `Excess liquidity is critically low ($${snapshot.excess_liquidity.toLocaleString()}). Consider reducing short puts or adding margin.`,
    });
  } else if (snapshot?.available_funds < 20000) {
    insights.push({
      type: "warn",
      text: `Available funds are low ($${snapshot.available_funds?.toLocaleString()}). Limited room for new positions.`,
    });
  }

  // Upcoming expirations
  const soon = options.filter(o => o.status === "Open" && o.expiration_date &&
    moment(o.expiration_date).diff(moment(), "days") <= 30);
  if (soon.length > 0) {
    const tickers = [...new Set(soon.map(o => o.ticker))].join(", ");
    insights.push({
      type: "warn",
      text: `${soon.length} position(s) expiring within 30 days: ${tickers}. Review and manage before expiration.`,
    });
  }

  // LEAPS heavy
  const leaps = options.filter(o => o.status === "Open" && o.expiration_date &&
    moment(o.expiration_date).diff(moment(), "days") > 180);
  const leapsCollateral = leaps.reduce((s, o) => s + (o.collateral || 0), 0);
  if (leapsCollateral > 100000) {
    insights.push({
      type: "info",
      text: `$${leapsCollateral.toLocaleString()} in collateral tied to LEAPS (>180 DTE). High margin commitment long-term.`,
    });
  }

  // Stocks underwater
  const underwater = stocks.filter(s => s.gain_loss_pct && s.gain_loss_pct < -0.3);
  if (underwater.length > 0) {
    const names = underwater.map(s => `${s.ticker} (${(s.gain_loss_pct * 100).toFixed(0)}%)`).join(", ");
    insights.push({
      type: "warn",
      text: `Positions significantly underwater: ${names}. Consider covered calls or reassessing thesis.`,
    });
  }

  // Concentration
  const topStock = stocks.reduce((max, s) => (s.current_value || 0) > (max?.current_value || 0) ? s : max, null);
  const totalStockVal = stocks.reduce((sum, s) => sum + (s.current_value || 0), 0);
  if (topStock && totalStockVal > 0 && (topStock.current_value / totalStockVal) > 0.5) {
    insights.push({
      type: "info",
      text: `${topStock.ticker} represents ${((topStock.current_value / totalStockVal) * 100).toFixed(0)}% of stock portfolio. High concentration risk.`,
    });
  }

  if (insights.length === 0) {
    insights.push({ type: "ok", text: "Portfolio looks balanced. No immediate action required." });
  }

  const colors = {
    danger: "bg-loss/10 border-loss/30 text-loss",
    warn: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    info: "bg-chart-2/10 border-chart-2/30 text-chart-2",
    ok: "bg-profit/10 border-profit/30 text-profit",
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-chart-3" />
        <h3 className="text-sm font-semibold">Strategy Insights</h3>
      </div>
      <div className="space-y-2">
        {insights.map((ins, i) => (
          <div key={i} className={`border rounded-lg px-3 py-2 text-xs ${colors[ins.type]}`}>
            {ins.text}
          </div>
        ))}
      </div>
    </div>
  );
}