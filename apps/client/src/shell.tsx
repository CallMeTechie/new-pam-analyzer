import { Icon, Logo } from '@web/components/Icon';
import { Credit, LanguageSwitch } from '@web/components/Layout';
import { Modal, Notice } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ConnectionCard } from './components';
import type { ImportSummary } from './lib/engine';
import type { InputFile } from './lib/evaluate';
import { useLayout, usePosture } from './lib/layout';
import { useEngine } from './lib/useEngine';

// ---------- importing files ----------

interface ImportState {
  pick(): Promise<void>;
  busy: boolean;
  over: boolean;
  last: ImportSummary | null;
  clearLast(): void;
}
const ImportContext = createContext<ImportState | null>(null);

export function useImport(): ImportState {
  const v = useContext(ImportContext);
  if (!v) throw new Error('useImport outside Shell');
  return v;
}

function ImportProvider({ children }: { children: ReactNode }) {
  const [, engine] = useEngine();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [last, setLast] = useState<ImportSummary | null>(null);

  const run = useCallback(
    async (files: InputFile[]) => {
      if (!files.length) return;
      setBusy(true);
      try {
        const summary = await engine.importFiles(files);
        setLast(summary);
        // A single file opened from Explorer goes straight to its result.
        const only = files.length === 1 && summary.created.length + summary.duplicates.length === 1;
        const id = summary.created[0] ?? summary.duplicates[0];
        if (only && id !== undefined) navigate(`/results/${id}`);
        else navigate('/');
      } finally {
        setBusy(false);
      }
    },
    [engine, navigate],
  );
  useEffect(() => engine.platform.onFiles((files) => void run(files), setOver), [engine, run]);

  const value: ImportState = {
    pick: async () => run(await engine.platform.pickFiles()),
    busy,
    over,
    last,
    clearLast: () => setLast(null),
  };
  return (
    <ImportContext.Provider value={value}>
      {children}
      {over && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <Icon name="upload" size={34} />
            <b>
              <DropText />
            </b>
          </div>
        </div>
      )}
    </ImportContext.Provider>
  );
}
function DropText() {
  const { t } = useI18n();
  return <>{t('client.drop.release')}</>;
}

// ---------- updates ----------

interface UpdateState {
  checking: boolean;
  error: boolean;
  check(manual: boolean): Promise<void>;
}
const UpdateContext = createContext<UpdateState | null>(null);

export function useUpdates(): UpdateState {
  const v = useContext(UpdateContext);
  if (!v) throw new Error('useUpdates outside Shell');
  return v;
}

function UpdateProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [s, engine] = useEngine();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [installing, setInstalling] = useState<number | null | false>(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const started = useRef(false);

  const check = useCallback(
    async (manual: boolean) => {
      setChecking(true);
      setError(false);
      try {
        const update = await engine.checkUpdate();
        if (update) setDialog(true);
      } catch {
        if (manual) setError(true);
      } finally {
        setChecking(false);
      }
    },
    [engine],
  );
  // Look for a new version once at start.
  useEffect(() => {
    if (started.current || !engine.platform.updates) return;
    started.current = true;
    void check(false);
  }, [check, engine]);

  async function install() {
    const updates = engine.platform.updates;
    if (!updates) return;
    setInstalling(null);
    try {
      await updates.install((f) => setInstalling(f));
      setInstalling(false);
    } catch (e) {
      setInstalling(false);
      if (e instanceof Error && e.message === 'install_permission') setNeedsPermission(true);
      else {
        setError(true);
        setDialog(false);
      }
    }
  }

  return (
    <UpdateContext.Provider value={{ checking, error, check }}>
      {children}
      {dialog && s.update && (
        <Modal
          title={t('client.update.title', { v: s.update.version })}
          onClose={() => installing === false && setDialog(false)}
        >
          <p>
            {t('client.update.text', { current: engine.platform.version, v: s.update.version })}
            {s.update.version.includes('-') && <span className="beta-badge">BETA</span>}
          </p>
          {s.update.notes && <pre className="update-notes">{s.update.notes}</pre>}
          {needsPermission && <Notice kind="info">{t('client.update.permission')}</Notice>}
          {installing !== false && (
            <div className="progress" role="progressbar" aria-label={t('client.update.installing')}>
              <span style={{ width: installing === null ? '30%' : `${Math.round(installing * 100)}%` }} />
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" disabled={installing !== false} onClick={() => setDialog(false)}>
              {t('client.update.later')}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={installing !== false}
              onClick={() => void install()}
            >
              <Icon name="download" size={16} />
              {installing !== false ? t('client.update.installing') : t('client.update.install')}
            </button>
          </div>
        </Modal>
      )}
    </UpdateContext.Provider>
  );
}

// ---------- layout ----------

function NavItems({ variant }: { variant: 'sidebar' | 'bottom' | 'rail' }) {
  const { t, int } = useI18n();
  const [s] = useEngine();
  const queued = s.rows.filter((r) => r.upload === 'queued' || r.upload === 'rejected').length;
  const { pathname } = useLocation();
  const onResults = pathname === '/' || pathname.startsWith('/results');
  const badge = (n: number) => (n > 0 ? <span className="badge">{int(n)}</span> : null);
  return (
    <>
      <Link to="/" aria-current={onResults ? 'page' : undefined}>
        <Icon name="results" />
        <span>{t('client.nav.results')}</span>
        {variant === 'sidebar' && badge(s.rows.length)}
      </Link>
      <NavLink to="/server">
        <Icon name="upload" />
        <span>{t('client.nav.server')}</span>
        {badge(queued)}
      </NavLink>
      <NavLink to="/settings">
        <Icon name="settings" />
        <span>{t('client.nav.settings')}</span>
      </NavLink>
    </>
  );
}

export function Shell() {
  const { t } = useI18n();
  const layout = useLayout();
  usePosture();
  if (layout !== 'desktop') {
    return (
      <ImportProvider>
        <UpdateProvider>
          <div className={`app client mobile ${layout}`}>
            {layout === 'rail' && (
              <nav className="rail-nav" aria-label={t('nav.label')}>
                <NavItems variant="rail" />
              </nav>
            )}
            <div className="main">
              <Outlet />
            </div>
            {layout === 'bottom' && (
              <nav className="bottom-nav" aria-label={t('nav.label')}>
                <NavItems variant="bottom" />
              </nav>
            )}
          </div>
        </UpdateProvider>
      </ImportProvider>
    );
  }
  return (
    <ImportProvider>
      <UpdateProvider>
        <div className="app client">
          <div className="sidebar-col">
            <aside className="sidebar" id="sidebar">
              <NavLink to="/" className="brand">
                <Logo />
                <span>
                  <b>PAM Analyzer</b>
                  <small>FUJI NXT · NXT-R · AIMEX</small>
                </span>
              </NavLink>
              <nav className="nav" aria-label={t('nav.label')}>
                <div className="nav-section">
                  <NavItems variant="sidebar" />
                </div>
              </nav>
              <ConnectionCard />
            </aside>
          </div>
          <div className="main">
            <Outlet />
            <footer className="footer">
              <LanguageSwitch />
              <Credit />
              <span className="version">v{__APP_VERSION__}</span>
            </footer>
          </div>
        </div>
      </UpdateProvider>
    </ImportProvider>
  );
}
