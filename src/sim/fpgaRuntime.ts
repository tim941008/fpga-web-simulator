/**
 * FPGA Runtime - Verilator WebAssembly pipeline
 *
 *   project files + top module --> Verilator (verilator_bin.wasm, in a Web Worker)
 *               |  Verilator XML netlist (obj_dir/V<top>.xml)
 *               v
 *           VerilogXMLParser (8bitworkshop)
 *               |  HDL AST
 *               v
 *           HDLModuleWASM (8bitworkshop + binaryen) --> native WebAssembly model
 *               |      (falls back to HDLModuleJS if WASM codegen fails)
 *               v
 *           FpgaRuntime  --> LED / HEX7SEG / Matrix16x16 (via Hardware Config Mapper)
 */
import { PortDefinition } from '../types/fpga';
import { VerilogXMLParser } from '../vendor/8bitworkshop/hdl/vxmlparser';
import { HDLModuleJS } from '../vendor/8bitworkshop/hdl/hdlruntime';

export interface CompileMessage {
  severity: 'error' | 'warning';
  file: string | null;
  line: number;
  msg: string;
}

export interface CompileResult {
  runtime: FpgaRuntime | null;
  messages: CompileMessage[];
  log: string[];
  timings: { verilatorMs: number; codegenMs: number };
}

export interface SourceFile {
  name: string;
  content: string;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  xml?: string;
  errors: CompileMessage[];
  log: string[];
}

// ---------------------------------------------------------------------------
// Verilator worker (singleton; the 6 MB verilator_bin.wasm is compiled once)
// ---------------------------------------------------------------------------
let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, (res: WorkerResponse) => void>();

function getWorker(): Worker {
  if (!worker) {
    const url = `${import.meta.env.BASE_URL}verilator/verilator-worker.js?v=3`;
    worker = new Worker(url); // classic worker (uses importScripts)
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const cb = pending.get(ev.data.id);
      if (cb) {
        pending.delete(ev.data.id);
        cb(ev.data);
      }
    };
    worker.onerror = (ev) => {
      const err: CompileMessage = {
        severity: 'error',
        file: null,
        line: 0,
        msg: `Verilator worker crashed: ${ev.message || 'unknown error'}`,
      };
      for (const [id, cb] of pending) cb({ id, ok: false, errors: [err], log: [] });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export const VERILATOR_TIMEOUT_MS = 30_000;

/**
 * Normalizes a Verilog $readmemh / $readmemb file into one-entry-per-address lines.
 * Strips comments and honors `@hex_addr` address directives by zero-filling gaps (BUG-13).
 */
export function normalizeMemContent(raw: string): string {
  const tokens = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const cells: string[] = [];
  let addr = 0;
  const MAX_ADDR = 65536;

  for (const tok of tokens) {
    if (tok.startsWith('@')) {
      const parsed = parseInt(tok.slice(1), 16);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_ADDR) {
        addr = parsed;
      }
      continue;
    }
    while (cells.length < addr) cells.push('0');
    cells[addr] = tok;
    addr += 1;
  }

  return cells.join('\n');
}

/**
 * Enhances Verilator compile diagnostics with safe actionable hints (BUG-16).
 */
export function annotateCompileMessages(messages: CompileMessage[]): CompileMessage[] {
  const out = [...messages];
  const hasBlkLoopInit = out.some(
    (m) =>
      m.severity === 'error' &&
      (/BLKLOOPINIT/i.test(m.msg) || /Delayed assignment to array inside for loops/i.test(m.msg))
  );
  if (hasBlkLoopInit) {
    out.push({
      severity: 'warning',
      file: null,
      line: 0,
      msg: "Hint (BLKLOOPINIT): Verilator 4.205 does not support non-blocking (<=) assignments to unpacked arrays inside procedural for-loops. Do not blindly change <= to blocking = inside always @(posedge clk) (which can cause race conditions); instead, unroll structurally with a 'generate for' block or flatten the array.",
    });
  }
  return out;
}

function runVerilator(
  files: SourceFile[],
  top: string,
  timeoutMs: number = VERILATOR_TIMEOUT_MS
): Promise<WorkerResponse> {
  const w = getWorker();
  const id = nextRequestId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      const timeoutErr: CompileMessage = {
        severity: 'error',
        file: null,
        line: 0,
        msg: `Verilator compilation timed out after ${Math.round(timeoutMs / 1000)} s; worker was reset.`,
      };
      // Reset the hung worker and reject any other in-flight requests cleanly
      for (const [otherId, cb] of pending) {
        cb({ id: otherId, ok: false, errors: [timeoutErr], log: [] });
      }
      pending.clear();
      worker?.terminate();
      worker = null;
      resolve({ id, ok: false, errors: [timeoutErr], log: [] });
    }, timeoutMs);

    pending.set(id, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
    w.postMessage({ id, files, top });
  });
}

// ---------------------------------------------------------------------------
// Value conversion helpers (state proxy returns number | bigint | TypedArray)
// ---------------------------------------------------------------------------
function toBigInt(v: unknown, width: number): bigint {
  let out: bigint;
  if (typeof v === 'number') {
    out = BigInt(v >>> 0);
  } else if (typeof v === 'bigint') {
    out = BigInt.asUintN(Math.max(width, 1), v);
  } else if (v && typeof (v as ArrayLike<number>).length === 'number') {
    const arr = v as ArrayLike<number>;
    const bits = (arr as Uint8Array).BYTES_PER_ELEMENT
      ? (arr as Uint8Array).BYTES_PER_ELEMENT * 8
      : 32;
    out = 0n;
    for (let i = arr.length - 1; i >= 0; i--) {
      out = (out << BigInt(bits)) | BigInt(arr[i] >>> 0);
    }
  } else {
    out = 0n;
  }
  return width > 0 ? out & ((1n << BigInt(width)) - 1n) : out;
}

interface VarInfo {
  key: string; // name inside the HDL state proxy
  def: PortDefinition;
}

// ---------------------------------------------------------------------------
// FpgaRuntime: wraps a Verilated model and exposes a simple port API
// ---------------------------------------------------------------------------
export class FpgaRuntime {
  readonly backend: 'verilator-wasm' | 'verilator-js';
  readonly topModule: string;
  readonly ports: PortDefinition[];
  readonly internalSignals: PortDefinition[];
  readonly skippedWidePorts: Array<{ name: string; width: number }>;

  private model: any; // HDLModuleWASM | HDLModuleJS
  private vars = new Map<string, VarInfo>();

  private constructor(model: any, backend: 'verilator-wasm' | 'verilator-js', topModule: string) {
    this.model = model;
    this.backend = backend;
    this.topModule = topModule;

    const ports: PortDefinition[] = [];
    const internals: PortDefinition[] = [];
    const skippedWidePorts: Array<{ name: string; width: number }> = [];
    // HDLModuleWASM keeps the AST in .hdlmod, HDLModuleJS in .mod
    const vardefs: Record<string, any> = (model.hdlmod ?? model.mod).vardefs;

    for (const [key, vd] of Object.entries(vardefs)) {
      if (vd.isParam || vd.constValue != null) continue;
      const dt = vd.dtype;
      if (!dt || typeof dt.left !== 'number' || typeof dt.right !== 'number') continue; // skip arrays/memories
      const msb = Math.max(dt.left, dt.right);
      const lsb = Math.min(dt.left, dt.right);
      const width = msb - lsb + 1;
      if (width > 64) {
        if (vd.isInput || vd.isOutput) {
          skippedWidePorts.push({ name: key, width });
        }
        continue;
      }

      if (vd.isInput || vd.isOutput) {
        const direction: PortDefinition['direction'] =
          vd.isInput && vd.isOutput ? 'inout' : vd.isInput ? 'input' : 'output';
        const def: PortDefinition = {
          name: key,
          direction,
          msb,
          lsb,
          width,
        };
        ports.push(def);
        this.vars.set(key, { key, def });
      } else {
        const display = FpgaRuntime.prettyName(key, topModule);
        if (!display || display.startsWith('__V') || display.includes('__V')) continue;
        if (this.vars.has(display)) continue; // shadow copy of a port
        const def: PortDefinition = { name: display, direction: 'inout', msb, lsb, width, isReg: true };
        internals.push(def);
        this.vars.set(display, { key, def });
      }
    }

    this.ports = ports;
    this.internalSignals = internals.filter((d) => !ports.some((p) => p.name === d.name));
    this.skippedWidePorts = skippedWidePorts;
  }

  /** "top__DOT__u_cnt__DOT__count" / "top$u_cnt$count" -> "u_cnt.count" */
  private static prettyName(key: string, top: string): string {
    let s = key;
    for (const prefix of [`${top}__DOT__`, `${top}$`, 'TOP__DOT__', 'TOP$']) {
      if (s.startsWith(prefix)) {
        s = s.slice(prefix.length);
        break;
      }
    }
    return s.replace(/__DOT__/g, '.').replace(/\$/g, '.');
  }

  /** Compile Verilog sources in the browser with Verilator WASM and build a runnable model. */
  static async compile(files: SourceFile[], top: string): Promise<CompileResult> {
    const t0 = performance.now();
    const res = await runVerilator(files, top);
    const t1 = performance.now();
    const messages = annotateCompileMessages(res.errors ?? []);

    if (!res.ok || !res.xml) {
      return { runtime: null, messages, log: res.log ?? [], timings: { verilatorMs: t1 - t0, codegenMs: 0 } };
    }

    let runtime: FpgaRuntime | null = null;
    try {
      const parser = new VerilogXMLParser();
      parser.parse(res.xml);
      const topDef = parser.modules['TOP'];
      const constPool = parser.modules['@CONST-POOL@'];
      if (!topDef) throw new Error('Verilator XML has no TOP module');

      // Build memory file lookup for $readmemh / $readmemb from actual project files only (BUG-13)
      const memFiles = new Map<string, string>();
      for (const f of files) {
        const norm = normalizeMemContent(f.content);
        const base = f.name.split(/[\\/]/).pop() ?? f.name;
        memFiles.set(f.name, norm);
        memFiles.set(f.name.toLowerCase(), norm);
        memFiles.set(base, norm);
        memFiles.set(base.toLowerCase(), norm);
      }

      const getFileData = (filename: string): string | null => {
        const clean = filename.replace(/\0/g, '').trim();
        const base = clean.split(/[\\/]/).pop() ?? clean;
        const rev = clean.split('').reverse().join('');
        return (
          memFiles.get(clean) ??
          memFiles.get(clean.toLowerCase()) ??
          memFiles.get(base) ??
          memFiles.get(base.toLowerCase()) ??
          memFiles.get(rev) ??
          memFiles.get(rev.toLowerCase()) ??
          null
        );
      };

      try {
        const [{ HDLModuleWASM }, { binaryenReady }] = await Promise.all([
          import('../vendor/8bitworkshop/hdl/hdlwasm'),
          import('../vendor/8bitworkshop/hdl/binaryen-shim'),
        ]);
        await binaryenReady();
        const wasmModel = new HDLModuleWASM(topDef, constPool);
        (wasmModel as any).getFileData = getFileData;
        await wasmModel.init();
        wasmModel.powercycle();
        runtime = new FpgaRuntime(wasmModel, 'verilator-wasm', top);
      } catch (wasmErr) {
        console.warn('HDLModuleWASM failed, falling back to HDLModuleJS:', wasmErr);
        messages.push({
          severity: 'warning',
          file: null,
          line: 0,
          msg: `WASM codegen failed (${String((wasmErr as Error)?.message ?? wasmErr)}); using JS backend`,
        });
        const jsModel = new HDLModuleJS(topDef, constPool);
        (jsModel as any).getFileData = getFileData;
        jsModel.init();
        jsModel.powercycle();
        runtime = new FpgaRuntime(jsModel, 'verilator-js', top);
      }

      if (runtime && runtime.skippedWidePorts.length > 0) {
        for (const wp of runtime.skippedWidePorts) {
          messages.push({
            severity: 'warning',
            file: null,
            line: 0,
            msg: `Port "${wp.name}" (${wp.width}-bit) exceeds 64 bits and is omitted from live hardware/signal inspection.`,
          });
        }
      }
    } catch (e) {
      const err = e as any;
      messages.push({
        severity: 'error',
        file: err?.$loc?.path ?? null,
        line: err?.$loc?.line ?? 0,
        msg: String(err?.message ?? err),
      });
    }

    return {
      runtime,
      messages,
      log: res.log ?? [],
      timings: { verilatorMs: t1 - t0, codegenMs: performance.now() - t1 },
    };
  }

  hasSignal(name: string): boolean {
    return this.vars.has(name);
  }

  getSignals(): Record<string, bigint> {
    const out: Record<string, bigint> = {};
    const state = this.model.state;
    for (const [name, info] of this.vars) {
      out[name] = toBigInt(state[info.key], info.def.width);
    }
    return out;
  }

  /** Read one signal without snapshotting the whole state (cheap; used for per-cycle sampling). */
  readSignal(name: string): bigint {
    const info = this.vars.get(name);
    if (!info) return 0n;
    return toBigInt(this.model.state[info.key], info.def.width);
  }

  /** Drive an input port (does not evaluate; call eval() afterwards). */
  setSignal(name: string, value: bigint): void {
    const info = this.vars.get(name);
    if (!info) return;
    const width = info.def.width;
    const masked = value & ((1n << BigInt(width)) - 1n);
    const state = this.model.state;
    const cur = state[info.key];

    if (typeof cur === 'number' || cur == null) {
      state[info.key] = Number(masked);
    } else if (typeof cur === 'bigint') {
      state[info.key] = masked;
    } else if (typeof cur.length === 'number') {
      // typed array view (e.g. 33..64-bit signals are stored as 2 x u32)
      const bits = BigInt((cur.BYTES_PER_ELEMENT ?? 4) * 8);
      const mask = (1n << bits) - 1n;
      let v = masked;
      for (let i = 0; i < cur.length; i++) {
        cur[i] = Number(v & mask);
        v >>= bits;
      }
    }
  }

  /**
   * Build a hot-loop function that advances one full clock cycle.
   * - Active-High (default): clk 1 -> eval -> clk 0 -> eval (idle 0)
   * - Active-Low: clk 0 -> eval -> clk 1 -> eval (idle 1)
   * Clock key / model are resolved once so the per-cycle cost is two state writes + two evals
   * (no BigInt conversion, no map lookups, no signal snapshots).
   */
  makeCycleStepper(
    clockName: string | null,
    polarity: 'active-high' | 'active-low' = 'active-high'
  ): () => void {
    const model = this.model;
    const info = clockName ? this.vars.get(clockName) : undefined;
    if (!info) return () => model.eval();
    const key = info.key;
    const activeLevel: 0 | 1 = polarity === 'active-low' ? 0 : 1;
    const idleLevel: 0 | 1 = polarity === 'active-low' ? 1 : 0;
    if (typeof model.state[key] === 'number' || model.state[key] == null) {
      return () => {
        model.state[key] = activeLevel;
        model.eval();
        model.state[key] = idleLevel;
        model.eval();
      };
    }
    const activeBig = BigInt(activeLevel);
    const idleBig = BigInt(idleLevel);
    return () => {
      this.setSignal(clockName!, activeBig);
      model.eval();
      this.setSignal(clockName!, idleBig);
      model.eval();
    };
  }

  /** Settle combinational logic (Verilator eval()). */
  eval(): void {
    this.model.eval();
  }

  /** Drive the clock pin to `level` and evaluate (posedge/negedge processes fire). */
  stepEdge(clockName: string, level: 0 | 1): void {
    if (this.vars.has(clockName)) {
      this.setSignal(clockName, BigInt(level));
    }
    this.model.eval();
  }

  /** Power-cycle the model, then restore the given input values. */
  reset(inputs: Record<string, bigint> = {}): void {
    this.model.powercycle();
    for (const [k, v] of Object.entries(inputs)) {
      const info = this.vars.get(k);
      if (info && info.def.direction === 'input') this.setSignal(k, v);
    }
    this.model.eval();
  }

  dispose(): void {
    try {
      this.model.dispose?.();
    } catch {
      /* ignore */
    }
  }
}
