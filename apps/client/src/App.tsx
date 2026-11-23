import { Icon } from '@web/components/Icon';
import { Page, PageChromeContext } from '@web/components/Layout';
import { useI18n } from '@web/i18n';
import type { ResultDetail as Detail } from '@web/lib/api';
import { ScopeProvider } from '@web/lib/scope';
import { HeadHistory } from '@web/pages/HeadHistory';
import { ResultDetail, ResultDetailContext } from '@web/pages/ResultDetail';
import { useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router';
import { AssignDialog } from './assign';
import { UploadChip } from './components';
import { useLayout, useMinWidth } from './lib/layout';
import { useEngine } from './lib/useEngine';
import { Overview } from './pages/Overview';
import { Results } from './pages/Results';
import { Settings } from './pages/Settings';
import { Shell, useResultsDrawer } from './shell';

/** Upload state and "Show in Explorer" instead of the web's download button. */
function DetailActions({ detail }: { detail: Detail }) {
  const { t } = useI18n();
  const [s, engine] = useEngine();
  const [missing, setMissing] = useState(false);
  const [edit, setEdit] = useState(false);
  const row = s.rows.find((r) => r.id === detail.result.id);
  if (!row) return null;
  return (
    <>
      <button type="button" className="btn" onClick={() => setEdit(true)} title={t('client.assign.edit')}>
        <Icon name="edit" size={16} />
        <span className="label-sm-hide">{t('client.assign.edit')}</span>
      </button>
      {edit && (
        <AssignDialog
          ids={[row.id]}
          title={t('client.assign.title')}
          initialCustomer={row.customer ?? ''}
          edit
          onClose={() => setEdit(false)}
        />
      )}
      {(s.connection || row.upload !== 'local') && <UploadChip state={row.upload} reason={row.uploadError} />}
      {row.filePath && engine.platform.kind === 'tauri' && (
        <button
          type="button"
          className="btn"
          title={missing ? t('client.detail.fileMissing') : undefined}
          disabled={missing}
          onClick={() => {
            if (row.filePath) void engine.platform.reveal(row.filePath).then((ok) => setMissing(!ok));
          }}
        >
          <Icon name="folder" size={16} />
          <span className="label-sm-hide">{t('client.detail.reveal')}</span>
        </button>
      )}
    </>
  );
}

function useDetailOptions() {
  const { t, instant } = useI18n();
  const [, engine] = useEngine();
  const mobile = engine.platform.formFactor === 'mobile';
  return {
    tabbed: mobile,
    zoomHolders: mobile,
    renderActions: (detail: Detail) => <DetailActions detail={detail} />,
    addedText: (detail: Detail) => t('client.detail.added', { date: instant(detail.result.createdAt) }),
  };
}

/** From this window width (a maximized window on a laptop or larger) results open beside the list. */
export const PANEL = 1400;

/**
 * Results: the list, a result or the head history. Tablets and unfolded foldables show the list
 * next to the result; on Windows a wide window slides the result in from the right (at most half
 * the width), a narrow one opens it as its own page.
 */
function ResultsArea() {
  const { t } = useI18n();
  const layout = useLayout();
  const wide = useMinWidth(PANEL);
  const navigate = useNavigate();
  const { search } = useLocation();
  const detail = useMatch('/results/:id/*');
  const drawer = useResultsDrawer();
  const full = new URLSearchParams(search).has('full');
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/results'));

  if (layout === 'desktop') {
    if (!detail) return <Results />;
    if (!wide || full) {
      return (
        <PageChromeContext.Provider value={{ back }}>
          <Outlet />
        </PageChromeContext.Provider>
      );
    }
    return (
      <div className="split panel">
        <div className="split-list">
          <Results compact selectedId={detail.params.id ?? null} />
        </div>
        <div className="split-detail" key={detail.params.id}>
          <PageChromeContext.Provider
            value={{
              close: () => navigate('/results'),
              expand: () => navigate(`${detail.pathname}?full`),
            }}
          >
            <Outlet />
          </PageChromeContext.Provider>
        </div>
      </div>
    );
  }
  if (layout !== 'rail') {
    return detail ? (
      <PageChromeContext.Provider value={{ back }}>
        <Outlet />
      </PageChromeContext.Provider>
    ) : (
      <Results />
    );
  }
  // Tablets and unfolded foldables: the list alone, or the result over the full width with the
  // list sliding in from the left ("Results" in the navigation rail).
  if (!detail) return <Results />;
  return (
    <div className="split drawer">
      <button
        type="button"
        className={`drawer-scrim${drawer.open ? ' open' : ''}`}
        aria-label={t('common.close')}
        tabIndex={drawer.open ? 0 : -1}
        onClick={() => drawer.setOpen(false)}
      />
      <div className={`split-list${drawer.open ? ' open' : ''}`} id="results-drawer" aria-hidden={!drawer.open}>
        <Results compact selectedId={detail.params.id ?? null} />
      </div>
      <div className="split-detail">
        <Outlet />
      </div>
    </div>
  );
}

function NotFound() {
  const { t } = useI18n();
  return (
    <Page title={t('notFound.title')}>
      <div className="card empty">
        <b>{t('notFound.text')}</b>
        <Link to="/" className="btn">
          {t('notFound.home')}
        </Link>
      </div>
    </Page>
  );
}

export function App() {
  const detailOptions = useDetailOptions();
  return (
    <ScopeProvider>
      <ResultDetailContext.Provider value={detailOptions}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Overview />} />
            <Route path="results" element={<ResultsArea />}>
              <Route index element={null} />
              <Route path=":id" element={<ResultDetail />} />
              <Route path=":id/history" element={<HeadHistory />} />
            </Route>
            <Route path="server" element={<Navigate to="/settings?tab=server" replace />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ResultDetailContext.Provider>
    </ScopeProvider>
  );
}
