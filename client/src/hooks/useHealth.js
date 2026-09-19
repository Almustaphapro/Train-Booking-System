import { useEffect, useState } from 'react';
import axios from 'axios';
import { getHealth } from '../api/health.js';

export function useHealth() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: null });

    getHealth(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data });
      })
      .catch((error) => {
        if (controller.signal.aborted || axios.isCancel(error)) return;
        setState({ status: 'error', data: null });
      });

    return () => controller.abort();
  }, [attempt]);

  return { ...state, refresh: () => setAttempt((value) => value + 1) };
}
