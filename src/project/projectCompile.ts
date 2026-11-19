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
 * Computes the set of modules transitively instantiated starting from `topModule`.
 * Ensures that if a user selects a submodule as the active `topModule`, parent modules
 * in other files that instantiate `topModule` are not passed to Verilator (which would
 * otherwise fail with "Specified --top-module '...' isn't at the top level").
 */
function selectFilesForTop(project: VerilogProject): SourceFile[] {
  const modules = scanProject(project.files);
  const byName = new Map<string, typeof modules>();
  const byFileId = new Map<string, string[]>();

  for (const mod of modules) {
    byName.set(mod.name, [...(byName.get(mod.name) ?? []), mod]);
    byFileId.set(mod.fileId, [...(byFileId.get(mod.fileId) ?? []), mod.name]);
  }

  const reachable = new Set<string>();
  const queue = [project.topModule];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const def of byName.get(cur) ?? []) {
      for (const child of def.instantiates) {
        if (!reachable.has(child)) queue.push(child);
      }
    }
  }

  return project.files
    .filter((f) => {
      if (!isSourceFile(f.name)) return true; // always include headers (.vh/.svh) and memory files (.hex/.mem)
      const fileMods = byFileId.get(f.id) ?? [];
      if (fileMods.length === 0) return true;
      return fileMods.some((m) => reachable.has(m));
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
