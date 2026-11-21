import { Field, Modal } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { machineTime } from './lib/engine';
import type { DateChoice } from './lib/types';
import { useEngine } from './lib/useEngine';

/**
 * Customer name with autocompletion from the names used so far (this PC and the server). New
 * names can simply be typed.
 */
export function CustomerInput({
  value,
  onChange,
  id,
  describedBy,
}: {
  value: string;
  onChange(value: string): void;
  id: string;
  describedBy?: string;
}) {
  const { t } = useI18n();
  const [, engine] = useEngine();
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    const timer = setTimeout(() => {
      void engine.customerSuggestions(value).then((names) => {
        if (n !== seq.current) return;
        setItems(names.filter((x) => x !== value.trim()).slice(0, 8));
        setActive(-1);
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [engine, value]);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };
  const shown = open && items.length > 0;

  return (
    <div className="combo">
      <input
        id={id}
        className="input"
        value={value}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...(active >= 0 ? { 'aria-activedescendant': `${listId}-${active}` } : {})}
        autoComplete="off"
        placeholder={t('client.assign.customerPlaceholder')}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!shown) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            const name = items[active];
            if (name) choose(name);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {shown && (
        <div className="combo-list" role="listbox" id={listId}>
          {items.map((name, i) => (
            <div
              key={name}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(name);
              }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * After an import (or for one result): customer and test date. Applies to all `ids`; the
 * customer can be left empty.
 */
export function AssignDialog({
  ids,
  title,
  initialCustomer = '',
  edit = false,
  onClose,
}: {
  /** Changing one existing result instead of asking after an import. */
  edit?: boolean;
  ids: number[];
  title: string;
  initialCustomer?: string;
  onClose(): void;
}) {
  const { t, dateTime, date } = useI18n();
  const [s, engine] = useEngine();
  const [customer, setCustomer] = useState(initialCustomer);
  const today = machineTime(new Date()).slice(0, 10);
  const first = s.rows.find((r) => r.id === ids[0]);
  // When editing, a date entered by hand stays selected.
  const manual = edit && first?.dateSource === 'manual';
  const [kind, setKind] = useState<DateChoice['kind']>(manual ? 'date' : 'file');
  const [other, setOther] = useState(manual && first ? first.testDate.slice(0, 10) : today);
  const [busy, setBusy] = useState(false);
  const fromFile =
    first && first.dateSource !== 'manual'
      ? `${dateTime(first.testDate)} · ${t(`dateSource.${first.dateSource}`)}`
      : '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const choice: DateChoice = kind === 'date' ? { kind, date: other } : { kind };
    await engine.assign(ids, { customer: customer || null, date: choice });
    setBusy(false);
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="assign" onSubmit={(e) => void submit(e)}>
        {!edit && <p className="muted">{t('client.assign.text', { n: ids.length })}</p>}
        <Field label={t('fact.customer')} hint={t('client.assign.customerHint')}>
          {(p) => (
            <CustomerInput
              id={p.id}
              value={customer}
              onChange={setCustomer}
              {...(p['aria-describedby'] ? { describedBy: p['aria-describedby'] } : {})}
            />
          )}
        </Field>
        <fieldset className="radio-cards">
          <legend>{t('client.assign.date')}</legend>
          <label className={kind === 'file' ? 'on' : ''}>
            <input type="radio" name="date" checked={kind === 'file'} onChange={() => setKind('file')} />
            <span>
              <b>{t('client.assign.fromFile')}</b>
              <small>{ids.length === 1 ? fromFile : t('client.assign.fromFileMany')}</small>
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
            {edit ? t('common.cancel') : t('client.assign.skip')}
          </button>
          <button type="submit" className="btn primary" disabled={busy || (kind === 'date' && !other)}>
            {t('client.assign.apply')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
