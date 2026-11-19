import { type DragEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { errorText, Notice, RatingPill } from '../components/ui';
import { useI18n } from '../i18n';
import { ApiError, type Company, type IngestOutcome, type UploadResponse, uploadFiles } from '../lib/api';
import { useScope } from '../lib/scope';
import { useApi } from '../lib/useApi';

const accepted = (name: string) => /\.(dat|zip)$/i.test(name);
/** Requests stay well below the server limit (200 MB) and keep the progress meaningful. */
const BATCH_BYTES = 40 * 1024 * 1024;
const BATCH_FILES = 300;

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(cb: (f: File) => void, err?: (e: unknown) => void): void;
  createReader?(): { readEntries(cb: (entries: FileSystemEntryLike[]) => void, err?: (e: unknown) => void): void };
}

async function filesFromEntry(entry: FileSystemEntryLike): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return new Promise((resolve) =>
      entry.file?.(
        (f) => resolve([f]),
        () => resolve([]),
      ),
    );
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const all: FileSystemEntryLike[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntryLike[]>((resolve) =>
        reader.readEntries(resolve, () => resolve([])),
      );
      if (!batch.length) break;
      all.push(...batch);
    }
    return (await Promise.all(all.map(filesFromEntry))).flat();
  }
  return [];
}

function batches(files: File[]): File[][] {
  const out: File[][] = [];
  let current: File[] = [];
  let size = 0;
  for (const f of files) {
    if (current.length && (size + f.size > BATCH_BYTES || current.length >= BATCH_FILES)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += f.size;
  }
  if (current.length) out.push(current);
  return out;
}

export function Upload() {
  const { t, int, num, dateTime } = useI18n();
  const scope = useScope();
  const staffAll = scope.companyId === null;
  const companies = useApi<{ items: Company[] }>(staffAll ? '/companies' : null);
  const [companyId, setCompanyId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function add(list: File[]) {
    const ok = list.filter((f) => accepted(f.name));
    setIgnored((n) => n + list.length - ok.length);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
      return [...prev, ...ok.filter((f) => !seen.has(`${f.name}|${f.size}|${f.lastModified}`))];
    });
    setResponse(null);
    setError(null);
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const items = [...e.dataTransfer.items];
    const entries = items
      .map((i) => i.webkitGetAsEntry?.() as unknown as FileSystemEntryLike | null | undefined)
      .filter((x): x is FileSystemEntryLike => Boolean(x));
    if (entries.length) add((await Promise.all(entries.map(filesFromEntry))).flat());
    else add([...e.dataTransfer.files]);
  }

  async function start() {
    const groups = batches(files);
    const total = files.reduce((s, f) => s + f.size, 0) || 1;
    let done = 0;
    const merged: UploadResponse = {
      summary: { created: 0, duplicate: 0, rejected: 0, skipped: 0 },
      results: [],
      skipped: [],
    };
    setProgress(0);
    setError(null);
    try {
      for (const group of groups) {
        const form = new FormData();
        for (const f of group) {
          form.append('files', f, f.name);
          form.append('lastModified', String(f.lastModified));
        }
        const target = scope.companyId ?? (companyId ? Number(companyId) : null);
        if (target) form.append('companyId', String(target));
        const size = group.reduce((s, f) => s + f.size, 0);
        const res = await uploadFiles(form, (p) => setProgress((done + p * size) / total));
        done += size;
        for (const k of Object.keys(merged.summary) as (keyof UploadResponse['summary'])[])
          merged.summary[k] += res.summary[k];
        merged.results.push(...res.results);
        merged.skipped.push(...res.skipped);
      }
      setResponse(merged);
      setFiles([]);
      setIgnored(0);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'internal_error', String(err)));
      if (merged.results.length) setResponse(merged);
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;
  const size = files.reduce((s, f) => s + f.size, 0);
  const statusLabel = (r: IngestOutcome) =>
    r.status === 'rejected' ? t(`reject.${r.reason ?? 'unreadable'}` as never) : t(`upload.status.${r.status}`);

  return (
    <Page title={t('nav.upload')}>
      <p className="muted" style={{ maxWidth: '80ch' }}>
        {t('upload.intro')}
      </p>
      {staffAll && (
        <section className="card form-row">
          <label className="field">
            {t('upload.company')}
            <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={busy}>
              <option value="">{t('upload.unassigned')}</option>
              {companies.data?.items
                .filter((c) => !c.isService && !c.disabled)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <p className="muted" style={{ fontSize: 13.5, flex: '2 1 280px' }}>
            {companyId ? t('upload.companyHint') : t('upload.unassignedHint')}
          </p>
        </section>
      )}
      {scope.viewing && <Notice kind="info">{t('upload.forCompany', { company: scope.companyName ?? '' })}</Notice>}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: dropping is a shortcut; the buttons inside choose files and folders */}
      <section
        className={`dropzone${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => void onDrop(e)}
      >
        <span className="icon-circle">
          <Icon name="upload" size={28} />
        </span>
        <b>{t('upload.drop')}</b>
        <span className="muted">{t('upload.dropHint')}</span>
        <div className="form-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn primary" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Icon name="file" size={16} />
            {t('upload.chooseFiles')}
          </button>
          <button type="button" className="btn" onClick={() => folderInput.current?.click()} disabled={busy}>
            <Icon name="folder" size={16} />
            {t('upload.chooseFolder')}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".dat,.zip"
          hidden
          onChange={(e) => {
            add([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(e) => {
            add([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </section>

      {(files.length > 0 || busy) && (
        <section className="card stack">
          <div className="card-h" style={{ marginBottom: 0 }}>
            <div>
              <h2>{t('upload.ready', { n: files.length })}</h2>
              <p>
                {num(size / 1024 / 1024, 1)} MB
                {ignored > 0 && ` · ${t('upload.ignored', { n: ignored })}`}
              </p>
            </div>
            <div className="form-row">
              <button type="button" className="btn" onClick={() => setFiles([])} disabled={busy}>
                {t('common.clear')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void start()}
                disabled={busy || files.length === 0}
              >
                <Icon name="upload" size={16} />
                {busy ? t('upload.busy') : t('upload.start')}
              </button>
            </div>
          </div>
          {busy && (
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={Math.round((progress ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${(progress ?? 0) * 100}%` }} />
            </div>
          )}
          {!busy && (
            <ul
              className="muted mono"
              style={{ margin: 0, paddingLeft: 18, fontSize: 13, maxHeight: 180, overflowY: 'auto' }}
            >
              {files.slice(0, 50).map((f) => (
                <li key={`${f.name}|${f.size}|${f.lastModified}`}>{f.name}</li>
              ))}
              {files.length > 50 && <li>{t('upload.more', { n: files.length - 50 })}</li>}
            </ul>
          )}
        </section>
      )}

      {error && <Notice kind="error" title={errorText(t, error)} />}

      {response && (
        <section className="stack">
          <div className="section-h">
            <h2>{t('upload.done')}</h2>
            <div className="summary-pills">
              <span className="pill r-excellent">{t('upload.created', { n: response.summary.created })}</span>
              <span className="pill plain">{t('upload.duplicates', { n: response.summary.duplicate })}</span>
              {response.summary.rejected > 0 && (
                <span className="pill r-critical">{t('upload.rejected', { n: response.summary.rejected })}</span>
              )}
              {response.summary.skipped > 0 && (
                <span className="pill r-warning">{t('upload.skipped', { n: response.summary.skipped })}</span>
              )}
            </div>
          </div>
          <div className="card flat table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('upload.file')}</th>
                  <th>{t('upload.status')}</th>
                  <th>{t('fact.head')}</th>
                  <th>{t('fact.tested')}</th>
                  <th>Cpk XY</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {response.results.map((r, i) => (
                  <tr key={`${r.fileName}-${i}`}>
                    <td className="mono" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                      {r.fileName}
                    </td>
                    <td>
                      <span
                        className={`pill small ${r.status === 'created' ? 'r-excellent' : r.status === 'rejected' ? 'r-critical' : 'plain'}`}
                      >
                        {statusLabel(r)}
                      </span>
                    </td>
                    <td className="nowrap">{r.headType ? `${r.headType} · ${r.headSerial}` : '–'}</td>
                    <td className="nowrap">
                      {r.testDate ? dateTime(r.testDate) : '–'}
                      {r.dateSource && r.dateSource !== 'header' && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {t(`dateSource.${r.dateSource}` as never)}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.status === 'created' ? (
                        <RatingPill rating={r.rating ?? null} value={r.cpkXY ?? null} small />
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="actions">
                      {r.resultId && (
                        <Link to={scope.link(`/results/${r.resultId}`)} className="linkbtn">
                          {t('common.open')} →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {response.skipped.map((s, i) => (
                  <tr key={`skip-${s.name}-${i}`}>
                    <td className="mono" style={{ fontSize: 13 }}>
                      {s.name}
                    </td>
                    <td>
                      <span className="pill small r-warning">{t(`skip.${s.reason}` as never)}</span>
                    </td>
                    <td colSpan={4} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Link to={scope.link('/results')} className="btn">
              {t('upload.toResults', { n: int(response.summary.created) })} →
            </Link>
          </div>
        </section>
      )}
    </Page>
  );
}
