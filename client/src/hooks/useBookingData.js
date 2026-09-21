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
        if (!controller.signal.aborted) { setData({ ...response.data.data, receivedAt: Date.now() }); setError(''); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.response?.data?.message ?? 'We could not reach the service. Please try again.');
      } finally {
        if (!controller.signal.aborted) { setLoading(false); if (pollMs) timer = setTimeout(load, pollMs); }
      }
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [path, attempt, pollMs]);
  return { data, loading, refreshing: loading && Boolean(data), error, refresh: () => setAttempt(value => value + 1) };
}
