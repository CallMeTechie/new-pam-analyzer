import { Icon } from '@web/components/Icon';
import { Page } from '@web/components/Layout';
import { useI18n } from '@web/i18n';
import type { ResultDetail as Detail } from '@web/lib/api';
import { ScopeProvider } from '@web/lib/scope';
import { HeadHistory } from '@web/pages/HeadHistory';
import { ResultDetail, ResultDetailContext } from '@web/pages/ResultDetail';
import { useState } from 'react';
import { Link, Outlet, Route, Routes, useMatch } from 'react-router';
import { UploadChip } from './components';
import { useLayout } from './lib/layout';
import { useEngine } from './lib/useEngine';
import { Results } from './pages/Results';
import { Server } from './pages/Server';
import { Settings } from './pages/Settings';
import { Shell } from './shell';

/** Upload state and "Show in Explorer" instead of the web's download button. */
function DetailActions({ detail }: { detail: Detail }) {
  const { t } = useI18n();
  const [s, engine] = useEngine();
  const [missing, setMissing] = useState(false);
  const row = s.rows.find((r) => r.id === detail.result.id);
  if (!row) return null;
  return (
    <>
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

/**
 * Results: the list, a result or the head history. Tablets and unfolded foldables show the list
 * next to the result.
 */
function ResultsArea() {
  const { t } = useI18n();
  const layout = useLayout();
  const detail = useMatch('/results/:id/*');
  if (layout !== 'rail') return detail ? <Outlet /> : <Results />;
  return (
    <div className="split">
      <div className="split-list">
        <Results compact selectedId={detail ? Number(detail.params.id) : null} />
      </div>
      <div className="split-detail">
        {detail ? (
          <Outlet />
        ) : (
          <div className="split-empty">
            <Icon name="results" size={34} />
            <span>{t('client.split.empty')}</span>
          </div>
        )}
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
            <Route element={<ResultsArea />}>
              <Route index element={null} />
              <Route path="results/:id" element={<ResultDetail />} />
              <Route path="results/:id/history" element={<HeadHistory />} />
            </Route>
            <Route path="server" element={<Server />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ResultDetailContext.Provider>
    </ScopeProvider>
  );
}
