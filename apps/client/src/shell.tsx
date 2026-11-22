import { Icon } from '@web/components/Icon';
import { Credit, LanguageSwitch } from '@web/components/Layout';
import { Modal, Notice } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AssignDialog } from './assign';
import { ConnectionCard, reasonText } from './components';
import type { ImportProgress } from './lib/engine';
import type { InputFile } from './lib/evaluate';
import { useLayout, usePosture, useTheme } from './lib/layout';
import { useEngine } from './lib/useEngine';
import { useToast } from './toast';

// ---------- importing files ----------

interface ImportState {
  pick(): Promise<void>;
  busy: boolean;
  over: boolean;
  progress: ImportProgress | null;
}
/** Tablets and unfolded foldables: the results list slides in over an open result. */
interface ResultsDrawer {
  open: boolean;
  setOpen(open: boolean): void;
}
const ResultsDrawerContext = createContext<ResultsDrawer>({ open: false, setOpen: () => {} });
export const useResultsDrawer = () => useContext(ResultsDrawerContext);

const ImportContext = createContext<ImportState | null>(null);

export function useImport(): ImportState {
  const v = useContext(ImportContext);
  if (!v) throw new Error('useImport outside Shell');
  return v;
}

function ImportProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [, engine] = useEngine();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [assign, setAssign] = useState<number[] | null>(null);

  const run = useCallback(
    async (files: InputFile[]) => {
      if (!files.length) return;
      setBusy(true);
      try {
        const summary = await engine.importFiles(files, (p) => {
          setProgress(p);
          if (p.total > 1 && p.done < p.total)
            toast.show(
              {
                kind: 'progress',
                title: t('client.import.running', { n: p.total }),
                text: t('client.import.progress', { done: p.done, total: p.total }),
                progress: p.done / p.total,
              },
              'import',
            );
        });
        const created = summary.created.length;
        toast.show(
          {
            kind: created ? 'success' : summary.rejected.length ? 'error' : 'info',
            title: created ? t('client.import.created', { n: created }) : t('client.import.nothing'),
            text: [
              summary.duplicates.length ? t('client.import.duplicates', { n: summary.duplicates.length }) : '',
              summary.rejected.length
                ? `${t('client.import.rejected', { n: summary.rejected.length })}: ${summary.rejected
                    .slice(0, 3)
                    .map((r) => `${r.name} (${reasonText(t, r.reason)})`)
                    .join(', ')}`
                : '',
            ]
              .filter(Boolean)
              .join(' · '),
          },
          'import',
        );
        if (created) setAssign(summary.created);
        // A single file opened from Explorer or shared goes straight to its result.
        const only = files.length === 1 && created + summary.duplicates.length === 1;
        const id = summary.created[0] ?? summary.duplicates[0];
        if (only && id !== undefined) navigate(`/results/${id}`);
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [engine, navigate, t, toast],
  );
  useEffect(() => engine.platform.onFiles((files) => void run(files), setOver), [engine, run]);

  const value: ImportState = {
    pick: async () => run(await engine.platform.pickFiles()),
    busy,
    over,
    progress,
  };
  return (
    <ImportContext.Provider value={value}>
      {children}
      {over && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <Icon name="upload" size={34} />
            <b>{t('client.drop.release')}</b>
          </div>
        </div>
      )}
      {assign && (
        <AssignDialog
          ids={assign}
          title={t('client.assign.title', { n: assign.length })}
          onClose={() => setAssign(null)}
        />
      )}
    </ImportContext.Provider>
  );
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
  const attention = s.rows.filter((r) => r.upload === 'rejected').length + (s.server === 'revoked' ? 1 : 0);
  const { pathname } = useLocation();
  const onResults = pathname.startsWith('/results');
  const drawer = useResultsDrawer();
  // With a result open, "Results" in the rail slides the list in instead of leaving the result.
  const onResult = /^\/results\/\d+/.test(pathname);
  const badge = (n: number) => (n > 0 ? <span className="badge">{int(n)}</span> : null);
  return (
    <>
      <NavLink to="/" end>
        <Icon name="dashboard" />
        <span>{t('client.nav.overview')}</span>
      </NavLink>
      <Link
        to="/results"
        aria-current={onResults ? 'page' : undefined}
        {...(variant === 'rail' && onResult ? { 'aria-expanded': drawer.open, 'aria-controls': 'results-drawer' } : {})}
        onClick={(e) => {
          if (variant !== 'rail' || !onResult) return;
          e.preventDefault();
          drawer.setOpen(!drawer.open);
        }}
      >
        <Icon name="results" />
        <span>{t('client.nav.results')}</span>
        {variant === 'sidebar' && badge(s.rows.length)}
      </Link>
      <NavLink to="/settings">
        <Icon name="settings" />
        <span>{t('client.nav.settings')}</span>
        {badge(attention)}
      </NavLink>
    </>
  );
}

export function Shell() {
  const { t } = useI18n();
  const layout = useLayout();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // A chosen result (or any other page) closes the list again.
  useEffect(() => setDrawerOpen(false), [pathname]);
  const drawer = { open: drawerOpen, setOpen: setDrawerOpen };
  usePosture();
  useTheme();
  if (layout !== 'desktop') {
    return (
      <ImportProvider>
        <UpdateProvider>
          <ResultsDrawerContext.Provider value={drawer}>
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
          </ResultsDrawerContext.Provider>
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
