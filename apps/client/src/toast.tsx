import { Icon, type IconName } from '@web/components/Icon';
import { useI18n } from '@web/i18n';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface Toast {
  id: number;
  kind: 'success' | 'info' | 'error' | 'progress';
  title: string;
  text?: string;
  /** 0–1 while something runs; the toast then stays until it is replaced or closed. */
  progress?: number | null;
}

interface ToastApi {
  /** Shows a toast; the same `key` replaces an earlier one (e.g. a running import). */
  show(toast: Omit<Toast, 'id'>, key?: string): void;
  hide(key: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);
/** Seconds a finished message stays visible. */
const LIFETIME = 5000;

export function useToast(): ToastApi {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v;
}

const ICON: Record<Toast['kind'], IconName> = {
  success: 'checkCircle',
  info: 'info',
  error: 'warning',
  progress: 'upload',
};

/** Small messages at the bottom right that disappear by themselves. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<(Toast & { key: string })[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const next = useRef(1);

  const hide = useCallback((key: string) => {
    setToasts((list) => list.filter((x) => x.key !== key));
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.delete(key);
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, 'id'>, key = `t${next.current}`) => {
      const id = next.current++;
      setToasts((list) => [...list.filter((x) => x.key !== key), { ...toast, id, key }].slice(-4));
      const old = timers.current.get(key);
      if (old) clearTimeout(old);
      timers.current.delete(key);
      if (toast.kind !== 'progress')
        timers.current.set(
          key,
          setTimeout(() => hide(key), LIFETIME),
        );
    },
    [hide],
  );
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast toast-${x.kind}`} role={x.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={ICON[x.kind]} size={18} />
            <span className="toast-text">
              <b>{x.title}</b>
              {x.text && <small>{x.text}</small>}
            </span>
            <button type="button" className="toast-close" aria-label={t('common.close')} onClick={() => hide(x.key)}>
              <Icon name="close" size={14} />
            </button>
            {x.kind === 'progress' ? (
              <span className="toast-bar">
                <i style={{ width: `${Math.round((x.progress ?? 0) * 100)}%` }} />
              </span>
            ) : (
              <span className="toast-bar timer">
                <i />
              </span>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
