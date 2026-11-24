import { type DragEvent as ReactDragEvent, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { Company } from '../lib/api';
import { startUpload, useBackgroundUpload } from '../lib/backgroundUpload';
import { useScope } from '../lib/scope';
import { useApi } from '../lib/useApi';
import { listZip } from '../lib/zip';
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

/** A chosen file and where it lies in the dropped or chosen folder. */
interface Picked {
  file: File;
  path: string;
  key: string;
}

const picked = (file: File, path = file.webkitRelativePath || file.name): Picked => ({
  file,
  path,
  key: `${path}|${file.size}|${file.lastModified}`,
});

/** All files of a dropped file or folder, also in subfolders, with their path. */
async function filesFromEntry(entry: FileSystemEntryLike, dir = ''): Promise<Picked[]> {
  const path = dir ? `${dir}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    return new Promise((resolve) =>
      entry.file?.(
        (f) => resolve([picked(f, path)]),
        () => resolve([]),
      ),
    );
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const all: FileSystemEntryLike[] = [];
    // readEntries returns the entries in portions (about 100 in Chrome) until an empty one.
    for (;;) {
      const batch = await new Promise<FileSystemEntryLike[]>((resolve) =>
        reader.readEntries(resolve, () => resolve([])),
      );
      if (!batch.length) break;
      all.push(...batch);
    }
    return (await Promise.all(all.map((e) => filesFromEntry(e, path)))).flat();
  }
  return [];
}

/** Files of a drop: folders (with subfolders), ZIP archives and single files. */
async function filesFromDrop(data: DataTransfer): Promise<Picked[]> {
  // The entries must be taken before the first await: the browser empties the list afterwards.
  const entries = [...data.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.() as unknown as FileSystemEntryLike | null | undefined)
    .filter((x): x is FileSystemEntryLike => Boolean(x));
  const plain = [...data.files];
  if (!entries.length) return plain.map((f) => picked(f));
  return (await Promise.all(entries.map((e) => filesFromEntry(e)))).flat();
}

/** PAM files in a ZIP archive (all subfolders) and archives inside it. */
type ZipInfo = { dat: number; zips: number } | 'invalid';

async function zipInfo(file: File): Promise<ZipInfo> {
  try {
    const entries = (await listZip(file)).filter((e) => !e.path.endsWith('/') && !e.path.startsWith('__MACOSX/'));
    return {
      dat: entries.filter((e) => /\.dat$/i.test(e.path)).length,
      zips: entries.filter((e) => /\.zip$/i.test(e.path)).length,
    };
  } catch {
    return 'invalid';
  }
}

const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'));

/**
 * Upload area of the dashboard: drop files, ZIP archives and folders (also subfolders) on the drop
 * zone or choose them, choose the company (service staff) and start; the upload then runs in the
 * background (see `UploadToast`). While files are dragged into the window, the drop zone is marked.
 */
export function UploadPanel() {
  const { t, num } = useI18n();
  const scope = useScope();
  const staffAll = scope.companyId === null;
  const companies = useApi<{ items: Company[] }>(staffAll ? '/companies' : null);
  const [companyId, setCompanyId] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [zips, setZips] = useState<Record<string, ZipInfo>>({});
  const [ignored, setIgnored] = useState(0);
  /** Files are dragged somewhere over the window: the drop zone is marked. */
  const [dragging, setDragging] = useState(false);
  /** …and right over the drop zone. */
  const [over, setOver] = useState(false);
  const upload = useBackgroundUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function add(list: Picked[]) {
    const ok = list.filter((p) => accepted(p.file.name));
    setIgnored((n) => n + list.length - ok.length);
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => p.key));
      return [...prev, ...ok.filter((p) => !seen.has(p.key) && seen.add(p.key))];
    });
  }
  // Marks the drop zone while files are dragged into the window; a file dropped next to it is not
  // opened by the browser (which would leave the page).
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      setOver(false);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // How many PAM files each ZIP archive holds (all subfolders); only its directory is read.
  useEffect(() => {
    for (const p of files) {
      if (!/\.zip$/i.test(p.file.name) || p.key in zips) continue;
      setZips((z) => ({ ...z, [p.key]: { dat: -1, zips: 0 } }));
      void zipInfo(p.file).then((info) => setZips((z) => ({ ...z, [p.key]: info })));
    }
  }, [files, zips]);

  function onDrop(e: ReactDragEvent) {
    e.preventDefault();
    setOver(false);
    void filesFromDrop(e.dataTransfer).then(add);
  }

  function start() {
    startUpload(
      files.map((p) => p.file),
      scope.companyId ?? (companyId ? Number(companyId) : null),
    );
    setFiles([]);
    setIgnored(0);
  }

  const busy = upload.status === 'running';
  const size = files.reduce((s, p) => s + p.file.size, 0);
  const sizeText = size < 1024 * 1024 ? `${num(Math.max(size / 1024, 0.1), 1)} KB` : `${num(size / 1024 / 1024, 1)} MB`;
  const isZip = (p: Picked) => /\.zip$/i.test(p.file.name);
  const known = (info: ZipInfo | undefined) => info === 'invalid' || (info !== undefined && info.dat >= 0);
  // All ZIP archives are counted (their directories are read right after adding them).
  const counted = files.every((p) => !isZip(p) || known(zips[p.key]));
  const total = files.reduce((n, p) => {
    if (!/\.zip$/i.test(p.file.name)) return n + 1;
    const info = zips[p.key];
    return n + (info && info !== 'invalid' && info.dat > 0 ? info.dat : 0);
  }, 0);
  const hasZip = files.some(isZip);

  function zipLabel(p: Picked) {
    const info = zips[p.key];
    if (!known(info)) return ' · …';
    if (info === 'invalid') return ` · ${t('skip.invalid_archive')}`;
    if (info === undefined) return '';
    return ` · ${t('upload.zipContents', { n: info.dat })}${info.zips ? ` ${t('upload.zipNested', { n: info.zips })}` : ''}`;
  }

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
        className={`dropzone compact${dragging ? ' armed' : ''}${over ? ' over' : ''}`}
        data-testid="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={onDrop}
      >
        <span className="icon-circle">
          <Icon name="upload" size={22} />
        </span>
        <span className="dz-text">
          <b>{dragging ? t('upload.dropHere') : t('dash.uploadTitle')}</b>
          <span className="muted">{t('dash.uploadText')}</span>
        </span>
        <div className="form-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn primary" onClick={() => fileInput.current?.click()}>
            <Icon name="file" size={16} />
            {t('upload.chooseFiles')}
          </button>
          <button type="button" className="btn" onClick={() => folderInput.current?.click()}>
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
            add([...(e.target.files ?? [])].map((f) => picked(f)));
            e.target.value = '';
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(e) => {
            add([...(e.target.files ?? [])].map((f) => picked(f)));
            e.target.value = '';
          }}
        />
      </section>

      {files.length > 0 && (
        <section className="card stack" style={{ gap: 10 }} data-testid="upload-ready">
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <b>{t('upload.ready', { n: files.length })}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                {hasZip && counted && `${t('upload.total', { n: total })} · `}
                {sizeText}
                {ignored > 0 && ` · ${t('upload.ignored', { n: ignored })}`}
              </div>
            </div>
            <div className="form-row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFiles([]);
                  setIgnored(0);
                }}
              >
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
          <ul className="upload-list muted mono">
            {files.slice(0, 50).map((p) => (
              <li key={p.key}>
                {p.path}
                {isZip(p) && <span className="zip-info">{zipLabel(p)}</span>}
              </li>
            ))}
            {files.length > 50 && <li>{t('upload.more', { n: files.length - 50 })}</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
