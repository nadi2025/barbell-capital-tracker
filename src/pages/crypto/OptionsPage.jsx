import { useState, useMemo } from "react";
import { Plus, AlertTriangle, TrendingUp, DollarSign, Award, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import OpenPositionCard from "@/components/crypto/options/OpenPositionCard";
import ClosedPositionCard from "@/components/crypto/options/ClosedPositionCard";
import SettleDialog from "@/components/crypto/options/SettleDialog";
import AddEditPositionDialog from "@/components/crypto/options/AddEditPositionDialog";
import RyskWalletCard from "@/components/crypto/options/RyskWalletCard";
import { useEntityList, useEntityMutation } from "@/hooks/useEntityQuery";
import { usePrices } from "@/hooks/usePrices";

const fmt = (v, d = 0) => v == null ? "$0" : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

function KpiCard({ icon: Icon, label, value, sub, valueClass = "" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ClosedSummary({ closed }) {
  if (closed.length === 0) return null;
  const wins = closed.filter((p) => p.status === "Expired OTM");
  const winRate = (wins.length / closed.length) * 100;
  const totalPremium = closed.reduce((s, p) => s + (p.income_usd || 0), 0);
  const totalPnl = closed.reduce((s, p) => s + (p.net_pnl || (p.status === "Expired OTM" ? p.income_usd || 0 : 0)), 0);
  const withDuration = closed.filter((p) => p.opened_date && p.maturity_date);
  const avgDuration = withDuration.length > 0
    ? Math.round(withDuration.reduce((s, p) => s + Math.ceil((new Date(p.maturity_date) - new Date(p.opened_date)) / 86400000), 0) / withDuration.length)
    : null;
  const pnls = closed.map((p) => ({ pnl: p.net_pnl || (p.status === "Expired OTM" ? p.income_usd || 0 : 0), label: `${p.asset} ${p.option_type}` }));
  const best = pnls.length > 0 ? pnls.reduce((a, b) => a.pnl > b.pnl ? a : b) : null;
  const worst = pnls.length > 0 ? pnls.reduce((a, b) => a.pnl < b.pnl ? a : b) : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">סיכום עסקאות סגורות</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">סה״כ עסקאות</p>
          <p className="font-bold text-base">{closed.length}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Win Rate</p>
          <p className={`font-bold text-base ${winRate >= 70 ? "text-emerald-500" : "text-amber-400"}`}>{winRate.toFixed(0)}%</p>
          <p className="text-muted-foreground">{wins.length} wins / {closed.length} total</p>
        </div>
        <div>
          <p className="text-muted-foreground">סה״כ פרמיה</p>
          <p className="font-bold text-base font-mono text-emerald-500">{fmt(totalPremium, 2)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Net Realized P&L</p>
          <p className={`font-bold text-base font-mono ${totalPnl >= 0 ? "text-emerald-500" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl, 2)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs border-t border-border/40 pt-3">
        {avgDuration != null && (
          <div>
            <p className="text-muted-foreground">Avg Duration</p>
            <p className="font-semibold">{avgDuration} days</p>
          </div>
        )}
        {best && (
          <div>
            <p className="text-muted-foreground">Best Trade</p>
            <p className="font-semibold text-emerald-500">{fmt(best.pnl, 2)} · {best.label}</p>
          </div>
        )}
        {worst && (
          <div>
            <p className="text-muted-foreground">Worst Trade</p>
            <p className={`font-semibold ${worst.pnl < 0 ? "text-red-400" : "text-muted-foreground"}`}>{fmt(worst.pnl, 2)} · {worst.label}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * crypto/OptionsPage — Rysk options dashboard.
 *
 * Wallet/cash tracking lives in <RyskWalletCard /> (mounted in File 5 of
 * the spec). Settlement-driven asset transfers and USDC adjustments are
 * handled inside SettleDialog itself, so handleSettle here stays a thin
 * "update entity + log activity" handler.
 */
export default function OptionsPage() {
  const positionsQ = useEntityList("CryptoOptionsPosition", { sort: "-opened_date" });
  const positions = positionsQ.data || [];
  const { priceMap } = usePrices();

  const updatePosition = useEntityMutation("CryptoOptionsPosition", "update");
  const createPosition = useEntityMutation("CryptoOptionsPosition", "create");
  const createActivityLog = useEntityMutation("CryptoActivityLog", "create");

  const [tab, setTab] = useState("Open");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [settlePos, setSettlePos] = useState(null);
  const [editPos, setEditPos] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // Apply platform filter at the source so all downstream memos (open / closed
  // / KPIs) recompute against the same filtered set automatically.
  const platformFiltered = useMemo(() => {
    if (platformFilter === "All") return positions;
    return positions.filter((p) => p.platform === platformFilter);
  }, [positions, platformFilter]);

  const needsSettlement = useMemo(
    () => platformFiltered.filter((p) => p.status === "Open" && p.maturity_date && new Date(p.maturity_date) < today),
    [platformFiltered, today]
  );
  const openPositions = useMemo(
    () => platformFiltered.filter((p) => p.status === "Open" && (!p.maturity_date || new Date(p.maturity_date) >= today)),
    [platformFiltered, today]
  );
  const allClosed = useMemo(
    () => platformFiltered.filter((p) => p.status === "Expired OTM" || p.status === "Expired ITM" || p.status === "Exercised"),
    [platformFiltered]
  );

  const activeNotional = openPositions.reduce((s, p) => s + (p.notional_usd || 0), 0);
  const totalPremium = platformFiltered.reduce((s, p) => s + (p.income_usd || 0), 0);
  const wins = allClosed.filter((p) => p.status === "Expired OTM");
  const winRate = allClosed.length > 0 ? (wins.length / allClosed.length) * 100 : 0;
  const realizedPnl = allClosed.reduce((s, p) => s + (p.net_pnl || (p.status === "Expired OTM" ? p.income_usd || 0 : 0)), 0);

  const handleSettle = async (id, data) => {
    await updatePosition.mutateAsync({ id, data });
    const pos = positions.find((p) => p.id === id);
    if (pos) {
      await createActivityLog.mutateAsync({
        date: new Date().toISOString().split("T")[0],
        action_type: "Other",
        description: `Option settled: ${pos.asset} ${pos.option_type} ${pos.strike_price ? "$" + pos.strike_price : ""} ${data.status === "Expired OTM" ? "expired OTM" : data.status}, ${data.settlement_result || ""}`,
        amount_usd: data.net_pnl || 0,
      });
    }
    toast.success("Position settled");
    setSettlePos(null);
  };

  const handleAdd = async (data) => {
    if (!data.asset || !data.maturity_date) { toast.error("Asset and maturity date required"); return; }
    await createPosition.mutateAsync(data);
    setShowAdd(false);
    toast.success("Position added");
  };

  const handleEdit = async (data) => {
    await updatePosition.mutateAsync({ id: editPos.id, data });
    setEditPos(null);
    toast.success("Position updated");
  };

  const tabPositions = tab === "Open"
    ? [...needsSettlement, ...openPositions]
    : tab === "Closed"
      ? allClosed
      : platformFiltered;

  if (positionsQ.isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Crypto Options</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Rysk Finance — Premium Collection Strategy</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף פוזיציה
        </Button>
      </div>

      {/* Rysk wallet card — cash, locked collateral, free, deposits/withdraws */}
      <RyskWalletCard />

      {/* Settlement alert */}
      {needsSettlement.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">{needsSettlement.length} פוזיציות פג תוקפן וממתינות לסגירה</p>
            <p className="text-xs text-muted-foreground mt-0.5">לחץ על "Settle" בכל כרטיסייה כדי לאשר את התוצאה</p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={TrendingUp} label="Active Notional" value={fmt(activeNotional)} sub={`${openPositions.length} open positions`} />
        <KpiCard icon={DollarSign} label="Total Premium Collected" value={fmt(totalPremium, 2)} valueClass="text-emerald-500" sub="since first trade" />
        <KpiCard icon={Award} label="Win Rate" value={`${winRate.toFixed(0)}%`} valueClass={winRate >= 70 ? "text-emerald-500" : "text-amber-400"} sub={`${wins.length} wins / ${allClosed.length} total`} />
        <KpiCard icon={BarChart2} label="Realized P&L" value={(realizedPnl >= 0 ? "+" : "") + fmt(realizedPnl, 2)} valueClass={realizedPnl >= 0 ? "text-emerald-500" : "text-red-400"} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {["Open", "Closed", "All"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-lg border transition ${tab === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {t}
            {t === "Open" && needsSettlement.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{needsSettlement.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Platform filter pills */}
      <div className="flex gap-2 items-center text-xs">
        <span className="text-muted-foreground">Platform:</span>
        {["All", "Rysk Finance", "Derive"].map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`px-3 py-1 rounded-md border transition ${
              platformFilter === p
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {tab === "Closed" && <ClosedSummary closed={allClosed} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tabPositions.map((pos) => {
          const isClosed = pos.status === "Expired OTM" || pos.status === "Expired ITM" || pos.status === "Exercised";
          if (isClosed && tab !== "Open") {
            return <ClosedPositionCard key={pos.id} pos={pos} />;
          }
          return (
            <OpenPositionCard
              key={pos.id}
              pos={pos}
              priceMap={priceMap}
              onEdit={setEditPos}
              onSettle={setSettlePos}
            />
          );
        })}
        {tabPositions.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground text-sm">
            {tab === "Open" ? "אין פוזיציות פתוחות" : tab === "Closed" ? "אין פוזיציות סגורות" : "אין פוזיציות"}
          </div>
        )}
      </div>

      <SettleDialog
        open={!!settlePos}
        pos={settlePos}
        onClose={() => setSettlePos(null)}
        onConfirm={handleSettle}
      />
      <AddEditPositionDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleAdd}
        globalPrices={priceMap}
      />
      <AddEditPositionDialog
        open={!!editPos}
        initialData={editPos}
        onClose={() => setEditPos(null)}
        onSave={handleEdit}
        globalPrices={priceMap}
      />
    </div>
  );
}