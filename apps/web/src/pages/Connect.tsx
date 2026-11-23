import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router';
import { Logo } from '../components/Icon';
import { LanguageSwitch } from '../components/Layout';
import { QrCode } from '../components/QrCode';
import { ErrorNotice, Field, Loading, Notice } from '../components/ui';
import { useI18n } from '../i18n';
import { type ApiError, api } from '../lib/api';
import { useApi } from '../lib/useApi';

const MIN_PASSWORD = 12;

interface CodeInfo {
  purpose: 'invite' | 'device';
  name: string;
  email: string;
  companyName: string;
  expiresAt: string;
  needsPassword: boolean;
  deviceConnected: boolean;
}

/**
 * The page behind an invitation or connect link (`/connect/<code>`), signed in or not: an invitation
 * first sets the password; then the page shows the QR code for the app.
 */
export function Connect() {
  const { t } = useI18n();
  const { code = '' } = useParams();
  const info = useApi<CodeInfo>(`/connect/${encodeURIComponent(code)}`);
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const mismatch = repeat.length > 0 && next !== repeat;
  const url = window.location.href.split('?')[0] ?? window.location.href;
  const formatted = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/connect/${encodeURIComponent(code)}/password`, { password: next });
      setDone(true);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const data = info.data;
  return (
    <div className="connect-page">
      <div className="card stack">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo />
          <b>{t('connect.title')}</b>
        </div>
        {info.error && <Notice kind="warning" title={t('connect.invalid')} />}
        {!data && !info.error && <Loading />}
        {data && (
          <>
            <h1 style={{ margin: 0, fontSize: 24 }}>{t('connect.welcome', { name: data.name })}</h1>
            {data.needsPassword && !done && (
              <form className="stack" onSubmit={submit}>
                <p style={{ margin: 0 }}>{t('connect.inviteText', { company: data.companyName, email: data.email })}</p>
                {error && <ErrorNotice error={error} />}
                <Field label={t('connect.password')} hint={t('password.rule', { n: MIN_PASSWORD })}>
                  {(p) => (
                    <input
                      {...p}
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      minLength={MIN_PASSWORD}
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('connect.repeat')} error={mismatch ? t('connect.mismatch') : undefined}>
                  {(p) => (
                    <input
                      {...p}
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                    />
                  )}
                </Field>
                <div>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={busy || next.length < MIN_PASSWORD || next !== repeat}
                  >
                    {t('connect.setPassword')}
                  </button>
                </div>
              </form>
            )}
            {done && (
              <Notice kind="success" title={t('connect.done')}>
                <a href={`/?email=${encodeURIComponent(data.email)}`}>{t('connect.toLogin')}</a>
              </Notice>
            )}
            {!data.deviceConnected && (
              <section className="stack" style={{ gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{t('connect.appTitle')}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {t('connect.appText')}
                </p>
                <div className="qr-box">
                  <QrCode value={url} label={t('devices.qrLabel')} size={180} />
                  <span className="stack" style={{ gap: 6 }}>
                    <span className="muted">{t('connect.server')}</span>
                    <b className="mono">{window.location.origin}</b>
                    <span className="muted">{t('invite.code')}</span>
                    <b className="mono code-big">{formatted}</b>
                  </span>
                </div>
              </section>
            )}
          </>
        )}
        <div className="muted" style={{ fontSize: 13 }}>
          <LanguageSwitch />
        </div>
      </div>
    </div>
  );
}
