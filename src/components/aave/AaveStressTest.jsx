import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const fmt = (v, d = 0) => v == null ? '$0' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d });

export default function AaveStressTest() {
  const [btcDrop, setBtcDrop] = useState(0);
  const [ethDrop, setEthDrop] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const scenarios = [
    { label: 'BTC -20%', btc: 20, eth: 0 },
    { label: 'BTC -40%', btc: 40, eth: 0 },
    { label: 'BTC -60%', btc: 60, eth: 0 },
    { label: 'Crash -50%', btc: 50, eth: 50 }
  ];

  const runTest = async (btc, eth) => {
    setBtcDrop(btc);
    setEthDrop(eth);
    setLoading(true);
    try {
      const response = await base44.functions.invoke('calculateStressTest', { btcDropPct: btc, ethDropPct: eth });
      setResult(response.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTest(btcDrop, ethDrop);
  }, []);

  const statusColor = result?.status === 'safe' ? 'text-profit' : result?.status === 'caution' ? 'text-amber-400' : result?.status === 'danger' ? 'text-loss' : 'text-red-600';
  const statusDot = { safe: '🟢', caution: '🟡', danger: '🔴', liquidation: '🔴' };

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Stress Test Scenarios</h3>

      <div className="space-y-4 mb-6">
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">BTC Price Drop: {btcDrop}%</label>
          <input
            type="range"
            min="0"
            max="80"
            step="5"
            value={btcDrop}
            onChange={(e) => runTest(parseInt(e.target.value), ethDrop)}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">ETH Price Drop: {ethDrop}%</label>
          <input
            type="range"
            min="0"
            max="80"
            step="5"
            value={ethDrop}
            onChange={(e) => runTest(btcDrop, parseInt(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {result && (
        <div className="bg-muted/50 rounded p-3 mb-4 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">New collateral:</span>
            <span className="font-mono">{fmt(result.newCollateral)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">New HF:</span>
            <span className={`font-mono font-bold ${statusColor}`}>{result.newHealthFactor.toFixed(2)} {statusDot[result.status]}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {scenarios.map(s => (
          <button
            key={s.label}
            onClick={() => runTest(s.btc, s.eth)}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}