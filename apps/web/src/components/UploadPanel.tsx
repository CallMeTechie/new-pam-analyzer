import { type DragEvent as ReactDragEvent, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { accepted, filesFromDrop, hasFiles, type Picked, picked } from '../lib/pickedFiles';
import { useScope } from '../lib/scope';
import { Icon } from './Icon';
import { UploadDialog } from './UploadDialog';
import { Notice } from './ui';

/**
 * Upload area of the dashboard: drop files, ZIP archives and folders (also subfolders) on the drop
 * zone or choose them. A dialog then asks for company or customer and the test date (both optional);
 * the upload runs in the background (see `UploadToast`). While files are dragged into the window, the
 * drop zone is marked.
 */
export function UploadPanel() {
  const { t } = useI18n();
  const scope = useScope();
  /** Files waiting in the dialog; `null`: no dialog. */
  const [files, setFiles] = useState<Picked[] | null>(null);
  const [ignored, setIgnored] = useState(0);
  const [nothing, setNothing] = useState(0);
  /** Files are dragged somewhere over the window: the drop zone is marked. */
  const [dragging, setDragging] = useState(false);
  /** …and right over the drop zone. */
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function add(list: Picked[]) {
    const ok = list.filter((p) => accepted(p.file.name));
    if (!ok.length) {
      setNothing(list.length);
      return;
    }
    setNothing(0);
    setIgnored((n) => (files ? n : 0) + list.length - ok.length);
    setFiles((prev) => {
      const seen = new Set((prev ?? []).map((p) => p.key));
      return [...(prev ?? []), ...ok.filter((p) => !seen.has(p.key) && seen.add(p.key))];
    });
  }

  // Marks the drop zone while files are dragged into the window; a file dropped next to it is not
  // opened by the browser (which would leave the page).
  useEffect(() => {
    let depth = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      depth = 0;
      clearTimeout(idle);
      setDragging(false);
      setOver(false);
    };
    // Browsers send `dragover` every few hundred milliseconds while files are over the window; when
    // none comes (drag cancelled, or ended where no `drop` or `dragleave` reaches the page), unmark.
    const watch = () => {
      clearTimeout(idle);
      idle = setTimeout(end, 1000);
    };
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
      watch();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) end();
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      watch();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      end();
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      clearTimeout(idle);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  function onDrop(e: ReactDragEvent) {
    e.preventDefault();
    setOver(false);
    void filesFromDrop(e.dataTransfer).then(add);
  }

  return (
    <div className="upload-panel stack" style={{ gap: 12 }}>
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

      {nothing > 0 && <Notice kind="warning" title={t('upload.nothing', { n: nothing })} />}

      {files && (
        <UploadDialog
          files={files}
          ignored={ignored}
          onClose={() => {
            setFiles(null);
            setIgnored(0);
          }}
        />
      )}
    </div>
  );
}
