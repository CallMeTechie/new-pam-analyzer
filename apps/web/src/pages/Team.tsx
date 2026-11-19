import { useState } from 'react';
import { KeysPanel, MachinesPanel, UsersPanel } from '../components/CompanyPanels';
import { Page } from '../components/Layout';
import { Notice } from '../components/ui';
import { useI18n } from '../i18n';
import { useScope } from '../lib/scope';

type Tab = 'users' | 'keys' | 'machines';

/** "Team & API keys" of the company: company admins, and FUJI Service administrators in the company view. */
export function Team() {
  const { t } = useI18n();
  const scope = useScope();
  const [tab, setTab] = useState<Tab>('users');
  const companyId = scope.companyId;
  if (companyId === null) return null;
  return (
    <Page title={t('nav.team')}>
      <p className="muted" style={{ maxWidth: '80ch' }}>
        {t('team.intro', { company: scope.companyName ?? '' })}
      </p>
      {!scope.canManage && <Notice kind="info">{t('team.readOnly')}</Notice>}
      <div className="tabs" role="tablist" aria-label={t('companies.sections')}>
        {(['users', 'keys', 'machines'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`team.tab.${k}`)}
          </button>
        ))}
      </div>
      <section className="card">
        {tab === 'users' && <UsersPanel companyId={companyId} companyIsService={false} canManage={scope.canManage} />}
        {tab === 'keys' && <KeysPanel companyId={companyId} canManage={scope.canManage} />}
        {tab === 'machines' && <MachinesPanel companyId={companyId} canManage={scope.canManage} />}
      </section>
    </Page>
  );
}
