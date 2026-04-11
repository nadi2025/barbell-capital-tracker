import { differenceInDays, differenceInHours, format } from "date-fns";
import { CheckCircle2, AlertTriangle, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

function getStatus(date) {
  if (!date) return "red";
  const days = differenceInDays(new Date(), new Date(date));
  if (days < 1) return "green";
  if (days <= 3) return "yellow";
  return "red";
}

function formatAge(date) {
  if (!date) return "לא עודכן";
  const hours = differenceInHours(new Date(), new Date(date));
  if (hours < 1) return "לפני פחות משעה";
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = differenceInDays(new Date(), new Date(date));
  return `לפני ${days} ימים`;
}

const ITEMS = [
  { key: "crypto_prices", label: "מחירי קריפטו", path: "/crypto/wallets" },
  { key: "hyperliquid", label: "פוזיציות HyperLiquid", path: "/crypto/leveraged" },
  { key: "aave", label: "נתוני Aave", path: "/crypto/aave" },
  { key: "options", label: "אופציות Rysk", path: "/crypto/options" },
  { key: "ib_nav", label: "IB NAV", path: "/" },
  { key: "interest_payments", label: "תשלומי ריבית", path: "/offchain-investors" },
];

export default function FreshnessCheck({ dates, onSkip }) {
  const stale = ITEMS.filter(item => getStatus(dates[item.key]) !== "green");

  return (
    <div className="bg-card border border-border rounded-xl p-6 max-w-xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold text-right">בדיקת עדכניות נתונים</h2>
        <p className="text-sm text-muted-foreground text-right mt-1">לפני הפקת דוח, ודא שכל הנתונים עדכניים</p>
      </div>

      <div className="space-y-2">
        {ITEMS.map(item => {
          const status = getStatus(dates[item.key]);
          const Icon = status === "green" ? CheckCircle2 : status === "yellow" ? AlertTriangle : XCircle;
          const color = status === "green" ? "text-emerald-500" : status === "yellow" ? "text-amber-500" : "text-red-500";
          const bg = status === "green" ? "bg-emerald-50" : status === "yellow" ? "bg-amber-50" : "bg-red-50";
          const dateStr = dates[item.key] ? format(new Date(dates[item.key]), "d.M.yy") : "—";

          return (
            <div key={item.key} className={`flex items-center justify-between rounded-lg px-3 py-2 ${bg}`} dir="rtl">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>עודכן: {dateStr}</span>
                <span>({formatAge(dates[item.key])})</span>
                {status !== "green" && (
                  <Link to={item.path}>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                      עדכן <ExternalLink className="w-3 h-3" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {stale.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700 text-right" dir="rtl">
          ⚠️ {stale.length} פריטים דורשים עדכון לדיוק מקסימלי
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onSkip}>
          המשך בכל זאת
        </Button>
        {stale.length === 0 && (
          <Button className="flex-1" onClick={onSkip}>
            המשך לדוח ✓
          </Button>
        )}
      </div>
    </div>
  );
}