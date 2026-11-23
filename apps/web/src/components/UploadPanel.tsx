import { type DragEvent, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { Company } from '../lib/api';
import { startUpload, useBackgroundUpload } from '../lib/backgroundUpload';
import { useScope } from '../lib/scope';
import { useApi } from '../lib/useApi';
import { Icon } from './Icon';
import { InfoTip } from './ui';

const accepted = (name: string) => /\.(dat|zip)$/i.test(name);

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

/**
 * Drop zone of the dashboard: drop or choose files and folders (.dat, .zip of any size), choose the
 * company (service staff) and start; the upload then runs in the background (see `UploadToast`).
 */
export function UploadPanel() {
  const { t, num } = useI18n();
  const scope = useScope();
  const staffAll = scope.companyId === null;
  const companies = useApi<{ items: Company[] }>(staffAll ? '/companies' : null);
  const [companyId, setCompanyId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [over, setOver] = useState(false);
  const upload = useBackgroundUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function add(list: File[]) {
    const ok = list.filter((f) => accepted(f.name));
    setIgnored((n) => n + list.length - ok.length);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
      return [...prev, ...ok.filter((f) => !seen.has(`${f.name}|${f.size}|${f.lastModified}`))];
    });
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

  function start() {
    startUpload(files, scope.companyId ?? (companyId ? Number(companyId) : null));
    setFiles([]);
    setIgnored(0);
  }

  const busy = upload.status === 'running';
  const size = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="upload-panel stack" style={{ gap: 12 }}>
      {staffAll && (
        <div className="field">
          <span className="title-with-info">
            <label htmlFor="upload-company">{t('upload.company')}</label>
            <InfoTip text={companyId ? t('upload.companyHint') : t('upload.unassignedHint')} />
          </span>
          <select
            id="upload-company"
            className="select"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={busy}
          >
            <option value="">{t('upload.unassigned')}</option>
            {companies.data?.items
              .filter((c) => !c.isService && !c.disabled)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      )}
      {scope.viewing && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {t('upload.forCompany', { company: scope.companyName ?? '' })}
        </p>
      )}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: dropping is a shortcut; the buttons inside choose files and folders */}
      <section
        className={`dropzone compact${over ? ' over' : ''}`}
        data-testid="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => void onDrop(e)}
      >
        <span className="icon-circle">
          <Icon name="upload" size={22} />
        </span>
        <span className="dz-text">
          <b>{t('dash.uploadTitle')}</b>
          <span className="muted">{t('dash.uploadText')}</span>
        </span>
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

      {files.length > 0 && (
        <section className="card stack" style={{ gap: 10 }}>
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <b>{t('upload.ready', { n: files.length })}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                {num(size / 1024 / 1024, 1)} MB
                {ignored > 0 && ` · ${t('upload.ignored', { n: ignored })}`}
              </div>
            </div>
            <div className="form-row">
              <button type="button" className="btn" onClick={() => setFiles([])} disabled={busy}>
                {t('common.clear')}
              </button>
              <button type="button" className="btn primary" onClick={start} disabled={busy || files.length === 0}>
                <Icon name="upload" size={16} />
                {busy ? t('upload.busy') : t('upload.start')}
              </button>
            </div>
            {busy && (
              <span className="muted" style={{ fontSize: 13 }}>
                {t('upload.waitHint')}
              </span>
            )}
          </div>
          <ul
            className="muted mono"
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12.5,
              maxHeight: 140,
              overflowY: 'auto',
              overflowWrap: 'anywhere',
            }}
          >
            {files.slice(0, 50).map((f) => (
              <li key={`${f.name}|${f.size}|${f.lastModified}`}>{f.name}</li>
            ))}
            {files.length > 50 && <li>{t('upload.more', { n: files.length - 50 })}</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
