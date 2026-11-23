import { type FormEvent, useState } from 'react';
import { MyDevices } from '../components/Devices';
import { Page } from '../components/Layout';
import { ErrorNotice, Field, Notice } from '../components/ui';
import { CATALOGS, useI18n } from '../i18n';
import { type ApiError, api, type Profile } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';

const MIN_PASSWORD = 12;
/** Default administrator of a new installation; must choose its own e-mail address. */
export const DEFAULT_ADMIN_EMAIL = 'admin@example.com';

export function PasswordForm({ onDone, forced }: { onDone?: () => void; forced?: boolean }) {
  const { t } = useI18n();
  const { refresh, user } = useAuth();
  const defaultAccount = user?.email === DEFAULT_ADMIN_EMAIL;
  const [newEmail, setNewEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const mismatch = repeat.length > 0 && next !== repeat;
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/auth/password', {
        currentPassword: current,
        newPassword: next,
        ...(defaultAccount ? { newEmail: newEmail.trim() } : {}),
      });
      setDone(true);
      setCurrent('');
      setNext('');
      setRepeat('');
      await refresh();
      onDone?.();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {forced && (
        <Notice kind="info" title={t('password.forcedTitle')}>
          {defaultAccount ? t('password.forcedDefaultText') : t('password.forcedText')}
        </Notice>
      )}
      {done && <Notice kind="success" title={t('password.changed')} />}
      {error && <ErrorNotice error={error} />}
      {defaultAccount && (
        <Field label={t('password.newEmail')} hint={t('password.newEmailHint')}>
          {(p) => (
            <input
              {...p}
              className="input"
              type="email"
              autoComplete="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          )}
        </Field>
      )}
      <label className="field">
        {t('password.current')}
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <Field label={t('password.new')} hint={t('password.rule', { n: MIN_PASSWORD })}>
        {(p) => (
          <input
            {...p}
            className="input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={tooShort}
          />
        )}
      </Field>
      <Field label={t('password.repeat')} error={mismatch ? t('password.mismatch') : undefined}>
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
          disabled={
            !current ||
            next.length < MIN_PASSWORD ||
            next !== repeat ||
            (defaultAccount && (!newEmail.includes('@') || newEmail.trim().toLowerCase() === DEFAULT_ADMIN_EMAIL))
          }
        >
          {t('password.save')}
        </button>
      </div>
    </form>
  );
}

export function Account() {
  const { t, setLocale } = useI18n();
  const user = useUser();
  const { setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);

  async function saveProfile(patch: { name?: string; locale?: string }) {
    const { user: next } = await api.patch<{ user: Profile }>('/auth/me', patch);
    setUser(next);
    setSaved(true);
  }

  return (
    <Page title={t('account.title')}>
      <div className="grid-2">
        <section className="card stack">
          <div className="card-h">
            <h2>{t('account.profile')}</h2>
          </div>
          {saved && <Notice kind="success" title={t('common.saved')} />}
          <label className="field">
            {t('field.name')}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            {t('field.email')}
            <input className="input" value={user.email} disabled />
          </label>
          <label className="field">
            {t('app.language')}
            <select
              className="select"
              value={user.locale}
              onChange={(e) => {
                setLocale(e.target.value);
                void saveProfile({ locale: e.target.value });
              }}
            >
              {Object.entries(CATALOGS).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ fontSize: 14 }}>
            {user.company.name} · {t(`role.${user.role}`)}
          </p>
          <div>
            <button
              type="button"
              className="btn primary"
              disabled={!name.trim() || name === user.name}
              onClick={() => void saveProfile({ name: name.trim() })}
            >
              {t('common.save')}
            </button>
          </div>
        </section>
        <section className="card stack">
          <div className="card-h">
            <h2>{t('password.title')}</h2>
          </div>
          <PasswordForm />
        </section>
      </div>
      <MyDevices />
    </Page>
  );
}

/** Shown instead of the app until a new user has replaced the initial password. */
export function ForcedPasswordChange() {
  const { t } = useI18n();
  const { logout, user } = useAuth();
  return (
    <div className="center-page">
      <div className="card stack" style={{ width: 'min(460px, 100%)' }}>
        {user?.nameServiceCompany && (
          <span className="muted" style={{ fontSize: 13 }}>
            {t('setup.step', { n: 1, total: 2 })}
          </span>
        )}
        <h2 style={{ fontSize: 24, fontWeight: 800 }}>{t('password.title')}</h2>
        <PasswordForm forced />
        <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => void logout()}>
          {t('profile.logout')}
        </button>
      </div>
    </div>
  );
}

/**
 * Second step of a new installation, right after the default credentials were replaced: the
 * administrator names the service company (suggestion: `SERVICE_COMPANY_NAME`).
 */
export function NameServiceCompany() {
  const { t } = useI18n();
  const user = useUser();
  const { setUser, logout } = useAuth();
  const [name, setName] = useState(user.company.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ user: Profile }>('/auth/service-company', { name: name.trim() });
      setUser(res.user);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-page">
      <form className="card stack" style={{ width: 'min(460px, 100%)' }} onSubmit={submit}>
        <span className="muted" style={{ fontSize: 13 }}>
          {t('setup.step', { n: 2, total: 2 })}
        </span>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{t('setup.serviceTitle')}</h2>
        <p style={{ margin: 0 }}>{t('setup.serviceText')}</p>
        {error && <ErrorNotice error={error} />}
        <Field label={t('setup.serviceName')} hint={t('setup.serviceHint')}>
          {(p) => (
            <input
              {...p}
              className="input"
              value={name}
              maxLength={120}
              required
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {t('setup.serviceSave')}
          </button>
        </div>
        <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => void logout()}>
          {t('profile.logout')}
        </button>
      </form>
    </div>
  );
}
