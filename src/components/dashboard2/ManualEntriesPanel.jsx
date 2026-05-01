import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, ArrowUpRight, Settings, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityList } from "@/hooks/useEntityQuery";
import { usePrices } from "@/hooks/usePrices";
import {
  computeAaveCollateralDerived,
  TOKEN_ALIAS_TO_BASE,
} from "@/lib/portfolioMath";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Page-level maintenance widgets are exposed via named exports below
 * (AaveMaintenanceSection, HLMaintenanceSection, etc.) so each
 * relevant page can mount only the slice that belongs to it. The full
 * cross-cutting panel (default export) was removed from the main
 * Dashboard at user request — too much noise. It's still available if
 * a future settings/ops page wants it.
 */

const HL_WALLET_KEY = "hl_wallet_address";
function getStoredHLWallet() {
  try { return localStorage.getItem(HL_WALLET_KEY) || ""; } catch { return ""; }
}
function setStoredHLWallet(addr) {
  try { localStorage.setItem(HL_WALLET_KEY, addr); } catch { /* ignore */ }
}

const fmt = (v) =>
  v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function daysSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * Color a row based on how many days have passed vs the threshold:
 *   green  — < threshold/2
 *   amber  — between threshold/2 and threshold
 *   red    — exceeded
 *
 * @param {number} days
 * @param {number} threshold — soft cap in days
 * @returns one of "green" | "amber" | "red"
 */
function statusFor(days, threshold) {
  if (days >= threshold) return "red";
  if (days >= threshold / 2) return "amber";
  return "green";
}

const STATUS_CLASSES = {
  green: { dot: "bg-profit", text: "text-profit", row: "" },
  amber: { dot: "bg-amber-500", text: "text-amber-500", row: "bg-amber-500/5" },
  red:   { dot: "bg-red-500", text: "text-red-500", row: "bg-red-500/5" },
};

function StatusDot({ status }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${STATUS_CLASSES[status].dot}`} aria-label={status} />;
}

function DaysBadge({ days, status }) {
  if (!isFinite(days)) return <span className={`text-[11px] ${STATUS_CLASSES[status].text}`}>אין עדכון</span>;
  return <span className={`text-[11px] ${STATUS_CLASSES[status].text}`}>לפני {days} ימים</span>;
}

function SectionCard({ title, count, threshold, items, renderItem, emptyMessage, expanded, onToggle, hasRed, headerAction }) {
  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${hasRed ? "border-red-500/30" : "border-border"}`}>
      <div className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-right">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-[10px] text-muted-foreground">({count} · סף {threshold} ימים)</span>
          {hasRed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-medium">
              דורש עדכון
            </span>
          )}
        </button>
        {headerAction && <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>}
      </div>
      {expanded && (
        <div className="border-t border-border/40 divide-y divide-border/30">
          {items.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">{emptyMessage}</div>
          ) : items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

/**
 * Inline Sync-HL button. Stores the user's HL wallet address in localStorage
 * the first time it's needed, then reuses it. Hits the syncHL Deno function
 * which pulls live position state from api.hyperliquid.xyz/info and
 * reconciles the LeveragedPosition entity.
 */
function HLSyncButton() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    let wallet = getStoredHLWallet();
    if (!wallet) {
      // eslint-disable-next-line no-alert
      const entered = window.prompt("הזן את כתובת ה-HyperLiquid שלך (0x...)\nהיא תישמר מקומית לפעמים הבאות:");
      if (!entered) return;
      if (!/^0x[a-fA-F0-9]{40}$/.test(entered.trim())) {
        toast.error("כתובת לא תקינה");
        return;
      }
      wallet = entered.trim();
      setStoredHLWallet(wallet);
    }

    setBusy(true);
    try {
      const res = await base44.functions.invoke("syncHL", { wallet });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["entity", "LeveragedPosition"] });
      const summary = `עודכן: ${data?.updated || 0} · נפתחו: ${data?.created || 0} · נסגרו: ${data?.closed || 0}`;
      toast.success(`HL סונכרן · ${summary}`);
    } catch (e) {
      toast.error(`שגיאה ב-HL sync: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={busy} className="h-7 gap-1.5 text-xs">
      <Zap className={`w-3 h-3 ${busy ? "animate-pulse" : ""}`} />
      {busy ? "מסנכרן..." : "Sync HL"}
    </Button>
  );
}

/**
 * ManualEntriesPanel — surfaces every entity field the auto-update pipeline
 * doesn't touch, with staleness indicators so the user knows what to maintain.
 *
 * Six sections, each with its own threshold:
 *   Aave Collateral    — 14 days
 *   Aave Borrow        — 7 days
 *   HL Positions       — 30 days  (escalates earlier if HLTrade newer than position.last_updated)
 *   Wallet aTokens     — 30 days  (only tokens starting with "A" and in alias map)
 *   LP Positions       — 14 days
 *   Off-Chain Investors — last InvestorPayment > 30 days ago
 *
 * Each row links via react-router to the relevant page with ?editId=… so
 * destination pages can open their edit form on that specific record.
 *
 * The panel itself is collapsed by default. It auto-expands only when at
 * least one item is in red (i.e. needs attention right now). Each section
 * inside also collapses individually.
 */
export default function ManualEntriesPanel() {
  const collateralsQ = useEntityList("AaveCollateral");
  const borrowsQ = useEntityList("AaveBorrow");
  const leveragedQ = useEntityList("LeveragedPosition", { filter: { status: "Open" } });
  const cryptoAssetsQ = useEntityList("CryptoAsset");
  const lpQ = useEntityList("LpPosition", { filter: { status: "Active" } });
  const investorsQ = useEntityList("OffChainInvestor", { filter: { status: "Active" } });
  const paymentsQ = useEntityList("InvestorPayment", { sort: "-payment_date", limit: 500 });
  const hlTradesQ = useEntityList("HLTrade", { sort: "-trade_date", limit: 100 });
  const { priceMap } = usePrices();

  // ── Build each section's enriched item list ──

  const collateralItems = useMemo(() => {
    return (collateralsQ.data || [])
      // Defensive: skip orphan rows where the asset hasn't been set. These
      // tend to come from older data or aborted edits, and they confuse the
      // user with "undefined · X units · $0" rows.
      .filter((c) => c.asset_name && (c.price_key || c.asset_name))
      .map((c) => {
        const days = daysSince(c.last_updated || c.updated_date || c.created_date);
        const status = statusFor(days, 14);
        const derived = computeAaveCollateralDerived(c, priceMap);
        return {
          id: c.id,
          primary: `${c.asset_name} · ${(c.units || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} units`,
          secondary: `שווי נגזר: ${fmt(derived.value_usd)}`,
          days, status,
          editHref: `/crypto/aave?editId=${c.id}&type=collateral`,
        };
      });
  }, [collateralsQ.data, priceMap]);

  const borrowItems = useMemo(() => {
    return (borrowsQ.data || []).map((b) => {
      const days = daysSince(b.last_updated || b.updated_date || b.created_date);
      const status = statusFor(days, 7);
      return {
        id: b.id,
        primary: `${b.asset_name || "USDC"} · borrowed ${fmt(b.borrowed_amount)}`,
        secondary: `APY ${(b.borrow_apy || 0).toFixed(2)}%`,
        days, status,
        editHref: `/crypto/aave?editId=${b.id}&type=borrow`,
      };
    });
  }, [borrowsQ.data]);

  // For HL: also flag earlier when an HLTrade is newer than position.last_updated
  const hlItems = useMemo(() => {
    const trades = hlTradesQ.data || [];
    const latestTradeByAsset = {};
    for (const t of trades) {
      const k = (t.asset || "").toUpperCase();
      const cur = latestTradeByAsset[k];
      const tDate = new Date(t.trade_date || 0).getTime();
      if (!cur || tDate > cur) latestTradeByAsset[k] = tDate;
    }
    return (leveragedQ.data || []).map((p) => {
      let days = daysSince(p.last_updated || p.opened_date);
      const tradeMs = latestTradeByAsset[(p.asset || "").toUpperCase()];
      const positionUpdatedMs = new Date(p.last_updated || p.opened_date || 0).getTime();
      // If a trade was logged AFTER the last position update, escalate to red.
      const tradedAfterUpdate = tradeMs && positionUpdatedMs && tradeMs > positionUpdatedMs;
      let status = statusFor(days, 30);
      if (tradedAfterUpdate) status = "red";
      return {
        id: p.id,
        primary: `${p.asset} ${p.direction} ${p.leverage}x · size ${p.size || 0}`,
        secondary: `entry ${fmt(p.entry_price)} · margin ${fmt(p.margin_usd)} · liq ${fmt(p.liquidation_price)}${tradedAfterUpdate ? " · trade newer than last update!" : ""}`,
        days, status,
        editHref: `/crypto/leveraged?editId=${p.id}`,
      };
    });
  }, [leveragedQ.data, hlTradesQ.data]);

  // Wallet aTokens — only tokens starting with "A" that map back to a base asset
  const aTokenItems = useMemo(() => {
    return (cryptoAssetsQ.data || [])
      .filter((a) => {
        const t = (a.token || "").toUpperCase();
        return t.startsWith("A") && TOKEN_ALIAS_TO_BASE[t];
      })
      .map((a) => {
        const days = daysSince(a.last_updated);
        const status = statusFor(days, 30);
        return {
          id: a.id,
          primary: `${a.token} · ${(a.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
          secondary: `wallet: ${a.wallet_name || "—"}`,
          days, status,
          editHref: `/crypto/wallets?editId=${a.id}`,
        };
      });
  }, [cryptoAssetsQ.data]);

  const lpItems = useMemo(() => {
    return (lpQ.data || []).map((l) => {
      const days = daysSince(l.last_updated || l.updated_date || l.created_date);
      const status = statusFor(days, 14);
      return {
        id: l.id,
        primary: `${l.protocol || l.platform || "LP"} · ${l.pair || ""}`,
        secondary: `שווי: ${fmt(l.current_value_usd)}`,
        days, status,
        editHref: `/settings/assets?editId=${l.id}`,
      };
    });
  }, [lpQ.data]);

  // Off-chain investors — stale if no InvestorPayment in last 30 days
  const investorItems = useMemo(() => {
    const payments = paymentsQ.data || [];
    const latestByInvestor = {};
    for (const p of payments) {
      const cur = latestByInvestor[p.investor_id];
      const pDate = new Date(p.payment_date || 0).getTime();
      if (!cur || pDate > cur) latestByInvestor[p.investor_id] = pDate;
    }
    return (investorsQ.data || [])
      .filter((inv) => inv.interest_schedule === "Monthly") // only monthly investors expected to have recent payments
      .map((inv) => {
        const lastMs = latestByInvestor[inv.id];
        const days = lastMs ? Math.floor((Date.now() - lastMs) / 86400000) : Infinity;
        const status = statusFor(days, 30);
        return {
          id: inv.id,
          primary: `${inv.name} · ${fmt(inv.principal_usd)} @ ${inv.interest_rate}%`,
          secondary: lastMs
            ? `תשלום אחרון לפני ${days} ימים`
            : "אין תיעוד תשלום",
          days, status,
          editHref: `/offchain-investors?editId=${inv.id}`,
        };
      });
  }, [investorsQ.data, paymentsQ.data]);

  // ── Section state (which expanded) — auto-expand red ──

  const allSections = useMemo(() => [
    { key: "collateral", title: "Aave Collateral", items: collateralItems, threshold: 14, emptyMessage: "אין collateral" },
    { key: "borrow",     title: "Aave Borrow", items: borrowItems, threshold: 7, emptyMessage: "אין borrow" },
    { key: "hl",         title: "HL Positions", items: hlItems, threshold: 30, emptyMessage: "אין פוזיציות פתוחות" },
    { key: "atokens",    title: "Crypto Wallet aTokens", items: aTokenItems, threshold: 30, emptyMessage: "אין aTokens במעקב" },
    { key: "lp",         title: "LP Positions", items: lpItems, threshold: 14, emptyMessage: "אין LP positions פעילים" },
    { key: "investors",  title: "Off-Chain Investors (חודשי)", items: investorItems, threshold: 30, emptyMessage: "אין משקיעים חודשיים" },
  ], [collateralItems, borrowItems, hlItems, aTokenItems, lpItems, investorItems]);

  const totalRedCount = allSections.reduce(
    (s, sec) => s + sec.items.filter((it) => it.status === "red").length,
    0
  );
  const totalAmberCount = allSections.reduce(
    (s, sec) => s + sec.items.filter((it) => it.status === "amber").length,
    0
  );

  // Panel-level state — open by default if anything is red
  const [panelOpen, setPanelOpen] = useState(false);
  // Per-section state: open the section only if it has red rows
  const [sectionOpen, setSectionOpen] = useState({});

  // Trigger open on first render with red items
  useMemo(() => {
    if (totalRedCount > 0) setPanelOpen(true);
    const next = {};
    for (const sec of allSections) {
      next[sec.key] = sec.items.some((it) => it.status === "red");
    }
    setSectionOpen(next);
  }, [totalRedCount, allSections]);

  if (allSections.every((s) => s.items.length === 0)) return null;

  const headerColor = totalRedCount > 0 ? "text-red-500" : totalAmberCount > 0 ? "text-amber-500" : "text-muted-foreground";

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className={`w-4 h-4 ${headerColor}`} />
          <span className="text-sm font-semibold">תחזוקה ידנית — נתונים שלא מתעדכנים אוטומטית</span>
          {totalRedCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-medium">
              {totalRedCount} דורש עדכון
            </span>
          )}
          {totalAmberCount > 0 && totalRedCount === 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium">
              {totalAmberCount} מתקרב לסף
            </span>
          )}
        </div>
        {panelOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {panelOpen && (
        <div className="border-t border-border/40 p-3 space-y-2">
          {allSections.map((sec) => {
            const hasRed = sec.items.some((it) => it.status === "red");
            // HL has a public read-only API — give the section a one-click sync.
            const headerAction = sec.key === "hl" ? <HLSyncButton /> : null;
            return (
              <SectionCard
                key={sec.key}
                title={sec.title}
                count={sec.items.length}
                threshold={sec.threshold}
                items={sec.items}
                hasRed={hasRed}
                expanded={!!sectionOpen[sec.key]}
                onToggle={() => setSectionOpen((p) => ({ ...p, [sec.key]: !p[sec.key] }))}
                emptyMessage={sec.emptyMessage}
                headerAction={headerAction}
                renderItem={(item) => (
                  <Link
                    key={item.id}
                    to={item.editHref}
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors ${STATUS_CLASSES[item.status].row}`}
                  >
                    <StatusDot status={item.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">{item.primary}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{item.secondary}</p>
                    </div>
                    <DaysBadge days={item.days} status={item.status} />
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </Link>
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Page-level maintenance widgets
// ──────────────────────────────────────────────────────────────────────────

/**
 * Renders one or more SectionCards by key. Used by per-page widgets so each
 * surface (Aave page, Leveraged page, Wallets page, Off-chain investors
 * page) shows exactly the rows that belong to it — without dragging the
 * cross-cutting panel into the main dashboard.
 */
function MaintenanceShell({ keys, headerActions = {} }) {
  // Re-run the same computations the full panel does, but render only the
  // requested subset. We deliberately do not auto-expand here — pages already
  // have their own focus, the section is a quiet sidebar by default.
  const collateralsQ = useEntityList("AaveCollateral");
  const borrowsQ = useEntityList("AaveBorrow");
  const leveragedQ = useEntityList("LeveragedPosition", { filter: { status: "Open" } });
  const cryptoAssetsQ = useEntityList("CryptoAsset");
  const lpQ = useEntityList("LpPosition", { filter: { status: "Active" } });
  const investorsQ = useEntityList("OffChainInvestor", { filter: { status: "Active" } });
  const paymentsQ = useEntityList("InvestorPayment", { sort: "-payment_date", limit: 500 });
  const hlTradesQ = useEntityList("HLTrade", { sort: "-trade_date", limit: 100 });
  const { priceMap } = usePrices();

  const collateralItems = useMemo(() => {
    return (collateralsQ.data || [])
      .filter((c) => c.asset_name && (c.price_key || c.asset_name))
      .map((c) => {
        const days = daysSince(c.last_updated || c.updated_date || c.created_date);
        const status = statusFor(days, 14);
        const derived = computeAaveCollateralDerived(c, priceMap);
        return {
          id: c.id,
          primary: `${c.asset_name} · ${(c.units || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} units`,
          secondary: `שווי נגזר: ${fmt(derived.value_usd)}`,
          days, status,
          editHref: `/crypto/aave?editId=${c.id}&type=collateral`,
        };
      });
  }, [collateralsQ.data, priceMap]);

  const borrowItems = useMemo(() => {
    return (borrowsQ.data || []).map((b) => {
      const days = daysSince(b.last_updated || b.updated_date || b.created_date);
      const status = statusFor(days, 7);
      return {
        id: b.id,
        primary: `${b.asset_name || "USDC"} · borrowed ${fmt(b.borrowed_amount)}`,
        secondary: `APY ${(b.borrow_apy || 0).toFixed(2)}%`,
        days, status,
        editHref: `/crypto/aave?editId=${b.id}&type=borrow`,
      };
    });
  }, [borrowsQ.data]);

  const hlItems = useMemo(() => {
    const trades = hlTradesQ.data || [];
    const latestTradeByAsset = {};
    for (const t of trades) {
      const k = (t.asset || "").toUpperCase();
      const cur = latestTradeByAsset[k];
      const tDate = new Date(t.trade_date || 0).getTime();
      if (!cur || tDate > cur) latestTradeByAsset[k] = tDate;
    }
    return (leveragedQ.data || []).map((p) => {
      const days = daysSince(p.last_updated || p.opened_date);
      const tradeMs = latestTradeByAsset[(p.asset || "").toUpperCase()];
      const positionUpdatedMs = new Date(p.last_updated || p.opened_date || 0).getTime();
      const tradedAfterUpdate = tradeMs && positionUpdatedMs && tradeMs > positionUpdatedMs;
      let status = statusFor(days, 30);
      if (tradedAfterUpdate) status = "red";
      return {
        id: p.id,
        primary: `${p.asset} ${p.direction} ${p.leverage}x · size ${p.size || 0}`,
        secondary: `entry ${fmt(p.entry_price)} · margin ${fmt(p.margin_usd)} · liq ${fmt(p.liquidation_price)}${tradedAfterUpdate ? " · trade newer than last update!" : ""}`,
        days, status,
        editHref: `/crypto/leveraged?editId=${p.id}`,
      };
    });
  }, [leveragedQ.data, hlTradesQ.data]);

  const aTokenItems = useMemo(() => {
    return (cryptoAssetsQ.data || [])
      .filter((a) => {
        const t = (a.token || "").toUpperCase();
        return t.startsWith("A") && TOKEN_ALIAS_TO_BASE[t];
      })
      .map((a) => {
        const days = daysSince(a.last_updated);
        const status = statusFor(days, 30);
        return {
          id: a.id,
          primary: `${a.token} · ${(a.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
          secondary: `wallet: ${a.wallet_name || "—"}`,
          days, status,
          editHref: `/crypto/wallets?editId=${a.id}`,
        };
      });
  }, [cryptoAssetsQ.data]);

  const lpItems = useMemo(() => {
    return (lpQ.data || []).map((l) => {
      const days = daysSince(l.last_updated || l.updated_date || l.created_date);
      const status = statusFor(days, 14);
      return {
        id: l.id,
        primary: `${l.protocol || l.platform || "LP"} · ${l.pair || ""}`,
        secondary: `שווי: ${fmt(l.current_value_usd)}`,
        days, status,
        editHref: `/settings/assets?editId=${l.id}`,
      };
    });
  }, [lpQ.data]);

  const investorItems = useMemo(() => {
    const payments = paymentsQ.data || [];
    const latestByInvestor = {};
    for (const p of payments) {
      const cur = latestByInvestor[p.investor_id];
      const pDate = new Date(p.payment_date || 0).getTime();
      if (!cur || pDate > cur) latestByInvestor[p.investor_id] = pDate;
    }
    return (investorsQ.data || [])
      .filter((inv) => inv.interest_schedule === "Monthly")
      .map((inv) => {
        const lastMs = latestByInvestor[inv.id];
        const days = lastMs ? Math.floor((Date.now() - lastMs) / 86400000) : Infinity;
        const status = statusFor(days, 30);
        return {
          id: inv.id,
          primary: `${inv.name} · ${fmt(inv.principal_usd)} @ ${inv.interest_rate}%`,
          secondary: lastMs
            ? `תשלום אחרון לפני ${days} ימים`
            : "אין תיעוד תשלום",
          days, status,
          editHref: `/offchain-investors?editId=${inv.id}`,
        };
      });
  }, [investorsQ.data, paymentsQ.data]);

  const allSections = useMemo(() => [
    { key: "collateral", title: "Aave Collateral", items: collateralItems, threshold: 14, emptyMessage: "אין collateral" },
    { key: "borrow",     title: "Aave Borrow", items: borrowItems, threshold: 7, emptyMessage: "אין borrow" },
    { key: "hl",         title: "HL Positions", items: hlItems, threshold: 30, emptyMessage: "אין פוזיציות פתוחות" },
    { key: "atokens",    title: "Crypto Wallet aTokens", items: aTokenItems, threshold: 30, emptyMessage: "אין aTokens במעקב" },
    { key: "lp",         title: "LP Positions", items: lpItems, threshold: 14, emptyMessage: "אין LP positions פעילים" },
    { key: "investors",  title: "Off-Chain Investors (חודשי)", items: investorItems, threshold: 30, emptyMessage: "אין משקיעים חודשיים" },
  ], [collateralItems, borrowItems, hlItems, aTokenItems, lpItems, investorItems]);

  const filtered = allSections.filter((s) => keys.includes(s.key));

  // Sections start expanded on per-page mount; they're already focused.
  const [openMap, setOpenMap] = useState(() => Object.fromEntries(filtered.map((s) => [s.key, true])));

  if (filtered.every((s) => s.items.length === 0)) return null;

  return (
    <div className="space-y-2">
      {filtered.map((sec) => {
        const hasRed = sec.items.some((it) => it.status === "red");
        const headerAction = headerActions[sec.key];
        return (
          <SectionCard
            key={sec.key}
            title={sec.title}
            count={sec.items.length}
            threshold={sec.threshold}
            items={sec.items}
            hasRed={hasRed}
            expanded={!!openMap[sec.key]}
            onToggle={() => setOpenMap((p) => ({ ...p, [sec.key]: !p[sec.key] }))}
            emptyMessage={sec.emptyMessage}
            headerAction={headerAction}
            renderItem={(item) => (
              <Link
                key={item.id}
                to={item.editHref}
                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors ${STATUS_CLASSES[item.status].row}`}
              >
                <StatusDot status={item.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{item.primary}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{item.secondary}</p>
                </div>
                <DaysBadge days={item.days} status={item.status} />
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Link>
            )}
          />
        );
      })}
    </div>
  );
}

export function AaveMaintenance() {
  return <MaintenanceShell keys={["collateral", "borrow"]} />;
}

export function HLMaintenance() {
  return <MaintenanceShell keys={["hl"]} headerActions={{ hl: <HLSyncButton /> }} />;
}

export function WalletsMaintenance() {
  return <MaintenanceShell keys={["atokens", "lp"]} />;
}

export function InvestorsMaintenance() {
  return <MaintenanceShell keys={["investors"]} />;
}