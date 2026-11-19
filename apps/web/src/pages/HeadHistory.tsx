import { CPK_THRESHOLDS } from '@pam/core';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Page } from '../components/Layout';
import { ErrorNotice, headLabel, Loading, PartsBar, RatingPill, ratingClass } from '../components/ui';
import { useI18n } from '../i18n';
import type { ResultRow } from '../lib/api';
import { useScope } from '../lib/scope';
import { useApi } from '../lib/useApi';

const W = 1000;
const H = 300;
const PAD = { l: 44, r: 20, t: 16, b: 34 };
const fromFile = (r: ResultRow) => r.dateSource === 'header' || r.dateSource === 'file_modified';
const time = (s: string) => Date.parse(`${s.replace(' ', 'T')}Z`);

function Chart({ items, currentId }: { items: ResultRow[]; currentId: number }) {
  const { t, num, date, dateTime } = useI18n();
  const scope = useScope();
  const navigate = useNavigate();
  const [hover, setHover] = useState<ResultRow | null>(null);
  const points = items.filter((r) => r.cpkXY !== null);
  const times = points.map((r) => time(r.testDate));
  let t0 = Math.min(...times);
  let t1 = Math.max(...times);
  if (t1 - t0 < 86_400_000) {
    t0 -= 86_400_000 * 3;
    t1 += 86_400_000 * 3;
  }
  const span = t1 - t0;
  t0 -= span * 0.04;
  t1 += span * 0.04;
  const yMax = Math.max(2.5, Math.ceil(Math.max(...points.map((r) => r.cpkXY ?? 0)) * 2) / 2);
  const x = (ms: number) => PAD.l + ((ms - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const coords = points.map((r) => [x(time(r.testDate)), y(r.cpkXY ?? 0)] as const);
  const line = coords.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area =
    coords.length > 1
      ? `${line} L${coords.at(-1)?.[0].toFixed(1)} ${y(0)} L${coords[0]?.[0].toFixed(1)} ${y(0)} Z`
      : '';
  const yTicks = Array.from({ length: Math.floor(yMax / 0.5) + 1 }, (_, i) => i * 0.5);
  const xTicks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n }, (_, i) => t0 + ((i + 0.5) / n) * (t1 - t0));
  }, [t0, t1]);
  // Each line marks where a level starts, in the colour of that level.
  const thresholds = [
    [CPK_THRESHOLDS.warning, 'var(--warn-fill)'],
    [CPK_THRESHOLDS.good, 'var(--good-fill)'],
    [CPK_THRESHOLDS.excellent, 'var(--exc-fill)'],
  ] as const;

  return (
    <div className="history-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('history.chartAria', { n: points.length })}>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" style={{ fontSize: 11 }}>
              {num(v, 1)}
            </text>
          </g>
        ))}
        {xTicks.map((ms) => (
          <text key={ms} x={x(ms)} y={H - 10} textAnchor="middle" style={{ fontSize: 11 }}>
            {date(new Date(ms).toISOString().slice(0, 10))}
          </text>
        ))}
        {thresholds.map(([v, color]) => (
          <line key={v} className="thr" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={color} />
        ))}
        {area && <path className="area" d={area} />}
        <path className="line" d={line} />
        {points.map((r, i) => {
          const [px, py] = coords[i] ?? [0, 0];
          const filled = fromFile(r);
          const current = r.id === currentId;
          return (
            <g
              key={r.id}
              className={`pt ${ratingClass(r.rating)}`}
              tabIndex={0}
              role="link"
              aria-label={`${dateTime(r.testDate)}: Cpk XY ${num(r.cpkXY, 2)}`}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r)}
              onBlur={() => setHover(null)}
              onClick={() => navigate(scope.link(`/results/${r.id}`))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(scope.link(`/results/${r.id}`));
              }}
            >
              <circle cx={px} cy={py} r={14} fill="transparent" />
              {current && (
                <circle cx={px} cy={py} r={10} fill="none" stroke="var(--rf)" strokeWidth={2} opacity={0.5} />
              )}
              <circle
                className="mark"
                cx={px}
                cy={py}
                r={5.5}
                fill={filled ? 'var(--rf)' : 'var(--surface)'}
                stroke="var(--rf)"
                strokeWidth={2.6}
              />
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="tip"
          style={{
            left: `clamp(8px, calc(${(x(time(hover.testDate)) / W) * 100}% - 80px), calc(100% - 200px))`,
            top: `calc(${(y(hover.cpkXY ?? 0) / H) * 100}% - 62px)`,
          }}
        >
          {dateTime(hover.testDate)}
          <br />
          Cpk XY <b>{num(hover.cpkXY, 2)}</b> · {t(`rating.${hover.rating ?? 'none'}`)}
          <br />
          {t(`dateSource.${hover.dateSource}`)}
        </div>
      )}
    </div>
  );
}

export function HeadHistory() {
  const { id } = useParams();
  const { t, num, dateTime } = useI18n();
  const scope = useScope();
  const { data, error } = useApi<{ headType: string; headSerial: string; items: ResultRow[] }>(
    `/results/${id}/history`,
  );
  const currentId = Number(id);

  if (error) {
    return (
      <Page title={t('history.title')}>
        <ErrorNotice error={error} />
      </Page>
    );
  }
  if (!data) {
    return (
      <Page title={t('history.title')}>
        <Loading />
      </Page>
    );
  }
  const items = data.items;
  const latest = items.at(-1);
  const rated = items.filter((r) => r.cpkXY !== null);
  const best = rated.reduce<ResultRow | null>((b, r) => (!b || (r.cpkXY ?? 0) > (b.cpkXY ?? 0) ? r : b), null);
  const worst = rated.reduce<ResultRow | null>((w, r) => (!w || (r.cpkXY ?? 0) < (w.cpkXY ?? 0) ? r : w), null);
  const previous = rated.at(-2);
  const delta = latest?.cpkXY != null && previous?.cpkXY != null ? latest.cpkXY - previous.cpkXY : null;
  const machines = [...new Set(items.map((r) => r.machineNo))];
  const title = headLabel({ ...data, toolType: latest?.toolType ?? null }, t('fact.sn'));

  return (
    <Page
      title={t('history.title')}
      actions={
        <Link to={scope.link(`/results/${currentId}`)} className="btn">
          ← {t('history.backToResult')}
        </Link>
      }
    >
      <p className="muted" style={{ maxWidth: '80ch' }}>
        {t('history.intro')}
      </p>
      <div className="kpis">
        <div className="kpi" style={{ background: 'var(--dark)', color: '#fff' }}>
          <span style={{ color: 'rgba(255,255,255,.7)' }}>{t('fact.head')}</span>
          <b style={{ fontSize: 24, fontWeight: 800 }}>{title}</b>
          <span className="mono" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>
            {machines.join(', ')}
          </span>
        </div>
        <div className={`kpi ${ratingClass(latest?.rating)}`}>
          <span>{t('history.latest')}</span>
          <b className="mono" style={{ color: 'var(--rc)' }}>
            {num(latest?.cpkXY, 2)}
          </b>
          <span className="muted" style={{ fontSize: 13 }}>
            {delta === null
              ? dateTime(latest?.testDate)
              : t('history.delta', { d: `${delta >= 0 ? '+' : '−'}${num(Math.abs(delta), 2)}` })}
          </span>
        </div>
        <div className={`kpi ${ratingClass(best?.rating)}`}>
          <span>{t('history.best')}</span>
          <b className="mono" style={{ color: 'var(--rc)' }}>
            {num(best?.cpkXY, 2)}
          </b>
          <span className="muted" style={{ fontSize: 13 }}>
            {dateTime(best?.testDate)}
          </span>
        </div>
        <div className={`kpi ${ratingClass(worst?.rating)}`}>
          <span>{t('history.worst')}</span>
          <b className="mono" style={{ color: 'var(--rc)' }}>
            {num(worst?.cpkXY, 2)}
          </b>
          <span className="muted" style={{ fontSize: 13 }}>
            {t('history.tests', { n: items.length })}
          </span>
        </div>
      </div>

      <section className="card stack">
        <div className="card-h" style={{ marginBottom: 0 }}>
          <h2>{t('history.trend')}</h2>
          <div className="legend-line">
            <span>
              <i className="mark-filled" />
              {t('history.fromFile')}
            </span>
            <span>
              <i className="mark-hollow" />
              {t('history.fromUpload')}
            </span>
            {(
              [
                [CPK_THRESHOLDS.warning, 'var(--warn-fill)', 'rating.warning'],
                [CPK_THRESHOLDS.good, 'var(--good-fill)', 'rating.good'],
                [CPK_THRESHOLDS.excellent, 'var(--exc-fill)', 'rating.excellent'],
              ] as const
            ).map(([v, c, k]) => (
              <span key={v}>
                <i style={{ width: 14, borderTop: `2px dashed ${c}` }} />
                {t('history.threshold', { v: num(v, 2), rating: t(k) })}
              </span>
            ))}
          </div>
        </div>
        {rated.length ? <Chart items={items} currentId={currentId} /> : <p className="muted">{t('history.noRated')}</p>}
      </section>

      <section className="stack">
        <h2 style={{ fontSize: 17, fontWeight: 700 }}>{t('history.list')}</h2>
        <div className="rows">
          {items
            .slice()
            .reverse()
            .map((r) => (
              <Link
                key={r.id}
                to={scope.link(`/results/${r.id}`)}
                className="result-row"
                style={r.id === currentId ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
              >
                <span style={{ display: 'flex', flexDirection: 'column', width: 200 }}>
                  <b style={{ fontSize: 14.5, fontWeight: 600 }}>{dateTime(r.testDate)}</b>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {t(`dateSource.${r.dateSource}`)}
                  </span>
                </span>
                <span className="mono" style={{ flex: 1, minWidth: 160, fontSize: 13, color: 'var(--fg-2)' }}>
                  {r.machineNo}
                  {r.line ? ` · ${r.line}` : ''}
                </span>
                <PartsBar measured={r.measured} expected={r.expected} status={r.componentStatus} />
                <span className="mono" style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>
                  X {num(r.cpkX, 2)} · Y {num(r.cpkY, 2)}
                </span>
                <RatingPill rating={r.rating} value={r.cpkXY} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{t('common.open')} →</span>
              </Link>
            ))}
        </div>
      </section>
    </Page>
  );
}
