import { type FormEvent, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { type ApiError, api, type Company, type Device, type IssuedCode, qs, type User } from '../lib/api';
import { useApi } from '../lib/useApi';
import { Icon } from './Icon';
import { QrCode } from './QrCode';
import { CopyButton, Empty, ErrorNotice, InfoTip, Loading, Modal, Notice } from './ui';

/** Whether the server can send invitations by e-mail (`SMTP_HOST` configured). */
export function useMailEnabled(): boolean {
  return useApi<{ mail?: boolean }>('/version').data?.mail === true;
}

/** QR code, link and code of an invitation or a "connect device" code. */
export function CodeView({ issued, label, expiry = true }: { issued: IssuedCode; label: string; expiry?: boolean }) {
  const { t, dateTime } = useI18n();
  return (
    <div className="code-view">
      <div className="qr-box">
        <QrCode value={issued.url} label={label} size={196} />
        <span className="muted">{t('invite.scanHint')}</span>
      </div>
      <div className="stack" style={{ gap: 12, flex: 1, minWidth: 0 }}>
        <div className="secret">
          <code style={{ overflowWrap: 'anywhere' }}>{issued.url}</code>
          <CopyButton value={issued.url} />
        </div>
        <div className="code-line">
          <span className="muted">{t('invite.code')}</span>
          <b className="mono code-big">{issued.code}</b>
        </div>
        {expiry && (
          <span className="muted" style={{ fontSize: 13 }}>
            {t('invite.validUntil', { date: dateTime(issued.expiresAt) })}
          </span>
        )}
      </div>
    </div>
  );
}

/** Shows a new invitation; "send by e-mail" when the server has a mail server. */
export function InviteDialog({
  user,
  issued: initial,
  onClose,
}: {
  user: Pick<User, 'id' | 'name' | 'email'>;
  issued: IssuedCode & { emailed?: boolean; mailError?: string };
  onClose(): void;
}) {
  const { t } = useI18n();
  const mail = useMailEnabled();
  const [issued, setIssued] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      const res = await api.post<{ invite: IssuedCode & { emailed: boolean; mailError?: string } }>(
        `/users/${user.id}/invite`,
        { send: true },
      );
      setIssued(res.invite);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={t('invite.title', { name: user.name })} onClose={onClose} wide>
      <p style={{ margin: 0 }}>{t('invite.text')}</p>
      <ol className="steps">
        <li>{t('invite.stepApp')}</li>
        <li>{t('invite.stepWeb')}</li>
      </ol>
      <CodeView issued={issued} label={t('invite.qrLabel', { name: user.name })} />
      {issued.emailed && <Notice kind="success" title={t('invite.emailed', { email: user.email })} />}
      {issued.mailError && (
        <Notice kind="warning" title={t('invite.mailFailed')}>
          {issued.mailError}
        </Notice>
      )}
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        {t('invite.lostHint')}
      </p>
      <div className="actions">
        {mail && !issued.emailed && (
          <button type="button" className="btn" disabled={busy} onClick={() => void send()}>
            <Icon name="mail" size={16} />
            {t('invite.sendMail')}
          </button>
        )}
        <button type="button" className="btn primary" onClick={onClose}>
          {t('common.done')}
        </button>
      </div>
    </Modal>
  );
}

function DeviceRow({ device, showUser, onDisconnect }: { device: Device; showUser: boolean; onDisconnect(): void }) {
  const { t, relative } = useI18n();
  return (
    <div className="device" style={{ background: 'var(--surface-2)' }}>
      <Icon name="device" />
      <span className="dn">
        <b>{device.name}</b>
        <span>
          {t(`platform.${device.platform}` as never)}
          {showUser ? ` · ${device.userName}` : ''}
          {device.appVersion ? ` · ${t('devices.appVersion', { v: device.appVersion })}` : ''}
        </span>
      </span>
      <span className="muted" style={{ fontSize: 13 }}>
        {t('devices.uploads', { n: device.uploadCount })}
      </span>
      <span className="muted" style={{ fontSize: 13, minWidth: 110 }}>
        {relative(device.lastSeenAt)}
      </span>
      <button
        type="button"
        className="btn small"
        onClick={async () => {
          if (!window.confirm(t('devices.disconnectConfirm', { name: device.name }))) return;
          await api.delete(`/devices/${device.id}`);
          onDisconnect();
        }}
      >
        {t('devices.disconnect')}
      </button>
    </div>
  );
}

/** All connected apps of a company and its limit of devices per user (Team → Devices). */
export function DevicesPanel({ companyId, canManage }: { companyId: number; canManage: boolean }) {
  const { t } = useI18n();
  const { data, error, reload } = useApi<{ items: Device[]; maxDevicesPerUser: number }>(
    canManage ? `/devices${qs({ companyId })}` : null,
  );
  const company = useApi<{ company: Company }>(canManage ? `/companies/${companyId}` : null);
  const [limit, setLimit] = useState('');
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const own = company.data?.company.maxDevicesPerUser ?? null;
  useEffect(() => {
    if (data) setLimit(String(data.maxDevicesPerUser));
  }, [data]);
  if (!canManage) return <Notice kind="info">{t('devices.noAccess')}</Notice>;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    try {
      await api.put(`/companies/${companyId}/device-limit`, { maxDevicesPerUser: Number(limit) });
      setSaved(true);
      reload();
      company.reload();
    } catch (err) {
      setSaveError(err as ApiError);
    }
  }

  return (
    <div className="stack">
      <form className="toolbar" style={{ alignItems: 'flex-end' }} onSubmit={save}>
        <label className="field" style={{ flex: '0 1 220px' }}>
          {t('devices.limit')}
          <input
            className="input mono"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <button type="submit" className="btn" disabled={!limit || Number(limit) < 1}>
          {t('common.save')}
        </button>
        <InfoTip text={own === null ? t('devices.limitDefault') : t('devices.limitInfo')} />
        {saved && <span className="muted">{t('common.saved')}</span>}
      </form>
      {saveError && <ErrorNotice error={saveError} />}
      {error && <ErrorNotice error={error} />}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && <Empty title={t('devices.none')} />}
      {data && data.items.length > 0 && (
        <div className="devices">
          {data.items.map((d) => (
            <DeviceRow key={d.id} device={d} showUser onDisconnect={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

/** "My account": own devices and a code to connect one more. */
export function MyDevices() {
  const { t, int } = useI18n();
  const { data, error, reload } = useApi<{ items: Device[]; maxDevicesPerUser: number }>('/devices');
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<ApiError | null>(null);
  const left = issued ? Math.max(0, new Date(issued.expiresAt).getTime() - now) : 0;
  useEffect(() => {
    if (!issued) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [issued]);
  // While the code is shown, look for the newly connected device.
  useEffect(() => {
    if (!issued || left === 0) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [issued, left, reload]);

  async function newCode() {
    setBusy(true);
    setCodeError(null);
    try {
      setIssued(await api.post<IssuedCode>('/devices/connect-code', {}));
      setNow(Date.now());
    } catch (err) {
      setCodeError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }
  const full = data ? data.items.length >= data.maxDevicesPerUser : false;
  const minutes = Math.floor(left / 60_000);
  const seconds = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>{t('devices.mine')}</h2>
        {error && <ErrorNotice error={error} />}
        {!data && !error && <Loading />}
        {data && data.items.length === 0 && <p className="muted">{t('devices.noneMine')}</p>}
        {data && data.items.length > 0 && (
          <div className="devices">
            {data.items.map((d) => (
              <DeviceRow key={d.id} device={d} showUser={false} onDisconnect={reload} />
            ))}
          </div>
        )}
        {data && (
          <span className="muted" style={{ fontSize: 13 }}>
            {t('devices.usage', { n: int(data.items.length), max: int(data.maxDevicesPerUser) })}
          </span>
        )}
      </section>
      <section className="card stack connect-card">
        <h2 style={{ margin: 0 }}>{t('devices.connectTitle')}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t('devices.connectText')}
        </p>
        {codeError && <ErrorNotice error={codeError} />}
        {full && <Notice kind="info">{t('devices.full')}</Notice>}
        {issued && left > 0 ? (
          <>
            <CodeView issued={issued} label={t('devices.qrLabel')} expiry={false} />
            <span className="countdown">{t('devices.countdown', { time: `${minutes}:${seconds}` })}</span>
          </>
        ) : (
          <div>
            <button type="button" className="btn primary" disabled={busy || full} onClick={() => void newCode()}>
              <Icon name="device" size={16} />
              {issued ? t('devices.newCode') : t('devices.showCode')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
