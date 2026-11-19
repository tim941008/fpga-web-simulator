/**
 * Project abstraction layer (Phase C.1).
 *
 * Holds the multi-file Verilog project (files + chosen top module) and the
 * pure helpers that scan / validate / edit it. Deliberately independent of
 * HardwareConfig and of the Verilator runtime so it can be unit-tested in Node.
 */

export interface ProjectFile {
  id: string;
  /** Project-relative path, forward slashes, e.g. "submodules/alu.v" */
  name: string;
  content: string;
}

export interface VerilogProject {
  files: ProjectFile[];
  topModule: string;
}

export interface ModuleInfo {
  name: string;
  fileId: string;
  fileName: string;
  /** Names of modules instantiated inside this module (deduplicated). */
  instantiates: string[];
}

export type DiagnosticCode =
  | 'NO_SOURCES'
  | 'MISSING_TOP'
  | 'MISSING_MODULE'
  | 'DUPLICATE_MODULE'
  | 'CIRCULAR_REFERENCE'
  | 'MISSING_INCLUDE'
  | 'DUPLICATE_FILE';

export interface ProjectDiagnostic {
  severity: 'error' | 'warning';
  code: DiagnosticCode;
  message: string;
  file: string | null;
}

export const SOURCE_EXT_RE = /\.(v|sv)$/i;
export const HEADER_EXT_RE = /\.(vh|svh)$/i;

let idCounter = 0;
export function newFileId(): string {
  idCounter += 1;
  return `pf${Date.now().toString(36)}_${idCounter}`;
}

export function createFile(name: string, content: string): ProjectFile {
  return { id: newFileId(), name: normalizePath(name), content };
}

export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '')
    .replace(/\/{2,}/g, '/');
}

export function isSourceFile(name: string): boolean {
  return SOURCE_EXT_RE.test(name);
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------
const KEYWORDS = new Set([
  'module', 'endmodule', 'begin', 'end', 'else', 'if', 'for', 'while', 'repeat', 'forever',
  'case', 'casex', 'casez', 'endcase', 'always', 'always_ff', 'always_comb', 'always_latch',
  'initial', 'assign', 'wire', 'reg', 'logic', 'integer', 'genvar', 'generate', 'endgenerate',
  'function', 'endfunction', 'task', 'endtask', 'parameter', 'localparam', 'input', 'output',
  'inout', 'defparam', 'default', 'deassign', 'force', 'release', 'typedef', 'enum', 'struct',
  'import', 'package', 'endpackage', 'interface', 'endinterface', 'assert', 'tri', 'supply0',
  'supply1', 'signed', 'unsigned', 'real', 'time', 'bit', 'byte', 'int', 'shortint', 'longint',
  'automatic', 'return', 'wait', 'disable', 'fork', 'join', 'specify', 'endspecify',
  // gate-level primitives
  'and', 'nand', 'or', 'nor', 'xor', 'xnor', 'not', 'buf', 'bufif0', 'bufif1', 'notif0', 'notif1',
  'pullup', 'pulldown', 'nmos', 'pmos', 'cmos', 'tran',
]);

export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
}

/** Extract module declarations (and what they instantiate) from one source text. */
export function scanSource(
  content: string,
  fileId = '',
  fileName = ''
): ModuleInfo[] {
  const text = stripComments(content);
  const modules: ModuleInfo[] = [];
  const re = /\bmodule\s+(?:automatic\s+|static\s+)?([A-Za-z_][A-Za-z0-9_$]*)([\s\S]*?)\bendmodule\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const rest = m[2];
    // body starts after the header terminator ';' (header may contain #(...) and port lists)
    const semi = rest.indexOf(';');
    const body = semi >= 0 ? rest.slice(semi + 1) : '';
    const inst = new Set<string>();
    for (const stmtRaw of body.split(';')) {
      let stmt = stmtRaw.trim();
      // peel off leading block keywords: "end else begin foo u1 (...)"
      for (;;) {
        const lead = /^(begin|end|else|endcase|endgenerate|generate|endfunction|endtask)\b(?:\s*:\s*[A-Za-z_]\w*)?\s*/.exec(stmt);
        if (!lead) break;
        stmt = stmt.slice(lead[0].length);
      }
      const im = /^([A-Za-z_][A-Za-z0-9_$]*)\b\s*(?:#\s*\([^;]*?\)\s*|\s+)([A-Za-z_][A-Za-z0-9_$]*)\b\s*(?:\[[^\]]*\]\s*)?\(/.exec(stmt);
      if (im && !KEYWORDS.has(im[1]) && !KEYWORDS.has(im[2]) && im[1] !== name) {
        inst.add(im[1]);
      }
    }
    modules.push({ name, fileId, fileName, instantiates: [...inst] });
  }
  return modules;
}

export function scanProject(files: ProjectFile[]): ModuleInfo[] {
  const out: ModuleInfo[] = [];
  for (const f of files) {
    if (!isSourceFile(f.name)) continue;
    out.push(...scanSource(f.content, f.id, f.name));
  }
  return out;
}

/** Modules that no other module instantiates, in file order. */
export function findTopCandidates(modules: ModuleInfo[]): string[] {
  const used = new Set<string>();
  for (const mod of modules) for (const i of mod.instantiates) used.add(i);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const mod of modules) {
    if (used.has(mod.name) || seen.has(mod.name)) continue;
    seen.add(mod.name);
    result.push(mod.name);
  }
  return result;
}

/** Preferred top: a root module literally named top*, otherwise first root, otherwise first module. */
export function guessTopModule(modules: ModuleInfo[]): string {
  const roots = findTopCandidates(modules);
  const named = roots.find((r) => /^top/i.test(r));
  return named ?? roots[0] ?? modules[0]?.name ?? '';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export function validateProject(project: VerilogProject): ProjectDiagnostic[] {
  const diags: ProjectDiagnostic[] = [];
  const sources = project.files.filter((f) => isSourceFile(f.name));
  if (sources.length === 0) {
    diags.push({
      severity: 'error',
      code: 'NO_SOURCES',
      message: 'Project has no .v / .sv source files.',
      file: null,
    });
    return diags;
  }

  // duplicate file names
  const names = new Map<string, number>();
  for (const f of project.files) names.set(f.name, (names.get(f.name) ?? 0) + 1);
  for (const [n, c] of names) {
    if (c > 1) {
      diags.push({
        severity: 'error',
        code: 'DUPLICATE_FILE',
        message: `File name "${n}" appears ${c} times in the project.`,
        file: n,
      });
    }
  }

  const modules = scanProject(project.files);

  // duplicate modules
  const byName = new Map<string, ModuleInfo[]>();
  for (const mod of modules) {
    byName.set(mod.name, [...(byName.get(mod.name) ?? []), mod]);
  }
  for (const [name, defs] of byName) {
    if (defs.length > 1) {
      diags.push({
        severity: 'error',
        code: 'DUPLICATE_MODULE',
        message: `Module "${name}" is defined ${defs.length} times (${defs
          .map((d) => d.fileName)
          .join(', ')}).`,
        file: defs[1].fileName,
      });
    }
  }

  // top module
  if (!project.topModule || !byName.has(project.topModule)) {
    diags.push({
      severity: 'error',
      code: 'MISSING_TOP',
      message: project.topModule
        ? `Missing top module: "${project.topModule}" is not defined in any project file.`
        : 'Missing top module: no top module selected.',
      file: null,
    });
  }

  // missing modules (instantiated but never defined)
  const reportedMissing = new Set<string>();
  for (const mod of modules) {
    for (const inst of mod.instantiates) {
      if (!byName.has(inst) && !reportedMissing.has(`${mod.name}>${inst}`)) {
        reportedMissing.add(`${mod.name}>${inst}`);
        diags.push({
          severity: 'error',
          code: 'MISSING_MODULE',
          message: `Module "${inst}" (instantiated in "${mod.name}") is not defined in any project file.`,
          file: mod.fileName,
        });
      }
    }
  }

  // circular references
  const graph = new Map<string, string[]>();
  for (const mod of modules) {
    if (!graph.has(mod.name)) graph.set(mod.name, mod.instantiates.filter((i) => byName.has(i)));
  }
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const dfs = (n: string) => {
    color.set(n, 1);
    stack.push(n);
    for (const next of graph.get(n) ?? []) {
      const c = color.get(next) ?? 0;
      if (c === 0) dfs(next);
      else if (c === 1) cycles.push([...stack.slice(stack.indexOf(next)), next]);
    }
    stack.pop();
    color.set(n, 2);
  };
  for (const n of graph.keys()) if ((color.get(n) ?? 0) === 0) dfs(n);
  for (const cyc of cycles) {
    diags.push({
      severity: 'error',
      code: 'CIRCULAR_REFERENCE',
      message: `Circular module reference: ${cyc.join(' → ')}`,
      file: byName.get(cyc[0])?.[0]?.fileName ?? null,
    });
  }

  // `include "file" must resolve to a project file
  const allNames = project.files.map((f) => f.name.toLowerCase());
  for (const f of sources) {
    const incRe = /`include\s+"([^"]+)"/g;
    let im: RegExpExecArray | null;
    const text = stripComments(f.content);
    while ((im = incRe.exec(text)) !== null) {
      const inc = normalizePath(im[1]).toLowerCase();
      const base = inc.split('/').pop()!;
      const found = allNames.some((n) => n === inc || n.endsWith('/' + inc) || n.split('/').pop() === base);
      if (!found) {
        diags.push({
          severity: 'warning',
          code: 'MISSING_INCLUDE',
          message: `\`include "${im[1]}" in ${f.name} was not found among project files.`,
          file: f.name,
        });
      }
    }
  }

  return diags;
}

export function hasErrors(diags: ProjectDiagnostic[]): boolean {
  return diags.some((d) => d.severity === 'error');
}

// ---------------------------------------------------------------------------
// Project editing (immutable helpers used by Project Explorer)
// ---------------------------------------------------------------------------
function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  while (taken.has(`${stem}_${i}${ext}`)) i++;
  return `${stem}_${i}${ext}`;
}

/** Add files; a file whose path already exists replaces that file's content. */
export function addFiles(
  files: ProjectFile[],
  incoming: Array<{ name: string; content: string }>
): ProjectFile[] {
  const out = files.slice();
  for (const inc of incoming) {
    const name = normalizePath(inc.name);
    const idx = out.findIndex((f) => f.name === name);
    if (idx >= 0) out[idx] = { ...out[idx], content: inc.content };
    else out.push({ id: newFileId(), name, content: inc.content });
  }
  return out;
}

export function renameFile(
  files: ProjectFile[],
  id: string,
  newName: string
): { files: ProjectFile[]; error?: string } {
  const name = normalizePath(newName.trim());
  if (!name) return { files, error: 'File name cannot be empty.' };
  if (files.some((f) => f.id !== id && f.name === name)) {
    return { files, error: `A file named "${name}" already exists.` };
  }
  return { files: files.map((f) => (f.id === id ? { ...f, name } : f)) };
}

export function deleteFile(files: ProjectFile[], id: string): ProjectFile[] {
  return files.filter((f) => f.id !== id);
}

/** Replace the content of one file, keeping its id and name. */
export function replaceFile(files: ProjectFile[], id: string, content: string): ProjectFile[] {
  return files.map((f) => (f.id === id ? { ...f, content } : f));
}

export function makeProject(
  files: Array<{ name: string; content: string }>,
  topModule?: string
): VerilogProject {
  const pf = files.map((f) => createFile(f.name, f.content));
  return {
    files: pf,
    topModule: topModule ?? guessTopModule(scanProject(pf)),
  };
}

export { uniqueName };
