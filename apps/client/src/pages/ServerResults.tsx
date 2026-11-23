import { Icon } from '@web/components/Icon';
import { Empty, Loading, Notice, ResultListRow } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { type Family, qs, type Rating, type ResultRow } from '@web/lib/api';
import { type ReactNode, useEffect, useState } from 'react';
import { ServerError } from '../lib/engine';
import { serverRow } from '../lib/transport';
import { useEngine } from '../lib/useEngine';

const FAMILIES: (Family | '')[] = ['', 'nxt', 'nxtr', 'aimex'];
const RATINGS: Rating[] = ['critical', 'warning', 'good', 'excellent'];
const PAGE_SIZE = 50;

type Grouping = 'date' | 'customer' | 'list';

/** Consecutive rows of the same test day or customer (the server already orders them so). */
function sections(rows: ResultRow[], grouping: Grouping): { key: string; rows: ResultRow[] }[] {
  if (grouping === 'list') return [{ key: 'all', rows }];
  const out: { key: string; rows: ResultRow[] }[] = [];
  for (const r of rows) {
    const key = grouping === 'date' ? r.testDate.slice(0, 10) : (r.customer ?? '');
    const last = out.at(-1);
    if (last && last.key === key) last.rows.push(r);
    else out.push({ key, rows: [r] });
  }
  return out;
}

/**
 * Results of the whole company on the server (all devices and web uploads), read-only. Opening one
 * shows the server's evaluation; without connection the view says so.
 */
export function ServerResults({
  grouping,
  groupingSwitch,
  selectedId,
}: {
  grouping: Grouping;
  groupingSwitch: ReactNode;
  selectedId: string | null;
}) {
  const { t, int, date } = useI18n();
  const [s, engine] = useEngine();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [family, setFamily] = useState<Family | ''>('');
  const [rating, setRating] = useState<Rating | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: ResultRow[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  // A new search starts on page one.
  useEffect(() => setPage(1), [q, family, rating, grouping]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const path = `/results${qs({
      q,
      family,
      rating,
      group: grouping === 'list' ? null : grouping,
      sort: '-testDate',
      page,
      pageSize: PAGE_SIZE,
    })}`;
    engine
      .remote<{ items: ResultRow[]; total: number }>(path)
      .then((res) => {
        if (cancelled) return;
        setData({ total: res.total, items: res.items.map(serverRow) });
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof ServerError && e.status === 0 ? t('client.results.serverOffline') : t('error.internal_error'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [engine, q, family, rating, grouping, page, t]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const me = s.connection?.userName;
  const row = (r: ResultRow) => (
    <ResultListRow
      key={r.id}
      row={r}
      selected={String(r.id) === selectedId}
      extra={
        <span className="uploader">
          {r.uploadedByName === me && r.deviceName === s.connection?.deviceName
            ? t('client.results.thisDevice')
            : `${r.uploadedByName ?? '–'} · ${r.deviceName ?? t('client.results.webUpload')}`}
        </span>
      }
    />
  );

  return (
    <>
      <section className="search-card" role="search">
        <label className="search-box">
          <Icon name="search" size={20} stroke={2.4} />
          <span className="sr-only">{t('results.search')}</span>
          <input
            type="search"
            value={input}
            placeholder={t('client.results.searchPlaceholder')}
            onChange={(e) => setInput(e.target.value)}
          />
          {loading && <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />}
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
            <label className="sr-only" htmlFor="sf-rating">
              {t('results.rating')}
            </label>
            <select
              id="sf-rating"
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
      {error && <Notice kind="warning" title={error} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="pager">
            <span>
              {t('results.count', { n: data.total, total: int(data.total) })} · {t('client.results.serverHint')}
            </span>
            {groupingSwitch}
          </div>
          {data.items.length === 0 ? (
            <Empty title={t('results.none')} />
          ) : grouping === 'list' ? (
            <div className="rows">{data.items.map(row)}</div>
          ) : (
            <div className="groups" data-testid={`server-groups-${grouping}`}>
              {sections(data.items, grouping).map((g, i) => (
                <section key={`${i}:${g.key}`} className="group">
                  <h3 className="group-h">
                    <span>{grouping === 'date' ? date(g.key) : g.key || t('client.results.noCustomer')}</span>
                    <span className="muted">{t('results.groupCount', { n: g.rows.length })}</span>
                  </h3>
                  <div className="rows">{g.rows.map(row)}</div>
                </section>
              ))}
            </div>
          )}
          {pages > 1 && (
            <nav className="pager" aria-label={t('results.pages')}>
              <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ← {t('common.previous')}
              </button>
              <span>{t('results.page', { page, pages })}</span>
              <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                {t('common.next')} →
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
