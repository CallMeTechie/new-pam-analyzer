import { machineLabel } from '@pam/core';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { MenuToggle } from '../components/Layout';
import { Empty, ErrorNotice, headLabel, Loading, ResultListRow, ratingClass } from '../components/ui';
import { useI18n } from '../i18n';
import { type Dashboard as DashboardData, type Family, qs, type Rating, type ResultRow } from '../lib/api';
import { useUser } from '../lib/auth';
import { useScope } from '../lib/scope';
import { useApi } from '../lib/useApi';
import { isoDate, isoWeek } from '../lib/week';

const RATINGS: Rating[] = ['excellent', 'good', 'warning', 'critical'];
const RATING_COLOR: Record<Rating, string> = {
  excellent: 'var(--exc-fill)',
  good: 'var(--good-fill)',
  warning: 'var(--warn-fill)',
  critical: 'var(--crit-fill)',
};

function LatestCard({ row }: { row: ResultRow }) {
  const { t, num, date } = useI18n();
  const scope = useScope();
  const pct = Math.min(100, ((row.cpkXY ?? 0) / 2.5) * 100);
  return (
    <Link to={scope.link(`/results/${row.id}`)} className={`lcard ${ratingClass(row.rating)}`}>
      <span className="top">
        <span style={{ minWidth: 0 }}>
          <b>{headLabel(row, t('fact.sn'))}</b>
          <span className="m">{machineLabel(row.machineNo, t('machine.sn'))}</span>
        </span>
        <span className="chip">{t(`family.${row.machineFamily}`)}</span>
      </span>
      <span className="val">
        <span>Cpk XY</span>
        <b>{num(row.cpkXY, 2)}</b>
      </span>
      <span className="meter">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="bottom">
        <span>{date(row.testDate)}</span>
        <span>{t(`rating.${row.rating ?? 'none'}`)}</span>
      </span>
    </Link>
  );
}

function Ratings({ data, week, plain = false }: { data: DashboardData; week: number; plain?: boolean }) {
  const { t, int, num } = useI18n();
  const total = RATINGS.reduce((s, r) => s + (data.ratings[r] ?? 0), 0);
  let acc = 0;
  const stops = RATINGS.map((r) => {
    const from = acc;
    acc += total ? ((data.ratings[r] ?? 0) / total) * 100 : 0;
    return `${RATING_COLOR[r]} ${from}% ${acc}%`;
  });
  const top = total ? ((data.ratings.excellent ?? 0) / total) * 100 : 0;
  return (
    <section className="card stack" style={{ flex: '1 1 280px', gap: 16 }}>
      {!plain && <span className="card-label">{t('dash.ratings', { week })}</span>}
      <div
        className="donut"
        role="img"
        aria-label={RATINGS.map((r) => `${t(`rating.${r}`)} ${int(data.ratings[r] ?? 0)}`).join(', ')}
        style={{ background: total ? `conic-gradient(${stops.join(', ')})` : 'var(--surface-3)' }}
      >
        <span>
          <b>{total ? `${num(top, 0)} %` : '–'}</b>
          <small>{t('rating.excellent')}</small>
        </span>
      </div>
      <div className="legend-grid">
        {RATINGS.map((r) => (
          <span key={r}>
            <i className="dot" style={{ background: RATING_COLOR[r] }} />
            <span>{t(`rating.${r}`)}</span>
            <b>{int(data.ratings[r] ?? 0)}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

const TABS: (Family | 'all')[] = ['all', 'nxt', 'nxtr', 'aimex'];

/** This and last calendar week, from the user's local clock. */
function useWeeks() {
  const today = isoDate(new Date());
  return useMemo(() => {
    const now = isoWeek(new Date(`${today}T12:00:00`));
    const lastMonday = new Date(now.monday.getFullYear(), now.monday.getMonth(), now.monday.getDate() - 7);
    return {
      week: now.week,
      lastWeek: isoWeek(lastMonday).week,
      from: isoDate(now.monday),
      to: isoDate(now.sunday),
      lastFrom: isoDate(lastMonday),
      days: Array.from(
        { length: 7 },
        (_, i) => new Date(now.monday.getFullYear(), now.monday.getMonth(), now.monday.getDate() + i),
      ),
    };
  }, [today]);
}

export function Dashboard() {
  const { t, date, locale } = useI18n();
  const user = useUser();
  const scope = useScope();
  const weeks = useWeeks();
  const [tab, setTab] = useState<Family | 'all'>('all');
  const dash = useApi<DashboardData>(`/dashboard${qs({ companyId: scope.companyId, from: weeks.from, to: weeks.to })}`);
  // The table: everything tested this and last calendar week.
  const list = useApi<{ items: ResultRow[]; total: number }>(
    `/results${qs({
      companyId: scope.companyId,
      family: tab === 'all' ? null : tab,
      from: weeks.lastFrom,
      to: weeks.to,
      sort: '-testDate',
      pageSize: 200,
    })}`,
  );
  const staffAll = scope.companyId === null;
  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  useEffect(() => {
    document.title = `${t('nav.dashboard')} · PAM Analyzer`;
  }, [t]);
  const data = dash.data;
  const critical = data?.perDay.reduce((n, d) => n + d.critical, 0) ?? 0;
  const peak = Math.max(1, ...(data?.perDay.map((d) => d.results) ?? [0]));
  const items = list.data?.items ?? [];
  const weekSections = [
    {
      key: 'this',
      label: t('dash.thisWeek', { week: weeks.week }),
      rows: items.filter((r) => r.testDate.slice(0, 10) >= weeks.from),
    },
    {
      key: 'last',
      label: t('dash.lastWeek', { week: weeks.lastWeek }),
      rows: items.filter((r) => r.testDate.slice(0, 10) < weeks.from),
    },
  ];
  const allLink = scope.link(`/results${qs({ from: weeks.lastFrom, to: weeks.to })}`);

  return (
    <div className="dash dash-web">
      <header className="dash-band topbar">
        <div className="dash-title">
          <MenuToggle />
          <h1>{t('nav.dashboard')}</h1>
        </div>
        <p className="dash-sub">
          {scope.viewing ? scope.companyName : t('dash.welcome', { name: firstName })} ·{' '}
          {staffAll ? t('dash.subAll') : t('dash.subCompany', { company: scope.companyName ?? '' })}
        </p>
        {data && (
          <div className="dash-sum">
            <div className="dash-grow">
              <div className="dash-ttl">
                {t('dash.weekText', {
                  week: weeks.week,
                  from: date(weeks.from),
                  to: date(weeks.to),
                  n: data.totals.inPeriod,
                })}
              </div>
              <div
                className="dash-days"
                role="img"
                aria-label={t('dash.perDayAria', { n: data.totals.inPeriod, week: weeks.week })}
                data-testid="week-days"
              >
                {data.perDay.map((d, i) => (
                  <span key={d.day} title={`${date(d.day)}: ${d.results} · ${t('rating.critical')} ${d.critical}`}>
                    <i
                      style={{ height: `${Math.max(3, (d.results / peak) * 46)}px` }}
                      className={d.results ? (d.critical ? 'c' : '') : 'z'}
                    />
                    {weeks.days[i]?.toLocaleDateString(locale, { weekday: 'short' })}
                  </span>
                ))}
              </div>
            </div>
            <div className="dash-tot">
              <small>
                {t('dash.results')} / {t('rating.critical')}
              </small>
              <b className="num">
                {data.totals.inPeriod} <span>/ {critical}</span>
              </b>
            </div>
          </div>
        )}
      </header>

      <aside className="dash-side">
        <h2>{t('nav.upload')}</h2>
        <Link to={scope.link('/upload')} className="dropzone compact clickable">
          <span className="icon-circle">
            <Icon name="upload" size={22} />
          </span>
          <span className="dz-text">
            <b>{t('dash.uploadTitle')}</b>
            <span className="muted">{t('dash.uploadText')}</span>
          </span>
        </Link>
        {data && data.totals.results > 0 && (
          <>
            <h2>{t('dash.ratings', { week: weeks.week })}</h2>
            <Ratings data={data} week={weeks.week} plain />
          </>
        )}
      </aside>

      <section className="dash-main">
        {dash.error && <ErrorNotice error={dash.error} />}
        {!data && dash.loading && <Loading />}
        {data && data.totals.results === 0 && (
          <Empty title={t('dash.emptyTitle')}>
            <p>{t('dash.emptyText')}</p>
            <Link to={scope.link('/upload')} className="btn primary">
              <Icon name="upload" size={16} />
              {t('nav.upload')}
            </Link>
          </Empty>
        )}
        {data && data.totals.results > 0 && (
          <>
            <div className="latest" data-testid="latest-cards">
              {data.latest.slice(0, 3).map((r) => (
                <LatestCard key={r.id} row={r} />
              ))}
            </div>
            <section className="stack" style={{ gap: 14 }}>
              <div className="section-h" style={{ alignItems: 'center' }}>
                <div className="tabs" role="tablist" aria-label={t('results.family')}>
                  {TABS.map((f) => (
                    <button key={f} type="button" role="tab" aria-selected={tab === f} onClick={() => setTab(f)}>
                      {f === 'all' ? t('common.all') : t(`family.${f}`)}
                    </button>
                  ))}
                </div>
                <Link to={allLink} className="btn">
                  {t('dash.allResults')} →
                </Link>
              </div>
              {list.error && <ErrorNotice error={list.error} />}
              {list.data && (
                <div className="groups" data-testid="week-table">
                  {weekSections.map((g) => (
                    <section key={g.key} className="group" data-testid={`week-${g.key}`}>
                      <h3 className="group-h">
                        <span>{g.label}</span>
                        <span className="muted">{t('results.groupCount', { n: g.rows.length })}</span>
                      </h3>
                      {g.rows.length ? (
                        <div className="rows">
                          {g.rows.map((r) => (
                            <ResultListRow key={r.id} row={r} showCompany={staffAll} />
                          ))}
                        </div>
                      ) : (
                        <p className="muted" style={{ margin: '2px 2px 6px' }}>
                          {t('dash.weekNone')}
                        </p>
                      )}
                    </section>
                  ))}
                  {list.data.total > items.length && (
                    <Link to={allLink} className="btn" style={{ justifySelf: 'center' }}>
                      {t('dash.allResults')} →
                    </Link>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
