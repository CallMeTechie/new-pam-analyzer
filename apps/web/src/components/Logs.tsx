import { useCallback, useEffect, useMemo, useState } from 'react';
import { type MessageKey, useI18n } from '../i18n';
import { type ApiError, api, type Company, qs } from '../lib/api';
import { useApi } from '../lib/useApi';
import { Icon } from './Icon';
import { ErrorNotice, InfoTip, Loading } from './ui';

type Level = 'crash' | 'error' | 'warning' | 'info' | 'report';
type Source = 'server' | 'windows' | 'android' | 'other';

interface LogRow {
  id: number;
  level: Level;
  source: Source;
  category: string;
  message: string;
  count: number;
  occurredAt: string;
  lastAt: string;
  appVersion: string | null;
  deviceId: number | null;
  deviceName: string | null;
  system: string | null;
  companyId: number | null;
  companyName: string | null;
  userId: number | null;
  userName: string | null;
  hasDetails: boolean;
  hasHistory: boolean;
}

interface LogDetail extends LogRow {
  details: string | null;
  history: string | null;
  context: Record<string, unknown> | null;
  same: { count: number; devices: number };
}

interface Monitoring {
  server: { version: string; startedAt: string; uptimeSeconds: number };
  storage: { databaseBytes: number; freeBytes: number | null; totalBytes: number | null };
  uploads: { created: number; rejected: number };
  problems: { errors: number; warnings: number; reports: number; server: number; apps: number };
  devices: { connected: number; active: number; versions: { version: string; n: number }[] };
  queues: { files: number; devices: number };
  mail: { configured: boolean; lastFailureAt: string | null };
  retentionDays: number;
}

/** The level chips: errors include crashes. */
const LEVEL_GROUPS: { key: string; levels: Level[]; label: MessageKey }[] = [
  { key: 'errors', levels: ['crash', 'error'], label: 'logs.level.errors' },
  { key: 'warnings', levels: ['warning'], label: 'logs.level.warnings' },
  { key: 'reports', levels: ['report'], label: 'logs.level.reports' },
  { key: 'info', levels: ['info'], label: 'logs.level.info' },
];
const SOURCES = ['', 'server', 'windows', 'android'] as const;
const PERIODS = { day: 1, week: 7, month: 30, all: 0 } as const;
type Period = keyof typeof PERIODS;
const PAGE = 100;

function bytes(n: number, num: (v: number, d?: number) => string): string {
  if (n >= 1024 ** 3) return `${num(n / 1024 ** 3, 1)} GB`;
  if (n >= 1024 ** 2) return `${num(n / 1024 ** 2, 0)} MB`;
  return `${num(n / 1024, 0)} KB`;
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** Status of the server and the apps; refreshes every 30 seconds. */
function MonitoringTiles() {
  const { t, int, num, relative } = useI18n();
  const { data, error, reload } = useApi<Monitoring>('/monitoring');
  const now = useNow(30_000);
  useEffect(() => {
    if (now) reload();
  }, [now, reload]);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  const days = Math.floor(data.server.uptimeSeconds / 86_400);
  const hours = Math.floor((data.server.uptimeSeconds % 86_400) / 3600);
  const [top, ...older] = data.devices.versions;
  const olderCount = older.reduce((s, v) => s + v.n, 0);
  const mailState = !data.mail.configured
    ? 'off'
    : data.mail.lastFailureAt && Date.now() - new Date(data.mail.lastFailureAt).getTime() < 86_400_000
      ? 'failed'
      : 'ok';
  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="card-h" style={{ marginBottom: 0 }}>
        <h2 className="title-with-info" style={{ margin: 0 }}>
          {t('logs.monitoring')}
          <InfoTip text={t('logs.monitoringInfo')} />
        </h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {t('logs.refreshes')}
        </span>
      </div>
      <div className="mon-grid" data-testid="monitoring">
        <div className="mon-tile">
          <span>{t('logs.tile.server')}</span>
          <b>
            <i className="dot ok" />
            {t('logs.running')}
          </b>
          <small>
            {t('logs.uptime', { days, hours })} · v{data.server.version}
          </small>
        </div>
        <div className="mon-tile">
          <span>{t('logs.tile.storage')}</span>
          <b>{t('logs.database', { size: bytes(data.storage.databaseBytes, num) })}</b>
          <small>
            {data.storage.freeBytes === null ? '–' : t('logs.free', { size: bytes(data.storage.freeBytes, num) })}
          </small>
        </div>
        <div className="mon-tile">
          <span>{t('logs.tile.uploads')}</span>
          <b>{int(data.uploads.created)}</b>
          <small>{t('logs.notReadable', { n: data.uploads.rejected })}</small>
        </div>
        <div className={`mon-tile${data.problems.errors ? ' alert' : ''}`}>
          <span>{t('logs.tile.errors')}</span>
          <b className={data.problems.errors ? 'crit' : ''}>{int(data.problems.errors)}</b>
          <small>
            {t('logs.errorsSplit', { server: data.problems.server, apps: data.problems.apps })} ·{' '}
            {t('logs.warningsCount', { n: data.problems.warnings })}
          </small>
        </div>
        <div className="mon-tile">
          <span>{t('logs.tile.devices')}</span>
          <b>{int(data.devices.connected)}</b>
          <small>{t('logs.active', { n: data.devices.active })}</small>
        </div>
        <div className="mon-tile">
          <span>{t('logs.tile.versions')}</span>
          <b>{top ? `${top.version} · ${int(top.n)}×` : '–'}</b>
          <small>{olderCount ? t('logs.olderVersions', { n: olderCount }) : t('logs.allSame')}</small>
        </div>
        <div className="mon-tile">
          <span>{t('logs.tile.mail')}</span>
          <b>
            <i className={`dot ${mailState === 'ok' ? 'ok' : mailState === 'failed' ? 'crit' : 'off'}`} />
            {t(`logs.mail.${mailState}`)}
          </b>
          <small>
            {data.mail.lastFailureAt ? t('logs.mailFailed', { when: relative(data.mail.lastFailureAt) }) : '–'}
          </small>
        </div>
        <div className="mon-tile">
          <span>{t('logs.tile.queues')}</span>
          <b>{t('logs.files', { n: data.queues.files })}</b>
          <small>{t('logs.onDevices', { n: data.queues.devices })}</small>
        </div>
      </div>
    </section>
  );
}

function sourceLabel(t: ReturnType<typeof useI18n>['t'], r: { source: Source; appVersion: string | null }) {
  return r.source === 'server'
    ? t('logs.source.server')
    : `${t(`logs.source.${r.source}`)}${r.appVersion ? ` ${r.appVersion}` : ''}`;
}

/** One entry, opened: facts, stack trace, the app's log before the event, actions. */
function Detail({ id, onDeleted, onDevice }: { id: number; onDeleted(): void; onDevice(id: number): void }) {
  const { t, locale } = useI18n();
  const { data, error } = useApi<{ entry: LogDetail }>(`/logs/${id}`);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  const e = data.entry;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' });
  const text = [
    `${e.level.toUpperCase()} · ${sourceLabel(t, e)} · ${e.category}`,
    e.message,
    `${t('logs.f.occurred')}: ${when.format(new Date(e.occurredAt))}${e.count > 1 ? ` (${e.count}×, ${t('logs.f.last')} ${when.format(new Date(e.lastAt))})` : ''}`,
    e.deviceName ? `${t('logs.f.device')}: ${e.deviceName}` : '',
    e.system ? `${t('logs.f.system')}: ${e.system}` : '',
    e.companyName ? `${t('logs.f.company')}: ${e.companyName}` : '',
    e.userName ? `${t('logs.f.user')}: ${e.userName}` : '',
    e.context ? `${t('logs.f.context')}: ${JSON.stringify(e.context)}` : '',
    e.details ? `\n${e.details}` : '',
    e.history ? `\n${t('logs.history')}:\n${e.history}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pam-analyzer-log-${e.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="log-detail" data-testid="log-detail">
      <div className="stack" style={{ gap: 10, minWidth: 0 }}>
        <dl className="log-facts">
          <dt>{t('logs.f.category')}</dt>
          <dd className="mono">{e.category}</dd>
          {e.companyName && (
            <>
              <dt>{t('logs.f.company')}</dt>
              <dd>{e.companyName}</dd>
            </>
          )}
          {e.system && (
            <>
              <dt>{t('logs.f.system')}</dt>
              <dd>{e.system}</dd>
            </>
          )}
          <dt>{t('logs.f.occurred')}</dt>
          <dd>
            {when.format(new Date(e.occurredAt))}
            {e.count > 1 && ` · ${t('logs.f.repeated', { n: e.count, last: when.format(new Date(e.lastAt)) })}`}
          </dd>
          <dt>{t('logs.f.same')}</dt>
          <dd>{t('logs.f.sameValue', { n: e.same.count, devices: e.same.devices })}</dd>
          {e.context && (
            <>
              <dt>{t('logs.f.context')}</dt>
              <dd className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
                {JSON.stringify(e.context)}
              </dd>
            </>
          )}
        </dl>
        {e.details && <pre className="log-pre dark">{e.details}</pre>}
      </div>
      <div className="stack" style={{ gap: 10, minWidth: 0 }}>
        {e.history && (
          <>
            <b style={{ fontSize: 13 }}>{t('logs.history')}</b>
            <pre className="log-pre">{e.history}</pre>
          </>
        )}
        <div className="form-row">
          <button type="button" className="btn small" onClick={() => void navigator.clipboard?.writeText(text)}>
            {t('logs.copy')}
          </button>
          <button type="button" className="btn small" onClick={download}>
            {t('logs.download')}
          </button>
          {e.deviceId && (
            <button type="button" className="btn small" onClick={() => onDevice(e.deviceId as number)}>
              {t('logs.allOfDevice')}
            </button>
          )}
          <button
            type="button"
            className="btn small danger"
            onClick={async () => {
              await api.delete(`/logs/${e.id}`);
              onDeleted();
            }}
          >
            {t('common.remove')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Settings → Logs & Monitoring: status tiles and the protocol of the server and the apps. */
export function LogsMonitoring() {
  const { t, locale, int } = useI18n();
  const companies = useApi<{ items: Company[] }>('/companies');
  const [source, setSource] = useState<(typeof SOURCES)[number]>('');
  const [groups, setGroups] = useState<string[]>(['errors', 'warnings', 'reports']);
  const [period, setPeriod] = useState<Period>('week');
  const [companyId, setCompanyId] = useState('');
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [live, setLive] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [items, setItems] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [retention, setRetention] = useState(30);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<ApiError | null>(null);
  const [loaded, setLoaded] = useState(false);
  const now = useNow(10_000);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const filter = useMemo(() => {
    const days = PERIODS[period];
    return {
      source: source || undefined,
      level: LEVEL_GROUPS.filter((g) => groups.includes(g.key))
        .flatMap((g) => g.levels)
        .join(','),
      from: days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined,
      companyId: companyId || undefined,
      deviceId: deviceId ?? undefined,
      q: term || undefined,
    };
  }, [source, groups, period, companyId, deviceId, term]);

  const load = useCallback(async () => {
    if (!filter.level) {
      // No level chosen: nothing to show.
      setItems([]);
      setTotal(0);
      setLoaded(true);
      return;
    }
    try {
      const res = await api.get<{
        items: LogRow[];
        total: number;
        levels: Record<string, number>;
        retentionDays: number;
      }>(`/logs${qs({ ...filter, pageSize: PAGE * pages })}`);
      setItems(res.items);
      setTotal(res.total);
      setLevels(res.levels);
      setRetention(res.retentionDays);
      setError(null);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoaded(true);
    }
  }, [filter, pages]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (live && now) void load();
  }, [live, now, load]);

  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' });
  const groupCount = (key: string) =>
    (LEVEL_GROUPS.find((g) => g.key === key)?.levels ?? []).reduce((s, l) => s + (levels[l] ?? 0), 0);
  const exportUrl = `/api/logs/export${qs({ ...filter, level: filter.level || undefined })}`;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <MonitoringTiles />
      <section className="card stack" style={{ gap: 16 }}>
        <div className="card-h" style={{ marginBottom: 0 }}>
          <h2 className="title-with-info" style={{ margin: 0 }}>
            {t('logs.protocol')}
            <InfoTip text={t('logs.protocolInfo')} />
          </h2>
          <div className="form-row">
            <label className="check">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              {t('logs.live')}
            </label>
            <a className="btn small" href={exportUrl} download>
              <Icon name="download" size={15} />
              {t('logs.export')}
            </a>
          </div>
        </div>

        <div className="toolbar log-filters">
          <div className="seg" role="radiogroup" aria-label={t('logs.source')}>
            {SOURCES.map((s) => (
              <button
                key={s || 'all'}
                type="button"
                role="radio"
                aria-checked={source === s}
                onClick={() => setSource(s)}
              >
                {s ? t(`logs.source.${s}`) : t('logs.all')}
              </button>
            ))}
          </div>
          <div className="log-chips" role="group" aria-label={t('logs.level')}>
            {LEVEL_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`log-chip ${g.key}${groups.includes(g.key) ? ' on' : ''}`}
                aria-pressed={groups.includes(g.key)}
                onClick={() =>
                  setGroups((list) => (list.includes(g.key) ? list.filter((k) => k !== g.key) : [...list, g.key]))
                }
              >
                {t(g.label)} {int(groupCount(g.key))}
              </button>
            ))}
          </div>
          <select
            className="select"
            aria-label={t('logs.period')}
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <option key={p} value={p}>
                {t(`logs.period.${p}`)}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label={t('logs.f.company')}
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">{t('logs.allCompanies')}</option>
            {companies.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="search"
            aria-label={t('logs.search')}
            placeholder={t('logs.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: '1 1 220px', minWidth: 0 }}
          />
        </div>
        {deviceId !== null && (
          <div className="form-row">
            <span className="pill plain">
              {t('logs.onlyDevice', { name: items.find((i) => i.deviceId === deviceId)?.deviceName ?? `#${deviceId}` })}
            </span>
            <button type="button" className="linkbtn" onClick={() => setDeviceId(null)}>
              {t('logs.showAll')}
            </button>
          </div>
        )}

        {error && <ErrorNotice error={error} />}
        {!loaded && <Loading />}
        {loaded && items.length === 0 && !error && <p className="muted">{t('logs.none')}</p>}
        {items.length > 0 && (
          <div className="log-table" data-testid="log-table">
            <div className="log-row head">
              <span>{t('logs.f.time')}</span>
              <span>{t('logs.level')}</span>
              <span>{t('logs.source')}</span>
              <span>{t('logs.f.who')}</span>
              <span>{t('logs.f.message')}</span>
            </div>
            {items.map((r) => (
              <div key={r.id} className={`log-entry${open === r.id ? ' open' : ''}`}>
                <button
                  type="button"
                  className="log-row"
                  aria-expanded={open === r.id}
                  onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
                >
                  <span>{when.format(new Date(r.lastAt))}</span>
                  <span>
                    <span className={`log-level ${r.level}`}>{t(`logs.lvl.${r.level}`)}</span>
                  </span>
                  <span>{sourceLabel(t, r)}</span>
                  <span className="who">
                    {[r.deviceName, r.userName, r.companyName].filter(Boolean).join(' · ') || '–'}
                  </span>
                  <span className="msg">
                    {r.message}
                    {r.count > 1 && <span className="log-count">{int(r.count)}×</span>}
                  </span>
                </button>
                {open === r.id && (
                  <Detail
                    id={r.id}
                    onDeleted={() => {
                      setOpen(null);
                      void load();
                    }}
                    onDevice={(id) => {
                      setOpen(null);
                      setDeviceId(id);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {items.length < total && (
          <div>
            <button type="button" className="btn" onClick={() => setPages((p) => p + 1)}>
              {t('logs.more', { n: total - items.length })}
            </button>
          </div>
        )}
        <div className="card-h" style={{ marginBottom: 0 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {t('logs.retention', { days: retention })}
          </span>
          <button
            type="button"
            className="btn small danger"
            onClick={async () => {
              if (!window.confirm(t('logs.clearConfirm'))) return;
              await api.delete('/logs');
              setOpen(null);
              void load();
            }}
          >
            {t('logs.clear')}
          </button>
        </div>
      </section>
    </div>
  );
}
