import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { Empty, ErrorNotice, Loading, ResultListRow } from '../components/ui';
import { useI18n } from '../i18n';
import { type Family, qs, type Rating, type ResultRow } from '../lib/api';
import { useScope } from '../lib/scope';
import { useApi } from '../lib/useApi';

const FAMILIES: (Family | '')[] = ['', 'nxt', 'nxtr', 'aimex'];
const RATINGS: Rating[] = ['critical', 'warning', 'good', 'excellent'];
const SORTS = ['-testDate', 'testDate', 'cpkXY', '-cpkXY', '-createdAt'] as const;
const PAGE_SIZE = 25;

export function Results() {
  const { t, int } = useI18n();
  const scope = useScope();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const family = params.get('family') ?? '';
  const rating = params.get('rating') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = params.get('sort') ?? '-testDate';
  const page = Math.max(1, Number(params.get('page') ?? 1));

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Live search: apply the input shortly after typing stops.
  useEffect(() => {
    if (input === q) return;
    const timer = setTimeout(() => set({ q: input.trim() }), 250);
    return () => clearTimeout(timer);
  });
  useEffect(() => setInput(q), [q]);

  const { data, error, loading } = useApi<{ items: ResultRow[]; total: number }>(
    `/results${qs({ companyId: scope.companyId, q, family, rating, from, to, sort, page, pageSize: PAGE_SIZE })}`,
  );
  const examples = useApi<{ items: ResultRow[] }>(
    `/results${qs({ companyId: scope.companyId, pageSize: 3, sort: '-createdAt' })}`,
  );
  const chips = [
    ...new Set((examples.data?.items ?? []).flatMap((r) => [`${r.headType} ${r.headSerial}`, r.machineNo]).slice(0, 4)),
  ];
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = Boolean(q || family || rating || from || to);

  return (
    <Page
      title={t('nav.results')}
      actions={
        <Link to={scope.link('/upload')} className="btn primary">
          <Icon name="upload" size={16} />
          {t('nav.upload')}
        </Link>
      }
    >
      <section className="search-card" role="search">
        <label className="search-box">
          <Icon name="search" size={20} stroke={2.4} />
          <span className="sr-only">{t('results.search')}</span>
          <input
            type="search"
            value={input}
            placeholder={t('results.searchPlaceholder')}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') set({ q: input.trim() });
            }}
          />
          {loading && <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />}
        </label>
        {chips.length > 0 && (
          <div className="chips">
            <span>{t('results.examples')}</span>
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => set({ q: c })}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="filters">
          <div className="tabs" role="tablist" aria-label={t('results.family')}>
            {FAMILIES.map((f) => (
              <button
                key={f || 'all'}
                type="button"
                role="tab"
                aria-selected={family === f}
                onClick={() => set({ family: f })}
              >
                {f ? t(`family.${f}`) : t('common.all')}
              </button>
            ))}
          </div>
          <div className="right">
            <label className="sr-only" htmlFor="f-rating">
              {t('results.rating')}
            </label>
            <select id="f-rating" className="select" value={rating} onChange={(e) => set({ rating: e.target.value })}>
              <option value="">{t('results.allRatings')}</option>
              {RATINGS.map((r) => (
                <option key={r} value={r}>
                  {t(`rating.${r}`)}
                </option>
              ))}
            </select>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {t('results.from')}
              <input
                className="input"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => set({ from: e.target.value })}
              />
            </label>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {t('results.to')}
              <input
                className="input"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => set({ to: e.target.value })}
              />
            </label>
            <label className="sr-only" htmlFor="f-sort">
              {t('results.sort')}
            </label>
            <select id="f-sort" className="select" value={sort} onChange={(e) => set({ sort: e.target.value })}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && <ErrorNotice error={error} />}
      {!data && loading && <Loading />}
      {data && (
        <>
          <div className="pager">
            <span>
              {t('results.count', { n: data.total, total: int(data.total) })}
              {filtered && (
                <>
                  {' · '}
                  <button type="button" className="linkbtn" onClick={() => setParams({}, { replace: true })}>
                    {t('results.reset')}
                  </button>
                </>
              )}
            </span>
          </div>
          {data.items.length === 0 ? (
            <Empty title={filtered ? t('results.noMatch') : t('results.none')}>
              {filtered ? <p>{t('results.noMatchHint')}</p> : <p>{t('dash.emptyText')}</p>}
            </Empty>
          ) : (
            <div className="rows">
              {data.items.map((r) => (
                <ResultListRow key={r.id} row={r} showCompany={scope.companyId === null} />
              ))}
            </div>
          )}
          {pages > 1 && (
            <nav className="pager" aria-label={t('results.pages')}>
              <button
                type="button"
                className="btn"
                disabled={page <= 1}
                onClick={() => set({ page: String(page - 1) })}
              >
                ← {t('common.previous')}
              </button>
              <span>{t('results.page', { page, pages })}</span>
              <button
                type="button"
                className="btn"
                disabled={page >= pages}
                onClick={() => set({ page: String(page + 1) })}
              >
                {t('common.next')} →
              </button>
            </nav>
          )}
        </>
      )}
    </Page>
  );
}
