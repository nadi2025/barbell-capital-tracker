import { calcDashboard, fmt, pct } from "./dashboardCalcs";

function MiniPie({ slices, size = 160 }) {
  const total = slices.reduce((s, sl) => s + sl.val, 0);
  if (!total) return null;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  let paths = [], angle = -Math.PI / 2;
  for (const sl of slices) {
    if (!sl.val) continue;
    const sweep = (sl.val / total) * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    paths.push(
      <path key={sl.name}
        d={`M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`}
        fill={sl.color} stroke="hsl(var(--card))" strokeWidth="3" />
    );
    angle = end;
  }
  return <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>{paths}</svg>;
}

function PerfBar({ label, val, maxVal }) {
  const w = maxVal > 0 ? (Math.abs(val) / maxVal) * 100 : 0;
  const color = val >= 0 ? "bg-profit" : "bg-loss";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(w, 100)}%`, opacity: 0.8 }} />
      </div>
      <span className={`text-xs font-mono font-semibold w-20 text-right ${val >= 0 ? "text-profit" : "text-loss"}`}>
        {fmt(val, 0)}
      </span>
    </div>
  );
}

export default function AllocationSection({ data }) {
  const c = calcDashboard(data);
  const pieTotal = c.allocationSlices.reduce((s, sl) => s + sl.val, 0) || 1;
  const maxBar = Math.max(...c.perfItems.map(b => Math.abs(b.val)), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Allocation */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-5">הקצאת נכסים</p>
        <div className="flex items-center gap-6">
          <MiniPie slices={c.allocationSlices} size={160} />
          <div className="flex flex-col gap-2">
            {c.allocationSlices.map(sl => (
              <div key={sl.name} className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: sl.color }} />
                <span className="text-xs text-muted-foreground min-w-[80px]">{sl.name}</span>
                <span className="text-xs font-mono font-semibold">{((sl.val / pieTotal) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance by strategy */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-5">ביצועים לפי אסטרטגיה</p>
        <div className="space-y-3.5">
          {c.perfItems.map(b => (
            <PerfBar key={b.label} label={b.label} val={b.val} maxVal={maxBar} />
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-border/50 flex justify-between text-xs text-muted-foreground">
          <span>פרמיה שנגבתה (IB)</span>
          <span className="font-mono font-semibold text-profit">{fmt(c.premiumCollected, 0)}</span>
        </div>
      </div>
    </div>
  );
}