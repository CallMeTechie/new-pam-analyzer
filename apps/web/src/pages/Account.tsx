import { type FormEvent, useState } from 'react';
import { Page } from '../components/Layout';
import { ErrorNotice, Field, Notice } from '../components/ui';
import { CATALOGS, useI18n } from '../i18n';
import { type ApiError, api, type Profile } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';

const MIN_PASSWORD = 12;

export function PasswordForm({ onDone, forced }: { onDone?: () => void; forced?: boolean }) {
  const { t } = useI18n();
  const { refresh } = useAuth();
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
      await api.post('/auth/password', { currentPassword: current, newPassword: next });
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
          {t('password.forcedText')}
        </Notice>
      )}
      {done && <Notice kind="success" title={t('password.changed')} />}
      {error && <ErrorNotice error={error} />}
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
          disabled={!current || next.length < MIN_PASSWORD || next !== repeat}
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
    </Page>
  );
}

/** Shown instead of the app until a new user has replaced the initial password. */
export function ForcedPasswordChange() {
  const { t } = useI18n();
  const { logout } = useAuth();
  return (
    <div className="center-page">
      <div className="card stack" style={{ width: 'min(460px, 100%)' }}>
        <h2 style={{ fontSize: 24, fontWeight: 800 }}>{t('password.title')}</h2>
        <PasswordForm forced />
        <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => void logout()}>
          {t('profile.logout')}
        </button>
      </div>
    </div>
  );
}
