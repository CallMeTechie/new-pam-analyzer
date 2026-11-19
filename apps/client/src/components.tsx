import { Icon, type IconName } from '@web/components/Icon';
import { useI18n } from '@web/i18n';
import type { ImportSummary } from './lib/engine';
import type { UploadState } from './lib/types';
import { useEngine } from './lib/useEngine';

/** Text for why a file was not evaluated or not accepted by the server. */
export function reasonText(t: ReturnType<typeof useI18n>['t'], reason: string): string {
  if (reason === 'unsupported_type' || reason === 'invalid_archive') return t(`skip.${reason}`);
  const key = `reject.${reason}` as const;
  const text = t(key as never);
  return text === key ? t('reject.unreadable') : text;
}

const UPLOAD_ICON: Record<UploadState, IconName> = {
  uploaded: 'check',
  queued: 'history',
  local: 'device',
  rejected: 'warning',
};

/** Where the original file stands with respect to the server. */
export function UploadChip({ state, reason }: { state: UploadState; reason?: string | null }) {
  const { t } = useI18n();
  const title = state === 'rejected' && reason ? reasonText(t, reason) : undefined;
  return (
    <span className={`upchip up-${state}`} title={title}>
      <Icon name={UPLOAD_ICON[state]} size={13} stroke={2.4} />
      {t(`client.upload.${state}`)}
    </span>
  );
}

/** Result of opening or dropping files. */
export function ImportBanner({
  summary,
  onOpen,
  onClose,
}: {
  summary: ImportSummary;
  onOpen?: () => void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const created = summary.created.length;
  const parts = [
    created ? t('client.import.created', { n: created }) : '',
    summary.duplicates.length ? t('client.import.duplicates', { n: summary.duplicates.length }) : '',
    summary.rejected.length ? t('client.import.rejected', { n: summary.rejected.length }) : '',
  ].filter(Boolean);
  const kind = created ? 'success' : summary.rejected.length ? 'error' : 'info';
  return (
    <div className={`notice ${kind}`} role="status">
      <Icon name={created ? 'checkCircle' : kind === 'error' ? 'warning' : 'info'} size={20} />
      <div>
        <b>{parts.join(' · ') || t('client.import.nothing')}</b>
        {summary.rejected.length > 0 && (
          <ul className="reject-list">
            {summary.rejected.slice(0, 5).map((r) => (
              <li key={r.name}>
                <span className="mono">{r.name}</span>: {reasonText(t, r.reason)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="notice-actions">
        {onOpen && (
          <button type="button" className="btn small" onClick={onOpen}>
            {t('client.import.open')}
          </button>
        )}
        <button type="button" className="btn small ghost icon" aria-label={t('common.close')} onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </span>
    </div>
  );
}

/** Connection state at the bottom of the sidebar. */
export function ConnectionCard() {
  const { t } = useI18n();
  const [s] = useEngine();
  const queued = s.rows.filter((r) => r.upload === 'queued').length;
  let dot = 'off';
  let title = t('client.conn.off');
  let text = t('client.conn.offText');
  if (s.connection) {
    if (s.server === 'revoked') {
      dot = 'error';
      title = t('client.conn.revoked');
      text = t('client.conn.revokedText');
    } else if (s.server === 'offline') {
      dot = 'wait';
      title = t('client.conn.offline', { n: queued });
      text = t('client.conn.offlineText');
    } else {
      dot = s.syncing || queued ? 'wait' : 'on';
      title = s.syncing ? t('client.conn.syncing', { n: queued }) : t('client.conn.on');
      text = s.connection.companyName;
    }
  }
  return (
    <div className="conn-card" data-testid="connection">
      <b>
        <span className={`dot dot-${dot}`} />
        {title}
      </b>
      {s.connection && <span className="conn-host">{new URL(s.connection.server).host}</span>}
      <span>{text}</span>
    </div>
  );
}
