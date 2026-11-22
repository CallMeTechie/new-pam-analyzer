import { Icon } from '@web/components/Icon';
import { Page } from '@web/components/Layout';
import { Empty, ResultListRow } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import type { Family } from '@web/lib/api';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ConnectionCard, UploadChip } from '../components';
import { toRow } from '../lib/evaluate';
import { useLayout } from '../lib/layout';
import type { LocalResult } from '../lib/types';
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

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

/** Start page: add files, and what was tested this calendar week. */
/** Start page: the Windows design (band, side panel, chart) or the compact touch layout. */
export function Overview() {
  return useLayout() === 'desktop' ? <DesktopOverview /> : <TouchOverview />;
}

function useWeek() {
  const [s] = useEngine();
  const { week, monday, sunday } = isoWeek(new Date());
  const from = iso(monday);
  const to = iso(sunday);
  const rows = useMemo(
    () =>
      s.rows
        .filter((r) => r.testDate.slice(0, 10) >= from && r.testDate.slice(0, 10) <= to)
        .sort((a, b) => b.testDate.localeCompare(a.testDate) || b.id - a.id),
    [s.rows, from, to],
  );
  return { week, monday, sunday, rows };
}

type Chip = '' | Family | 'critical';

/** Cpk XY of this week's measurements over time, with the rating limits. */
function WeekChart({ rows }: { rows: LocalResult[] }) {
  const { num } = useI18n();
  const [s] = useEngine();
  const th = s.config.thresholds;
  const pts = rows
    .filter((r) => r.cpkXY !== null)
    .slice()
    .sort((a, b) => a.testDate.localeCompare(b.testDate));
  const W = 360;
  const H = 160;
  const L = 34;
  const max = Math.max(2.5, Math.ceil(Math.max(...pts.map((r) => r.cpkXY ?? 0), 0) * 2) / 2);
  const x = (i: number) => (pts.length < 2 ? L + (W - L - 20) / 2 : L + 8 + (i / (pts.length - 1)) * (W - L - 28));
  const y = (v: number) => 12 + (1 - v / max) * (H - 30);
  const line = pts.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r.cpkXY ?? 0).toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: Math.floor(max / 0.5) }, (_, i) => (i + 1) * 0.5);
  const last = pts.at(-1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="dash-chart" role="img" aria-label="Cpk XY">
      {ticks.map((v) => (
        <g key={v}>
          <path d={`M${L} ${y(v)}H${W - 6}`} stroke="var(--line-2)" strokeDasharray="3 4" />
          <text x="0" y={y(v) + 4} fontSize="10" fill="var(--muted)">
            {num(v, 1)}
          </text>
        </g>
      ))}
      <path d={`M${L} ${y(th.warning)}H${W - 6}`} stroke="var(--crit-fill)" strokeOpacity=".45" />
      {line && <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" />}
      {pts.map((r, i) => (
        <circle
          key={r.id}
          cx={x(i)}
          cy={y(r.cpkXY ?? 0)}
          r={i === pts.length - 1 ? 6 : 3.5}
          fill="var(--surface)"
          stroke={(r.cpkXY ?? 0) < th.warning ? 'var(--crit-fill)' : 'var(--accent)'}
          strokeWidth="2.5"
        />
      ))}
      {last && (
        <g>
          <rect
            x={x(pts.length - 1) - 21}
            y={Math.max(0, y(last.cpkXY ?? 0) - 34)}
            width="42"
            height="22"
            rx="4"
            fill="var(--accent)"
          />
          <text
            x={x(pts.length - 1)}
            y={Math.max(0, y(last.cpkXY ?? 0) - 34) + 15}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="var(--on-accent)"
          >
            {num(last.cpkXY, 2)}
          </text>
        </g>
      )}
    </svg>
  );
}

function DesktopOverview() {
  const { t, date, num, int, locale } = useI18n();
  const [s] = useEngine();
  const { week, monday, sunday, rows } = useWeek();
  const [chip, setChip] = useState<Chip>('');
  const th = s.config.thresholds;
  useMemo(() => {
    document.title = `${t('client.nav.overview')} · PAM Analyzer`;
  }, [t]);
  const shown = rows.filter((r) =>
    chip === '' ? true : chip === 'critical' ? r.cpkXY !== null && r.cpkXY < th.warning : r.machineFamily === chip,
  );
  const rated = rows.filter((r) => r.cpkXY !== null);
  const avg = rated.length ? rated.reduce((a, r) => a + (r.cpkXY ?? 0), 0) / rated.length : null;
  const critical = rated.filter((r) => (r.cpkXY ?? 0) < th.warning);
  const best = rated.reduce<LocalResult | null>((b, r) => (!b || (r.cpkXY ?? 0) > (b.cpkXY ?? 0) ? r : b), null);
  // Measurements per weekday (Monday … Sunday).
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return {
      label: d.toLocaleDateString(locale, { weekday: 'short' }),
      n: rows.filter((r) => r.testDate.startsWith(iso(d))).length,
    };
  });
  const peak = Math.max(1, ...perDay.map((d) => d.n));
  const chips: [Chip, string][] = [
    ['', t('common.all')],
    ['nxt', t('family.nxt')],
    ['nxtr', t('family.nxtr')],
    ['aimex', t('family.aimex')],
    ['critical', t('rating.critical')],
  ];
  return (
    <div className="dash">
      <header className="dash-band topbar">
        <h1>{t('client.nav.overview')}</h1>
        <div className="dash-filters" role="group" aria-label={t('client.overview.show')}>
          <span>{t('client.overview.show')}:</span>
          {chips.map(([k, text]) => (
            <button
              key={k || 'all'}
              type="button"
              className="chip"
              aria-pressed={chip === k}
              onClick={() => setChip(k)}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="dash-sum">
          <div>
            <div className="dash-ttl">
              {t('client.overview.weekText', { week, from: date(iso(monday)), to: date(iso(sunday)), n: rows.length })}
            </div>
            <div className="dash-days" aria-hidden="true">
              {perDay.map((d) => (
                <span key={d.label}>
                  <i style={{ height: `${Math.max(3, (d.n / peak) * 46)}px` }} className={d.n ? '' : 'z'} />
                  {d.label}
                </span>
              ))}
            </div>
          </div>
          <div className="dash-tot">
            <small>{t('client.overview.avg')}</small>
            <b className="num">
              {avg === null ? '–' : num(avg, 2)} <span>/ {int(critical.length)}</span>
            </b>
          </div>
        </div>
      </header>

      <aside className="dash-side">
        <h2>{t('client.overview.addFiles')}</h2>
        <DropZone />
        <h2>{t('client.overview.server')}</h2>
        <ConnectionCard testId="connection-panel" />
      </aside>

      <section className="dash-main">
        <div className="dash-cols">
          <div className="dash-card">
            <div className="dash-kp">
              <div>
                <small>{t('client.overview.measurements')}</small>
                <b className="num">{int(rows.length)}</b>
              </div>
              <div className="mut">
                <small>{t('client.overview.critical')}</small>
                <b className="num">{int(critical.length)}</b>
              </div>
            </div>
            <WeekChart rows={rows} />
          </div>
          <div className="dash-pastel">
            {best ? (
              <Link to={`/results/${best.id}?full`} className="pc lav">
                <small>{t('client.overview.best')}</small>
                <b>
                  {best.headType} · SN {best.headSerial}
                  <br />
                  Cpk {num(best.cpkXY, 2)}
                </b>
              </Link>
            ) : (
              <div className="pc lav">
                <small>{t('client.overview.best')}</small>
                <b>–</b>
              </div>
            )}
            <button
              type="button"
              className="pc peach"
              aria-pressed={chip === 'critical'}
              onClick={() => setChip(chip === 'critical' ? '' : 'critical')}
            >
              <small>{t('client.overview.attention')}</small>
              <b>{t('client.overview.below', { n: critical.length, v: num(th.warning, 2) })}</b>
            </button>
          </div>
        </div>
        <div className="section-h">
          <h2>{t('client.overview.latest')}</h2>
          <Link to="/results" className="btn ghost">
            {t('client.overview.all')} <Icon name="arrowRight" size={16} />
          </Link>
        </div>
        {shown.length === 0 ? (
          <Empty title={t('client.overview.empty')}>
            <p>{t('client.empty.text')}</p>
          </Empty>
        ) : (
          <div className="rows">
            {shown.map((r) => (
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
      </section>
    </div>
  );
}

function TouchOverview() {
  const { t, date } = useI18n();
  const [s] = useEngine();
  const { week, monday, sunday } = isoWeek(new Date());
  const rows = useMemo(
    () =>
      s.rows
        // Tested this calendar week (the test date is local machine time, `YYYY-MM-DD HH:mm:ss`).
        .filter((r) => r.testDate.slice(0, 10) >= iso(monday) && r.testDate.slice(0, 10) <= iso(sunday))
        .sort((a, b) => b.testDate.localeCompare(a.testDate) || b.id - a.id),
    [s.rows, monday, sunday],
  );
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
