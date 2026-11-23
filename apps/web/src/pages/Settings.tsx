import { type CoefficientConfig, CPK_THRESHOLDS, type CpkThresholds, validThresholds } from '@pam/core';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import changelogDe from '../../../../CHANGELOG.de.md?raw';
import changelogEn from '../../../../CHANGELOG.md?raw';
import manualDe from '../../../../docs/manual/de.md?raw';
import manualEn from '../../../../docs/manual/en.md?raw';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { Markdown } from '../components/Markdown';
import { ErrorNotice, InfoTip, Loading, Notice } from '../components/ui';
import { CATALOGS, type MessageKey, useI18n } from '../i18n';
import { en } from '../i18n/en';
import { type ApiError, api } from '../lib/api';
import { setThresholds } from '../lib/thresholds';
import { useApi } from '../lib/useApi';

type Tab = 'coefficients' | 'rating' | 'languages' | 'security' | 'crashes' | 'manual' | 'version';
const TABS: Tab[] = ['coefficients', 'rating', 'languages', 'security', 'crashes', 'manual', 'version'];

/* ------------------------------ Coefficients ------------------------------ */

interface CoefficientsResponse {
  version: string;
  config: CoefficientConfig;
  defaults: CoefficientConfig;
}

type Row = { key: string; coefficient: string; parts: string };

const num = (v: string): number | null => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
};

/** Head types (without DX) and DX tools as editable rows: coefficient and expected components side by side. */
function toRows(config: CoefficientConfig) {
  const heads = new Set([...Object.keys(config.cpkCoefficients), ...Object.keys(config.placementCounts)]);
  heads.delete('DX');
  const sort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return {
    heads: [...heads].sort(sort).map((key) => {
      const parts = config.placementCounts[key];
      return {
        key,
        coefficient: config.cpkCoefficients[key] === undefined ? '' : String(config.cpkCoefficients[key]),
        parts: typeof parts === 'number' ? String(parts) : '',
      };
    }),
    tools: [...new Set([...Object.keys(config.dynaheadTools), ...Object.keys(config.dynaheadToolPlacements)])]
      .sort(sort)
      .map((key) => ({
        key,
        coefficient: config.dynaheadTools[key] === undefined ? '' : String(config.dynaheadTools[key]),
        parts: config.dynaheadToolPlacements[key] === undefined ? '' : String(config.dynaheadToolPlacements[key]),
      })),
  };
}

function toConfig(
  heads: Row[],
  tools: Row[],
  defaultCoefficient: string,
  base: CoefficientConfig,
): CoefficientConfig | null {
  const config: CoefficientConfig = {
    cpkCoefficients: {},
    dynaheadTools: {},
    // DX keeps its "tool dependent" marker; it is not edited in the table.
    placementCounts: 'DX' in base.placementCounts ? { DX: base.placementCounts.DX ?? null } : {},
    dynaheadToolPlacements: {},
    defaultCoefficient: num(defaultCoefficient) ?? Number.NaN,
  };
  for (const r of heads) {
    const c = num(r.coefficient);
    const p = num(r.parts);
    if (r.coefficient.trim() !== '') {
      if (c === null || c <= 0 || c > 1000) return null;
      config.cpkCoefficients[r.key] = c;
    }
    if (r.parts.trim() !== '') {
      if (p === null || p <= 0 || !Number.isInteger(p)) return null;
      config.placementCounts[r.key] = p;
    }
  }
  for (const r of tools) {
    const c = num(r.coefficient);
    const p = num(r.parts);
    if (r.coefficient.trim() !== '') {
      if (c === null || c <= 0 || c > 1000) return null;
      config.dynaheadTools[r.key] = c;
    }
    if (r.parts.trim() !== '') {
      if (p === null || p <= 0 || !Number.isInteger(p)) return null;
      config.dynaheadToolPlacements[r.key] = p;
    }
  }
  const d = config.defaultCoefficient;
  return Number.isFinite(d) && d > 0 && d <= 1000 ? config : null;
}

function RowsTable({
  rows,
  onChange,
  typeLabel,
  filter = '',
}: {
  rows: Row[];
  onChange(rows: Row[]): void;
  typeLabel: string;
  filter?: string;
}) {
  const { t } = useI18n();
  const set = (key: string, patch: Partial<Row>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const shown = rows.filter((r) => r.key.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <table className="table compact">
      <thead>
        <tr>
          <th>{typeLabel}</th>
          <th className="num">{t('settings.coefficientCol')}</th>
          <th className="num">{t('settings.partsCol')}</th>
          <th aria-label={t('common.remove')} />
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => (
          <tr key={r.key}>
            <td className="mono" style={{ fontWeight: 600 }}>
              {r.key}
            </td>
            <td className="num">
              <input
                className="input mono cell-input"
                inputMode="decimal"
                value={r.coefficient}
                placeholder="–"
                aria-label={`${r.key} ${t('settings.coefficientCol')}`}
                onChange={(e) => set(r.key, { coefficient: e.target.value })}
              />
            </td>
            <td className="num">
              <input
                className="input mono cell-input"
                inputMode="numeric"
                value={r.parts}
                placeholder="–"
                aria-label={`${r.key} ${t('settings.partsCol')}`}
                onChange={(e) => set(r.key, { parts: e.target.value })}
              />
            </td>
            <td className="actions">
              <button
                type="button"
                className="btn small ghost danger icon"
                aria-label={`${t('common.remove')} ${r.key}`}
                title={t('common.remove')}
                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
              >
                <Icon name="trash" size={14} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AddRow({ existing, onAdd, placeholder }: { existing: Row[]; onAdd(key: string): void; placeholder: string }) {
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const clean = key.trim().toUpperCase();
  const taken = existing.some((r) => r.key === clean);
  return (
    <form
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!clean || taken) return;
        onAdd(clean);
        setKey('');
      }}
    >
      <input
        className="input mono"
        value={key}
        maxLength={24}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setKey(e.target.value)}
      />
      <button type="submit" className="btn small" disabled={!clean || taken}>
        <Icon name="plus" size={14} />
        {t('common.add')}
      </button>
    </form>
  );
}

function Coefficients() {
  const { t, instant } = useI18n();
  const { data, error, reload } = useApi<CoefficientsResponse>('/settings/coefficients');
  const [heads, setHeads] = useState<Row[]>([]);
  const [tools, setTools] = useState<Row[]>([]);
  const [defaultCoef, setDefaultCoef] = useState('');
  const [filter, setFilter] = useState('');
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  const load = (config: CoefficientConfig) => {
    const r = toRows(config);
    setHeads(r.heads);
    setTools(r.tools);
    setDefaultCoef(String(config.defaultCoefficient));
  };
  useEffect(() => {
    if (data) load(data.config);
  }, [data]);

  const draft = useMemo(
    () => (data ? toConfig(heads, tools, defaultCoef, data.config) : null),
    [heads, tools, defaultCoef, data],
  );
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  const dirty = draft === null || JSON.stringify(draft) !== JSON.stringify(data.config);
  const touch =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setSaved(false);
    };

  async function save() {
    if (!draft) return;
    setSaveError(null);
    try {
      await api.put('/settings/coefficients', draft);
      setSaved(true);
      reload();
    } catch (err) {
      setSaveError(err as ApiError);
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {saved && <Notice kind="success" title={t('settings.savedVersion')} />}
      {saveError && <ErrorNotice error={saveError} />}
      <div className="coef-layout">
        <section className="card flat">
          <div className="card-bar">
            <h2 className="title-with-info">
              {t('settings.headTypes')}
              <InfoTip text={t('settings.headTypesHint')} />
            </h2>
            <input
              className="input"
              type="search"
              value={filter}
              placeholder={t('settings.filterTypes')}
              aria-label={t('settings.filterTypes')}
              onChange={(e) => setFilter(e.target.value)}
              style={{ maxWidth: 200, minHeight: 36 }}
            />
          </div>
          <div className="table-wrap coef-scroll">
            <RowsTable rows={heads} onChange={touch(setHeads)} typeLabel={t('settings.type')} filter={filter} />
          </div>
          <AddRow
            existing={heads}
            placeholder={t('settings.newType')}
            onAdd={(key) => touch(setHeads)([...heads, { key, coefficient: '', parts: '' }])}
          />
        </section>
        <div className="stack" style={{ gap: 16 }}>
          <section className="card flat">
            <div className="card-bar">
              <h2 className="title-with-info">
                {t('settings.dx')}
                <InfoTip text={t('settings.dxHint')} />
              </h2>
            </div>
            <RowsTable rows={tools} onChange={touch(setTools)} typeLabel={t('settings.tool')} />
            <AddRow
              existing={tools}
              placeholder={t('settings.newTool')}
              onAdd={(key) => touch(setTools)([...tools, { key, coefficient: '', parts: '' }])}
            />
          </section>
          <section className="card">
            <div className="field">
              <span className="title-with-info">
                <label htmlFor="default-coefficient">{t('settings.default')}</label>
                <InfoTip text={t('settings.defaultHint')} />
              </span>
              <input
                id="default-coefficient"
                className="input mono"
                inputMode="decimal"
                value={defaultCoef}
                onChange={(e) => touch(setDefaultCoef)(e.target.value)}
                style={{ maxWidth: 140 }}
              />
            </div>
          </section>
          <section className="card" style={{ fontSize: 14 }}>
            <span className="title-with-info muted">
              {t('settings.versionTitle', {
                v: data.version === 'default' ? t('footer.configDefault') : instant(data.version),
              })}
              <InfoTip text={t('settings.versionText')} />
            </span>
          </section>
        </div>
      </div>
      <div className="save-bar">
        <button type="button" className="btn primary" disabled={!dirty || !draft} onClick={() => void save()}>
          {t('settings.saveVersion')}
        </button>
        <button type="button" className="btn" disabled={!dirty} onClick={() => load(data.config)}>
          {t('common.discard')}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            load(data.defaults);
            setSaved(false);
          }}
        >
          {t('settings.restoreDefaults')}
        </button>
        {!draft && <span className="error-text">{t('settings.invalid')}</span>}
      </div>
    </div>
  );
}

/* ------------------------------ Rating ------------------------------ */

function Rating() {
  const { t, num: fmt } = useI18n();
  const { data, error, reload } = useApi<CpkThresholds & { defaults: CpkThresholds }>('/settings/rating');
  const [values, setValues] = useState({ warning: '', good: '', excellent: '' });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  useEffect(() => {
    if (data) setValues({ warning: String(data.warning), good: String(data.good), excellent: String(data.excellent) });
  }, [data]);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  const parsed = {
    warning: num(values.warning) ?? 0,
    good: num(values.good) ?? 0,
    excellent: num(values.excellent) ?? 0,
  };
  const valid = validThresholds(parsed);
  const dirty = parsed.warning !== data.warning || parsed.good !== data.good || parsed.excellent !== data.excellent;
  const scaleMax = Math.max(2.5, parsed.excellent + 0.5);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / scaleMax) * 100))}%`;
  const levels = [
    ['critical', 0, parsed.warning],
    ['warning', parsed.warning, parsed.good],
    ['good', parsed.good, parsed.excellent],
    ['excellent', parsed.excellent, scaleMax],
  ] as const;

  async function save() {
    setSaveError(null);
    try {
      const res = await api.put<CpkThresholds>('/settings/rating', parsed);
      setThresholds(res);
      setSaved(true);
      reload();
    } catch (err) {
      setSaveError(err as ApiError);
    }
  }

  return (
    <section className="card stack" style={{ gap: 18, maxWidth: 760 }}>
      <div className="card-h" style={{ marginBottom: 0 }}>
        <h2 className="title-with-info">
          {t('settings.tab.rating')}
          <InfoTip text={t('settings.ratingText')} />
        </h2>
      </div>
      {saved && <Notice kind="success" title={t('settings.ratingSaved')} />}
      {saveError && <ErrorNotice error={saveError} />}
      <div className="rating-scale" aria-hidden="true">
        {valid &&
          levels.map(([r, from, to]) => (
            <span key={r} className={`r-${r}`} style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }}>
              {t(`rating.${r}`)}
            </span>
          ))}
      </div>
      <div className="form-row">
        {(['warning', 'good', 'excellent'] as const).map((k) => (
          <label key={k} className="field" style={{ flex: '1 1 160px' }}>
            <span>
              <span className={`pill small r-${k}`}>{t(`rating.${k}`)}</span> {t('settings.from')}
            </span>
            <input
              className="input mono"
              inputMode="decimal"
              value={values[k]}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setValues({ ...values, [k]: e.target.value });
                setSaved(false);
              }}
            />
          </label>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        {t('settings.ratingCritical', { v: fmt(parsed.warning, 2) })}
      </p>
      <div className="form-row">
        <button type="button" className="btn primary" disabled={!valid || !dirty} onClick={() => void save()}>
          {t('settings.ratingSave')}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const d = data.defaults ?? CPK_THRESHOLDS;
            setValues({ warning: String(d.warning), good: String(d.good), excellent: String(d.excellent) });
          }}
        >
          {t('settings.restoreDefaults')}
        </button>
        {!valid && <span className="error-text">{t('settings.ratingInvalid')}</span>}
      </div>
    </section>
  );
}

/* ------------------------------ Languages ------------------------------ */

const placeholders = (m: unknown) => [...new Set(JSON.stringify(m ?? '').match(/\{\w+\}/g) ?? [])].sort().join(',');

interface ImportCheck {
  code: string;
  name: string;
  messages: Record<string, unknown>;
  missing: number;
  unknown: number;
  placeholderErrors: string[];
}

function checkCatalog(raw: unknown): ImportCheck | string {
  if (!raw || typeof raw !== 'object') return 'format';
  const { code, name, messages } = raw as { code?: unknown; name?: unknown; messages?: unknown };
  if (typeof code !== 'string' || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(code)) return 'code';
  if (typeof name !== 'string' || !name.trim()) return 'name';
  if (!messages || typeof messages !== 'object') return 'format';
  const msgs = messages as Record<string, unknown>;
  const known = Object.keys(en) as MessageKey[];
  const placeholderErrors = known.filter((k) => k in msgs && placeholders(msgs[k]) !== placeholders(en[k]));
  return {
    code,
    name: name.trim(),
    messages: msgs,
    missing: known.filter((k) => !(k in msgs)).length,
    unknown: Object.keys(msgs).filter((k) => !(k in en)).length,
    placeholderErrors,
  };
}

function download(filename: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Languages() {
  const i18n = useI18n();
  const { t } = i18n;
  const file = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const imported = useApi<{ catalogs: { code: string; name: string; updatedAt: string }[] }>('/i18n');

  function exportCatalog(code: string) {
    const entry = CATALOGS[code];
    if (!entry) return;
    // Export complete: texts the catalog lacks are filled with English, ready for translation.
    const messages = Object.fromEntries((Object.keys(en) as MessageKey[]).map((k) => [k, entry.messages[k] ?? en[k]]));
    download(`pam-analyzer-${code}.json`, { code, name: entry.name, messages });
  }

  async function onFile(f: File) {
    setDone(null);
    setError(null);
    setProblem(null);
    try {
      const result = checkCatalog(JSON.parse(await f.text()));
      if (typeof result === 'string') setProblem(t(`languages.problem.${result}` as MessageKey));
      else setCheck(result);
    } catch {
      setProblem(t('languages.problem.format'));
    }
  }

  async function confirmImport() {
    if (!check) return;
    try {
      await api.put(`/i18n/${check.code}`, { name: check.name, messages: check.messages });
      setDone(t('languages.imported', { name: check.name }));
      setCheck(null);
      imported.reload();
      await i18n.reloadCatalogs?.();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  const importedCodes = new Set(imported.data?.catalogs.map((c) => c.code) ?? []);
  return (
    <section className="card stack" style={{ gap: 16, maxWidth: 860 }}>
      <div className="card-h" style={{ marginBottom: 0 }}>
        <h2 className="title-with-info">
          {t('settings.tab.languages')}
          <InfoTip text={t('settings.languagesText')} />
        </h2>
        <div className="form-row">
          <button type="button" className="btn" onClick={() => exportCatalog('en')}>
            <Icon name="download" size={16} />
            {t('languages.template')}
          </button>
          <button type="button" className="btn primary" onClick={() => file.current?.click()}>
            <Icon name="upload" size={16} />
            {t('languages.import')}
          </button>
        </div>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      {done && <Notice kind="success" title={done} />}
      {problem && <Notice kind="error" title={problem} />}
      {error && <ErrorNotice error={error} />}
      {check && (
        <div className="card dashed stack" style={{ gap: 10 }}>
          <b>{t('languages.check', { name: check.name, code: check.code })}</b>
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            <li>{t('languages.missing', { n: check.missing })}</li>
            {check.unknown > 0 && <li>{t('languages.unknown', { n: check.unknown })}</li>}
            {check.placeholderErrors.length > 0 && (
              <li className="error-text">
                {t('languages.placeholders', { n: check.placeholderErrors.length })}:{' '}
                {check.placeholderErrors.slice(0, 5).join(', ')}
              </li>
            )}
          </ul>
          <div className="form-row">
            <button
              type="button"
              className="btn primary"
              disabled={check.placeholderErrors.length > 0}
              onClick={() => void confirmImport()}
            >
              {CATALOGS[check.code] ? t('languages.replace') : t('languages.add')}
            </button>
            <button type="button" className="btn" onClick={() => setCheck(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <div className="stack tight">
        {Object.entries(CATALOGS).map(([code, c]) => (
          <div key={code} className="device">
            <b style={{ flex: 1 }}>{c.name}</b>
            <span className="mono muted">{code}</span>
            {code === 'en' && <span className="pill small dark">{t('settings.mainLanguage')}</span>}
            {importedCodes.has(code) && <span className="pill small plain">{t('languages.importedBadge')}</span>}
            <button type="button" className="btn small" onClick={() => exportCatalog(code)}>
              <Icon name="download" size={14} />
              {t('languages.export')}
            </button>
            {importedCodes.has(code) && (
              <button
                type="button"
                className="btn small danger"
                onClick={async () => {
                  if (!window.confirm(t('languages.deleteConfirm', { name: c.name }))) return;
                  await api.delete(`/i18n/${code}`);
                  imported.reload();
                  await i18n.reloadCatalogs?.();
                }}
              >
                {c.builtin ? t('languages.reset') : t('common.remove')}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Security ------------------------------ */

function Security() {
  const { t } = useI18n();
  const { data, error, reload } = useApi<{ defaultMaxConnections: number }>('/settings/general');
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data) setValue(String(data.defaultMaxConnections));
  }, [data]);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  return (
    <section className="card stack" style={{ maxWidth: 760 }}>
      <div className="card-h" style={{ marginBottom: 0 }}>
        <h2 className="title-with-info">
          {t('settings.tab.security')}
          <InfoTip text={t('settings.securityText')} />
        </h2>
      </div>
      {saved && <Notice kind="success" title={t('common.saved')} />}
      <div className="form-row">
        <label className="field" style={{ flex: '0 1 280px' }}>
          {t('settings.defaultMaxConn')}
          <input
            className="input mono"
            type="number"
            min={1}
            max={1000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={Number(value) < 1 || Number(value) === data.defaultMaxConnections}
          onClick={async () => {
            await api.put('/settings/general', { defaultMaxConnections: Number(value) });
            setSaved(true);
            reload();
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------ Crash reports ------------------------------ */

interface CrashReportRow {
  id: number;
  platform: string;
  appVersion: string | null;
  deviceName: string | null;
  system: string | null;
  kind: string;
  message: string;
  report: string;
  occurredAt: string;
  companyName: string | null;
}

/** Crashes of the Windows and Android apps; the apps send them once they are connected. */
function CrashReports() {
  const { t, locale, int } = useI18n();
  const { data, error, reload } = useApi<{ items: CrashReportRow[]; total: number }>('/crash-reports?pageSize=100');
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' });
  return (
    <section className="card stack" style={{ maxWidth: 1000 }}>
      <div className="card-h" style={{ marginBottom: 0 }}>
        <h2 className="title-with-info">
          {t('settings.tab.crashes')}
          <InfoTip text={t('crashes.info')} />
        </h2>
        <span className="muted">{t('crashes.count', { n: data.total, total: int(data.total) })}</span>
      </div>
      {data.items.length === 0 && <p className="muted">{t('crashes.none')}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {data.items.map((r) => (
          <details key={r.id} className="crash">
            <summary>
              <b className="mono">{r.message}</b>
              <span className="muted">
                {when.format(new Date(r.occurredAt))} · {r.platform} {r.appVersion ?? ''} · {r.deviceName ?? '–'}
                {r.companyName ? ` · ${r.companyName}` : ''}
              </span>
            </summary>
            {r.system && <p className="muted">{r.system}</p>}
            <pre className="crash-report">{r.report}</pre>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn small" onClick={() => void navigator.clipboard?.writeText(r.report)}>
                {t('crashes.copy')}
              </button>
              <button
                type="button"
                className="btn small danger"
                onClick={async () => {
                  await api.delete(`/crash-reports/${r.id}`);
                  reload();
                }}
              >
                {t('common.remove')}
              </button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Manual and version ------------------------------ */

function Manual() {
  const { locale } = useI18n();
  return (
    <section className="card">
      <Markdown source={locale === 'de' ? manualDe : manualEn} />
    </section>
  );
}

function Version() {
  const { t, locale } = useI18n();
  const server = useApi<{ version: string; algorithmVersion: string }>('/version');
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stat-row" style={{ maxWidth: 760 }}>
        <div className="stat" style={{ background: 'var(--surface)' }}>
          <span>{t('version.web')}</span>
          <b className="mono">{__APP_VERSION__}</b>
        </div>
        <div className="stat" style={{ background: 'var(--surface)' }}>
          <span>{t('version.server')}</span>
          <b className="mono">{server.data?.version ?? '…'}</b>
        </div>
        <div className="stat" style={{ background: 'var(--surface)' }}>
          <span>{t('version.core')}</span>
          <b className="mono">{server.data?.algorithmVersion ?? '…'}</b>
        </div>
      </div>
      <section className="card">
        <Markdown source={locale === 'de' ? changelogDe : changelogEn} />
      </section>
    </div>
  );
}

export function Settings() {
  const { t } = useI18n();
  const fromHash = () => {
    const hash = window.location.hash.slice(1) as Tab;
    return TABS.includes(hash) ? hash : 'coefficients';
  };
  const [tab, setTab] = useState<Tab>(fromHash);
  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });
  return (
    <Page title={t('nav.settings')}>
      <div className="tabs" role="tablist" aria-label={t('companies.sections')}>
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              window.history.replaceState(null, '', `#${k}`);
            }}
          >
            {t(`settings.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'coefficients' && <Coefficients />}
      {tab === 'rating' && <Rating />}
      {tab === 'languages' && <Languages />}
      {tab === 'security' && <Security />}
      {tab === 'crashes' && <CrashReports />}
      {tab === 'manual' && <Manual />}
      {tab === 'version' && <Version />}
    </Page>
  );
}
