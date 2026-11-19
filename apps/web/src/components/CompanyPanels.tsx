import { type FormEvent, useState } from 'react';
import { CATALOGS, useI18n } from '../i18n';
import { type ApiError, type ApiKey, api, type Machine, qs, type Role, type User } from '../lib/api';
import { useUser } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { Icon } from './Icon';
import { initials } from './Layout';
import { CopyButton, Empty, ErrorNotice, FamilyIcon, Field, Loading, Modal, Notice } from './ui';

/** Random initial password, shown once to the person creating the account. */
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/* ------------------------------ API keys ------------------------------ */

export function KeysPanel({ companyId, canManage }: { companyId: number; canManage: boolean }) {
  const { t, int, relative, instant } = useI18n();
  const { data, error, reload } = useApi<{ items: ApiKey[]; defaultMaxConnections: number }>(
    canManage ? `/api-keys${qs({ companyId })}` : null,
  );
  const [name, setName] = useState('');
  const [max, setMax] = useState('');
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [formError, setFormError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);

  if (!canManage) return <Notice kind="info">{t('keys.noAccess')}</Notice>;

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await api.post<{ key: string; apiKey: ApiKey }>('/api-keys', {
        companyId,
        name: name.trim(),
        ...(max ? { maxConnections: Number(max) } : {}),
      });
      setCreated({ key: res.key, name: res.apiKey.name });
      setName('');
      setMax('');
      reload();
    } catch (err) {
      setFormError(err as ApiError);
    }
  }

  const active = data?.items.filter((k) => !k.revoked) ?? [];
  const revoked = data?.items.filter((k) => k.revoked) ?? [];

  return (
    <div className="stack">
      <Notice kind="info">{t('keys.info')}</Notice>
      <form className="card dashed form-row" onSubmit={create} style={{ padding: '14px 16px' }}>
        <label className="field">
          {t('keys.name')}
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('keys.namePlaceholder')}
            required
            maxLength={80}
          />
        </label>
        <label className="field" style={{ flex: '0 1 180px' }}>
          {t('keys.maxConn')}
          <input
            className="input mono"
            type="number"
            min={1}
            max={1000}
            value={max}
            placeholder={String(data?.defaultMaxConnections ?? 5)}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
        <button type="submit" className="btn dark" disabled={!name.trim()}>
          <Icon name="plus" size={16} />
          {t('keys.create')}
        </button>
      </form>
      {formError && <ErrorNotice error={formError} />}
      {error && <ErrorNotice error={error} />}
      {!data && !error && <Loading />}
      {data && active.length === 0 && <Empty title={t('keys.none')} />}
      {active.map((k) => {
        const used = k.devices.length;
        const full = used >= k.maxConnections;
        return (
          <div key={k.id} className="key-card" style={{ background: 'var(--surface-2)' }}>
            <div className="key-head">
              <span className="fam" style={{ background: 'var(--surface)' }}>
                <Icon name="key" />
              </span>
              <span className="kn">
                <b>{k.name}</b>
                <span>
                  {k.prefix}… · {t('keys.created', { date: instant(k.createdAt) })}
                </span>
              </span>
              <span className={`conn ${full ? 'r-warning' : 'r-good'}`} title={t('keys.connections')}>
                <span className="bar">
                  <span style={{ width: `${Math.min(100, (used / k.maxConnections) * 100)}%` }} />
                </span>
                <b className="mono">
                  {int(used)} / {int(k.maxConnections)}
                </b>
              </span>
              <span className="muted" style={{ fontSize: 13, minWidth: 120 }}>
                {k.lastUsedAt ? t('keys.lastUsed', { when: relative(k.lastUsedAt) }) : t('keys.neverUsed')}
              </span>
              <span className={`pill small ${full ? 'r-warning' : 'r-excellent'}`}>
                {full ? t('keys.full') : t('keys.active')}
              </span>
              <button type="button" className="btn small" onClick={() => setEditing(k)}>
                <Icon name="edit" size={14} />
                {t('common.edit')}
              </button>
              <button
                type="button"
                className="btn small danger"
                onClick={async () => {
                  if (!window.confirm(t('keys.revokeConfirm', { name: k.name, n: used }))) return;
                  await api.delete(`/api-keys/${k.id}`);
                  reload();
                }}
              >
                {t('keys.revoke')}
              </button>
            </div>
            {k.devices.length > 0 && (
              <div className="devices">
                {k.devices.map((d) => (
                  <div key={d.id} className="device" style={{ background: 'var(--surface)' }}>
                    <Icon name="device" />
                    <span className="dn">
                      <b>{d.name}</b>
                      <span>
                        {t(`platform.${d.platform}` as never)} · {d.userName}
                        {d.appVersion ? ` · ${t('keys.appVersion', { v: d.appVersion })}` : ''}
                      </span>
                    </span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {t('keys.uploads', { n: d.uploadCount })}
                    </span>
                    <span className="muted" style={{ fontSize: 13, minWidth: 110 }}>
                      {relative(d.lastSeenAt)}
                    </span>
                    <button
                      type="button"
                      className="btn small"
                      onClick={async () => {
                        if (!window.confirm(t('keys.disconnectConfirm', { name: d.name }))) return;
                        await api.delete(`/devices/${d.id}`);
                        reload();
                      }}
                    >
                      {t('keys.disconnect')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {revoked.length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: 14 }}>
            {t('keys.revoked', { n: revoked.length })}
          </summary>
          <ul className="muted" style={{ fontSize: 13.5 }}>
            {revoked.map((k) => (
              <li key={k.id}>
                {k.name} <span className="mono">({k.prefix}…)</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {created && (
        <Modal title={t('keys.createdTitle')} onClose={() => setCreated(null)}>
          <p>{t('keys.createdText', { name: created.name })}</p>
          <div className="secret">
            <code>{created.key}</code>
            <CopyButton value={created.key} />
          </div>
          <Notice>{t('keys.onceWarning')}</Notice>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => setCreated(null)}>
              {t('common.done')}
            </button>
          </div>
        </Modal>
      )}
      {editing && <EditKey apiKey={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}

function EditKey({ apiKey, onClose, onSaved }: { apiKey: ApiKey; onClose(): void; onSaved(): void }) {
  const { t } = useI18n();
  const [name, setName] = useState(apiKey.name);
  const [max, setMax] = useState(String(apiKey.maxConnections));
  const [error, setError] = useState<ApiError | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.patch(`/api-keys/${apiKey.id}`, { name: name.trim(), maxConnections: Number(max) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  return (
    <Modal title={t('keys.editTitle')} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <ErrorNotice error={error} />}
        <label className="field">
          {t('keys.name')}
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>
        <Field label={t('keys.maxConn')} hint={t('keys.lowerHint')}>
          {(p) => (
            <input
              {...p}
              className="input mono"
              type="number"
              min={1}
              max={1000}
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          )}
        </Field>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim() || Number(max) < 1}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ Users ------------------------------ */

export function UserForm({
  companyId,
  companyIsService,
  user,
  onClose,
  onSaved,
}: {
  companyId: number;
  companyIsService: boolean;
  user?: User;
  onClose(): void;
  onSaved(): void;
}) {
  const { t } = useI18n();
  const me = useUser();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'user');
  const [locale, setLocale] = useState(user?.locale ?? 'en');
  const [password, setPassword] = useState(user ? '' : generatePassword());
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const self = user?.id === me.id;
  const roles: Role[] =
    companyIsService && me.role === 'admin' ? ['admin', 'companyAdmin', 'user'] : ['companyAdmin', 'user'];

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (user) {
        await api.patch(`/users/${user.id}`, {
          name: name.trim(),
          email,
          locale,
          ...(self ? {} : { role }),
          ...(password ? { password } : {}),
        });
      } else {
        await api.post('/users', { companyId, name: name.trim(), email, role, locale, password });
      }
      onSaved();
      if (password) setDone(password);
      else onClose();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  if (done) {
    return (
      <Modal title={user ? t('users.passwordReset') : t('users.created')} onClose={onClose}>
        <p>{t('users.passwordText', { email })}</p>
        <div className="secret">
          <code>{done}</code>
          <CopyButton value={done} />
        </div>
        <Notice kind="info">{t('users.passwordHint')}</Notice>
        <div className="actions">
          <button type="button" className="btn primary" onClick={onClose}>
            {t('common.done')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={user ? t('users.editTitle') : t('users.inviteTitle')} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <ErrorNotice error={error} />}
        <div className="form-grid">
          <label className="field">
            {t('field.name')}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </label>
          <label className="field">
            {t('field.email')}
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            {t('users.role')}
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={self}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('app.language')}
            <select className="select" value={locale} onChange={(e) => setLocale(e.target.value)}>
              {Object.entries(CATALOGS).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Field label={user ? t('users.newPassword') : t('users.initialPassword')} hint={t('users.passwordRule')}>
          {(p) => (
            <span style={{ display: 'flex', gap: 8 }}>
              <input
                {...p}
                className="input mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={user ? t('users.keepPassword') : ''}
                minLength={12}
              />
              <button type="button" className="btn" onClick={() => setPassword(generatePassword())}>
                {t('users.generate')}
              </button>
            </span>
          )}
        </Field>
        <p className="muted" style={{ fontSize: 13.5 }}>
          {t(`role.${role}.hint` as never)}
        </p>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={!name.trim() || !email || (password.length > 0 && password.length < 12) || (!user && !password)}
          >
            {user ? t('common.save') : t('users.invite')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function UserRows({ users, onChange, showCompany }: { users: User[]; onChange(): void; showCompany?: boolean }) {
  const { t, relative } = useI18n();
  const me = useUser();
  const [editing, setEditing] = useState<User | null>(null);
  if (!users.length) return <Empty title={t('users.none')} />;
  return (
    <div className="stack tight">
      {users.map((u) => (
        <div key={u.id} className="device" style={{ opacity: u.disabled ? 0.6 : 1 }}>
          <span className="avatar">{initials(u.name)}</span>
          <span className="dn">
            <b>
              {u.name}
              {u.id === me.id ? ` (${t('users.you')})` : ''}
            </b>
            <span>
              {u.email}
              {showCompany ? ` · ${u.companyName}` : ''}
            </span>
          </span>
          <span className={`pill small ${u.role === 'user' ? 'plain' : 'dark'}`}>{t(`role.${u.role}`)}</span>
          <span className="muted" style={{ fontSize: 13, minWidth: 90 }}>
            {t('users.devices', { n: u.devices })}
          </span>
          <span className="muted" style={{ fontSize: 13, minWidth: 130 }}>
            {u.disabled
              ? t('users.disabled')
              : u.lastLoginAt
                ? t('users.lastLogin', { when: relative(u.lastLoginAt) })
                : t('users.neverLoggedIn')}
          </span>
          <button type="button" className="btn small" onClick={() => setEditing(u)}>
            {t('common.edit')}
          </button>
          {u.id !== me.id && (
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                await api.patch(`/users/${u.id}`, { disabled: !u.disabled });
                onChange();
              }}
            >
              {u.disabled ? t('users.enable') : t('users.disable')}
            </button>
          )}
          {u.id !== me.id && (
            <button
              type="button"
              className="btn small danger icon"
              aria-label={t('users.delete')}
              title={t('users.delete')}
              onClick={async () => {
                if (!window.confirm(t('users.deleteConfirm', { name: u.name }))) return;
                try {
                  await api.delete(`/users/${u.id}`);
                } catch (e) {
                  window.alert((e as ApiError).message);
                }
                onChange();
              }}
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      ))}
      {editing && (
        <UserForm
          companyId={editing.companyId}
          companyIsService={me.company.isService && editing.companyId === me.company.id}
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={onChange}
        />
      )}
    </div>
  );
}

export function UsersPanel({
  companyId,
  companyIsService,
  canManage,
}: {
  companyId: number;
  companyIsService: boolean;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const { data, error, reload } = useApi<{ items: User[] }>(canManage ? `/users${qs({ companyId })}` : null);
  const [inviting, setInviting] = useState(false);
  if (!canManage) return <Notice kind="info">{t('users.noAccess')}</Notice>;
  return (
    <div className="stack">
      <div className="section-h" style={{ alignItems: 'center' }}>
        <p>{t('users.teamInfo')}</p>
        <button type="button" className="btn dark" onClick={() => setInviting(true)}>
          <Icon name="plus" size={16} />
          {t('users.invite')}
        </button>
      </div>
      {error && <ErrorNotice error={error} />}
      {!data && !error && <Loading />}
      {data && <UserRows users={data.items} onChange={reload} />}
      {inviting && (
        <UserForm
          companyId={companyId}
          companyIsService={companyIsService}
          onClose={() => setInviting(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

/* ------------------------------ Machines ------------------------------ */

export function MachinesPanel({ companyId, canManage }: { companyId: number; canManage: boolean }) {
  const { t, int, date } = useI18n();
  const { data, error, reload } = useApi<{ items: Machine[] }>(`/companies/${companyId}/machines`);
  const [edit, setEdit] = useState<{ id: number; line: string } | null>(null);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  if (!data.items.length) return <Empty title={t('machines.none')}>{t('machines.noneHint')}</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('machines.machine')}</th>
            <th>{t('machines.line')}</th>
            <th className="num">{t('machines.heads')}</th>
            <th className="num">{t('machines.results')}</th>
            <th>{t('machines.last')}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((m) => (
            <tr key={m.id}>
              <td>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FamilyIcon family={m.family} />
                  <span className="mono" style={{ fontSize: 13.5 }}>
                    {m.machineNo}
                  </span>
                </span>
              </td>
              <td>
                {edit?.id === m.id ? (
                  <form
                    style={{ display: 'flex', gap: 6 }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await api.patch(`/machines/${m.id}`, { line: edit.line });
                      setEdit(null);
                      reload();
                    }}
                  >
                    <input
                      className="input"
                      style={{ minHeight: 34, width: 160 }}
                      value={edit.line}
                      onChange={(e) => setEdit({ id: m.id, line: e.target.value })}
                      aria-label={t('machines.line')}
                    />
                    <button type="submit" className="btn small primary">
                      {t('common.save')}
                    </button>
                  </form>
                ) : (
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {m.line ?? <span className="muted">–</span>}
                    {canManage && (
                      <button
                        type="button"
                        className="linkbtn"
                        style={{ fontSize: 13 }}
                        onClick={() => setEdit({ id: m.id, line: m.line ?? '' })}
                      >
                        {t('common.edit')}
                      </button>
                    )}
                  </span>
                )}
              </td>
              <td className="num">{int(m.heads)}</td>
              <td className="num">{int(m.results)}</td>
              <td>{date(m.lastResultAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
