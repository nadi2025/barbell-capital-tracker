import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFxHedgeData } from "@/hooks/useFxHedgeData";
import { buildRatesMap } from "@/lib/fxMath";
import FxTransactionTable from "@/components/fx/FxTransactionTable";
import FxTransactionForm from "@/components/fx/FxTransactionForm";
import FxCloseDialog from "@/components/fx/FxCloseDialog";

export default function FxTransactionsPage() {
  const { data, isLoading } = useFxHedgeData();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [closeTx, setCloseTx] = useState(null);

  const ratesMap = useMemo(() => buildRatesMap(data.rates), [data.rates]);

  const handleEdit = (tx) => { setEditTx(tx); setShowForm(true); };
  const handleAdd = () => { setEditTx(null); setShowForm(true); };

  const handleDelete = async (tx) => {
    if (!confirm(`למחוק את העסקה "${tx.reference}"?`)) return;
    try {
      await base44.entities.FxHedgeTransaction.delete(tx.id);
      queryClient.invalidateQueries({ queryKey: ["entity", "FxHedgeTransaction"] });
      toast.success("העסקה נמחקה");
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">עסקאות מט"ח</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{data.transactions.length} עסקאות סה"כ</p>
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> עסקה חדשה
        </Button>
      </div>

      <FxTransactionTable
        transactions={data.transactions}
        ratesMap={ratesMap}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClose={setCloseTx}
      />

      <FxTransactionForm
        open={showForm}
        editTransaction={editTx}
        onClose={() => { setShowForm(false); setEditTx(null); }}
      />
      <FxCloseDialog
        open={!!closeTx}
        transaction={closeTx}
        onClose={() => setCloseTx(null)}
      />
    </div>
  );
}