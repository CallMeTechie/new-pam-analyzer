import { listZip } from './zip';

/**
 * Files chosen or dropped for an upload: folders are read with all subfolders (File System Entry
 * API), each file keeps its path; ZIP archives are only looked into (directory), never unpacked here.
 */

export const accepted = (name: string) => /\.(dat|zip)$/i.test(name);

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(cb: (f: File) => void, err?: (e: unknown) => void): void;
  createReader?(): { readEntries(cb: (entries: FileSystemEntryLike[]) => void, err?: (e: unknown) => void): void };
}

/** A chosen file and where it lies in the dropped or chosen folder. */
export interface Picked {
  file: File;
  path: string;
  key: string;
}

export const picked = (file: File, path = file.webkitRelativePath || file.name): Picked => ({
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
export async function filesFromDrop(data: DataTransfer): Promise<Picked[]> {
  // The entries must be taken before the first await: the browser empties the list afterwards.
  const entries = [...data.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.() as unknown as FileSystemEntryLike | null | undefined)
    .filter((x): x is FileSystemEntryLike => Boolean(x));
  const plain = [...data.files];
  if (!entries.length) return plain.map((f) => picked(f));
  return (await Promise.all(entries.map((e) => filesFromEntry(e)))).flat();
}

/** PAM files in a ZIP archive (all subfolders), archives inside it and the dates of its entries. */
export type ZipInfo = { dat: number; zips: number; first: string | null; last: string | null } | 'invalid';

export async function zipInfo(file: File): Promise<ZipInfo> {
  try {
    const entries = (await listZip(file)).filter((e) => !e.path.endsWith('/') && !e.path.startsWith('__MACOSX/'));
    const dat = entries.filter((e) => /\.dat$/i.test(e.path));
    const dates = dat
      .map((e) => e.modified)
      .filter((d): d is string => Boolean(d))
      .sort();
    return {
      dat: dat.length,
      zips: entries.filter((e) => /\.zip$/i.test(e.path)).length,
      first: dates[0] ?? null,
      last: dates.at(-1) ?? null,
    };
  } catch {
    return 'invalid';
  }
}

export const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'));
