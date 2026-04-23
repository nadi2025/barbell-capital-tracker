import { calcDashboard, fmt } from "./dashboardCalcs";

function DonutChart({ slices, size = 180 }) {
  const total = slices.reduce((s, sl) => s + sl.val, 0);
  if (!total) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const innerR = r * 0.62;
  let paths = [];
  let angle = -Math.PI / 2;

  for (const sl of slices) {
    if (!sl.val) continue;
    const sweep = (sl.val / total) * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const ix1 = cx + innerR * Math.cos(end);
    const iy1 = cy + innerR * Math.sin(end);
    const ix2 = cx + innerR * Math.cos(angle);
    const iy2 = cy + innerR * Math.sin(angle);
    const largeArc = sweep > Math.PI ? 1 : 0;
    paths.push(
      <path
        key={sl.name}
        d={`M ${x1.toFixed(2)} ${y1.toFixed(2)}
            A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}
            L ${ix1.toFixed(2)} ${iy1.toFixed(2)}
            A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}
            Z`}
        fill={sl.color}
        stroke="hsl(var(--card))"
        strokeWidth="2"
      />
    );
    angle = end;
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>{paths}</svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total</p>
        <p className="text-lg font-bold font-mono">{fmt(total, 0)}</p>
      </div>
    </div>
  );
}

function PerfBar({ label, val, maxVal }) {
  const w = maxVal > 0 ? (Math.abs(val) / maxVal) * 100 : 0;
  const color = val >= 0 ? "bg-profit" : "bg-loss";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 text-right flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(w, 100)}%`, opacity: 0.85 }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold w-24 text-right ${val >= 0 ? "text-profit" : "text-loss"}`}>
        {fmt(val, 0)}
      </span>
    </div>
  );
}

export default function AllocationSection({ data }) {
  const c = calcDashboard(data);
  const pieTotal = c.allocationSlices.reduce((s, sl) => s + sl.val, 0) || 1;
  const maxBar = Math.max(...c.perfItems.map((b) => Math.abs(b.val)), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Allocation */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-5">
          הקצאת נכסים
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <DonutChart slices={c.allocationSlices} size={180} />
          <div className="flex flex-col gap-2.5 flex-1 w-full">
            {c.allocationSlices.map((sl) => {
              const p = (sl.val / pieTotal) * 100;
              return (
                <div key={sl.name} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: sl.color }} />
                  <span className="text-xs text-muted-foreground flex-1 truncate">{sl.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">{fmt(sl.val, 0)}</span>
                  <span className="text-xs font-mono font-semibold w-12 text-right">{p.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Performance by strategy */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-5">
          ביצועים לפי אסטרטגיה
        </p>
        <div className="space-y-4">
          {c.perfItems.length > 0 ? (
            c.perfItems.map((b) => <PerfBar key={b.label} label={b.label} val={b.val} maxVal={maxBar} />)
          ) : (
            <p className="text-xs text-muted-foreground py-8 text-center">אין נתוני ביצועים</p>
          )}
        </div>
        <div className="mt-6 pt-4 border-t border-border/50 flex justify-between items-center text-xs">
          <span className="text-muted-foreground">פרמיה מצטברת (IB)</span>
          <span className="font-mono font-semibold text-profit text-sm">{fmt(c.premiumCollected, 0)}</span>
        </div>
      </div>
    </div>
  );
}
