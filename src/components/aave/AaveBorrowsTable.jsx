import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Edit2 } from 'lucide-react';

const fmt = (v, d = 0) => v == null ? '$0' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d });

export default function AaveBorrowsTable({ borrowedAmount, borrowApy, availableToBorrow, maxBorrowCapacity, eMode, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(borrowedAmount);
  const [editApy, setEditApy] = useState(borrowApy);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke('updateAaveBorrow', {
        newAmount: parseFloat(editAmount),
        newApy: parseFloat(editApy)
      });
      setEditing(false);
      onEdit?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-semibold">Your borrows</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Balance {fmt(borrowedAmount)} · APY {borrowApy?.toFixed(2) || '0'}%
          </p>
        </div>
      </div>

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 text-xs font-medium text-muted-foreground">Asset</th>
            <th className="text-right py-2 text-xs font-medium text-muted-foreground">Debt</th>
            <th className="text-right py-2 text-xs font-medium text-muted-foreground">APY</th>
            <th className="text-right py-2 text-xs font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/50 hover:bg-muted/30">
            <td className="py-3 font-medium">USDC</td>
            <td className="text-right py-3">
              {editing ? (
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-32 px-2 py-1 border border-border rounded text-right text-sm"
                />
              ) : (
                <span className="font-mono text-loss">{fmt(borrowedAmount)}</span>
              )}
            </td>
            <td className="text-right py-3">
              {editing ? (
                <input
                  type="number"
                  value={editApy}
                  onChange={(e) => setEditApy(e.target.value)}
                  className="w-20 px-2 py-1 border border-border rounded text-right text-sm"
                />
              ) : (
                <span className="text-loss">{borrowApy?.toFixed(2) || '0'}%</span>
              )}
            </td>
            <td className="text-right py-3">
              {editing ? (
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? '...' : 'Save'}
                  </Button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="p-1 hover:bg-muted rounded">
                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between py-1.5 border-t border-border pt-2">
          <span className="text-muted-foreground">Available to borrow</span>
          <span className="font-mono font-medium text-profit">{fmt(availableToBorrow)}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Max borrow capacity</span>
          <span className="font-mono font-medium">{fmt(maxBorrowCapacity)}</span>
        </div>
        <div className="flex justify-between py-1.5 border-t border-border pt-2">
          <span className="text-muted-foreground">E-Mode</span>
          <span className="font-medium">{eMode === 'Enabled' ? '✓ Enabled' : 'Disabled'}</span>
        </div>
      </div>
    </div>
  );
}