import { Icon } from '@web/components/Icon';
import { Field, Notice } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { useEffect, useState } from 'react';
import { reasonText, UploadChip } from '../components';
import { diag } from '../lib/diag';
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

/**
 * Content of the QR codes on the web: the link `https://<server>/connect/<code>` of an invitation or
 * of "My account → Connect another device"; a code typed alone (`7KQ4-M2XP`) works as well.
 */
export function parseConnectQr(text: string): { code: string; server?: string } | null {
  const trimmed = text.trim();
  const bare = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(trimmed)) return { code: `${bare.slice(0, 4)}-${bare.slice(4)}` };
  try {
    const url = new URL(trimmed);
    const match = /\/connect\/([A-Za-z0-9]{8})\/?$/.exec(url.pathname);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && match?.[1]) {
      const code = match[1].toUpperCase();
      const base = url.pathname.slice(0, url.pathname.length - match[0].length);
      return { code: `${code.slice(0, 4)}-${code.slice(4)}`, server: `${url.origin}${base}` };
    }
  } catch {
    // not a URL
  }
  return null;
}

function ConnectForm() {
  const { t } = useI18n();
  const [, engine] = useEngine();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ server: '', code: '', deviceName: '' });
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    void engine.platform
      .defaultDeviceName()
      .then((name) => setForm((f) => (f.deviceName ? f : { ...f, deviceName: name })));
  }, [engine]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function connect(values: typeof form) {
    setBusy(true);
    setError(null);
    try {
      await engine.connect(values);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }
  const complete = Object.values(form).every((v) => v.trim());

  /** Scanning the QR code fills server and code and connects right away. */
  async function scan() {
    setScanError(null);
    let text: string | null = null;
    setScanning(true);
    try {
      text = (await engine.platform.scanQr?.()) ?? null;
    } catch (e) {
      // The reason helps when the scanner of Google Play services is missing or cannot be installed.
      const reason = e instanceof Error ? e.message : String(e);
      diag.error('qr', e);
      setScanError(`${t('client.connect.scannerFailed')} (${reason})`);
      return;
    } finally {
      setScanning(false);
    }
    if (!text) return;
    const parsed = parseConnectQr(text);
    if (!parsed) {
      setScanError(t('client.connect.scanFailed'));
      return;
    }
    const next = { ...form, code: parsed.code, ...(parsed.server ? { server: parsed.server } : {}) };
    setForm(next);
    if (next.server.trim() && next.deviceName.trim()) await connect(next);
  }

  return (
    <div className="grid-2">
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void connect(form);
        }}
      >
        <h2>{t('client.connect.title')}</h2>
        <p className="muted">{t('client.connect.text')}</p>
        {engine.platform.scanQr && (
          <>
            <button
              type="button"
              className="btn primary scan-btn"
              disabled={scanning || busy}
              onClick={() => void scan()}
            >
              {scanning ? (
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              ) : (
                <Icon name="camera" size={20} />
              )}
              {scanning ? t('client.connect.scannerLoading') : t('client.connect.scan')}
            </button>
            {scanError && <Notice kind="error" title={scanError} />}
            <div className="or-line">
              <span>{t('client.connect.or')}</span>
            </div>
          </>
        )}
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
        <Field label={t('client.connect.code')} hint={t('client.connect.codeHint')}>
          {(p) => (
            <input
              {...p}
              className="input mono code-input"
              value={form.code}
              onChange={set('code')}
              placeholder="XXXX-XXXX"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
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
          <button
            type="submit"
            className={`btn${engine.platform.scanQr ? '' : ' primary'}`}
            disabled={busy || !complete}
          >
            {busy ? t('client.connect.busy') : t('client.connect.submit')}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {t('client.connect.noSecrets')}
        </p>
      </form>
      <section className="card stack">
        <h2>{t('client.connect.keyTitle')}</h2>
        <p className="muted">{t('client.connect.keyText')}</p>
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
