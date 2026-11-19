import { type FormEvent, useState } from 'react';
import { Logo } from '../components/Icon';
import { Credit, LanguageSwitch } from '../components/Layout';
import { ErrorNotice } from '../components/ui';
import { useI18n } from '../i18n';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'internal_error', String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand">
          <Logo />
          <span>
            <b>PAM Analyzer</b>
            <small>FUJI NXT · NXT-R · AIMEX</small>
          </span>
        </div>
        <div className="hide-sm">
          <h1>{t('login.claim')}</h1>
          <p>{t('login.claimSub')}</p>
        </div>
        <span className="hide-sm" style={{ opacity: 0.8, fontSize: 13 }}>
          <Credit />
        </span>
      </div>
      <div className="login-form">
        <form onSubmit={submit} noValidate>
          <h2>{t('login.title')}</h2>
          <p className="sub">{t('login.sub')}</p>
          {error && <ErrorNotice error={error} />}
          <label className="field">
            {t('field.email')}
            <input
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            {t('field.password')}
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy || !email || !password}>
            {busy ? t('login.busy') : t('login.submit')}
          </button>
          <p className="muted" style={{ fontSize: 13 }}>
            {t('login.help')}
          </p>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, fontSize: 13 }}
            className="muted"
          >
            <LanguageSwitch />
            <span className="show-sm">
              <Credit />
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
