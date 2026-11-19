/**
 * Compile a VerilogProject: validate first (user-friendly diagnostics), then hand the
 * reachable project files plus the chosen top module to the Verilator WASM pipeline.
 */
import type { CompileMessage, CompileResult, SourceFile } from '../sim/fpgaRuntime';
import {
  hasErrors,
  isSourceFile,
  ProjectDiagnostic,
  ProjectFile,
  scanPackageImports,
  scanPackages,
  scanProject,
  validateProject,
  VerilogProject,
} from './projectModel';

export type Compiler = (files: SourceFile[], top: string) => Promise<CompileResult>;

export interface ProjectCompileOutcome {
  /** Pre-compile diagnostics (always present, may be warnings only). */
  diagnostics: ProjectDiagnostic[];
  /** Set when Verilator ran. */
  result: CompileResult | null;
  /** Diagnostics converted to the UI message shape + Verilator messages. */
  messages: CompileMessage[];
}

export function diagnosticsToMessages(diags: ProjectDiagnostic[]): CompileMessage[] {
  return diags.map((d) => ({
    severity: d.severity,
    file: d.file,
    line: 0,
    msg: d.message,
  }));
}

async function defaultCompiler(files: SourceFile[], top: string): Promise<CompileResult> {
  const { FpgaRuntime } = await import('../sim/fpgaRuntime');
  return FpgaRuntime.compile(files, top);
}

/**
 * Topologically orders source files so SystemVerilog `package` providers are always
 * compiled before files that `import` (or `pkg::` reference) them.
 * - Uses Kahn's algorithm with deterministic tie-breaking: ready package-declaring
 *   files are emitted first (in original project order), followed by ready non-package
 *   files (in original project order).
 * - Projects with no packages preserve exact original file order.
 * - Cyclic package dependencies are handled gracefully without dropping files (remaining
 *   nodes are appended in deterministic order; `validateProject` emits `CIRCULAR_PACKAGE`).
 */
function orderSourcesByPackageDependencies(sources: ProjectFile[]): ProjectFile[] {
  const n = sources.length;
  if (n <= 1) return sources.slice();

  const declaredByIdx: string[][] = sources.map((f) => scanPackages(f.content));
  const hasPackages = declaredByIdx.some((p) => p.length > 0);
  if (!hasPackages) return sources.slice();

  const pkgToProviders = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    for (const pkg of declaredByIdx[i]) {
      const list = pkgToProviders.get(pkg) ?? [];
      list.push(i);
      pkgToProviders.set(pkg, list);
    }
  }

  // Directed graph: edge providerIdx -> consumerIdx (provider must compile before consumer)
  const dependents: Array<Set<number>> = Array.from({ length: n }, () => new Set<number>());
  const inDegree = new Array<number>(n).fill(0);

  for (let consumerIdx = 0; consumerIdx < n; consumerIdx++) {
    const imports = scanPackageImports(sources[consumerIdx].content);
    for (const pkg of imports) {
      const providers = pkgToProviders.get(pkg);
      if (!providers) continue;
      for (const providerIdx of providers) {
        if (providerIdx === consumerIdx) continue;
        if (!dependents[providerIdx].has(consumerIdx)) {
          dependents[providerIdx].add(consumerIdx);
          inDegree[consumerIdx] += 1;
        }
      }
    }
  }

  const isPkgFile = (idx: number) => declaredByIdx[idx].length > 0;
  const compareReady = (a: number, b: number) => {
    const pa = isPkgFile(a) ? 0 : 1;
    const pb = isPkgFile(b) ? 0 : 1;
    return pa !== pb ? pa - pb : a - b;
  };

  const ready: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) ready.push(i);
  }
  ready.sort(compareReady);

  const orderedIdxs: number[] = [];
  const emitted = new Set<number>();

  while (ready.length > 0) {
    const cur = ready.shift()!;
    orderedIdxs.push(cur);
    emitted.add(cur);
    let added = false;
    for (const next of dependents[cur]) {
      inDegree[next] -= 1;
      if (inDegree[next] === 0) {
        ready.push(next);
        added = true;
      }
    }
    if (added) ready.sort(compareReady);
  }

  // Cyclic package dependencies: append remaining nodes deterministically without dropping any file
  if (orderedIdxs.length < n) {
    const remaining: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!emitted.has(i)) remaining.push(i);
    }
    remaining.sort(compareReady);
    orderedIdxs.push(...remaining);
  }

  return orderedIdxs.map((i) => sources[i]);
}

/**
 * Selects and orders project files to pass to Verilator for `topModule`.
 * Uses a strict-ancestor denylist rather than a regex reachability allowlist:
 * - Excludes a source file only when it declares no SystemVerilog packages AND every
 *   module it defines is a strict ancestor (transitively instantiates `topModule`),
 *   preventing Verilator from failing with "Specified --top-module '...' isn't at the
 *   top level" when compiling a submodule.
 * - Preserves all other source files (including package declaration files and submodules
 *   instantiated inside `generate` or `` `ifdef `` blocks) so Verilator remains the
 *   authoritative resolver.
 * - Topologically sorts source files so package providers precede files importing them.
 */
export function selectFilesForTop(project: VerilogProject): SourceFile[] {
  const modules = scanProject(project.files);
  const parentsOf = new Map<string, Set<string>>();
  const byFileId = new Map<string, string[]>();

  for (const mod of modules) {
    byFileId.set(mod.fileId, [...(byFileId.get(mod.fileId) ?? []), mod.name]);
    for (const child of mod.instantiates) {
      const set = parentsOf.get(child) ?? new Set<string>();
      set.add(mod.name);
      parentsOf.set(child, set);
    }
  }

  const strictAncestors = new Set<string>();
  const queue = [project.topModule];
  const visited = new Set<string>([project.topModule]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const parent of parentsOf.get(cur) ?? []) {
      if (parent !== project.topModule) strictAncestors.add(parent);
      if (!visited.has(parent)) {
        visited.add(parent);
        queue.push(parent);
      }
    }
  }

  const kept = project.files.filter((f) => {
    if (!isSourceFile(f.name)) return true; // always include headers (.vh/.svh) and memory files (.hex/.mem)
    // Never exclude a file that declares a SystemVerilog package
    if (scanPackages(f.content).length > 0) return true;
    const fileMods = byFileId.get(f.id) ?? [];
    if (fileMods.length === 0) return true;
    // Only exclude if EVERY module in this file is a strict ancestor of topModule
    return !fileMods.every((m) => strictAncestors.has(m));
  });

  const keptSources = kept.filter((f) => isSourceFile(f.name));
  const sortedSources = orderSourcesByPackageDependencies(keptSources);

  // Place topologically sorted source files into source slots while preserving non-source positions
  let srcCursor = 0;
  return kept
    .map((f) => (isSourceFile(f.name) ? sortedSources[srcCursor++] : f))
    .map((f) => ({ name: f.name, content: f.content }));
}

export async function compileProject(
  project: VerilogProject,
  compiler: Compiler = defaultCompiler
): Promise<ProjectCompileOutcome> {
  const diagnostics = validateProject(project);
  const pre = diagnosticsToMessages(diagnostics);
  if (hasErrors(diagnostics)) {
    return { diagnostics, result: null, messages: pre };
  }
  const files: SourceFile[] = selectFilesForTop(project);
  const result = await compiler(files, project.topModule);
  return { diagnostics, result, messages: [...pre, ...result.messages] };
}
