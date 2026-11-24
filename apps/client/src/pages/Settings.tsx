import { Icon } from '@web/components/Icon';
import { LanguageSwitch, Page } from '@web/components/Layout';
import { Markdown } from '@web/components/Markdown';
import { Notice } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import manualDe from '../../../../docs/manual/app.de.md?raw';
import manualEn from '../../../../docs/manual/app.en.md?raw';
import changelogDe from '../../CHANGELOG.de.md?raw';
import changelogEn from '../../CHANGELOG.md?raw';
import type { Channel, Theme } from '../lib/types';
import { useEngine } from '../lib/useEngine';
import { useUpdates } from '../shell';
import { Diagnostics } from './Diagnostics';
import { ServerSettings } from './Server';

const TABS = ['general', 'server', 'diagnostics', 'coefficients', 'rating', 'manual', 'version'] as const;
type Tab = (typeof TABS)[number];

function General() {
  const { t, int, instant } = useI18n();
  const [s, engine] = useEngine();
  const updates = useUpdates();
  const [location, setLocation] = useState('');
  useEffect(() => {
    void engine.platform.dataLocation().then(setLocation);
  }, [engine]);
  const channels: Channel[] = ['stable', 'beta'];
  const themes: Theme[] = ['light', 'dark', 'system'];
  return (
    <div className="grid-2 settings-grid">
      <section className="card stack">
        <h2>{t('app.language')}</h2>
        <p className="muted">{t('client.settings.languageText')}</p>
        <div>
          <LanguageSwitch />
        </div>
      </section>
      <section className="card stack">
        <h2>{t('client.settings.appearance')}</h2>
        <p className="muted">{t('client.settings.appearanceText')}</p>
        <fieldset className="radio-cards">
          <legend className="sr-only">{t('client.settings.appearance')}</legend>
          {themes.map((k) => (
            <label key={k} className={s.theme === k ? 'on' : ''}>
              <input
                type="radio"
                name="theme"
                value={k}
                checked={s.theme === k}
                onChange={() => void engine.setTheme(k)}
              />
              <span>
                <b>{t(`client.theme.${k}`)}</b>
              </span>
            </label>
          ))}
        </fieldset>
      </section>
      <section className="card stack">
        <h2>{t('client.settings.updates')}</h2>
        <p className="muted">{t('client.settings.updatesText', { v: engine.platform.version })}</p>
        {engine.platform.updatesBy !== 'play' && (
          <fieldset className="radio-cards">
            <legend className="sr-only">{t('client.settings.channel')}</legend>
            {channels.map((c) => (
              <label key={c} className={s.channel === c ? 'on' : ''}>
                <input
                  type="radio"
                  name="channel"
                  value={c}
                  checked={s.channel === c}
                  onChange={() => void engine.setChannel(c)}
                />
                <span>
                  <b>{t(`client.channel.${c}`)}</b>
                  <small>{t(`client.channel.${c}Text`)}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {engine.platform.updatesBy === 'play' && <Notice kind="info">{t('client.update.play')}</Notice>}
        {engine.platform.updates ? (
          <div className="form-row" style={{ alignItems: 'center' }}>
            <button type="button" className="btn" disabled={updates.checking} onClick={() => void updates.check(true)}>
              {updates.checking ? t('client.update.checking') : t('client.update.checkNow')}
            </button>
            {s.updateChecked && !s.update && !updates.checking && (
              <span className="muted">{t('client.update.none', { date: instant(s.updateChecked) })}</span>
            )}
            {updates.error && <span className="error-text">{t('client.update.error')}</span>}
          </div>
        ) : (
          <Notice kind="info">{t('client.update.unavailable')}</Notice>
        )}
      </section>
      <section className="card stack">
        <h2>{t('client.settings.data')}</h2>
        <p className="muted">{t('client.settings.dataText')}</p>
        <dl className="kv">
          <dt>{t('client.settings.results')}</dt>
          <dd>{int(s.rows.length)}</dd>
          <dt>{t('client.settings.location')}</dt>
          <dd className="mono">{location}</dd>
        </dl>
        {engine.platform.kind === 'tauri' && (
          <div>
            <button type="button" className="btn" onClick={() => void engine.platform.openDataLocation()}>
              <Icon name="folder" size={16} />
              {t('client.settings.openFolder')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ConfigSource() {
  const { t, instant } = useI18n();
  const [s] = useEngine();
  return (
    <Notice kind="info">
      {s.config.source === 'server' && s.config.fetchedAt
        ? t('client.settings.fromServer', { date: instant(s.config.fetchedAt) })
        : t('client.settings.defaults')}
    </Notice>
  );
}

function Coefficients() {
  const { t, int } = useI18n();
  const [s] = useEngine();
  const c = s.config.coefficients;
  const heads = Object.keys(c.cpkCoefficients).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const tools = Object.keys(c.dynaheadTools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const parts = (v: number | 'tool_dependent' | null | undefined) =>
    v === 'tool_dependent' ? t('client.settings.toolDependent') : typeof v === 'number' ? int(v) : '–';
  return (
    <div className="stack">
      <ConfigSource />
      <div className="grid-2">
        <section className="card flat">
          <table className="table">
            <thead>
              <tr>
                <th>{t('fact.head')}</th>
                <th className="num">{t('tile.coef')}</th>
                <th className="num">{t('tile.parts')}</th>
              </tr>
            </thead>
            <tbody>
              {heads.map((h) => (
                <tr key={h}>
                  <td>{h}</td>
                  <td className="num mono">±{c.cpkCoefficients[h]} µm</td>
                  <td className="num mono">{parts(c.placementCounts[h])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card flat">
          <table className="table">
            <thead>
              <tr>
                <th>{t('fact.tool')}</th>
                <th className="num">{t('tile.coef')}</th>
                <th className="num">{t('tile.parts')}</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((k) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num mono">±{c.dynaheadTools[k]} µm</td>
                  <td className="num mono">{parts(c.dynaheadToolPlacements[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function RatingTab() {
  const { t, num } = useI18n();
  const [s] = useEngine();
  const th = s.config.thresholds;
  const levels = [
    ['critical', t('client.settings.below', { v: num(th.warning, 2) })],
    ['warning', t('client.settings.range', { a: num(th.warning, 2), b: num(th.good, 2) })],
    ['good', t('client.settings.range', { a: num(th.good, 2), b: num(th.excellent, 2) })],
    ['excellent', t('client.settings.from', { v: num(th.excellent, 2) })],
  ] as const;
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <ConfigSource />
      <section className="card">
        <div className="levels">
          {levels.map(([r, text]) => (
            <div key={r} className={`level r-${r}`}>
              <b>{t(`rating.${r}`)}</b>
              <span className="mono">{text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function Settings() {
  const { t, locale } = useI18n();
  const [s] = useEngine();
  const attention = s.rows.filter((r) => r.upload === 'rejected').length + (s.server === 'revoked' ? 1 : 0);
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as Tab | null;
  const tab: Tab = asked && TABS.includes(asked) ? asked : 'general';
  const setTab = (k: Tab) => setParams(k === 'general' ? {} : { tab: k }, { replace: true });
  return (
    <Page title={t('client.nav.settings')}>
      <div className="tabs" role="tablist" aria-label={t('client.nav.settings')}>
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`client.settings.tab.${k}`)}
            {k === 'server' && attention > 0 && <span className="badge">{attention}</span>}
          </button>
        ))}
      </div>
      {tab === 'general' && <General />}
      {tab === 'server' && <ServerSettings />}
      {tab === 'diagnostics' && <Diagnostics />}
      {tab === 'coefficients' && <Coefficients />}
      {tab === 'rating' && <RatingTab />}
      {tab === 'manual' && (
        <section className="card">
          <Markdown source={locale === 'de' ? manualDe : manualEn} />
        </section>
      )}
      {tab === 'version' && (
        <section className="card">
          <Markdown source={locale === 'de' ? changelogDe : changelogEn} />
        </section>
      )}
    </Page>
  );
}
