/**
 * Compile a VerilogProject: validate first (user-friendly diagnostics), then hand the
 * reachable project files plus the chosen top module to the Verilator WASM pipeline.
 */
import type { CompileMessage, CompileResult, SourceFile } from '../sim/fpgaRuntime';
import {
  hasErrors,
  isSourceFile,
  ProjectDiagnostic,
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
 * Selects project files to pass to Verilator for `topModule`.
 * Uses a strict-ancestor denylist rather than a regex reachability allowlist:
 * - Excludes a source file only when every module it defines is a strict ancestor
 *   (transitively instantiates `topModule`), preventing Verilator from failing with
 *   "Specified --top-module '...' isn't at the top level" when compiling a submodule.
 * - Preserves all other source files (including submodules instantiated inside
 *   `generate` or `` `ifdef `` blocks that regex scanning cannot see) so Verilator
 *   remains the authoritative resolver.
 */
function selectFilesForTop(project: VerilogProject): SourceFile[] {
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

  return project.files
    .filter((f) => {
      if (!isSourceFile(f.name)) return true; // always include headers (.vh/.svh) and memory files (.hex/.mem)
      const fileMods = byFileId.get(f.id) ?? [];
      if (fileMods.length === 0) return true;
      // Only exclude if EVERY module in this file is a strict ancestor of topModule
      return !fileMods.every((m) => strictAncestors.has(m));
    })
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
