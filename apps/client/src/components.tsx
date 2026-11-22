import { Icon, type IconName } from '@web/components/Icon';
import { useI18n } from '@web/i18n';
import { Link } from 'react-router';
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

/** Connection state at the bottom of the sidebar. */
export function ConnectionCard({ compact = false, testId = 'connection' }: { compact?: boolean; testId?: string }) {
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
  if (compact) {
    // Windows rail: a dot with the state as tooltip and for screen readers.
    return (
      <Link to="/settings?tab=server" className="conn-dot" data-testid={testId} title={`${title} · ${text}`}>
        <span className={`dot dot-${dot}`} />
        <span className="sr-only">
          {title} {text}
        </span>
      </Link>
    );
  }
  return (
    <Link to="/settings?tab=server" className="conn-card" data-testid={testId}>
      <b>
        <span className={`dot dot-${dot}`} />
        {title}
      </b>
      {s.connection && <span className="conn-host">{new URL(s.connection.server).host}</span>}
      <span>{text}</span>
    </Link>
  );
}
