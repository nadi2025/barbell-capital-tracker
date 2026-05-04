/**
 * PrivateKpiCard — KPI tile for the Private Investments module.
 *
 * Standalone copy (no import from the existing app KpiCard) so the module is
 * self-contained and can be removed without touching other components.
 */
export default function PrivateKpiCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between min-h-[92px]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground/50" />}
      </div>
      <div>
        <p className={`text-xl font-bold font-mono leading-tight ${accent || ""}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}
