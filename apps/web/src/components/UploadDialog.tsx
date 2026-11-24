import { parsePamFile } from '@pam/core';
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api, type Company, qs } from '../lib/api';
import { isUploading, startUpload, useBackgroundUpload } from '../lib/backgroundUpload';
import { type Picked, type ZipInfo, zipInfo } from '../lib/pickedFiles';
import { useScope } from '../lib/scope';
import type { UploadMeta } from '../lib/uploadQueue';
import { useApi } from '../lib/useApi';
import { Icon } from './Icon';
import { Modal } from './ui';

const isZip = (p: Picked) => /\.zip$/i.test(p.file.name);
const decoder = new TextDecoder('utf-8');
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** Files whose date is read for the preview; more only cost time. */
const PREVIEW_FILES = 300;

/** Test date of a `.dat` file as the server will take it (header, else modification date). */
async function fileDate(file: File): Promise<string | null> {
  try {
    const parsed = parsePamFile(decoder.decode(await file.arrayBuffer()), file.name, {
      lastModified: new Date(file.lastModified),
      timeZone,
    });
    return parsed.header.testDate;
  } catch {
    return null;
  }
}

type Suggestion = { kind: 'company'; id: number; name: string } | { kind: 'customer'; name: string; results: number };

/**
 * Asked right after files were chosen or dropped: the company or customer (one field: a company in
 * the system gets the results, any other name is stored as customer) and the test date. Nothing is
 * required: "Skip" uploads as they are.
 */
export function UploadDialog({ files, ignored, onClose }: { files: Picked[]; ignored: number; onClose(): void }) {
  const { t, num, date, int } = useI18n();
  const scope = useScope();
  const staffAll = scope.companyId === null;
  const running = useBackgroundUpload().status === 'running';
  const companies = useApi<{ items: Company[] }>(staffAll ? '/companies' : null);
  const listId = useId();
  const [party, setParty] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [customers, setCustomers] = useState<{ name: string; results: number }[]>([]);
  const [zips, setZips] = useState<Record<string, ZipInfo>>({});
  const [dates, setDates] = useState<Record<string, string | null>>({});
  const [showList, setShowList] = useState(false);
  const single = files.length === 1 && !isZip(files[0] as Picked) ? (files[0] as Picked) : null;
  const original = single ? dates[single.key] : undefined;
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [kind, setKind] = useState<'file' | 'all'>('file');
  const seq = useRef(0);
  const requested = useRef(new Set<string>());

  // Look into ZIP archives (directory only) and read the dates of the PAM files for the preview.
  useEffect(() => {
    const todo = files.filter((p) => !requested.current.has(p.key));
    for (const p of todo) requested.current.add(p.key);
    for (const p of todo.filter(isZip)) {
      void zipInfo(p.file).then((info) => setZips((z) => ({ ...z, [p.key]: info })));
    }
    const dats = todo.filter((p) => !isZip(p)).slice(0, PREVIEW_FILES);
    if (dats.length)
      void Promise.all(dats.map(async (p) => [p.key, await fileDate(p.file)] as const)).then((list) =>
        setDates((d) => ({ ...d, ...Object.fromEntries(list) })),
      );
  }, [files]);

  // One file: date and time of the measurement, changeable.
  useEffect(() => {
    if (!single || !original) return;
    setDay(original.slice(0, 10));
    setTime(original.slice(11, 16));
  }, [single, original]);

  // Customers used so far (this company, or all for service staff), while typing.
  useEffect(() => {
    const n = ++seq.current;
    const timer = setTimeout(() => {
      void api
        .get<{ items: { name: string; results: number }[] }>(
          `/results/customers${qs({ q: party.trim() || undefined, companyId: scope.companyId ?? undefined })}`,
        )
        .then((res) => n === seq.current && setCustomers(res.items))
        .catch(() => n === seq.current && setCustomers([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [party, scope.companyId]);

  const term = party.trim().toLowerCase();
  const own = (companies.data?.items ?? []).filter((c) => !c.isService && !c.disabled);
  const company = staffAll ? own.find((c) => c.name.toLowerCase() === term) : undefined;
  const known = customers.some((c) => c.name.toLowerCase() === term);
  const suggestions: Suggestion[] = useMemo(() => {
    const list: Suggestion[] = own
      .filter((c) => c.name.toLowerCase().includes(term) && c.name.toLowerCase() !== term)
      .slice(0, 5)
      .map((c) => ({ kind: 'company', id: c.id, name: c.name }));
    const names = new Set(own.map((c) => c.name.toLowerCase()));
    for (const c of customers) {
      if (list.length >= 8) break;
      if (!names.has(c.name.toLowerCase()) && c.name.toLowerCase() !== term)
        list.push({ kind: 'customer', name: c.name, results: c.results });
    }
    return list;
  }, [own, customers, term]);
  const shown = open && suggestions.length > 0;

  const total = files.reduce((n, p) => {
    if (!isZip(p)) return n + 1;
    const info = zips[p.key];
    return n + (info && info !== 'invalid' ? info.dat : 0);
  }, 0);
  const zipCount = files.filter(isZip).length;
  const size = files.reduce((s, p) => s + p.file.size, 0);
  const sizeText = size < 1024 * 1024 ? `${num(Math.max(size / 1024, 0.1), 1)} KB` : `${num(size / 1024 / 1024, 1)} MB`;
  const known_dates = [
    ...Object.values(dates),
    ...Object.values(zips).flatMap((z) => (z === 'invalid' ? [] : [z.first, z.last])),
  ]
    .filter((d): d is string => Boolean(d))
    .sort();
  const first = known_dates[0]?.slice(0, 10);
  const last = known_dates.at(-1)?.slice(0, 10);
  const range = first && last ? (first === last ? date(first) : `${date(first)} – ${date(last)}`) : null;
  const today = new Date().toLocaleDateString('sv-SE');

  useEffect(() => {
    if (!single && !day && last) setDay(last);
  }, [single, day, last]);

  function choose(s: Suggestion) {
    setParty(s.name);
    setOpen(false);
    setActive(-1);
  }

  function upload(meta: UploadMeta, companyId: number | null) {
    if (isUploading()) return;
    startUpload(
      files.map((p) => p.file),
      companyId,
      meta,
    );
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const meta: UploadMeta = {};
    if (party.trim()) meta.customer = party.trim().replace(/\s+/g, ' ');
    if (single) {
      const changed = day && time && `${day} ${time}` !== original?.slice(0, 16);
      if (changed) meta.testDate = `${day} ${time}:00`;
    } else if (kind === 'all' && day) meta.testDay = day;
    upload(meta, scope.companyId ?? company?.id ?? null);
  }

  const hint = !term
    ? t('upload.dlg.optional')
    : company
      ? t('upload.dlg.isCompany')
      : known
        ? t('upload.dlg.knownCustomer')
        : t('upload.dlg.newCustomer');

  return (
    <Modal title={t('upload.dlg.title', { n: files.length })} onClose={onClose}>
      <form className="upload-dialog stack" style={{ gap: 18 }} onSubmit={submit} data-testid="upload-dialog">
        <div className="muted" style={{ fontSize: 14, marginTop: -8 }}>
          {single ? (
            <span className="mono" style={{ overflowWrap: 'anywhere' }}>
              {single.path}
            </span>
          ) : (
            <>
              {t('upload.total', { n: total })}
              {zipCount > 0 && ` (${t('upload.dlg.zips', { n: zipCount })})`} · {sizeText}
              {ignored > 0 && ` · ${t('upload.ignored', { n: ignored })}`} ·{' '}
              <button type="button" className="linkbtn" onClick={() => setShowList((v) => !v)}>
                {showList ? t('upload.dlg.hideList') : t('upload.dlg.showList')}
              </button>
            </>
          )}
        </div>
        {showList && !single && (
          <ul className="upload-list muted mono">
            {files.slice(0, 100).map((p) => {
              const info = zips[p.key];
              return (
                <li key={p.key}>
                  {p.path}
                  {isZip(p) && info && (
                    <span className="zip-info">
                      {' · '}
                      {info === 'invalid'
                        ? t('skip.invalid_archive')
                        : `${t('upload.zipContents', { n: info.dat })}${info.zips ? ` ${t('upload.zipNested', { n: info.zips })}` : ''}`}
                    </span>
                  )}
                </li>
              );
            })}
            {files.length > 100 && <li>{t('upload.more', { n: files.length - 100 })}</li>}
          </ul>
        )}

        <div className="field combo-field">
          <label htmlFor={`${listId}-input`}>
            {scope.companyId === null ? t('upload.dlg.party') : t('fact.customer')}
          </label>
          <div className="combo">
            <input
              id={`${listId}-input`}
              className="input"
              value={party}
              maxLength={120}
              autoComplete="off"
              role="combobox"
              aria-expanded={shown}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-describedby={`${listId}-hint`}
              {...(active >= 0 ? { 'aria-activedescendant': `${listId}-${active}` } : {})}
              placeholder={staffAll ? t('upload.dlg.partyPlaceholder') : t('client.assign.customerPlaceholder')}
              onChange={(e) => {
                setParty(e.target.value);
                setOpen(true);
                setActive(-1);
              }}
              onClick={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={(e) => {
                if (!shown && e.key === 'ArrowDown') {
                  e.preventDefault();
                  setOpen(true);
                  return;
                }
                if (!shown) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => (a + 1) % suggestions.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
                } else if (e.key === 'Enter' && active >= 0) {
                  e.preventDefault();
                  choose(suggestions[active] as Suggestion);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
            />
            {shown && (
              <div className="combo-list" id={listId} role="listbox">
                {suggestions.map((s, i) => (
                  <div
                    key={`${s.kind}-${s.name}`}
                    id={`${listId}-${i}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(s);
                    }}
                  >
                    <span>{s.name}</span>
                    <span className={`tag ${s.kind}`}>
                      {s.kind === 'company'
                        ? t('upload.dlg.tagCompany')
                        : t('upload.dlg.tagCustomer', { n: int(s.results) })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span id={`${listId}-hint`} className={`muted field-hint${company ? ' is-company' : ''}`}>
            {hint}
          </span>
        </div>

        {single ? (
          <div className="field">
            <label htmlFor={`${listId}-day`}>{t('client.assign.date')}</label>
            <div className="form-row">
              <input
                id={`${listId}-day`}
                className="input"
                type="date"
                max={today}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                style={{ width: 'auto' }}
              />
              <input
                className="input"
                type="time"
                aria-label={t('upload.dlg.time')}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{ width: 'auto' }}
              />
            </div>
            <span className="muted field-hint">
              {original ? t('upload.dlg.dateFromFile') : t('upload.dlg.dateNone')}
              {original && `${day} ${time}` !== original.slice(0, 16) && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => {
                      setDay(original.slice(0, 10));
                      setTime(original.slice(11, 16));
                    }}
                  >
                    {t('upload.dlg.reset')}
                  </button>
                </>
              )}
            </span>
          </div>
        ) : (
          <fieldset className="radio-cards">
            <legend>{t('client.assign.date')}</legend>
            <label className={kind === 'file' ? 'on' : ''}>
              <input type="radio" name="date" checked={kind === 'file'} onChange={() => setKind('file')} />
              <span>
                <b>{t('upload.dlg.fromFiles')}</b>
                <small>{range ? t('upload.dlg.fromFilesRange', { range }) : t('client.assign.fromFileMany')}</small>
              </span>
            </label>
            <label className={kind === 'all' ? 'on' : ''}>
              <input type="radio" name="date" checked={kind === 'all'} onChange={() => setKind('all')} />
              <span>
                <b>{t('upload.dlg.oneDate')}</b>
                <input
                  type="date"
                  className="input"
                  value={day}
                  max={today}
                  aria-label={t('upload.dlg.oneDate')}
                  onChange={(e) => {
                    setDay(e.target.value);
                    setKind('all');
                  }}
                />
              </span>
            </label>
          </fieldset>
        )}

        {running && <span className="muted">{t('upload.waitHint')}</span>}
        <div className="actions">
          <button type="button" className="btn" disabled={running} onClick={() => upload({}, scope.companyId ?? null)}>
            {t('upload.dlg.skip')}
          </button>
          <button type="submit" className="btn primary" disabled={running || (kind === 'all' && !single && !day)}>
            <Icon name="upload" size={16} />
            {t('upload.dlg.upload')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
