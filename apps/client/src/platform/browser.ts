import type { InputFile } from '../lib/evaluate';
import { memoryStore } from '../lib/store';
import type { Platform } from './types';

const toInput = async (f: File): Promise<InputFile> => ({
  name: f.name,
  path: null,
  bytes: new Uint8Array(await f.arrayBuffer()),
  lastModified: f.lastModified || null,
});

/**
 * Browser preview of the app for development and tests: data in memory, files through the file
 * input and HTML drag and drop, HTTP through `fetch`.
 */
export function browserPlatform(version: string): Platform {
  let secret: string | null = null;
  return {
    kind: 'browser',
    os: 'other',
    version,
    store: memoryStore(),
    pickFiles() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.dat,.zip';
        input.dataset.testid = 'pick-files';
        input.style.display = 'none';
        input.onchange = async () => {
          resolve(await Promise.all([...(input.files ?? [])].map(toInput)));
          input.remove();
        };
        input.oncancel = () => {
          resolve([]);
          input.remove();
        };
        document.body.append(input);
        input.click();
      });
    },
    onFiles(onDrop, onDrag) {
      let depth = 0;
      const enter = (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        depth++;
        onDrag(true);
      };
      const over = (e: DragEvent) => e.preventDefault();
      const leave = () => {
        depth = Math.max(0, depth - 1);
        if (depth === 0) onDrag(false);
      };
      const drop = async (e: DragEvent) => {
        e.preventDefault();
        depth = 0;
        onDrag(false);
        const files = [...(e.dataTransfer?.files ?? [])];
        if (files.length) onDrop(await Promise.all(files.map(toInput)));
      };
      window.addEventListener('dragenter', enter);
      window.addEventListener('dragover', over);
      window.addEventListener('dragleave', leave);
      window.addEventListener('drop', drop);
      return () => {
        window.removeEventListener('dragenter', enter);
        window.removeEventListener('dragover', over);
        window.removeEventListener('dragleave', leave);
        window.removeEventListener('drop', drop);
      };
    },
    async request(url, init) {
      try {
        const res = await fetch(url, {
          method: init.method,
          headers: init.headers ?? {},
          ...(init.body === undefined ? {} : { body: init.body as BodyInit }),
        });
        return { status: res.status, text: await res.text() };
      } catch (e) {
        return { status: 0, text: String(e) };
      }
    },
    secret: {
      get: async () => secret,
      set: async (v) => {
        secret = v;
      },
      clear: async () => {
        secret = null;
      },
    },
    reveal: async () => false,
    dataLocation: async () => '(browser)',
    openDataLocation: async () => {},
    defaultDeviceName: async () => 'Browser',
    updates: null,
  };
}
