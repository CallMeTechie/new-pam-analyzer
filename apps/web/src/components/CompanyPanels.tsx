import { machineLabel } from '@pam/core';
import { type FormEvent, useRef, useState } from 'react';
import { CATALOGS, useI18n } from '../i18n';
import { type ApiError, api, type Company, type IssuedCode, type Machine, qs, type Role, type User } from '../lib/api';
import { useUser } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { InviteDialog, useMailEnabled } from './Devices';
import { Icon } from './Icon';
import { initials } from './Layout';
import {
  CompanyBadge,
  CopyButton,
  Empty,
  ErrorNotice,
  errorText,
  FamilyIcon,
  Field,
  InfoTip,
  Loading,
  Modal,
  Notice,
} from './ui';

/** Random initial password, shown once to the person creating the account. */
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/* ------------------------------ Users ------------------------------ */

export function UserForm({
  companyId: initialCompanyId,
  companyName,
  user,
  onClose,
  onSaved,
}: {
  companyId: number;
  /** Shown read-only when the company cannot be chosen. */
  companyName?: string;
  user?: User;
  onClose(): void;
  onSaved(): void;
}) {
  const { t } = useI18n();
  const me = useUser();
  const isAdmin = me.role === 'admin' && me.company.isService;
  // Administrators choose the company (and can move users); everyone else sees it read-only.
  const companies = useApi<{ items: Company[] }>(isAdmin ? '/companies' : null);
  const [companyId, setCompanyId] = useState(user?.companyId ?? initialCompanyId);
  const company = companies.data?.items.find((c) => c.id === companyId);
  const companyIsService = company?.isService ?? (companyId === me.company.id && me.company.isService);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'user');
  const [locale, setLocale] = useState(user?.locale ?? 'en');
  // New members choose their password through the invitation; for existing accounts a new
  // initial password can still be set by hand.
  const [password, setPassword] = useState('');
  const mail = useMailEnabled();
  const [sendMail, setSendMail] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [invited, setInvited] = useState<{ user: User; invite: IssuedCode & { emailed: boolean } } | null>(null);
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
          ...(isAdmin && !self && companyId !== user.companyId ? { companyId } : {}),
          ...(self ? {} : { role }),
          ...(password ? { password } : {}),
        });
      } else {
        const res = await api.post<{ user: User; invite: IssuedCode & { emailed: boolean } }>('/users', {
          companyId,
          name: name.trim(),
          email,
          role,
          locale,
          sendInvite: mail && sendMail,
        });
        onSaved();
        setInvited(res);
        return;
      }
      onSaved();
      if (password) setDone(password);
      else onClose();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  if (invited) return <InviteDialog user={invited.user} issued={invited.invite} onClose={onClose} />;

  if (done) {
    return (
      <Modal title={t('users.passwordReset')} onClose={onClose}>
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
        <Field
          label={t('upload.company')}
          hint={user && isAdmin && companyId !== user.companyId ? t('users.moveHint') : undefined}
        >
          {(p) =>
            isAdmin && !self ? (
              <select
                {...p}
                className="select"
                value={companyId}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setCompanyId(next);
                  const target = companies.data?.items.find((c) => c.id === next);
                  if (!target?.isService && role === 'admin') setRole('companyAdmin');
                }}
              >
                {companies.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input {...p} className="input" value={user?.companyName ?? companyName ?? me.company.name} disabled />
            )
          }
        </Field>
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
        {user ? (
          <Field label={t('users.newPassword')} hint={t('users.passwordRule')}>
            {(p) => (
              <span style={{ display: 'flex', gap: 8 }}>
                <input
                  {...p}
                  className="input mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('users.keepPassword')}
                  minLength={12}
                />
                <button type="button" className="btn" onClick={() => setPassword(generatePassword())}>
                  {t('users.generate')}
                </button>
              </span>
            )}
          </Field>
        ) : (
          <>
            <Notice kind="info">{t('users.inviteInfo')}</Notice>
            {mail && (
              <label className="check">
                <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
                {t('users.sendInvite', { email: email || '…' })}
              </label>
            )}
          </>
        )}
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
            disabled={!name.trim() || !email || (password.length > 0 && password.length < 12)}
          >
            {user ? t('common.save') : t('users.invite')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function UserRows({ users, onChange, showCompany }: { users: User[]; onChange(): void; showCompany?: boolean }) {
  const { t, relative, date } = useI18n();
  const me = useUser();
  const [editing, setEditing] = useState<User | null>(null);
  const [inviting, setInviting] = useState<{ user: User; invite: IssuedCode } | null>(null);
  async function invite(u: User) {
    const res = await api.post<{ invite: IssuedCode }>(`/users/${u.id}/invite`, {});
    setInviting({ user: u, invite: res.invite });
    onChange();
  }
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
              : u.inviteUntil
                ? t('users.invitePending', { date: date(new Date(u.inviteUntil).toISOString()) })
                : u.lastLoginAt
                  ? t('users.lastLogin', { when: relative(u.lastLoginAt) })
                  : t('users.neverLoggedIn')}
          </span>
          {!u.disabled && (
            <button
              type="button"
              className="btn small"
              title={t('users.inviteAgainHint')}
              onClick={() => void invite(u)}
            >
              <Icon name="device" size={14} />
              {t('users.inviteAgain')}
            </button>
          )}
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
        <UserForm companyId={editing.companyId} user={editing} onClose={() => setEditing(null)} onSaved={onChange} />
      )}
      {inviting && <InviteDialog user={inviting.user} issued={inviting.invite} onClose={() => setInviting(null)} />}
    </div>
  );
}

export function UsersPanel({
  companyId,
  companyName,
  canManage,
}: {
  companyId: number;
  companyName: string;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const { data, error, reload } = useApi<{ items: User[] }>(canManage ? `/users${qs({ companyId })}` : null);
  const [inviting, setInviting] = useState(false);
  if (!canManage) return <Notice kind="info">{t('users.noAccess')}</Notice>;
  return (
    <div className="stack">
      <div className="section-h" style={{ alignItems: 'center' }}>
        <span />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <InfoTip text={t('users.teamInfo')} />
          <button type="button" className="btn dark" onClick={() => setInviting(true)}>
            <Icon name="plus" size={16} />
            {t('users.invite')}
          </button>
        </span>
      </div>
      {error && <ErrorNotice error={error} />}
      {!data && !error && <Loading />}
      {data && <UserRows users={data.items} onChange={reload} />}
      {inviting && (
        <UserForm companyId={companyId} companyName={companyName} onClose={() => setInviting(false)} onSaved={reload} />
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
                    {machineLabel(m.machineNo, t('machine.sn'))}
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

/* ------------------------------ Logo ------------------------------ */

/** Upload or remove the logo of a company (PNG, JPEG or WebP, at most 512 KB). */
export function LogoEditor({
  company,
  onChange,
}: {
  company: { id: number; name: string; isService?: boolean; logoVersion?: number | null };
  onChange(): void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<ApiError | null>(null);
  async function upload(file: File) {
    setError(null);
    const form = new FormData();
    form.append('logo', file);
    try {
      await api.put(`/companies/${company.id}/logo`, form);
      onChange();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  return (
    <div className="logo-editor">
      <CompanyBadge company={company} size={56} />
      <div className="stack tight">
        <div className="form-row" style={{ gap: 8 }}>
          <button type="button" className="btn small" onClick={() => input.current?.click()}>
            <Icon name="upload" size={14} />
            {company.logoVersion ? t('logo.replace') : t('logo.upload')}
          </button>
          {company.logoVersion ? (
            <button
              type="button"
              className="btn small danger"
              onClick={async () => {
                await api.delete(`/companies/${company.id}/logo`);
                onChange();
              }}
            >
              {t('logo.remove')}
            </button>
          ) : null}
          <InfoTip text={t('logo.hint')} />
        </div>
        {error && <span className="error-text">{errorText(t, error)}</span>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
