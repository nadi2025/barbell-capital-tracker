import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export function useAavePosition() {
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('calculateAavePosition', {});
      setPosition(response.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return { position, loading, error, refresh };
}