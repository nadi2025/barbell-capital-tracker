import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';

export default function AaveActivityLog() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const logs = await base44.entities.CryptoActivityLog.filter({ action_type: 'Collateral Adjustment' }, '-date', 10);
        setActivities(logs);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="text-xs text-muted-foreground">טוען...</div>;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Recent activity</h3>
      <div className="space-y-2">
        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground">אין פעילויות</p>
        ) : (
          activities.slice(0, 5).map((a, i) => (
            <div key={i} className="text-xs py-2 border-b border-border/50 last:border-0">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{new Date(a.date).toLocaleDateString('he-IL')}</span>
              </div>
              <p className="text-foreground">{a.description}</p>
            </div>
          ))
        )}
      </div>
      <Link to="/crypto/activity" className="text-xs text-primary hover:underline mt-3 block">
        צפה בהיסטוריה מלאה →
      </Link>
    </div>
  );
}