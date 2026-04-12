const fmt = (v, d = 0) => v == null ? '$0' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 2) => v == null ? '0%' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;

export default function AaveSummaryBar({ netWorth, netApy, healthFactor, borrowPowerUsed }) {
  const hfColor = healthFactor > 2 ? 'text-profit' : healthFactor > 1.5 ? 'text-amber-400' : healthFactor > 1.0 ? 'text-loss' : 'text-red-600';
  const bpColor = borrowPowerUsed > 70 ? 'text-loss' : borrowPowerUsed > 50 ? 'text-amber-400' : 'text-profit';

  return (
    <div className="bg-slate-900 text-white rounded-lg p-5 mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-xs text-slate-400 mb-1">Net worth</p>
          <p className="text-3xl font-bold font-mono">{fmt(netWorth)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Net APY</p>
          <p className={`text-2xl font-bold font-mono ${netApy >= 0 ? 'text-profit' : 'text-loss'}`}>{pct(netApy)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Health factor</p>
          <p className={`text-2xl font-bold font-mono ${hfColor}`}>{healthFactor?.toFixed(2) || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Borrow power used</p>
          <p className={`text-2xl font-bold font-mono ${bpColor}`}>{borrowPowerUsed?.toFixed(1) || '0'}%</p>
          <div className="w-32 bg-slate-700 rounded-full h-1.5 mt-2">
            <div
              className={`h-1.5 rounded-full transition-all ${borrowPowerUsed > 70 ? 'bg-loss' : borrowPowerUsed > 50 ? 'bg-amber-400' : 'bg-profit'}`}
              style={{ width: `${Math.min(100, borrowPowerUsed || 0)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}