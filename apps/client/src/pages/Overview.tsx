import { Icon } from '@web/components/Icon';
import { Page } from '@web/components/Layout';
import { Empty, ResultListRow } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { UploadChip } from '../components';
import { toRow } from '../lib/evaluate';
import { useEngine } from '../lib/useEngine';
import { useImport } from '../shell';

/** ISO 8601 calendar week and its Monday (local time). */
export function isoWeek(d: Date): { week: number; monday: Date; sunday: Date } {
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const week = 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return { week, monday, sunday };
}

/** Click or drag files onto it; shows the progress of a running import. */
export function DropZone() {
  const { t, int } = useI18n();
  const [, engine] = useEngine();
  const { pick, busy, over, progress } = useImport();
  const touch = engine.platform.formFactor === 'mobile';
  return (
    <button
      type="button"
      className={`dropzone compact clickable${over ? ' over' : ''}`}
      data-testid="dropzone"
      onClick={() => void pick()}
      disabled={busy}
    >
      <span className="icon-circle">
        <Icon name="upload" size={22} />
      </span>
      <span className="dz-text">
        <b>{over ? t('client.drop.release') : touch ? t('client.drop.titleTouch') : t('client.drop.title')}</b>
        <span className="muted">{touch ? t('client.drop.hintTouch') : t('client.drop.hint')}</span>
      </span>
      {busy && (
        <span
          className="dz-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress?.total ?? 1}
          aria-valuenow={progress?.done ?? 0}
        >
          <span className="dz-progress-h">
            <b>{t('client.drop.busy')}</b>
            {progress && progress.total > 0 && (
              <span className="muted">
                {t('client.import.progress', { done: int(progress.done), total: int(progress.total) })}
              </span>
            )}
          </span>
          <span className="progress">
            <span style={{ width: `${progress?.total ? Math.round((progress.done / progress.total) * 100) : 5}%` }} />
          </span>
          {progress?.name && <span className="muted mono dz-file">{progress.name}</span>}
        </span>
      )}
    </button>
  );
}

/** Start page: add files, and what was evaluated this calendar week. */
export function Overview() {
  const { t, date } = useI18n();
  const [s] = useEngine();
  const { week, monday, sunday } = isoWeek(new Date());
  const rows = useMemo(
    () =>
      s.rows
        .filter((r) => r.importedAt >= monday.getTime() && r.importedAt <= sunday.getTime())
        .sort((a, b) => b.importedAt - a.importedAt || b.id - a.id),
    [s.rows, monday, sunday],
  );
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (
    <Page title={t('client.nav.overview')}>
      <DropZone />
      <div className="section-h">
        <div>
          <h2>{t('client.overview.week')}</h2>
          <p>
            {t('client.overview.weekText', { week, from: date(iso(monday)), to: date(iso(sunday)), n: rows.length })}
          </p>
        </div>
        <Link to="/results" className="btn ghost">
          {t('client.overview.all')} <Icon name="arrowRight" size={16} />
        </Link>
      </div>
      {rows.length === 0 ? (
        <Empty title={t('client.overview.empty')}>
          <p>{t('client.empty.text')}</p>
        </Empty>
      ) : (
        <div className="rows">
          {rows.map((r) => (
            <ResultListRow
              key={r.id}
              row={toRow(r)}
              to={`/results/${r.id}?full`}
              extra={
                s.connection || r.upload !== 'local' ? <UploadChip state={r.upload} reason={r.uploadError} /> : null
              }
            />
          ))}
        </div>
      )}
    </Page>
  );
}
