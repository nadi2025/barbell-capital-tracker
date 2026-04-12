import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Edit2 } from 'lucide-react';

const fmt = (v, d = 2) => v == null ? '$0' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d });

export default function AaveSuppliesTable({ collateralDetails, totalCollateral, supplyApy, onEdit }) {
  const [editingAsset, setEditingAsset] = useState(null);
  const [editUnits, setEditUnits] = useState('');
  const [editApy, setEditApy] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditStart = (asset) => {
    setEditingAsset(asset.asset_name);
    setEditUnits(asset.units);
    setEditApy(asset.supply_apy);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke('updateAaveCollateral', {
        assetName: editingAsset,
        newUnits: parseFloat(editUnits),
        newApy: parseFloat(editApy)
      });
      setEditingAsset(null);
      onEdit?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-semibold">Your supplies</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Balance {fmt(totalCollateral)} · APY {supplyApy?.toFixed(2) || '0'}%
          </p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 text-xs font-medium text-muted-foreground">Asset</th>
            <th className="text-right py-2 text-xs font-medium text-muted-foreground">Balance</th>
            <th className="text-right py-2 text-xs font-medium text-muted-foreground">APY</th>
            <th className="text-right py-2 text-xs font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {collateralDetails?.map(asset => (
            <tr key={asset.asset_name} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-3 font-medium">{asset.asset_name}</td>
              <td className="text-right py-3">
                {editingAsset === asset.asset_name ? (
                  <input
                    type="number"
                    value={editUnits}
                    onChange={(e) => setEditUnits(e.target.value)}
                    className="w-20 px-2 py-1 border border-border rounded text-right text-sm"
                  />
                ) : (
                  <div className="text-xs">
                    <div className="font-mono">{asset.units.toFixed(4)}</div>
                    <div className="text-muted-foreground">{fmt(asset.value_usd)}</div>
                  </div>
                )}
              </td>
              <td className="text-right py-3">
                {editingAsset === asset.asset_name ? (
                  <input
                    type="number"
                    value={editApy}
                    onChange={(e) => setEditApy(e.target.value)}
                    className="w-16 px-2 py-1 border border-border rounded text-right text-sm"
                  />
                ) : (
                  <span className="text-xs text-profit">{asset.supply_apy?.toFixed(2) || '0'}%</span>
                )}
              </td>
              <td className="text-right py-3">
                {editingAsset === asset.asset_name ? (
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditingAsset(null)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? '...' : 'Save'}
                    </Button>
                  </div>
                ) : (
                  <button onClick={() => handleEditStart(asset)} className="p-1 hover:bg-muted rounded">
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}