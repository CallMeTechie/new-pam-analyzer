import { Icon } from '@web/components/Icon';
import { Page } from '@web/components/Layout';
import { Empty, ResultListRow } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import type { Family, Rating } from '@web/lib/api';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ImportBanner, UploadChip } from '../components';
import { toRow } from '../lib/evaluate';
import { useEngine } from '../lib/useEngine';
import { useImport } from '../shell';

const FAMILIES: (Family | '')[] = ['', 'nxt', 'nxtr', 'aimex'];
const RATINGS: Rating[] = ['critical', 'warning', 'good', 'excellent'];
const PAGE = 100;

/** Local history: every file evaluated on this PC, newest test first. */
export function Results() {
  const { t, int } = useI18n();
  const [state] = useEngine();
  const navigate = useNavigate();
  const { pick, busy, last, clearLast, over } = useImport();
  const [q, setQ] = useState('');
  const [family, setFamily] = useState<Family | ''>('');
  const [rating, setRating] = useState<Rating | ''>('');
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return state.rows
      .filter((r) => !family || r.machineFamily === family)
      .filter((r) => !rating || r.rating === rating)
      .filter((r) => {
        if (!words.length) return true;
        const text = `${r.headType} ${r.headSerial} ${r.machineNo} ${r.fileName} ${r.toolType ?? ''}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => b.testDate.localeCompare(a.testDate) || b.id - a.id);
  }, [state.rows, q, family, rating]);
  const any = q || family || rating;

  return (
    <Page
      title={t('client.nav.results')}
      actions={
        <button type="button" className="btn primary" onClick={() => void pick()} disabled={busy}>
          <Icon name="folder" size={16} />
          {t('client.open')}
        </button>
      }
    >
      <section className={`dropzone compact${over ? ' over' : ''}`} data-testid="dropzone">
        <span className="icon-circle">
          <Icon name="upload" size={22} />
        </span>
        <span className="dz-text">
          <b>{busy ? t('client.drop.busy') : over ? t('client.drop.release') : t('client.drop.title')}</b>
          <span className="muted">{t('client.drop.hint')}</span>
        </span>
      </section>
      {last && (
        <ImportBanner
          summary={last}
          onClose={clearLast}
          {...(last.created.length === 1 ? { onOpen: () => navigate(`/results/${last.created[0]}`) } : {})}
        />
      )}

      {state.rows.length > 0 && (
        <section className="search-card" role="search">
          <label className="search-box">
            <Icon name="search" size={20} stroke={2.4} />
            <span className="sr-only">{t('results.search')}</span>
            <input
              type="search"
              value={q}
              placeholder={t('results.searchPlaceholder')}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="filters">
            <div className="tabs" role="tablist" aria-label={t('results.family')}>
              {FAMILIES.map((f) => (
                <button
                  key={f || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={family === f}
                  onClick={() => setFamily(f)}
                >
                  {f ? t(`family.${f}`) : t('common.all')}
                </button>
              ))}
            </div>
            <div className="right">
              <label className="sr-only" htmlFor="f-rating">
                {t('results.rating')}
              </label>
              <select
                id="f-rating"
                className="select"
                value={rating}
                onChange={(e) => setRating(e.target.value as Rating | '')}
              >
                <option value="">{t('results.allRatings')}</option>
                {RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {t(`rating.${r}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

      {state.rows.length === 0 ? (
        <Empty title={t('client.empty.title')}>
          <p>{t('client.empty.text')}</p>
        </Empty>
      ) : (
        <>
          <div className="pager">
            <span>
              {t('results.count', { n: filtered.length, total: int(filtered.length) })}
              {any && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => {
                      setQ('');
                      setFamily('');
                      setRating('');
                    }}
                  >
                    {t('results.reset')}
                  </button>
                </>
              )}
            </span>
          </div>
          {filtered.length === 0 ? (
            <Empty title={t('results.noMatch')}>
              <p>{t('results.noMatchHint')}</p>
            </Empty>
          ) : (
            <div className="rows">
              {filtered.slice(0, limit).map((r) => (
                <ResultListRow
                  key={r.id}
                  row={toRow(r)}
                  extra={
                    state.connection || r.upload !== 'local' ? (
                      <UploadChip state={r.upload} reason={r.uploadError} />
                    ) : null
                  }
                />
              ))}
            </div>
          )}
          {filtered.length > limit && (
            <button
              type="button"
              className="btn"
              style={{ alignSelf: 'center' }}
              onClick={() => setLimit((l) => l + PAGE)}
            >
              {t('client.more', { n: filtered.length - limit })}
            </button>
          )}
        </>
      )}
    </Page>
  );
}
