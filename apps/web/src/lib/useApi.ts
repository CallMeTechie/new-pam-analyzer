import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload(): void;
}

/** Loads `path` (GET) whenever it changes; `null` loads nothing. Keeps the previous data while reloading. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    const id = ++current.current;
    setLoading(true);
    api
      .get<T>(path)
      .then((value) => {
        if (id !== current.current) return;
        setData(value);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== current.current) return;
        setError(e instanceof ApiError ? e : new ApiError(0, 'internal_error', String(e)));
      })
      .finally(() => {
        if (id === current.current) setLoading(false);
      });
  }, [path, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}
