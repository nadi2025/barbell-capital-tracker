import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const fmtP = (v) => v == null ? "—" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function parseHLDate(str) {
  // "5.11.2025 - 13:18:09"
  if (!str) return null;
  const cleaned = str.trim().replace(" - ", "T");
  const [datePart, timePart] = cleaned.split("T");
  if (!datePart) return null;
  const [d, m, y] = datePart.split(".");
  return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T${timePart || "00:00:00"}`);
}

function stripCoinName(coin) {
  return coin?.replace(/\s*\(.*\)/, "").trim();
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
    const row = {};
    header.forEach((h, i) => { row[h] = vals[i]; });
    return row;
  });
}

const DIR_COLORS = {
  "Open Long": "bg-blue-50 text-blue-700",
  "Close Long": "",
  "Open Short": "bg-purple-50 text-purple-700",
  "Close Short": "",
};

export default function TradeHistoryTab({ trades, onRefresh }) {
  const fileRef = useRef();
  const [importing, setImporting] = useState(false);
  const [assetFilter, setAssetFilter] = useState("All");
  const [dirFilter, setDirFilter] = useState("All");

  const assets = ["All", ...Array.from(new Set(trades.map(t => t.asset))).sort()];

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const batch = new Date().toISOString();

      // Get existing raw_keys to avoid duplicates
      const existing = await base44.entities.HLTrade.list("-trade_date", 2000);
      const existingKeys = new Set(existing.map(t => t.raw_key).filter(Boolean));

      let imported = 0;
      for (const row of rows) {
        const asset = stripCoinName(row.coin || row.Coin);
        const dir = row.dir || row.Dir || row.direction;
        const px = row.px || row.Px || row.price;
        const time = row.time || row.Time;
        const rawKey = `${time}|${row.coin}|${dir}|${px}`;

        if (existingKeys.has(rawKey)) continue;

        const tradeDate = parseHLDate(time);
        const closedPnl = parseFloat(row.closedPnl || row["Closed PnL"] || 0) || 0;
        const isClose = dir?.toLowerCase().includes("close");

        await base44.entities.HLTrade.create({
          trade_date: tradeDate?.toISOString(),
          asset,
          direction: dir,
          price: parseFloat(px) || 0,
          size: parseFloat(row.sz || row.Sz || 0) || 0,
          notional_usd: parseFloat(row.ntl || row.Ntl || 0) || 0,
          fee_usd: parseFloat(row.fee || row.Fee || 0) || 0,
          closed_pnl: isClose ? closedPnl : null,
          import_batch: batch,
          raw_key: rawKey,
        });
        imported++;
      }
      toast.success(`יובאו ${imported} עסקאות בהצלחה`);
      onRefresh();
    } catch (err) {
      toast.error("שגיאה בייבוא: " + err.message);
    }
    setImporting(false);
    e.target.value = "";
  };

  const filtered = trades.filter(t => {
    if (assetFilter !== "All" && t.asset !== assetFilter) return false;
    if (dirFilter === "Opens" && !t.direction?.toLowerCase().includes("open")) return false;
    if (dirFilter === "Closes" && !t.direction?.toLowerCase().includes("close")) return false;
    return true;
  });

  const isClose = (dir) => dir?.toLowerCase().includes("close");

  const pnlColor = (t) => {
    if (!isClose(t.direction)) return "";
    if (t.closed_pnl > 0) return "bg-emerald-50";
    if (t.closed_pnl < 0) return "bg-red-50";
    return "";
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)}
            className="h-8 px-2 rounded-md border border-input bg-transparent text-sm">
            {assets.map(a => <option key={a}>{a}</option>)}
          </select>
          <select value={dirFilter} onChange={e => setDirFilter(e.target.value)}
            className="h-8 px-2 rounded-md border border-input bg-transparent text-sm">
            <option value="All">All Directions</option>
            <option value="Opens">Opens only</option>
            <option value="Closes">Closes only</option>
          </select>
        </div>
        <div>
          <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleImport} />
          <Button variant="outline" className="gap-2" onClick={() => fileRef.current.click()} disabled={importing}>
            <Upload className="w-4 h-4" />
            {importing ? "מייבא..." : "ייבא CSV מ-HyperLiquid"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} עסקאות</p>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground bg-muted/30">
                <th className="text-right px-4 py-3">תאריך</th>
                <th className="text-right px-4 py-3">נכס</th>
                <th className="text-right px-4 py-3">פעולה</th>
                <th className="text-right px-4 py-3">מחיר</th>
                <th className="text-right px-4 py-3">כמות</th>
                <th className="text-right px-4 py-3">נוציונל</th>
                <th className="text-right px-4 py-3">עמלה</th>
                <th className="text-right px-4 py-3">P&L</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className={`border-b border-border/40 text-right ${pnlColor(t)}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {t.trade_date ? format(new Date(t.trade_date), "d.M.yy HH:mm") : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-bold">{t.asset}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isClose(t.direction) ? (t.closed_pnl >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700") : "bg-blue-100 text-blue-700"}`}>
                      {t.direction}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono">${(t.price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                  <td className="px-4 py-2.5 font-mono">{(t.size || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                  <td className="px-4 py-2.5 font-mono">${(t.notional_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">${(t.fee_usd || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold">
                    {isClose(t.direction) && t.closed_pnl != null
                      ? <span className={t.closed_pnl >= 0 ? "text-profit" : "text-loss"}>{t.closed_pnl >= 0 ? "+" : ""}{fmtP(t.closed_pnl)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  אין עסקאות. ייבא CSV מ-HyperLiquid כדי להתחיל.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-border">
          {filtered.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground text-sm px-4">אין עסקאות. ייבא CSV מ-HyperLiquid כדי להתחיל.</p>
          ) : filtered.map((t) => (
            <div key={t.id} className={`px-4 py-3 space-y-2 ${pnlColor(t)}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold">{t.asset}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {t.trade_date ? format(new Date(t.trade_date), "d.M.yy HH:mm") : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isClose(t.direction) ? (t.closed_pnl >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700") : "bg-blue-100 text-blue-700"}`}>
                  {t.direction}
                </span>
                {isClose(t.direction) && t.closed_pnl != null && (
                  <span className={`font-mono font-semibold text-sm ${t.closed_pnl >= 0 ? "text-profit" : "text-loss"}`}>
                    {t.closed_pnl >= 0 ? "+" : ""}{fmtP(t.closed_pnl)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">מחיר</p>
                  <p className="font-mono">${(t.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">כמות</p>
                  <p className="font-mono">{(t.size || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">עמלה</p>
                  <p className="font-mono text-muted-foreground">${(t.fee_usd || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}