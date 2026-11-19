import { CPK_THRESHOLDS, type CpkThresholds } from '@pam/core';
import { useEffect, useState } from 'react';
import { api } from './api';

let cached: CpkThresholds | null = null;
const listeners = new Set<(t: CpkThresholds) => void>();

/** Rating thresholds set by the administrator (core defaults until loaded). */
export function useThresholds(): CpkThresholds {
  const [value, setValue] = useState<CpkThresholds>(cached ?? CPK_THRESHOLDS);
  useEffect(() => {
    listeners.add(setValue);
    if (!cached) {
      api
        .get<CpkThresholds>('/settings/rating')
        .then((t) => setThresholds({ warning: t.warning, good: t.good, excellent: t.excellent }))
        .catch(() => {});
    }
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

export function setThresholds(t: CpkThresholds): void {
  cached = t;
  for (const l of listeners) l(t);
}
