import { type CoefficientConfig, CPK_THRESHOLDS } from '@pam/core';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { ErrorNotice, Loading, Notice } from '../components/ui';
import { CATALOGS, type MessageKey, useI18n } from '../i18n';
import { type ApiError, api } from '../lib/api';
import { useApi } from '../lib/useApi';

type Tab = 'coefficients' | 'rating' | 'languages' | 'security';
type TableKey = 'cpkCoefficients' | 'dynaheadTools' | 'placementCounts' | 'dynaheadToolPlacements';

interface CoefficientsResponse {
  version: string;
  config: CoefficientConfig;
  defaults: CoefficientConfig;
}

function KeyValueTable({
  title,
  hint,
  values,
  unit,
  allowText,
  onChange,
}: {
  title: MessageKey;
  hint: MessageKey;
  values: Record<string, number | string | null>;
  unit?: string;
  allowText?: boolean;
  onChange(next: Record<string, number | string | null>): void;
}) {
  const { t } = useI18n();
  const [newKey, setNewKey] = useState('');
  const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  return (
    <section className="card stack">
      <div className="card-h" style={{ marginBottom: 0 }}>
        <div>
          <h2>{t(title)}</h2>
          <p>{t(hint)}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('settings.type')}</th>
              <th>{unit ? t('settings.valueUnit', { unit }) : t('settings.value')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td className="mono">{k}</td>
                <td>
                  <input
                    className="input mono kv-input"
                    value={v === null ? '' : String(v)}
                    aria-label={`${k}`}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const value =
                        raw === '' ? null : allowText && raw === 'tool_dependent' ? raw : Number(raw.replace(',', '.'));
                      onChange({ ...values, [k]: value });
                    }}
                  />
                </td>
                <td className="actions">
                  <button
                    type="button"
                    className="btn small ghost danger icon"
                    aria-label={`${t('common.remove')} ${k}`}
                    title={t('common.remove')}
                    onClick={() => {
                      const { [k]: _, ...rest } = values;
                      onChange(rest);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="form-row"
        onSubmit={(e) => {
          e.preventDefault();
          const key = newKey.trim().toUpperCase();
          if (!key || key in values) return;
          onChange({ ...values, [key]: null });
          setNewKey('');
        }}
      >
        <label className="field" style={{ flex: '0 1 220px' }}>
          {t('settings.newType')}
          <input className="input mono" value={newKey} onChange={(e) => setNewKey(e.target.value)} maxLength={24} />
        </label>
        <button type="submit" className="btn" disabled={!newKey.trim()}>
          {t('common.add')}
        </button>
      </form>
    </section>
  );
}

function valid(config: CoefficientConfig): boolean {
  const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  return (
    Object.values(config.cpkCoefficients).every(positive) &&
    Object.values(config.dynaheadTools).every(positive) &&
    Object.values(config.dynaheadToolPlacements).every((v) => positive(v) && Number.isInteger(v)) &&
    Object.values(config.placementCounts).every(
      (v) => v === null || v === 'tool_dependent' || (positive(v) && Number.isInteger(v)),
    ) &&
    positive(config.defaultCoefficient)
  );
}

function Coefficients() {
  const { t, instant } = useI18n();
  const { data, error, reload } = useApi<CoefficientsResponse>('/settings/coefficients');
  const [draft, setDraft] = useState<CoefficientConfig | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data) setDraft(structuredClone(data.config));
  }, [data]);
  if (error) return <ErrorNotice error={error} />;
  if (!data || !draft) return <Loading />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.config);
  const set = (key: TableKey) => (next: Record<string, number | string | null>) => {
    setDraft({ ...draft, [key]: next } as CoefficientConfig);
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
    <div className="stack" style={{ gap: 20 }}>
      <Notice
        kind="info"
        title={t('settings.versionTitle', {
          v: data.version === 'default' ? t('footer.configDefault') : instant(data.version),
        })}
      >
        {t('settings.versionText')}
      </Notice>
      {saved && <Notice kind="success" title={t('settings.savedVersion')} />}
      {saveError && <ErrorNotice error={saveError} />}
      <div className="grid-2">
        <KeyValueTable
          title="settings.cpk"
          hint="settings.cpkHint"
          unit="±µm"
          values={draft.cpkCoefficients}
          onChange={set('cpkCoefficients')}
        />
        <KeyValueTable
          title="settings.dx"
          hint="settings.dxHint"
          unit="±µm"
          values={draft.dynaheadTools}
          onChange={set('dynaheadTools')}
        />
        <KeyValueTable
          title="settings.placements"
          hint="settings.placementsHint"
          values={draft.placementCounts}
          allowText
          onChange={set('placementCounts')}
        />
        <KeyValueTable
          title="settings.dxPlacements"
          hint="settings.dxPlacementsHint"
          values={draft.dynaheadToolPlacements}
          onChange={set('dynaheadToolPlacements')}
        />
      </div>
      <section className="card form-row">
        <label className="field" style={{ flex: '0 1 240px' }}>
          {t('settings.default')}
          <input
            className="input mono"
            value={draft.defaultCoefficient}
            onChange={(e) => {
              setDraft({ ...draft, defaultCoefficient: Number(e.target.value.replace(',', '.')) });
              setSaved(false);
            }}
          />
        </label>
        <p className="muted" style={{ flex: '2 1 300px', fontSize: 14 }}>
          {t('settings.defaultHint')}
        </p>
      </section>
      <div className="save-bar">
        <button type="button" className="btn primary" disabled={!dirty || !valid(draft)} onClick={() => void save()}>
          {t('settings.saveVersion')}
        </button>
        <button type="button" className="btn" disabled={!dirty} onClick={() => setDraft(structuredClone(data.config))}>
          {t('common.discard')}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setDraft(structuredClone(data.defaults));
            setSaved(false);
          }}
        >
          {t('settings.restoreDefaults')}
        </button>
        {dirty && !valid(draft) && <span className="error-text">{t('settings.invalid')}</span>}
      </div>
    </div>
  );
}

function Rating() {
  const { t, num } = useI18n();
  const rows = [
    ['critical', `< ${num(CPK_THRESHOLDS.warning, 2)}`],
    ['warning', `${num(CPK_THRESHOLDS.warning, 2)} – < ${num(CPK_THRESHOLDS.good, 2)}`],
    ['good', `${num(CPK_THRESHOLDS.good, 2)} – < ${num(CPK_THRESHOLDS.excellent, 2)}`],
    ['excellent', `≥ ${num(CPK_THRESHOLDS.excellent, 2)}`],
  ] as const;
  return (
    <section className="card stack">
      <p className="muted">{t('settings.ratingText')}</p>
      <div className="stack tight">
        {rows.map(([r, range]) => (
          <div key={r} className="device">
            <span className={`pill r-${r}`}>{t(`rating.${r}`)}</span>
            <span className="mono">Cpk {range}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13.5 }}>
        {t('settings.ratingFixed')}
      </p>
    </section>
  );
}

function Languages() {
  const { t } = useI18n();
  return (
    <section className="card stack">
      <p className="muted">{t('settings.languagesText')}</p>
      <div className="stack tight">
        {Object.entries(CATALOGS).map(([code, c]) => (
          <div key={code} className="device">
            <b style={{ flex: 1 }}>{c.name}</b>
            <span className="mono muted">{code}</span>
            {code === 'en' && <span className="pill small dark">{t('settings.mainLanguage')}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

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
    <section className="card stack">
      {saved && <Notice kind="success" title={t('common.saved')} />}
      <div className="form-row">
        <label className="field" style={{ flex: '0 1 260px' }}>
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
      <p className="muted" style={{ fontSize: 14 }}>
        {t('settings.securityText')}
      </p>
    </section>
  );
}

export function Settings() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('coefficients');
  return (
    <Page title={t('nav.settings')}>
      <div className="tabs" role="tablist" aria-label={t('companies.sections')}>
        {(['coefficients', 'rating', 'languages', 'security'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`settings.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'coefficients' && <Coefficients />}
      {tab === 'rating' && <Rating />}
      {tab === 'languages' && <Languages />}
      {tab === 'security' && <Security />}
    </Page>
  );
}
