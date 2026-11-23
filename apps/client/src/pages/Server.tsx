import { Icon } from '@web/components/Icon';
import { Field, Notice } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { type FormEvent, useEffect, useState } from 'react';
import { reasonText, UploadChip } from '../components';
import { ServerError } from '../lib/engine';
import { useEngine } from '../lib/useEngine';

function errorMessage(t: ReturnType<typeof useI18n>['t'], e: unknown): string {
  if (!(e instanceof ServerError)) return t('error.internal_error');
  const key = `client.error.${e.code}` as never;
  const own = t(key);
  if (own !== key) return own;
  const web = `error.${e.code}` as never;
  const text = t(web);
  return text === web ? t('error.internal_error') : text;
}

/** Content of the QR code shown on the web: `{"server": "…", "apiKey": "pam_…"}` or just the key. */
export function parseKeyQr(text: string): { apiKey: string; server?: string } | null {
  const trimmed = text.trim();
  if (/^pam_[\w-]{10,}$/.test(trimmed)) return { apiKey: trimmed };
  try {
    const data = JSON.parse(trimmed) as { apiKey?: unknown; server?: unknown };
    if (typeof data.apiKey === 'string' && /^pam_[\w-]{10,}$/.test(data.apiKey)) {
      return { apiKey: data.apiKey, ...(typeof data.server === 'string' ? { server: data.server } : {}) };
    }
  } catch {
    // not JSON
  }
  return null;
}

function ConnectForm() {
  const { t } = useI18n();
  const [, engine] = useEngine();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ server: '', apiKey: '', email: '', password: '', deviceName: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void engine.platform
      .defaultDeviceName()
      .then((name) => setForm((f) => (f.deviceName ? f : { ...f, deviceName: name })));
  }, [engine]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await engine.connect(form);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }
  const complete = Object.values(form).every((v) => v.trim());
  const [scanError, setScanError] = useState<string | null>(null);
  /** The web shows the new key as QR code: JSON with server and key, or the key alone. */
  async function scanKey() {
    setScanError(null);
    let text: string | null = null;
    try {
      text = (await engine.platform.scanQr?.()) ?? null;
    } catch {
      setScanError(t('client.connect.scannerFailed'));
      return;
    }
    if (!text) return;
    const parsed = parseKeyQr(text);
    if (!parsed) {
      setScanError(t('client.connect.scanFailed'));
      return;
    }
    setForm((f) => ({ ...f, apiKey: parsed.apiKey, ...(parsed.server ? { server: parsed.server } : {}) }));
  }

  return (
    <div className="grid-2">
      <form className="card stack" onSubmit={(e) => void submit(e)}>
        <h2>{t('client.connect.title')}</h2>
        <p className="muted">{t('client.connect.text')}</p>
        <Field label={t('client.connect.server')}>
          {(p) => (
            <input
              {...p}
              className="input"
              value={form.server}
              onChange={set('server')}
              placeholder="https://pam.example.com"
              autoComplete="url"
            />
          )}
        </Field>
        <Field label={t('client.connect.apiKey')} {...(scanError ? { error: scanError } : {})}>
          {(p) => (
            <div className="input-with-button">
              <input
                {...p}
                className="input mono"
                value={form.apiKey}
                onChange={set('apiKey')}
                placeholder="pam_…"
                autoComplete="off"
              />
              {engine.platform.scanQr && (
                <button type="button" className="btn" onClick={() => void scanKey()}>
                  <Icon name="camera" size={16} />
                  <span className="sr-only">{t('client.connect.scan')}</span>
                </button>
              )}
            </div>
          )}
        </Field>
        <Field label={t('field.email')}>
          {(p) => (
            <input
              {...p}
              className="input"
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="username"
            />
          )}
        </Field>
        <Field label={t('field.password')}>
          {(p) => (
            <input
              {...p}
              className="input"
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete="current-password"
            />
          )}
        </Field>
        <Field label={t('client.connect.deviceName')}>
          {(p) => (
            <input {...p} className="input" value={form.deviceName} onChange={set('deviceName')} maxLength={100} />
          )}
        </Field>
        {error && <Notice kind="error" title={error} />}
        <div>
          <button type="submit" className="btn primary" disabled={busy || !complete}>
            {busy ? t('client.connect.busy') : t('client.connect.submit')}
          </button>
        </div>
      </form>
      <section className="card stack">
        <h2>{t('client.connect.keyTitle')}</h2>
        <p className="muted">{t('client.connect.keyText')}</p>
        <Notice kind="info">{t('client.connect.passwordNote')}</Notice>
      </section>
    </div>
  );
}

function Connected() {
  const { t, instant } = useI18n();
  const [s, engine] = useEngine();
  const c = s.connection;
  if (!c) return null;
  const queued = s.rows.filter((r) => r.upload === 'queued');
  const rejected = s.rows.filter((r) => r.upload === 'rejected');
  return (
    <>
      {s.server === 'offline' && <Notice title={t('client.server.offline', { n: queued.length })} />}
      {s.server === 'revoked' && (
        <Notice kind="error" title={t('client.server.revoked')}>
          {t('client.server.revokedText')}
        </Notice>
      )}
      <div className="grid-2">
        <section className="card stack">
          <h2>{t('client.server.connection')}</h2>
          <dl className="kv">
            <dt>{t('client.connect.server')}</dt>
            <dd>{c.server}</dd>
            <dt>{t('fact.company')}</dt>
            <dd>{c.companyName}</dd>
            <dt>{t('client.server.user')}</dt>
            <dd>{c.userName}</dd>
            <dt>{t('client.connect.deviceName')}</dt>
            <dd>{c.deviceName}</dd>
            <dt>{t('client.server.since')}</dt>
            <dd>{instant(c.connectedAt)}</dd>
            <dt>{t('client.server.lastSync')}</dt>
            <dd>{c.lastSyncAt ? instant(c.lastSyncAt) : '–'}</dd>
          </dl>
        </section>
        <section className="card stack">
          <h2>{t('client.server.queue')}</h2>
          <p className="muted">{t('client.server.queueText')}</p>
          {queued.length === 0 && rejected.length === 0 ? (
            <p className="queue-empty">
              <Icon name="checkCircle" size={18} />
              {t('client.server.allUploaded')}
            </p>
          ) : (
            <ul className="queue">
              {[...queued, ...rejected].slice(0, 50).map((r) => (
                <li key={r.id}>
                  <span className="mono">{r.fileName}</span>
                  {r.upload === 'rejected' ? (
                    <span className="queue-actions">
                      <span className="muted">{reasonText(t, r.uploadError ?? 'unreadable')}</span>
                      <button type="button" className="btn small" onClick={() => void engine.retry(r.id)}>
                        {t('client.server.retry')}
                      </button>
                    </span>
                  ) : (
                    <UploadChip state={r.upload} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/** Settings tab: connect, or the connection with its upload queue. */
export function ServerSettings() {
  const { t } = useI18n();
  const [s, engine] = useEngine();
  const [confirm, setConfirm] = useState(false);
  if (!s.connection) return <ConnectForm />;
  return (
    <div className="stack">
      <div className="toolbar">
        {s.server !== 'revoked' && (
          <button type="button" className="btn" disabled={s.syncing} onClick={() => void engine.sync()}>
            <Icon name="upload" size={16} />
            {s.syncing ? t('client.server.syncing') : t('client.server.syncNow')}
          </button>
        )}
        {confirm ? (
          <>
            <button
              type="button"
              className="btn danger"
              onClick={() => void engine.disconnect().then(() => setConfirm(false))}
            >
              {t('client.server.disconnectConfirm')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <button type="button" className="btn danger" onClick={() => setConfirm(true)}>
            {t('client.server.disconnect')}
          </button>
        )}
      </div>
      <Connected />
    </div>
  );
}
