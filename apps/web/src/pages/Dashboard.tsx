import { machineLabel } from '@pam/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { MenuToggle } from '../components/Layout';
import { Empty, ErrorNotice, headLabel, Loading, ResultListRow, ratingClass } from '../components/ui';
import { useI18n } from '../i18n';
import { type Dashboard as DashboardData, type Family, qs, type Rating, type ResultRow } from '../lib/api';
import { useUser } from '../lib/auth';
import { useScope } from '../lib/scope';
import { useApi } from '../lib/useApi';

const RATINGS: Rating[] = ['excellent', 'good', 'warning', 'critical'];
const RATING_COLOR: Record<Rating, string> = {
  excellent: 'var(--exc-fill)',
  good: 'var(--good-fill)',
  warning: 'var(--warn-fill)',
  critical: 'var(--crit-fill)',
};
const PERIODS = [7, 30, 90] as const;

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

function Ratings({ data, plain = false }: { data: DashboardData; plain?: boolean }) {
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
      {!plain && <span className="card-label">{t('dash.ratings', { n: data.period.days })}</span>}
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

export function Dashboard() {
  const { t } = useI18n();
  const user = useUser();
  const scope = useScope();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [tab, setTab] = useState<Family | 'all'>('all');
  const dash = useApi<DashboardData>(`/dashboard${qs({ companyId: scope.companyId, days })}`);
  const list = useApi<{ items: ResultRow[] }>(
    `/results${qs({ companyId: scope.companyId, family: tab === 'all' ? null : tab, pageSize: 8, sort: '-createdAt' })}`,
  );
  const staffAll = scope.companyId === null;
  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  useEffect(() => {
    document.title = `${t('nav.dashboard')} · PAM Analyzer`;
  }, [t]);
  const data = dash.data;
  const critical = data?.perDay.reduce((n, d) => n + d.critical, 0) ?? 0;
  const peak = Math.max(1, ...(data?.perDay.map((d) => d.results) ?? [0]));

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
        <div className="dash-filters" role="group" aria-label={t('dash.period')}>
          <span>{t('dash.period')}:</span>
          {PERIODS.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={days === p} onClick={() => setDays(p)}>
              {t('dash.days', { n: p })}
            </button>
          ))}
        </div>
        {data && (
          <div className="dash-sum">
            <div className="dash-grow">
              <div className="dash-ttl">{t('dash.perDay', { n: data.period.days })}</div>
              <div
                className="dash-days dash-days-many"
                role="img"
                aria-label={t('dash.perDayAria', { n: data.totals.inPeriod, days: data.period.days })}
              >
                {data.perDay.map((d) => (
                  <span key={d.day} title={`${d.day}: ${d.results} · ${t('rating.critical')} ${d.critical}`}>
                    <i
                      style={{ height: `${Math.max(3, (d.results / peak) * 46)}px` }}
                      className={d.results ? (d.critical ? 'c' : '') : 'z'}
                    />
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
            <h2>{t('dash.ratings', { n: data.period.days })}</h2>
            <Ratings data={data} plain />
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
            <div className="latest">
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
                <Link to={scope.link('/results')} className="btn">
                  {t('dash.allResults')} →
                </Link>
              </div>
              <div className="rows">
                {list.data?.items.map((r) => (
                  <ResultListRow key={r.id} row={r} showCompany={staffAll} />
                ))}
                {list.data?.items.length === 0 && <Empty title={t('results.none')} />}
              </div>
            </section>
          </>
        )}
      </section>
    </div>
  );
}
