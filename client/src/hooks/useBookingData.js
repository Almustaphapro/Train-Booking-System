import { useEffect, useState } from 'react';
import { apiClient } from '../api/client.js';

export function useBookingData(path, pollMs = 15000) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let timer;
    setLoading(true); setError('');
    async function load() {
      try {
        const response = await apiClient.get(path, { signal: controller.signal });
        if (!controller.signal.aborted) { setData({ path, value: { ...response.data.data, receivedAt: Date.now() } }); setError(''); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.response?.data?.message ?? 'We could not reach the service. Please try again.');
      } finally {
        if (!controller.signal.aborted) { setLoading(false); if (pollMs) timer = setTimeout(load, pollMs); }
      }
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [path, attempt, pollMs]);
  // Retain data while refreshing the same record, but never show one record's
  // ticket or availability under another record's URL while that request loads.
  const currentData = data?.path === path ? data.value : null;
  return { data: currentData, loading, refreshing: loading && Boolean(currentData), error, refresh: () => setAttempt(value => value + 1) };
}
