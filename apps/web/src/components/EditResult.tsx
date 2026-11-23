import { type FormEvent, useEffect, useId, useState } from 'react';
import { useI18n } from '../i18n';
import { type ApiError, api, notifyDataChanged, qs, type ResultDetail } from '../lib/api';
import { ErrorNotice, Field, Modal } from './ui';

type DateKind = 'file' | 'today' | 'date';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Customer and test date of a result on the web, like "Customer & date" in the apps: the date from the
 * measurement file, today, or another day (the time of day of the measurement is kept).
 */
export function EditResultDialog({ detail, onClose }: { detail: ResultDetail; onClose(): void }) {
  const { t, dateTime, date } = useI18n();
  const r = detail.result;
  const listId = useId();
  const [customer, setCustomer] = useState(r.customer ?? '');
  const today = isoDay(new Date());
  const manual = r.dateSource === 'manual';
  const [kind, setKind] = useState<DateKind>(manual ? 'date' : 'file');
  const [other, setOther] = useState(manual ? r.testDate.slice(0, 10) : today);
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const time = r.testDate.slice(11, 19) || '12:00:00';

  // Suggestions: customers used so far in this company.
  useEffect(() => {
    const timer = setTimeout(() => {
      void api
        .get<{ items: { name: string }[] }>(
          `/results/customers${qs({ q: customer.trim(), companyId: r.companyId ?? undefined })}`,
        )
        .then((res) => setNames(res.items.map((i) => i.name).filter((n) => n !== customer.trim())))
        .catch(() => setNames([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [customer, r.companyId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/results/${r.id}`, {
        customer: customer.trim() || null,
        testDate: kind === 'file' ? null : `${kind === 'today' ? today : other} ${time}`,
      });
      notifyDataChanged();
      onClose();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('client.assign.title')} onClose={onClose}>
      <form className="assign" onSubmit={(e) => void submit(e)}>
        {error && <ErrorNotice error={error} />}
        <Field label={t('fact.customer')} hint={t('client.assign.customerHint')}>
          {(p) => (
            <>
              <input
                {...p}
                className="input"
                list={listId}
                value={customer}
                maxLength={200}
                autoComplete="off"
                placeholder={t('client.assign.customerPlaceholder')}
                onChange={(e) => setCustomer(e.target.value)}
              />
              <datalist id={listId}>
                {names.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <fieldset className="radio-cards">
          <legend>{t('client.assign.date')}</legend>
          <label className={kind === 'file' ? 'on' : ''}>
            <input type="radio" name="date" checked={kind === 'file'} onChange={() => setKind('file')} />
            <span>
              <b>{t('client.assign.fromFile')}</b>
              {!manual && (
                <small>
                  {dateTime(r.testDate)} · {t(`dateSource.${r.dateSource}`)}
                </small>
              )}
            </span>
          </label>
          <label className={kind === 'today' ? 'on' : ''}>
            <input type="radio" name="date" checked={kind === 'today'} onChange={() => setKind('today')} />
            <span>
              <b>{t('client.assign.today', { date: date(today) })}</b>
            </span>
          </label>
          <label className={kind === 'date' ? 'on' : ''}>
            <input type="radio" name="date" checked={kind === 'date'} onChange={() => setKind('date')} />
            <span>
              <b>{t('client.assign.other')}</b>
              <input
                type="date"
                className="input"
                value={other}
                max={today}
                aria-label={t('client.assign.other')}
                onChange={(e) => {
                  setOther(e.target.value);
                  setKind('date');
                }}
              />
            </span>
          </label>
        </fieldset>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={busy || (kind === 'date' && !other)}>
            {t('client.assign.apply')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
