import { useState } from 'react';
import { KeysPanel, LogoEditor, MachinesPanel, UsersPanel } from '../components/CompanyPanels';
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
    <Page title={t('nav.team')} info={t('team.intro', { company: scope.companyName ?? '' })}>
      {!scope.canManage && <Notice kind="info">{t('team.readOnly')}</Notice>}
      {scope.canManage && (
        <section className="card" style={{ padding: '14px 18px' }}>
          <LogoEditor
            company={{ id: companyId, name: scope.companyName ?? '', logoVersion: scope.companyLogoVersion }}
            onChange={scope.refreshCompany}
          />
        </section>
      )}
      <div className="tabs" role="tablist" aria-label={t('companies.sections')}>
        {(['users', 'keys', 'machines'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`team.tab.${k}`)}
          </button>
        ))}
      </div>
      <section className="card">
        {tab === 'users' && (
          <UsersPanel companyId={companyId} companyName={scope.companyName ?? ''} canManage={scope.canManage} />
        )}
        {tab === 'keys' && <KeysPanel companyId={companyId} canManage={scope.canManage} />}
        {tab === 'machines' && <MachinesPanel companyId={companyId} canManage={scope.canManage} />}
      </section>
    </Page>
  );
}
