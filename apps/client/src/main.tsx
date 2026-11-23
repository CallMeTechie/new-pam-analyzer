import { I18nProvider } from '@web/i18n';
import { notifyDataChanged, setApiTransport } from '@web/lib/api';
import { AuthProvider, useAuth } from '@web/lib/auth';
import { setThresholds } from '@web/lib/thresholds';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import '@web/styles.css';
import './app.css';
import '@web/skin-d.css';
import './skin-d.css';
import { App } from './App';
import { Engine } from './lib/engine';
import { localTransport } from './lib/transport';
import { EngineContext, useEngine } from './lib/useEngine';
import { browserPlatform } from './platform/browser';
import type { Platform } from './platform/types';
import { ToastProvider } from './toast';

const inTauri = '__TAURI_INTERNALS__' in window;

async function createPlatform(): Promise<Platform> {
  if (inTauri && /Android/i.test(navigator.userAgent)) {
    const { androidPlatform } = await import('./platform/android');
    return androidPlatform(__APP_VERSION__);
  }
  if (inTauri) {
    const { tauriPlatform } = await import('./platform/tauri');
    return tauriPlatform(__APP_VERSION__);
  }
  return browserPlatform(__APP_VERSION__);
}

/** Waits for the local data, then renders the pages that need a signed-in "user". */
function Gate() {
  const { user, refresh } = useAuth();
  const [s] = useEngine();
  // The local profile shows the connected company and user.
  useEffect(() => {
    void refresh();
  }, [s.connection, refresh]);
  // Keep the rating thresholds of the web pages in step with the evaluation settings.
  useEffect(() => setThresholds(s.config.thresholds), [s.config.thresholds]);
  if (!s.ready || !user) return null;
  return <App />;
}

async function start() {
  const platform = await createPlatform();
  const engine = new Engine(platform);
  if (platform.formFactor === 'mobile') document.documentElement.dataset.mobile = '';
  // The web's print button calls window.print(); Android prints through its own dialog.
  if (platform.print) {
    const print = platform.print;
    window.print = () => void print();
  }
  setApiTransport(localTransport(engine));
  // Result pages reload when results change (customer, date, upload state).
  let rows = engine.snapshot.rows;
  engine.subscribe(() => {
    if (engine.snapshot.rows === rows) return;
    rows = engine.snapshot.rows;
    notifyDataChanged();
  });
  // Links to web pages (e.g. the credit in the footer) open in the default browser; the app's
  // own window only shows the app.
  if (platform.openUrl) {
    const open = platform.openUrl;
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      const href = a?.getAttribute('href') ?? '';
      if (!/^https?:\/\//i.test(href)) return;
      e.preventDefault();
      void open(href);
    });
  }
  await engine.init();
  // Marker for the Android emulator test in CI (shows up in logcat).
  console.info(`PAM Analyzer ready: ${platform.os} ${platform.version}, ${engine.snapshot.rows.length} results`);
  setThresholds(engine.snapshot.config.thresholds);
  if (engine.snapshot.locale) localStorage.setItem('pam-locale', engine.snapshot.locale);
  // biome-ignore lint/suspicious/noExplicitAny: test hook for the browser preview
  if (!inTauri) (window as any).__pamEngine = engine;

  const loadCatalogs = async () => {
    const c = engine.snapshot.connection;
    if (!c) return null;
    const res = await platform.request(`${c.server}/api/i18n`, { method: 'GET' });
    if (res.status !== 200) return null;
    return (JSON.parse(res.text) as { catalogs: { code: string; name: string; messages: Record<string, unknown> }[] })
      .catalogs;
  };

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');
  createRoot(root).render(
    <StrictMode>
      <EngineContext.Provider value={engine}>
        <HashRouter>
          <I18nProvider loadCatalogs={loadCatalogs}>
            <AuthProvider>
              <ToastProvider>
                <Gate />
              </ToastProvider>
            </AuthProvider>
          </I18nProvider>
        </HashRouter>
      </EngineContext.Provider>
    </StrictMode>,
  );
}

void start();
