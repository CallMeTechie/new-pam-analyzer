import { useEffect, useState } from 'react';
import type { Posture } from '../platform/types';
import { useEngine } from './useEngine';

/** Width from which tablets and unfolded foldables show list and result side by side. */
export const EXPANDED = 840;

export type Layout = 'desktop' | 'bottom' | 'rail';

/**
 * Windows keeps the sidebar. Touch devices get a bottom navigation on narrow screens (phones,
 * folded foldables) and a navigation rail with list and result side by side from 840 px (tablets,
 * unfolded foldables, phones in landscape).
 */
export function useLayout(): Layout {
  const [, engine] = useEngine();
  const mobile = engine.platform.formFactor === 'mobile';
  const [wide, setWide] = useState(() => window.innerWidth >= EXPANDED);
  useEffect(() => {
    if (!mobile) return;
    const query = window.matchMedia(`(min-width: ${EXPANDED}px)`);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [mobile]);
  if (!mobile) return 'desktop';
  return wide ? 'rail' : 'bottom';
}

/** True while the window is at least `px` wide. */
export function useMinWidth(px: number): boolean {
  const [ok, setOk] = useState(() => window.innerWidth >= px);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${px}px)`);
    const update = () => setOk(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [px]);
  return ok;
}

/**
 * Tabletop mode of foldables (half open, hinge horizontal): the upper half shows the charts,
 * the lower half the controls. Sets the class `tabletop` and the hinge position on <html>.
 */
export function usePosture(): Posture {
  const [, engine] = useEngine();
  const [posture, setPosture] = useState<Posture>({ tabletop: false });
  useEffect(() => engine.platform.onPosture?.(setPosture), [engine]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('tabletop', posture.tabletop);
    if (posture.tabletop && posture.hingeTop !== undefined) {
      root.style.setProperty('--hinge-top', `${posture.hingeTop}px`);
      root.style.setProperty('--hinge-bottom', `${posture.hingeBottom ?? posture.hingeTop}px`);
    } else {
      root.style.removeProperty('--hinge-top');
      root.style.removeProperty('--hinge-bottom');
    }
  }, [posture]);
  return posture;
}

/** Applies the chosen appearance (light, dark or like the system) to the page and the window. */
export function useTheme(): void {
  const [s, engine] = useEngine();
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && query.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    query.addEventListener('change', apply);
    void engine.platform.setWindowTheme?.(s.theme === 'system' ? null : s.theme);
    return () => query.removeEventListener('change', apply);
  }, [s.theme, engine]);
}
