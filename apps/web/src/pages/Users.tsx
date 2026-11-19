import { useState } from 'react';
import { UserForm, UserRows } from '../components/CompanyPanels';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { ErrorNotice, Loading } from '../components/ui';
import { useI18n } from '../i18n';
import type { Company, Role, User } from '../lib/api';
import { useUser } from '../lib/auth';
import { useApi } from '../lib/useApi';

/** All users (administrators) or the users of the own company (company admins of the service company). */
export function Users() {
  const { t } = useI18n();
  const me = useUser();
  const isAdmin = me.role === 'admin';
  const { data, error, reload } = useApi<{ items: User[] }>('/users');
  const companies = useApi<{ items: Company[] }>(isAdmin ? '/companies' : null);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [q, setQ] = useState('');
  const [inviting, setInviting] = useState(false);
  const term = q.trim().toLowerCase();
  const items = (data?.items ?? []).filter(
    (u) =>
      (!company || u.companyId === Number(company)) &&
      (!role || u.role === role) &&
      (!term || u.name.toLowerCase().includes(term) || u.email.includes(term)),
  );
  const inviteCompany =
    companies.data?.items.find((c) => c.id === Number(company)) ?? companies.data?.items.find((c) => c.isService);

  return (
    <Page
      title={t('nav.users')}
      actions={
        <button
          type="button"
          className="btn primary"
          onClick={() => setInviting(true)}
          disabled={isAdmin && !inviteCompany}
        >
          <Icon name="plus" size={16} />
          {t('users.invite')}
        </button>
      }
    >
      <p className="muted" style={{ maxWidth: '80ch' }}>
        {t('users.intro')}
      </p>
      <section className="card filters">
        <input
          className="input"
          style={{ flex: '1 1 240px' }}
          type="search"
          placeholder={t('users.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('users.search')}
        />
        <div className="right">
          {isAdmin && (
            <select
              className="select"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              aria-label={t('upload.company')}
            >
              <option value="">{t('users.allCompanies')}</option>
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="select"
            value={role}
            onChange={(e) => setRole(e.target.value as Role | '')}
            aria-label={t('users.role')}
          >
            <option value="">{t('users.allRoles')}</option>
            {(['admin', 'companyAdmin', 'user'] as const).map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
        </div>
      </section>
      {error && <ErrorNotice error={error} />}
      {!data && !error && <Loading />}
      {data && (
        <section className="card">
          <UserRows users={items} onChange={reload} showCompany={isAdmin} />
        </section>
      )}
      {inviting && (
        <UserForm
          companyId={isAdmin ? (inviteCompany?.id ?? me.company.id) : me.company.id}
          companyIsService={isAdmin ? (inviteCompany?.isService ?? true) : true}
          onClose={() => setInviting(false)}
          onSaved={reload}
        />
      )}
    </Page>
  );
}
