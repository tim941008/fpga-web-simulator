/**
 * Project import: multi-select, drag-and-drop, folder upload and ZIP upload all
 * funnel into `ImportedEntry[]` -> `filterEntries()`.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { normalizePath } from './projectModel';

export interface ImportedEntry {
  /** Relative path (forward slashes) */
  name: string;
  content: string;
}

const ACCEPTED_RE = /\.(v|sv|vh|svh|hex|mem|mif|txt|binary)$/i;

/** Drop hidden / OS junk, unsupported types; strip a single shared top-level folder. */
export function filterEntries(raw: ImportedEntry[]): ImportedEntry[] {
  let entries = raw
    .map((e) => ({ ...e, name: normalizePath(e.name) }))
    .filter((e) => {
      const parts = e.name.split('/');
      if (parts.some((p) => p.startsWith('.') || p === '__MACOSX')) return false;
      return ACCEPTED_RE.test(e.name);
    });
  if (entries.length > 0 && entries.every((e) => e.name.includes('/'))) {
    const first = entries[0].name.split('/')[0];
    if (entries.every((e) => e.name.split('/')[0] === first)) {
      entries = entries.map((e) => ({ ...e, name: e.name.slice(first.length + 1) }));
    }
  }
  return entries;
}

export function unzipProject(data: Uint8Array): ImportedEntry[] {
  const files = unzipSync(data);
  const out: ImportedEntry[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith('/')) continue;
    out.push({ name: path, content: strFromU8(bytes) });
  }
  return filterEntries(out);
}

/** <input multiple>, <input webkitdirectory> or a File[] (names via webkitRelativePath when present). */
export async function entriesFromFiles(files: ArrayLike<File>): Promise<ImportedEntry[]> {
  const raw: ImportedEntry[] = [];
  let zipped: ImportedEntry[] = [];
  for (const file of Array.from(files)) {
    if (/\.zip$/i.test(file.name)) {
      zipped = zipped.concat(unzipProject(new Uint8Array(await file.arrayBuffer())));
      continue;
    }
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    raw.push({ name: rel || file.name, content: await file.text() });
  }
  return [...filterEntries(raw), ...zipped];
}

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (e: FsEntry[]) => void, err?: (e: unknown) => void) => void };
};

async function walk(entry: FsEntry, acc: File[], paths: string[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File>((res, rej) => entry.file!(res, rej));
    acc.push(f);
    paths.push((entry.fullPath ?? entry.name).replace(/^\//, ''));
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise<FsEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, acc, paths);
    }
  }
}

/** Drag-and-drop: handles individual files, folders (recursively) and ZIPs. */
export async function entriesFromDataTransfer(dt: DataTransfer): Promise<ImportedEntry[]> {
  const files: File[] = [];
  const paths: string[] = [];
  const items = Array.from(dt.items ?? []);
  const fsEntries = items
    .map((it) => (it as unknown as { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null)
    .filter((e): e is FsEntry => e !== null);
  if (fsEntries.length > 0) {
    for (const e of fsEntries) await walk(e, files, paths);
  } else {
    for (const f of Array.from(dt.files)) {
      files.push(f);
      paths.push(f.name);
    }
  }
  const raw: ImportedEntry[] = [];
  let zipped: ImportedEntry[] = [];
  for (let i = 0; i < files.length; i++) {
    if (/\.zip$/i.test(files[i].name)) {
      zipped = zipped.concat(unzipProject(new Uint8Array(await files[i].arrayBuffer())));
    } else {
      raw.push({ name: paths[i], content: await files[i].text() });
    }
  }
  return [...filterEntries(raw), ...zipped];
}
