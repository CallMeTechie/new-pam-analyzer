import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n';
import type { IngestOutcome, UploadResponse } from '../lib/api';
import { cancelUpload, dismissUpload, useBackgroundUpload } from '../lib/backgroundUpload';
import { useScope } from '../lib/scope';
import { Icon } from './Icon';
import { errorText, Modal, RatingPill } from './ui';

/** Rows the dialog shows at most; larger uploads are summarised. */
const MAX_ROWS = 300;

/** Outcome of an upload: per file new, already stored, not readable or skipped. */
export function UploadResultDialog({ response, onClose }: { response: UploadResponse; onClose(): void }) {
  const { t, int, dateTime } = useI18n();
  const scope = useScope();
  const statusLabel = (r: IngestOutcome) =>
    r.status === 'rejected' ? t(`reject.${r.reason ?? 'unreadable'}` as never) : t(`upload.status.${r.status}`);
  // New and unreadable files first: they are what one wants to look at.
  const order = { created: 0, rejected: 1, duplicate: 2 } as const;
  const rows = [...response.results].sort((a, b) => order[a.status] - order[b.status]);
  const shown = rows.slice(0, MAX_ROWS);
  const skipped = response.skipped.slice(0, Math.max(0, MAX_ROWS - shown.length));
  const hidden = rows.length + response.skipped.length - shown.length - skipped.length;

  return (
    <Modal title={t('upload.done')} onClose={onClose} wide="xl">
      <div className="section-h">
        <div className="summary-pills">
          <span className="pill r-excellent">{t('upload.created', { n: response.summary.created })}</span>
          <span className="pill plain">{t('upload.duplicates', { n: response.summary.duplicate })}</span>
          {response.summary.rejected > 0 && (
            <span className="pill r-critical">{t('upload.rejected', { n: response.summary.rejected })}</span>
          )}
          {response.summary.skipped > 0 && (
            <span className="pill r-warning">{t('upload.skipped', { n: response.summary.skipped })}</span>
          )}
        </div>
      </div>
      <div className="card flat table-wrap" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('upload.file')}</th>
              <th>{t('upload.status')}</th>
              <th>{t('fact.head')}</th>
              <th>{t('fact.tested')}</th>
              <th>Cpk XY</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.fileName}-${i}`}>
                <td className="mono file-cell" title={r.fileName}>
                  {r.fileName}
                </td>
                <td>
                  <span
                    className={`pill small ${r.status === 'created' ? 'r-excellent' : r.status === 'rejected' ? 'r-critical' : 'plain'}`}
                  >
                    {statusLabel(r)}
                  </span>
                </td>
                <td className="nowrap">{r.headType ? `${r.headType} · ${r.headSerial}` : '–'}</td>
                <td className="tested-cell">
                  {r.testDate ? dateTime(r.testDate) : '–'}
                  {r.dateSource && r.dateSource !== 'header' && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t(`dateSource.${r.dateSource}` as never)}
                    </div>
                  )}
                </td>
                <td>
                  {r.status === 'created' ? (
                    <RatingPill rating={r.rating ?? null} value={r.cpkXY ?? null} small />
                  ) : (
                    '–'
                  )}
                </td>
                <td className="actions">
                  {r.resultId && (
                    <Link to={scope.link(`/results/${r.resultId}`)} className="linkbtn" onClick={onClose}>
                      {t('common.open')} →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {skipped.map((s, i) => (
              <tr key={`skip-${s.name}-${i}`}>
                <td className="mono file-cell" title={s.name}>
                  {s.name}
                </td>
                <td>
                  <span className="pill small r-warning">{t(`skip.${s.reason}` as never)}</span>
                </td>
                <td colSpan={4} />
              </tr>
            ))}
            {hidden > 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {t('upload.more', { n: hidden })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
        <Link to={scope.link('/results')} className="btn primary" onClick={onClose}>
          {t('upload.toResults', { n: int(response.summary.created) })} →
        </Link>
      </div>
    </Modal>
  );
}

/**
 * Progress of the background upload, on every page: a toast at the bottom right and a bar along the
 * bottom edge; when finished, a summary with the details.
 */
export function UploadToast() {
  const { t, int, num } = useI18n();
  const upload = useBackgroundUpload();
  const [details, setDetails] = useState(false);
  if (upload.status === 'idle') return null;

  const p = upload.progress;
  const fraction = p ? Math.min(1, p.doneBytes / p.totalBytes) : 0;
  const mb = (bytes: number) => num(bytes / 1024 / 1024, 1);
  const s = upload.response?.summary;
  const outcome = s
    ? [
        t('upload.created', { n: s.created }),
        s.duplicate ? t('upload.duplicates', { n: s.duplicate }) : null,
        s.rejected ? t('upload.rejected', { n: s.rejected }) : null,
        s.skipped ? t('upload.skipped', { n: s.skipped }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const close = () => {
    setDetails(false);
    dismissUpload();
  };
  // A finished or cancelled upload closes by itself after 5 seconds; a failure stays until closed.
  const countdown = upload.status === 'done' || upload.status === 'cancelled';

  return (
    <>
      <div className="toasts" aria-live="polite">
        {upload.status === 'running' && (
          <div className="toast toast-progress has-bar" role="status" data-testid="upload-toast">
            <Icon name="upload" size={18} />
            <span className="toast-text">
              <b>{t('upload.background')}</b>
              <small>
                {p
                  ? t('upload.progress', {
                      done: int(p.doneFiles),
                      total: int(p.totalFiles),
                      mb: mb(p.doneBytes),
                      totalMb: mb(p.totalBytes),
                      pct: Math.floor(fraction * 100),
                    })
                  : upload.archives
                    ? t('upload.readingArchives', { done: upload.archives.done, total: upload.archives.total })
                    : t('upload.preparing')}
              </small>
            </span>
            <button type="button" className="toast-close" title={t('upload.cancel')} onClick={cancelUpload}>
              <Icon name="close" size={16} />
            </button>
            {/* Upload and processing on the server, in green. */}
            <div
              className="toast-bar progress"
              role="progressbar"
              aria-label={t('upload.background')}
              aria-valuenow={Math.round(fraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i className={p ? '' : 'indeterminate'} style={p ? { width: `${fraction * 100}%` } : undefined} />
            </div>
          </div>
        )}
        {upload.status !== 'running' && (
          <div
            className={`toast ${upload.status === 'done' ? 'toast-success' : 'toast-error'}${countdown ? ' has-bar' : ''}`}
            role="status"
            data-testid="upload-toast"
          >
            <Icon name={upload.status === 'done' ? 'checkCircle' : 'warning'} size={18} />
            <span className="toast-text">
              <b>
                {upload.status === 'done'
                  ? t('upload.done')
                  : upload.status === 'cancelled'
                    ? t('upload.cancelled')
                    : upload.error
                      ? errorText(t, upload.error)
                      : t('upload.failed')}
              </b>
              {outcome && <small>{outcome}</small>}
              {upload.response && upload.response.results.length + upload.response.skipped.length > 0 && (
                <button
                  type="button"
                  className="linkbtn"
                  style={{ justifySelf: 'start' }}
                  onClick={() => setDetails(true)}
                >
                  {t('upload.details')} →
                </button>
              )}
            </span>
            <button type="button" className="toast-close" title={t('common.close')} onClick={close}>
              <Icon name="close" size={16} />
            </button>
            {/* Finished: in red, the 5 seconds until the message closes (paused while pointed at). */}
            {countdown && (
              <div
                className={`toast-bar countdown${details ? ' paused' : ''}`}
                aria-hidden="true"
                data-testid="upload-countdown"
              >
                <i onAnimationEnd={close} />
              </div>
            )}
          </div>
        )}
      </div>
      {details && upload.response && <UploadResultDialog response={upload.response} onClose={close} />}
    </>
  );
}
