import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Engine, EngineState } from './engine';

export const EngineContext = createContext<Engine | null>(null);

export function useEngine(): [EngineState, Engine] {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error('useEngine outside EngineContext');
  const state = useSyncExternalStore(engine.subscribe, () => engine.snapshot);
  return [state, engine];
}
