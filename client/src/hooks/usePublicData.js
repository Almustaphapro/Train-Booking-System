import { useEffect, useState } from 'react';
import { getPublicData } from '../api/journeys.js';
export function usePublicData(path) {
  const [data, setData] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    getPublicData(path, controller.signal).then(rows => { if (!controller.signal.aborted) { setData(rows); setLoading(false); } }).catch(() => { if (!controller.signal.aborted) { setError('We could not load this information. Please try again.'); setLoading(false); } });
    return () => controller.abort();
  }, [path, attempt]);
  return { data, loading, error, retry: () => setAttempt(value => value + 1) };
}
