import { useState } from "react";
import PriceManagement from "../components/settings/PriceManagement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

const TYPE_COLORS = {
  Crypto: "bg-orange-100 text-orange-700 border-orange-200",
  Stock: "bg-blue-100 text-blue-700 border-blue-200",
  Other: "bg-muted text-muted-foreground",
};

export default function AssetsPage() {
  const [tab, setTab] = useState("prices");

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Settings · ניהול מחירים ונכסים</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab("prices")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "prices"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          ניהול מחירים
        </button>
      </div>

      {/* Content */}
      {tab === "prices" && <PriceManagement />}
    </div>
  );
}