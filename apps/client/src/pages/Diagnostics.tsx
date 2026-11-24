import { Icon } from '@web/components/Icon';
import { CopyButton, Field, Modal, Notice } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { type FormEvent, useState, useSyncExternalStore } from 'react';
import { diag, systemInfo } from '../lib/diag';
import { useEngine } from '../lib/useEngine';
import { useToast } from '../toast';

/** "Report a problem": the user's description, with the app's log and device facts. */
function ReportDialog({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  const [s, engine] = useEngine();
  const toast = useToast();
  const [text, setText] = useState('');
  const [history, setHistory] = useState(true);
  const [device, setDevice] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    diag.report(text, {
      history,
      device,
      context: {
        os: engine.platform.os,
        version: engine.platform.version,
        system: systemInfo(),
        results: s.rows.length,
        queued: s.rows.filter((r) => r.upload === 'queued').length,
        server: s.server,
      },
    });
    const before = diag.snapshot().pending;
    await engine.sendLogs();
    const sent = diag.snapshot().pending < before;
    setBusy(false);
    toast.show({
      kind: sent ? 'success' : 'info',
      title: sent ? t('client.diag.sent') : t('client.diag.kept'),
      ...(sent ? {} : { text: t('client.diag.keptText') }),
    });
    onClose();
  }

  return (
    <Modal title={t('client.diag.reportTitle')} onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={(e) => void submit(e)}>
        <Field label={t('client.diag.what')}>
          {(p) => (
            <textarea
              {...p}
              className="input"
              rows={5}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('client.diag.whatPlaceholder')}
            />
          )}
        </Field>
        <label className="check">
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
          {t('client.diag.withHistory')}
        </label>
        <label className="check">
          <input type="checkbox" checked={device} onChange={(e) => setDevice(e.target.checked)} />
          {t('client.diag.withDevice')}
        </label>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {t('client.diag.offlineHint')}
        </p>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !text.trim()}>
            {t('client.diag.send')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryDialog({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  const text = diag.historyText();
  return (
    <Modal title={t('client.diag.historyTitle')} onClose={onClose} wide>
      <pre className="log-pre" style={{ maxHeight: '55vh' }} data-testid="diag-history">
        {text || t('client.diag.historyEmpty')}
      </pre>
      <div className="actions">
        <CopyButton value={text} />
        <button type="button" className="btn primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}

/** Settings → Diagnostics: reports for Logs & Monitoring on the server. */
export function Diagnostics() {
  const { t } = useI18n();
  const [s, engine] = useEngine();
  const state = useSyncExternalStore(diag.subscribe, diag.snapshot);
  const [dialog, setDialog] = useState<'report' | 'history' | null>(null);
  const [sending, setSending] = useState(false);
  const connected = Boolean(s.connection) && s.server !== 'revoked';

  return (
    <div className="grid-2 settings-grid">
      <section className="card stack" data-testid="diagnostics">
        <h2>{t('client.diag.title')}</h2>
        <label className="toggle-row">
          <span>
            <b>{t('client.diag.autoSend')}</b>
            <small className="muted">{t('client.diag.autoSendText')}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={state.autoSend}
            checked={state.autoSend}
            onChange={(e) => diag.setAutoSend(e.target.checked)}
          />
        </label>
        <div className="diag-pending">
          <span>
            <b>{t('client.diag.pending', { n: state.pending })}</b>
            <small className="muted">
              {connected ? t('client.diag.pendingConnected') : t('client.diag.pendingOffline')}
            </small>
          </span>
          {connected && state.pending > 0 && (
            <button
              type="button"
              className="btn small"
              disabled={sending}
              onClick={async () => {
                setSending(true);
                await engine.sendLogs();
                setSending(false);
              }}
            >
              {t('client.diag.sendNow')}
            </button>
          )}
        </div>
        {!s.connection && <Notice kind="info">{t('client.diag.notConnected')}</Notice>}
        <div className="form-row">
          <button type="button" className="btn primary" onClick={() => setDialog('report')}>
            <Icon name="mail" size={16} />
            {t('client.diag.report')}
          </button>
          <button type="button" className="btn" onClick={() => setDialog('history')}>
            {t('client.diag.history')}
          </button>
        </div>
      </section>
      {dialog === 'report' && <ReportDialog onClose={() => setDialog(null)} />}
      {dialog === 'history' && <HistoryDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
