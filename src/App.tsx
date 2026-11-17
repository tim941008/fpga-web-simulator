import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileCode,
  FileSpreadsheet,
  FolderUp,
  Layers,
  Code2,
  Pin,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { buildBoardControlGroups, parseQsfFile } from './parsers/qsfParser';
import { parseVerilogSource } from './parsers/verilogParser';
import { CompileMessage, FpgaRuntime } from './sim/fpgaRuntime';
import { SAMPLE_PRESETS } from './presets/sampleDesigns';
import { PortDefinition, SignalHistoryEntry } from './types/fpga';
import { BackendMode, ClockControls } from './components/ClockControls';
import { BoardView } from './components/BoardView';
import { MatrixViewer } from './components/MatrixViewer';
import { SignalMonitor } from './components/SignalMonitor';

const createEmpty16x16 = (): number[][] => Array.from({ length: 16 }, () => Array(16).fill(0));

const FRAME_MS = 16; // UI refresh period while the clock runs
const HISTORY_LEN = 64;

interface SourceFile {
  name: string;
  content: string;
}

export const App: React.FC = () => {
  // ------------------------------------------------------------------ sources
  const [verilogFiles, setVerilogFiles] = useState<SourceFile[]>([
    { name: SAMPLE_PRESETS[0].verilogFilename, content: SAMPLE_PRESETS[0].verilogCode },
  ]);
  const [qsfFile, setQsfFile] = useState<SourceFile>({
    name: SAMPLE_PRESETS[0].qsfFilename,
    content: SAMPLE_PRESETS[0].qsfContent,
  });
  const [editIndex, setEditIndex] = useState(0);

  // --------------------------------------------------------------- sim state
  const [activeTab, setActiveTab] = useState<'board' | 'code' | 'qsf'>('board');
  const [running, setRunning] = useState(false);
  const [clockHz, setClockHz] = useState(30);
  const [cycleCount, setCycleCount] = useState(0);
  const [clockLevel, setClockLevel] = useState<0 | 1>(0);
  const [signals, setSignals] = useState<Record<string, bigint>>({});
  const [history, setHistory] = useState<SignalHistoryEntry[]>([]);
  const [backendMode, setBackendMode] = useState<BackendMode>('none');
  const [compiling, setCompiling] = useState(false);
  const [messages, setMessages] = useState<CompileMessage[]>([]);
  const [compileInfo, setCompileInfo] = useState<string>('');
  const [runtimePorts, setRuntimePorts] = useState<PortDefinition[] | null>(null);
  const [runtimeInternals, setRuntimeInternals] = useState<PortDefinition[]>([]);

  // 16x16 matrix
  const [matrixBuffer, setMatrixBuffer] = useState<number[][]>(createEmpty16x16);
  const [povEnabled, setPovEnabled] = useState(true);
  const [invertColPolarity, setInvertColPolarity] = useState(false);

  const runtimeRef = useRef<FpgaRuntime | null>(null);
  const cycleRef = useRef(0);
  const clockLevelRef = useRef<0 | 1>(0);
  const matrixRef = useRef<number[][]>(createEmpty16x16());
  const compileSeq = useRef(0);

  // ------------------------------------------------------------ parsing / pin mapper
  const verilogParsed = useMemo(() => parseVerilogSource(verilogFiles.map((f) => f.content)), [verilogFiles]);
  const qsfParsed = useMemo(() => parseQsfFile(qsfFile.content), [qsfFile]);

  // Top module: QSF TOP_LEVEL_ENTITY if it exists in the sources, otherwise auto-detected
  const topModule = useMemo(() => {
    const all = verilogFiles.map((f) => f.content).join('\n');
    const qsfTop = qsfParsed.topLevelEntity;
    if (qsfTop && new RegExp(`\\bmodule\\s+${qsfTop}\\b`).test(all)) return qsfTop;
    return verilogParsed.topModule;
  }, [verilogFiles, qsfParsed.topLevelEntity, verilogParsed.topModule]);

  // Ports reported by Verilator are authoritative; fall back to the regex parser before first compile
  const ports = runtimePorts ?? verilogParsed.ports;

  const controlGroups = useMemo(
    () => buildBoardControlGroups(ports, qsfParsed.assignments),
    [ports, qsfParsed.assignments]
  );
  const clockGroup = useMemo(() => controlGroups.find((g) => g.category === 'CLOCK') ?? null, [controlGroups]);
  const matrixRowGroup = useMemo(
    () => controlGroups.find((g) => g.category === 'MATRIX_ROW') ?? null,
    [controlGroups]
  );
  const matrixColGroup = useMemo(
    () => controlGroups.find((g) => g.category === 'MATRIX_COL') ?? null,
    [controlGroups]
  );
  const clkName = clockGroup?.baseName ?? null;
  const rowSigName = matrixRowGroup?.baseName ?? 'MATRIX_ROW';
  const colSigName = matrixColGroup?.baseName ?? 'MATRIX_COL';

  // --------------------------------------------------------------- matrix POV
  const sampleMatrix = useCallback(
    (sig: Record<string, bigint>) => {
      const rowVal = sig[rowSigName] ?? 0n;
      const raw = sig[colSigName] ?? 0n;
      const colVal = invertColPolarity ? ~raw & 0xffffn : raw & 0xffffn;
      const buf = matrixRef.current;
      for (let r = 0; r < 16; r++) {
        if (((rowVal >> BigInt(r)) & 1n) === 0n) continue;
        for (let c = 0; c < 16; c++) {
          const on = ((colVal >> BigInt(15 - c)) & 1n) === 1n;
          if (on) buf[r][c] = 1;
          else if (!povEnabled) buf[r][c] = 0;
        }
      }
    },
    [rowSigName, colSigName, invertColPolarity, povEnabled]
  );

  const decayMatrix = useCallback(() => {
    if (!povEnabled) return;
    const buf = matrixRef.current;
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) buf[r][c] *= 0.85;
  }, [povEnabled]);

  const publishMatrix = useCallback(() => {
    setMatrixBuffer(matrixRef.current.map((row) => row.slice()));
  }, []);

  const clearMatrix = useCallback(() => {
    matrixRef.current = createEmpty16x16();
    publishMatrix();
  }, [publishMatrix]);

  // ---------------------------------------------------------------- compile
  const compile = useCallback(async () => {
    const seq = ++compileSeq.current;
    setRunning(false);
    setCompiling(true);
    setCompileInfo('');
    const result = await FpgaRuntime.compile(verilogFiles, topModule);
    if (seq !== compileSeq.current) {
      result.runtime?.dispose();
      return; // a newer compile superseded this one
    }
    setCompiling(false);
    setMessages(result.messages);

    if (!result.runtime) {
      setBackendMode('none');
      setCompileInfo(`Verilator failed (${result.timings.verilatorMs.toFixed(0)} ms)`);
      return;
    }

    runtimeRef.current?.dispose();
    const rt = result.runtime;
    runtimeRef.current = rt;
    setBackendMode(rt.backend);
    setRuntimePorts(rt.ports);
    setRuntimeInternals(rt.internalSignals);
    setCompileInfo(
      `Verilator ${result.timings.verilatorMs.toFixed(0)} ms + codegen ${result.timings.codegenMs.toFixed(0)} ms`
    );

    cycleRef.current = 0;
    clockLevelRef.current = 0;
    setCycleCount(0);
    setClockLevel(0);
    const sig = rt.getSignals();
    setSignals(sig);
    setHistory([{ cycle: 0, halfCycle: 0, values: sig }]);
    matrixRef.current = createEmpty16x16();
    sampleMatrix(sig);
    publishMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verilogFiles, topModule]);

  // Auto-compile (debounced) whenever the sources change
  useEffect(() => {
    const t = window.setTimeout(() => void compile(), 600);
    return () => window.clearTimeout(t);
  }, [compile]);

  // ------------------------------------------------------------- clocking
  const pushHistory = (entries: SignalHistoryEntry[]) =>
    setHistory((h) => [...h, ...entries].slice(-HISTORY_LEN));

  const stepHalfCycle = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const next: 0 | 1 = clockLevelRef.current === 0 ? 1 : 0;
    if (clkName) rt.stepEdge(clkName, next);
    else rt.eval();
    clockLevelRef.current = next;
    if (next === 1) cycleRef.current += 1;
    const sig = rt.getSignals();
    sampleMatrix(sig);
    publishMatrix();
    setClockLevel(next);
    setCycleCount(cycleRef.current);
    setSignals(sig);
    pushHistory([{ cycle: cycleRef.current, halfCycle: next, values: sig }]);
  };

  /** Runs n full cycles; returns the snapshots taken after each edge. */
  const runCycles = (n: number): SignalHistoryEntry[] => {
    const rt = runtimeRef.current;
    if (!rt) return [];
    const snaps: SignalHistoryEntry[] = [];
    for (let i = 0; i < n; i++) {
      if (clkName) {
        if (clockLevelRef.current === 1) rt.stepEdge(clkName, 0);
        rt.stepEdge(clkName, 1);
        cycleRef.current += 1;
        const hi = rt.getSignals();
        sampleMatrix(hi);
        rt.stepEdge(clkName, 0);
        clockLevelRef.current = 0;
        const lo = rt.getSignals();
        sampleMatrix(lo);
        snaps.push({ cycle: cycleRef.current, halfCycle: 1, values: hi });
        snaps.push({ cycle: cycleRef.current, halfCycle: 0, values: lo });
      } else {
        rt.eval();
        cycleRef.current += 1;
        const s = rt.getSignals();
        sampleMatrix(s);
        snaps.push({ cycle: cycleRef.current, halfCycle: 0, values: s });
      }
    }
    return snaps;
  };

  const stepFullCycle = () => {
    const snaps = runCycles(1);
    if (!snaps.length) return;
    publishMatrix();
    setClockLevel(0);
    setCycleCount(cycleRef.current);
    setSignals(snaps[snaps.length - 1].values);
    pushHistory(snaps);
  };

  // Continuous clock: run ceil(Hz * frame) cycles per UI frame
  useEffect(() => {
    if (!running) return;
    let carry = 0;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      carry += ((now - last) / 1000) * clockHz;
      last = now;
      const n = Math.min(Math.floor(carry), 20000);
      if (n <= 0) return;
      carry -= n;
      try {
        decayMatrix();
        const snaps = runCycles(n);
        if (!snaps.length) return;
        publishMatrix();
        setClockLevel(0);
        setCycleCount(cycleRef.current);
        setSignals(snaps[snaps.length - 1].values);
        pushHistory(snaps.slice(-HISTORY_LEN));
      } catch (e) {
        setRunning(false);
        setMessages((m) => [...m, { severity: 'error', file: null, line: 0, msg: `Runtime: ${String(e)}` }]);
      }
    }, FRAME_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, clockHz, clkName, sampleMatrix, decayMatrix]);

  // ------------------------------------------------------------- inputs
  const applyInput = (signalName: string, update: (cur: bigint) => bigint) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const cur = rt.getSignals()[signalName] ?? 0n;
    rt.setSignal(signalName, update(cur));
    rt.eval();
    const sig = rt.getSignals();
    sampleMatrix(sig);
    publishMatrix();
    setSignals(sig);
  };

  const handleToggleInputBit = (name: string, bit: number) =>
    applyInput(name, (cur) => cur ^ (1n << BigInt(bit)));

  const handleSetInputBit = (name: string, bit: number, v: 0 | 1) =>
    applyInput(name, (cur) => (v ? cur | (1n << BigInt(bit)) : cur & ~(1n << BigInt(bit))));

  const handleReset = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    setRunning(false);
    const inputs: Record<string, bigint> = {};
    const cur = rt.getSignals();
    for (const p of rt.ports) if (p.direction === 'input' && p.name !== clkName) inputs[p.name] = cur[p.name] ?? 0n;
    rt.reset(inputs);
    cycleRef.current = 0;
    clockLevelRef.current = 0;
    const sig = rt.getSignals();
    setClockLevel(0);
    setCycleCount(0);
    setSignals(sig);
    setHistory([{ cycle: 0, halfCycle: 0, values: sig }]);
    clearMatrix();
  };

  // ------------------------------------------------------------- uploads
  const handleUploadVerilogFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const loaded: SourceFile[] = [];
    for (const file of Array.from(fileList)) loaded.push({ name: file.name, content: await file.text() });
    setRuntimePorts(null);
    setEditIndex(0);
    setVerilogFiles(loaded);
  };

  const handleUploadQsfFile = async (file: File | undefined) => {
    if (!file) return;
    setQsfFile({ name: file.name, content: await file.text() });
  };

  const errorCount = messages.filter((m) => m.severity === 'error').length;
  const warnCount = messages.length - errorCount;
  const signalDefs = [...ports, ...runtimeInternals];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
              <Layers className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Web FPGA Simulator
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Verilator WASM + Quartus QSF
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Top: <span className="font-mono text-cyan-300">{topModule}</span> — Verilog is compiled in your
                browser by Verilator (WebAssembly)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              onChange={(e) => {
                const preset = SAMPLE_PRESETS.find((p) => p.id === e.target.value);
                if (preset) {
                  setRuntimePorts(null);
                  setEditIndex(0);
                  setVerilogFiles([{ name: preset.verilogFilename, content: preset.verilogCode }]);
                  setQsfFile({ name: preset.qsfFilename, content: preset.qsfContent });
                }
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              defaultValue={SAMPLE_PRESETS[0].id}
            >
              {SAMPLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  Preset: {p.name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 cursor-pointer transition">
              <FileCode className="w-4 h-4" />
              <span>Upload .v ({verilogFiles.length} file{verilogFiles.length > 1 ? 's' : ''})</span>
              <input
                type="file"
                accept=".v,.sv,.vh,.svh"
                multiple
                className="hidden"
                onChange={(e) => handleUploadVerilogFiles(e.target.files)}
              />
            </label>

            <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 cursor-pointer transition">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Upload .qsf ({qsfFile.name})</span>
              <input
                type="file"
                accept=".qsf"
                className="hidden"
                onChange={(e) => handleUploadQsfFile(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] w-full mx-auto px-4 py-5 flex-1 space-y-5">
        <ClockControls
          running={running}
          clockHz={clockHz}
          cycleCount={cycleCount}
          clockLevel={clockLevel}
          clockSignalName={clkName}
          backendMode={backendMode}
          compiling={compiling}
          onCompile={() => void compile()}
          onToggleRun={() => setRunning((r) => !r)}
          onStepFullCycle={stepFullCycle}
          onStepHalfCycle={stepHalfCycle}
          onReset={handleReset}
          onChangeClockHz={setClockHz}
        />

        {/* Compiler output */}
        {(compiling || messages.length > 0 || compileInfo) && (
          <div
            className={`rounded-xl border p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto ${
              errorCount
                ? 'border-rose-800/70 bg-rose-950/30'
                : warnCount
                ? 'border-amber-800/60 bg-amber-950/20'
                : 'border-emerald-800/50 bg-emerald-950/20'
            }`}
          >
            <div className="flex items-center gap-2 text-slate-300">
              {compiling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />
              ) : errorCount ? (
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>
                {compiling
                  ? 'Running Verilator (first run downloads ~6 MB verilator_bin.wasm)…'
                  : `${errorCount} error(s), ${warnCount} warning(s)`}
              </span>
              {compileInfo && <span className="text-slate-500">• {compileInfo}</span>}
            </div>
            {messages.map((m, i) => (
              <div key={i} className={m.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}>
                {m.severity === 'error' ? (
                  <XCircle className="inline w-3 h-3 mr-1" />
                ) : (
                  <AlertTriangle className="inline w-3 h-3 mr-1" />
                )}
                {m.file ? `${m.file}:${m.line}: ` : ''}
                {m.msg}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            {(
              [
                ['board', <FolderUp key="i" className="w-3.5 h-3.5" />, 'FPGA Board & 16×16 Matrix'],
                ['code', <Code2 key="i" className="w-3.5 h-3.5" />, 'Verilog Editor (.v)'],
                ['qsf', <Pin key="i" className="w-3.5 h-3.5" />, `QSF Pin Mapper (${qsfParsed.assignments.length} pins)`],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {ports.length} ports • {runtimeInternals.length} internal signals • {qsfParsed.assignments.length} QSF pins
            </span>
          </div>
        </div>

        {activeTab === 'board' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-8">
              <BoardView
                topModule={topModule}
                deviceFamily={qsfParsed.family}
                partNumber={qsfParsed.device}
                groups={controlGroups}
                signals={signals}
                onToggleInputBit={handleToggleInputBit}
                onSetInputBit={handleSetInputBit}
              />
            </div>
            <div className="xl:col-span-4">
              <MatrixViewer
                matrixBuffer={matrixBuffer}
                rowSignalName={matrixRowGroup?.baseName ?? null}
                colSignalName={matrixColGroup?.baseName ?? null}
                rowValue={signals[rowSigName] ?? 0n}
                colValue={signals[colSigName] ?? 0n}
                povEnabled={povEnabled}
                invertColPolarity={invertColPolarity}
                onTogglePov={() => setPovEnabled((v) => !v)}
                onToggleInvertCol={() => setInvertColPolarity((v) => !v)}
                onClearBuffer={clearMatrix}
              />
            </div>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {verilogFiles.map((f, i) => (
                <button
                  key={f.name + i}
                  onClick={() => setEditIndex(i)}
                  className={`px-2.5 py-1 rounded text-xs font-mono border ${
                    i === editIndex
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {f.name}
                </button>
              ))}
              <span className="text-xs text-slate-500">Edits are re-compiled by Verilator automatically.</span>
            </div>
            <textarea
              value={verilogFiles[editIndex]?.content ?? ''}
              onChange={(e) => {
                const text = e.target.value;
                setVerilogFiles((files) => files.map((f, i) => (i === editIndex ? { ...f, content: text } : f)));
              }}
              spellCheck={false}
              className="w-full h-[460px] bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {activeTab === 'qsf' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-mono text-cyan-400">Quartus QSF Source ({qsfFile.name})</div>
              <textarea
                value={qsfFile.content}
                onChange={(e) => setQsfFile({ name: qsfFile.name, content: e.target.value })}
                spellCheck={false}
                className="w-full h-[380px] bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-y-auto max-h-[440px]">
              <div className="text-xs font-mono text-slate-300 mb-3 font-semibold">
                Parsed Pin Assignments ({qsfParsed.assignments.length})
              </div>
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-1.5">Signal</th>
                    <th className="py-1.5">Pin</th>
                    <th className="py-1.5">Category</th>
                    <th className="py-1.5">In design?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {qsfParsed.assignments.map((a) => (
                    <tr key={a.signalName}>
                      <td className="py-1.5 text-slate-200">{a.signalName}</td>
                      <td className="py-1.5 text-emerald-400">{a.pinLocation}</td>
                      <td className="py-1.5 text-cyan-300">{a.category}</td>
                      <td className="py-1.5">
                        {ports.some((p) => p.name === a.baseName) ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-slate-600">unused</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <SignalMonitor
          signalDefs={signalDefs}
          signals={signals}
          history={history}
          pinAssignments={qsfParsed.assignments}
        />
      </main>
    </div>
  );
};

export default App;
