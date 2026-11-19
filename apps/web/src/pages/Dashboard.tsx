import { useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
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
          <span className="m">{row.machineNo}</span>
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

function PerDay({ data }: { data: DashboardData }) {
  const { t, int, date } = useI18n();
  const max = Math.max(1, ...data.perDay.map((d) => d.results));
  const total = data.totals.inPeriod;
  const mid = data.perDay[Math.floor(data.perDay.length / 2)]?.day;
  return (
    <section className="card stack" style={{ flex: '999 1 520px' }}>
      <div className="card-h" style={{ marginBottom: 0 }}>
        <div>
          <span className="card-label">{t('dash.perDay', { n: data.period.days })}</span>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{int(total)}</div>
        </div>
        <div className="legend-line" style={{ fontWeight: 600 }}>
          <span>
            <i className="dot" style={{ background: 'var(--accent)' }} />
            {t('dash.results')}
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--crit-fill)' }} />
            {t('rating.critical')}
          </span>
        </div>
      </div>
      <div className="bars" role="img" aria-label={t('dash.perDayAria', { n: total, days: data.period.days })}>
        {data.perDay.map((d) => (
          <span key={d.day} data-tip={`${date(d.day)}: ${int(d.results)} · ${t('rating.critical')} ${int(d.critical)}`}>
            <i style={{ height: `${(d.results / max) * 100}%`, minHeight: d.results ? 3 : 0 }} />
            {d.critical > 0 && <i className="crit" style={{ height: `${(d.critical / max) * 100}%`, minHeight: 3 }} />}
          </span>
        ))}
      </div>
      <div className="axis">
        <span>{date(data.perDay[0]?.day)}</span>
        <span>{date(mid)}</span>
        <span>{t('common.today')}</span>
      </div>
    </section>
  );
}

function Ratings({ data }: { data: DashboardData }) {
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
      <span className="card-label">{t('dash.ratings', { n: data.period.days })}</span>
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

  return (
    <Page
      title={t('nav.dashboard')}
      actions={
        <Link to={scope.link('/upload')} className="btn primary">
          <Icon name="upload" size={16} />
          {t('nav.upload')}
        </Link>
      }
    >
      <div className="hero-title">
        <div>
          <h2>{scope.viewing ? scope.companyName : t('dash.welcome', { name: firstName })}</h2>
          <p>{staffAll ? t('dash.subAll') : t('dash.subCompany', { company: scope.companyName ?? '' })}</p>
        </div>
        <div className="seg" role="group" aria-label={t('dash.period')}>
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)}>
              {t('dash.days', { n: p })}
            </button>
          ))}
        </div>
      </div>

      {dash.error && <ErrorNotice error={dash.error} />}
      {!dash.data && dash.loading && <Loading />}
      {dash.data && dash.data.totals.results === 0 && (
        <Empty title={t('dash.emptyTitle')}>
          <p>{t('dash.emptyText')}</p>
          <Link to={scope.link('/upload')} className="btn primary">
            <Icon name="upload" size={16} />
            {t('nav.upload')}
          </Link>
        </Empty>
      )}
      {dash.data && dash.data.totals.results > 0 && (
        <>
          <div className="latest">
            {dash.data.latest.slice(0, 3).map((r) => (
              <LatestCard key={r.id} row={r} />
            ))}
          </div>
          <div className="row-wrap">
            <PerDay data={dash.data} />
            <Ratings data={dash.data} />
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
    </Page>
  );
}
