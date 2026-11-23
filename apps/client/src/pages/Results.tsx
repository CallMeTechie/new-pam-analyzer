import { Icon } from '@web/components/Icon';
import { Page } from '@web/components/Layout';
import { Empty, ResultListRow } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import type { Family, Rating } from '@web/lib/api';
import { type ReactNode, useMemo, useState } from 'react';
import { UploadChip } from '../components';
import { toRow } from '../lib/evaluate';
import type { LocalResult } from '../lib/types';
import { useEngine } from '../lib/useEngine';
import { ServerResults } from './ServerResults';

const FAMILIES: (Family | '')[] = ['', 'nxt', 'nxtr', 'aimex'];
const RATINGS: Rating[] = ['critical', 'warning', 'good', 'excellent'];
const GROUPINGS = ['date', 'customer', 'list'] as const;
export type Grouping = (typeof GROUPINGS)[number];
const PAGE = 100;
const GROUPING_KEY = 'pam-grouping';
const SOURCE_KEY = 'pam-results-source';
type Source = 'device' | 'server';

function storedSource(): Source {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'server' ? 'server' : 'device';
  } catch {
    return 'device';
  }
}

function storedGrouping(): Grouping {
  try {
    const v = localStorage.getItem(GROUPING_KEY);
    return GROUPINGS.includes(v as Grouping) ? (v as Grouping) : 'date';
  } catch {
    return 'date';
  }
}

/** One entry per head (type + serial): the newest measurement and how many there are. */
export interface HeadEntry {
  latest: LocalResult;
  count: number;
}

const newestFirst = (a: LocalResult, b: LocalResult) => b.testDate.localeCompare(a.testDate) || b.id - a.id;

/** Groups the results by head; heads without serial number stay single. Newest first. */
export function byHead(rows: LocalResult[]): HeadEntry[] {
  const map = new Map<string, HeadEntry>();
  for (const r of [...rows].sort(newestFirst)) {
    const key = r.headSerial ? `${r.headType}|${r.headSerial}` : `#${r.id}`;
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, { latest: r, count: 1 });
  }
  return [...map.values()];
}

/** Sections for the chosen grouping, in display order. */
export function sections(
  entries: HeadEntry[],
  grouping: Grouping,
  noCustomer: string,
): { key: string; label: string; entries: HeadEntry[] }[] {
  if (grouping === 'list') return [{ key: 'all', label: '', entries }];
  const map = new Map<string, HeadEntry[]>();
  for (const e of entries) {
    const key = grouping === 'date' ? e.latest.testDate.slice(0, 10) : (e.latest.customer ?? '');
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  // Entries come newest first, so customers keep the order of their last measurement.
  const keys = [...map.keys()];
  if (grouping === 'date') keys.sort((a, b) => b.localeCompare(a));
  else keys.sort((a, b) => Number(!a) - Number(!b));
  return keys.map((key) => ({ key, label: key || noCustomer, entries: map.get(key) ?? [] }));
}

/** Local history: every evaluated file, one row per head, grouped by date or customer. */
export function Results({
  compact = false,
  selectedId = null,
}: {
  compact?: boolean;
  /** Open result: a local id, or `s<id>` for one of the server. */
  selectedId?: string | null;
}) {
  const { t, int, date } = useI18n();
  const [state] = useEngine();
  const [source, setSourceState] = useState<Source>(storedSource);
  const setSource = (next: Source) => {
    setSourceState(next);
    try {
      localStorage.setItem(SOURCE_KEY, next);
    } catch {
      // only a convenience
    }
  };
  // The server view needs a connection; without one the device's results are shown.
  const fromServer = source === 'server' && state.connection !== null;
  const [q, setQ] = useState('');
  const [family, setFamily] = useState<Family | ''>('');
  const [rating, setRating] = useState<Rating | ''>('');
  const [grouping, setGroupingState] = useState<Grouping>(storedGrouping);
  const [limit, setLimit] = useState(PAGE);
  const setGrouping = (g: Grouping) => {
    setGroupingState(g);
    try {
      localStorage.setItem(GROUPING_KEY, g);
    } catch {
      // only a convenience
    }
  };

  const entries = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return byHead(
      state.rows
        .filter((r) => !family || r.machineFamily === family)
        .filter((r) => !rating || r.rating === rating)
        .filter((r) => {
          if (!words.length) return true;
          const text =
            `${r.headType} ${r.headSerial} ${r.machineNo} ${r.fileName} ${r.toolType ?? ''} ${r.customer ?? ''}`.toLowerCase();
          return words.every((w) => text.includes(w));
        }),
    );
  }, [state.rows, q, family, rating]);
  const groups = useMemo(() => {
    let left = limit;
    return sections(entries, grouping, t('client.results.noCustomer'))
      .map((g) => {
        const shown = g.entries.slice(0, Math.max(0, left));
        left -= shown.length;
        return { ...g, shown };
      })
      .filter((g) => g.shown.length > 0);
  }, [entries, grouping, limit, t]);
  const any = q || family || rating;

  const row = (e: HeadEntry): ReactNode => (
    <ResultListRow
      key={e.latest.id}
      row={toRow(e.latest)}
      selected={String(e.latest.id) === selectedId}
      count={e.count}
      {...(e.count > 1 ? { to: `/results/${e.latest.id}/history` } : {})}
      extra={
        state.connection || e.latest.upload !== 'local' ? (
          <UploadChip state={e.latest.upload} reason={e.latest.uploadError} />
        ) : null
      }
    />
  );

  const groupingSwitch = (
    <div className={`seg${compact ? ' seg-sm' : ''}`} role="radiogroup" aria-label={t('client.results.grouping')}>
      {GROUPINGS.map((g) => (
        <button key={g} type="button" role="radio" aria-checked={grouping === g} onClick={() => setGrouping(g)}>
          {t(`client.results.by.${g}`)}
        </button>
      ))}
    </div>
  );
  const sourceSwitch = state.connection && (
    <div className="source-switch" role="radiogroup" aria-label={t('client.results.source')}>
      {(['device', 'server'] as const).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={source === k} onClick={() => setSource(k)}>
          {k === 'device' ? t('client.results.fromDevice') : t('client.results.fromServer')}
        </button>
      ))}
    </div>
  );

  if (fromServer) {
    return (
      <Page title={t('client.nav.results')}>
        {sourceSwitch}
        <ServerResults grouping={grouping} groupingSwitch={groupingSwitch} selectedId={selectedId} />
      </Page>
    );
  }

  return (
    <Page title={t('client.nav.results')}>
      {sourceSwitch}
      {state.rows.length > 0 && (
        <section className="search-card" role="search">
          <label className="search-box">
            <Icon name="search" size={20} stroke={2.4} />
            <span className="sr-only">{t('results.search')}</span>
            <input
              type="search"
              value={q}
              placeholder={t('client.results.searchPlaceholder')}
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
              {t('client.results.count', { n: entries.length, heads: int(entries.length) })}
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
            {groupingSwitch}
          </div>
          {entries.length === 0 ? (
            <Empty title={t('results.noMatch')}>
              <p>{t('results.noMatchHint')}</p>
            </Empty>
          ) : grouping === 'list' ? (
            <div className="rows">{groups[0]?.shown.map(row)}</div>
          ) : (
            <div className="groups" data-testid={`groups-${grouping}`}>
              {groups.map((g) => (
                <section key={g.key} className="group">
                  <h3 className="group-h">
                    <span>{grouping === 'date' ? date(g.key) : g.label}</span>
                    <span className="muted">{t('client.results.groupCount', { n: g.entries.length })}</span>
                  </h3>
                  <div className="rows">{g.shown.map(row)}</div>
                </section>
              ))}
            </div>
          )}
          {entries.length > limit && (
            <button
              type="button"
              className="btn"
              style={{ alignSelf: 'center' }}
              onClick={() => setLimit((l) => l + PAGE)}
            >
              {t('client.more', { n: entries.length - limit })}
            </button>
          )}
        </>
      )}
    </Page>
  );
}
