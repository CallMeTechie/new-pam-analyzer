import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LogoEditor, MachinesPanel, UsersPanel } from '../components/CompanyPanels';
import { DevicesPanel } from '../components/Devices';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { CompanyBadge, Empty, ErrorNotice, Loading, Modal } from '../components/ui';
import { useI18n } from '../i18n';
import { type ApiError, api, type Company } from '../lib/api';
import { useUser } from '../lib/auth';
import { useApi } from '../lib/useApi';

type Tab = 'devices' | 'users' | 'machines';

function CompanyForm({ company, onClose, onSaved }: { company?: Company; onClose(): void; onSaved(c: Company): void }) {
  const { t } = useI18n();
  const [name, setName] = useState(company?.name ?? '');
  const [number, setNumber] = useState(company?.number ?? '');
  const [location, setLocation] = useState(company?.location ?? '');
  const [notes, setNotes] = useState(company?.notes ?? '');
  const [error, setError] = useState<ApiError | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const body = { name: name.trim(), number, location, notes };
      const res = company
        ? await api.patch<{ company: Company }>(`/companies/${company.id}`, body)
        : await api.post<{ company: Company }>('/companies', body);
      onSaved(res.company);
      onClose();
    } catch (err) {
      setError(err as ApiError);
    }
  }
  return (
    <Modal title={company ? t('companies.editTitle') : t('companies.add')} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {error && <ErrorNotice error={error} />}
        <div className="form-grid">
          <label className="field">
            {t('companies.name')}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </label>
          <label className="field">
            {t('companies.number')}
            <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} />
          </label>
        </div>
        <label className="field">
          {t('companies.location')}
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
        </label>
        <label className="field">
          {t('companies.notes')}
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Companies() {
  const { t, int, date } = useI18n();
  const me = useUser();
  const isAdmin = me.role === 'admin';
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useApi<{ items: Company[] }>('/companies');
  const [tab, setTab] = useState<Tab>('users');
  const [form, setForm] = useState<'new' | 'edit' | null>(null);
  const selectedId = Number(params.get('selected')) || data?.items.find((c) => !c.isService)?.id || data?.items[0]?.id;
  const selected = data?.items.find((c) => c.id === selectedId);
  const select = (id: number) => setParams({ selected: String(id) }, { replace: true });

  return (
    <Page
      title={t('nav.companies')}
      info={t('companies.intro')}
      actions={
        isAdmin && (
          <button type="button" className="btn primary" onClick={() => setForm('new')}>
            <Icon name="plus" size={16} />
            {t('companies.add')}
          </button>
        )
      }
    >
      {error && <ErrorNotice error={error} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="split">
          <ul className="company-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {data.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="company-item"
                  aria-current={c.id === selectedId}
                  onClick={() => select(c.id)}
                  style={{ opacity: c.disabled ? 0.6 : 1 }}
                >
                  <CompanyBadge company={c} />
                  <span className="cm">
                    <b>
                      {c.name}
                      {c.isService && <span className="service-pill">{t('companies.service')}</span>}
                    </b>
                    <span>
                      {c.disabled
                        ? t('companies.disabled')
                        : c.location || (c.isService ? t('companies.service') : '–')}
                    </span>
                  </span>
                  <span className="muted" style={{ fontSize: 12.5, textAlign: 'right' }}>
                    {t('companies.resultsShort', { n: c.results })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <section className="card stack" style={{ gap: 18 }}>
              <div className="section-h" style={{ alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <CompanyBadge company={selected} size={52} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 22, fontWeight: 800, display: 'block', overflowWrap: 'anywhere' }}>
                      {selected.name}
                    </b>
                    {selected.isService && (
                      <span className="service-pill" title={t('companies.serviceHint')}>
                        {t('companies.serviceSeesAll')}
                      </span>
                    )}
                    <span className="muted" style={{ fontSize: 13.5, display: 'block' }}>
                      {[
                        selected.number,
                        selected.location,
                        t('companies.since', { date: date(selected.createdAt.slice(0, 10)) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                </div>
                <div className="form-row">
                  {isAdmin && (
                    <button type="button" className="btn" onClick={() => setForm('edit')}>
                      <Icon name="edit" size={16} />
                      {t('common.edit')}
                    </button>
                  )}
                  {isAdmin && !selected.isService && (
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        if (
                          !selected.disabled &&
                          !window.confirm(t('companies.disableConfirm', { name: selected.name }))
                        )
                          return;
                        await api.patch(`/companies/${selected.id}`, { disabled: !selected.disabled });
                        reload();
                      }}
                    >
                      {selected.disabled ? t('companies.enable') : t('companies.disable')}
                    </button>
                  )}
                  {!selected.isService && (
                    <Link to={`/companies/${selected.id}/view`} className="btn primary">
                      <Icon name="eye" size={16} />
                      {t('companies.openView')}
                    </Link>
                  )}
                </div>
              </div>
              <div className="stat-row">
                <div className="stat">
                  <span>{t('companies.users')}</span>
                  <b>{int(selected.users)}</b>
                </div>
                <div className="stat">
                  <span>{t('companies.devices')}</span>
                  <b>{int(selected.devices)}</b>
                </div>
                <div className="stat">
                  <span>{t('companies.machines')}</span>
                  <b>{int(selected.machines)}</b>
                </div>
                <div className="stat">
                  <span>{t('companies.results')}</span>
                  <b>{int(selected.results)}</b>
                </div>
              </div>
              {selected.notes && <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{selected.notes}</p>}
              {isAdmin && <LogoEditor company={selected} onChange={reload} />}
              <div className="tabs" role="tablist" aria-label={t('companies.sections')}>
                {(['users', 'devices', 'machines'] as const).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                    {t(`companies.tab.${k}`)}
                  </button>
                ))}
              </div>
              {tab === 'devices' && (
                <DevicesPanel key={`d${selected.id}`} companyId={selected.id} canManage={isAdmin} />
              )}
              {tab === 'users' && (
                <UsersPanel
                  key={`u${selected.id}`}
                  companyId={selected.id}
                  companyName={selected.name}
                  canManage={isAdmin}
                />
              )}
              {tab === 'machines' && (
                <MachinesPanel key={`m${selected.id}`} companyId={selected.id} canManage={isAdmin} />
              )}
            </section>
          ) : (
            <Empty title={t('companies.none')} />
          )}
        </div>
      )}
      {form && (
        <CompanyForm
          {...(form === 'edit' && selected ? { company: selected } : {})}
          onClose={() => setForm(null)}
          onSaved={(c) => {
            reload();
            select(c.id);
          }}
        />
      )}
    </Page>
  );
}
