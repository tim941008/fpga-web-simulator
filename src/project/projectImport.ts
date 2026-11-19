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

export const MAX_IMPORT_FILES = 200;
export const MAX_IMPORT_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_RE = /\.(v|sv|vh|svh|hex|mem|mif|txt|binary)$/i;

/** Early path/extension filter (safe to run before reading file bytes). */
export function isAcceptedPath(rawPath: string): boolean {
  const norm = normalizePath(rawPath);
  if (!norm || norm.endsWith('/')) return false;
  const parts = norm.split('/');
  if (parts.some((p) => !p || p.startsWith('.') || p === '__MACOSX' || p === '..')) {
    return false;
  }
  return ACCEPTED_RE.test(norm);
}

/** Drop hidden / OS junk, unsupported types; strip a single shared top-level folder. */
export function filterEntries(raw: ImportedEntry[]): ImportedEntry[] {
  let entries = raw
    .map((e) => ({ ...e, name: normalizePath(e.name) }))
    .filter((e) => isAcceptedPath(e.name));
  if (entries.length > 0 && entries.every((e) => e.name.includes('/'))) {
    const first = entries[0].name.split('/')[0];
    if (entries.every((e) => e.name.split('/')[0] === first)) {
      entries = entries.map((e) => ({ ...e, name: e.name.slice(first.length + 1) }));
    }
  }
  return entries;
}

export function unzipProject(
  data: Uint8Array,
  limits: { maxFiles?: number; maxTotalBytes?: number } = {}
): ImportedEntry[] {
  const maxFiles = limits.maxFiles ?? MAX_IMPORT_FILES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_IMPORT_TOTAL_BYTES;

  if (data.byteLength > maxTotalBytes) {
    throw new Error(
      `ZIP archive exceeds maximum allowed size (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
    );
  }

  let acceptedCount = 0;
  let declaredBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter(info) {
        if (!isAcceptedPath(info.name)) return false;
        acceptedCount += 1;
        if (acceptedCount > maxFiles) {
          throw new Error(`ZIP archive exceeds maximum allowed file count (${maxFiles}).`);
        }
        declaredBytes += Math.max(0, info.originalSize || 0);
        if (declaredBytes > maxTotalBytes) {
          throw new Error(
            `ZIP archive uncompressed size exceeds limit (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
          );
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof Error && /exceeds/i.test(err.message)) {
      throw err;
    }
    throw new Error(
      `Failed to extract ZIP archive: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const out: ImportedEntry[] = [];
  let actualBytes = 0;
  for (const [path, bytes] of Object.entries(files)) {
    if (!isAcceptedPath(path)) continue;
    actualBytes += bytes.byteLength;
    if (actualBytes > maxTotalBytes) {
      throw new Error(
        `ZIP archive uncompressed size exceeds limit (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
      );
    }
    out.push({ name: path, content: strFromU8(bytes) });
  }
  return filterEntries(out);
}

/** <input multiple>, <input webkitdirectory> or a File[] (names via webkitRelativePath when present). */
export async function entriesFromFiles(
  files: ArrayLike<File>,
  limits: { maxFiles?: number; maxTotalBytes?: number } = {}
): Promise<ImportedEntry[]> {
  const maxFiles = limits.maxFiles ?? MAX_IMPORT_FILES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_IMPORT_TOTAL_BYTES;
  const raw: ImportedEntry[] = [];
  let zipped: ImportedEntry[] = [];
  let count = 0;
  let totalBytes = 0;

  for (const file of Array.from(files)) {
    if (/\.zip$/i.test(file.name)) {
      if (file.size > maxTotalBytes) {
        throw new Error(
          `ZIP archive "${file.name}" exceeds maximum allowed size (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
        );
      }
      const extracted = unzipProject(new Uint8Array(await file.arrayBuffer()), {
        maxFiles: Math.max(1, maxFiles - count),
        maxTotalBytes: Math.max(1, maxTotalBytes - totalBytes),
      });
      count += extracted.length;
      for (const e of extracted) totalBytes += e.content.length;
      if (count > maxFiles) {
        throw new Error(`Import exceeds maximum allowed file count (${maxFiles}).`);
      }
      if (totalBytes > maxTotalBytes) {
        throw new Error(
          `Import exceeds maximum allowed total size (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
        );
      }
      zipped = zipped.concat(extracted);
      continue;
    }

    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const candidateName = rel || file.name;
    // Early extension & hidden-path filtering before reading file contents
    if (!isAcceptedPath(candidateName)) continue;

    count += 1;
    if (count > maxFiles) {
      throw new Error(`Import exceeds maximum allowed file count (${maxFiles}).`);
    }
    totalBytes += Math.max(0, file.size || 0);
    if (totalBytes > maxTotalBytes) {
      throw new Error(
        `Import exceeds maximum allowed total size (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
      );
    }
    raw.push({ name: candidateName, content: await file.text() });
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
  if (entry.name.startsWith('.') || entry.name === '__MACOSX') return;
  if (entry.isFile && entry.file) {
    const p = (entry.fullPath ?? entry.name).replace(/^\//, '');
    if (!/\.zip$/i.test(entry.name) && !isAcceptedPath(p)) return;
    const f = await new Promise<File>((res, rej) => entry.file!(res, rej));
    acc.push(f);
    paths.push(p);
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
export async function entriesFromDataTransfer(
  dt: DataTransfer,
  limits: { maxFiles?: number; maxTotalBytes?: number } = {}
): Promise<ImportedEntry[]> {
  const maxFiles = limits.maxFiles ?? MAX_IMPORT_FILES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_IMPORT_TOTAL_BYTES;
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
  let count = 0;
  let totalBytes = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (/\.zip$/i.test(file.name)) {
      if (file.size > maxTotalBytes) {
        throw new Error(
          `ZIP archive "${file.name}" exceeds maximum allowed size (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
        );
      }
      const extracted = unzipProject(new Uint8Array(await file.arrayBuffer()), {
        maxFiles: Math.max(1, maxFiles - count),
        maxTotalBytes: Math.max(1, maxTotalBytes - totalBytes),
      });
      count += extracted.length;
      for (const e of extracted) totalBytes += e.content.length;
      if (count > maxFiles) {
        throw new Error(`Import exceeds maximum allowed file count (${maxFiles}).`);
      }
      if (totalBytes > maxTotalBytes) {
        throw new Error(
          `Import exceeds maximum allowed total size (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
        );
      }
      zipped = zipped.concat(extracted);
      continue;
    }

    if (!isAcceptedPath(paths[i])) continue;
    count += 1;
    if (count > maxFiles) {
      throw new Error(`Import exceeds maximum allowed file count (${maxFiles}).`);
    }
    totalBytes += Math.max(0, file.size || 0);
    if (totalBytes > maxTotalBytes) {
      throw new Error(
        `Import exceeds maximum allowed total size (${Math.round(maxTotalBytes / (1024 * 1024))} MB).`
      );
    }
    raw.push({ name: paths[i], content: await file.text() });
  }
  return [...filterEntries(raw), ...zipped];
}
