/**
 * FxKpiCard — self-contained KPI tile for the FX module.
 * Intentionally not reusing the global KpiCard so the module can be removed
 * cleanly.
 */
export default function FxKpiCard({ icon: Icon, label, value, sub, valueClass = "" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}