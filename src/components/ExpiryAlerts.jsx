import { useState, useMemo } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import moment from "moment";

const STORAGE_KEY = "option_expiry_decisions";

function getDecisions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveDecision(id, decision) {
  const d = getDecisions();
  d[id] = decision;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

/**
 * Consolidate expiring options by (ticker, category, strike, expiration_date).
 * Each group accumulates quantity, premium, stock cost — and remembers its
 * underlying trade IDs so "buy the stock" / "let expire" decisions apply to
 * the whole batch at once.
 */
function groupExpiring(list) {
  const map = new Map();
  for (const t of list) {
    const key = `${t.ticker}|${t.category}|${t.strike}|${t.expiration_date}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        ticker: t.ticker,
        category: t.category,
        strike: t.strike,
        expiration_date: t.expiration_date,
        daysLeft: t.daysLeft,
        qty: 0,
        premium: 0,
        stockCost: 0,
        tradeIds: [],
      });
    }
    const g = map.get(key);
    g.qty += (t.quantity || 0);
    g.premium += (t.fill_price || 0) * (t.quantity || 0) * 100;
    g.stockCost += (t.strike || 0) * (t.quantity || 0) * 100;
    g.tradeIds.push(t.id);
  }
  return Array.from(map.values()).sort((a, b) => a.daysLeft - b.daysLeft);
}

export default function ExpiryAlerts({ trades }) {
  const [decisions, setDecisions] = useState(getDecisions);
  const [showLog, setShowLog] = useState(true);

  const today = moment();

  // Upcoming open options expiring in next 30 days — grouped
  const groupedUpcoming = useMemo(() => {
    const upcoming = (trades || [])
      .filter((t) => t.status === "Open" && t.expiration_date)
      .map((t) => ({ ...t, daysLeft: moment(t.expiration_date).diff(today, "days") }))
      .filter((t) => t.daysLeft >= 0 && t.daysLeft <= 30);
    return groupExpiring(upcoming);
  }, [trades]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decision is recorded against the GROUP key, and propagated to all trade IDs it contains.
  const decide = (group, decision) => {
    const current = { ...getDecisions() };
    if (decision == null) {
      current[group.key] = undefined;
      group.tradeIds.forEach((id) => { delete current[id]; });
    } else {
      current[group.key] = decision;
      group.tradeIds.forEach((id) => { current[id] = decision; });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    setDecisions(current);
  };

  // Assignment log — assigned trades (kept raw for now, sorted newest first)
  const assignments = (trades || [])
    .filter((t) => t.status === "Assigned")
    .sort((a, b) => (b.close_date || b.expiration_date || "").localeCompare(a.close_date || a.expiration_date || ""));

  const urgency = (days) => {
    if (days <= 3) return { bg: "bg-loss/5 border-loss/30", badge: "bg-loss/10 text-loss border-loss/20", icon: "text-loss" };
    if (days <= 7) return { bg: "bg-amber-500/5 border-amber-500/30", badge: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: "text-amber-500" };
    return { bg: "bg-primary/5 border-primary/20", badge: "bg-primary/10 text-primary border-primary/20", icon: "text-primary" };
  };

  return (
    <div className="space-y-4">
      {/* Upcoming expiry alerts — grouped */}
      {groupedUpcoming.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold">Expiring Soon — Action Required</span>
            <span className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded-full">
              {groupedUpcoming.length}
            </span>
          </div>

          {groupedUpcoming.map((g) => {
            const u = urgency(g.daysLeft);
            const decision = decisions[g.key];
            const fillCount = g.tradeIds.length;

            return (
              <div key={g.key} className={`rounded-xl border px-4 py-3 ${u.bg}`}>
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${u.icon}`} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm font-mono">{g.ticker}</span>
                        <span className="text-xs text-muted-foreground">
                          {g.category} · Strike ${g.strike} · Qty {g.qty}
                          {fillCount > 1 && <span className="mr-1 text-[10px] opacity-80"> ({fillCount} fills)</span>}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${u.badge}`}>
                          {g.daysLeft === 0 ? "פוקע היום!" : `${g.daysLeft} ימים`}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{g.expiration_date}</span>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        <span>פרמיה שנגבתה: <span className="text-profit font-mono font-semibold">${g.premium.toLocaleString()}</span></span>
                        <span>עלות מניות אם ימומש: <span className="font-mono font-semibold">${g.stockCost.toLocaleString()}</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {decision ? (
                      <div className="flex items-center gap-1.5">
                        {decision === "assign" ? (
                          <span className="flex items-center gap-1 text-xs bg-profit/10 text-profit border border-profit/20 px-3 py-1 rounded-lg font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> קונה את המניה
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs bg-muted text-muted-foreground border border-border px-3 py-1 rounded-lg font-medium">
                            <XCircle className="w-3.5 h-3.5" /> לא קונה
                          </span>
                        )}
                        <button onClick={() => decide(g, null)} className="text-xs text-muted-foreground hover:text-foreground underline">שנה</button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => decide(g, "assign")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-profit/30 text-profit hover:bg-profit/10 transition-colors font-medium"
                        >
                          ✅ קונה את המניה
                        </button>
                        <button
                          onClick={() => decide(g, "expire")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors font-medium"
                        >
                          ❌ לא קונה
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assignment Transaction Log */}
      {assignments.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted/20 transition-colors"
            onClick={() => setShowLog((o) => !o)}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-profit" />
              <span className="text-sm font-semibold">Assignment Log</span>
              <span className="text-xs bg-profit/10 text-profit border border-profit/20 px-2 py-0.5 rounded-full">{assignments.length}</span>
            </div>
            {showLog ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {showLog && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground bg-muted/10">
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Description</th>
                    <th className="text-left px-4 py-2.5 font-medium">Transaction Type</th>
                    <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                    <th className="text-right px-4 py-2.5 font-medium">Quantity</th>
                    <th className="text-right px-4 py-2.5 font-medium">Price</th>
                    <th className="text-right px-4 py-2.5 font-medium">Gross Amount</th>
                    <th className="text-right px-4 py-2.5 font-medium">Premium</th>
                    <th className="text-right px-4 py-2.5 font-medium">Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((t) => {
                    const shares = (t.quantity || 0) * 100;
                    const gross = -(t.strike || 0) * shares;
                    const premium = (t.fill_price || 0) * (t.quantity || 0) * 100;
                    const net = gross + premium;
                    return (
                      <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs">{t.close_date || t.expiration_date || "—"}</td>
                        <td className="px-4 py-2.5 text-xs">
                          Buy {shares.toLocaleString()} {t.ticker} (Assignment)
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-profit/10 text-profit border border-profit/20">Assignment</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-sm">{t.ticker}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{shares.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{t.strike?.toFixed(4)} USD</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-loss">${Math.abs(gross).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-profit">+${premium.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                          <span className={net < 0 ? "text-loss" : "text-profit"}>${net.toLocaleString()}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
