import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileCode,
  FolderUp,
  Layers,
  Code2,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Globe,
  Plus,
} from 'lucide-react';
import { parseVerilogSource } from './parsers/verilogParser';
import { CompileMessage, FpgaRuntime } from './sim/fpgaRuntime';
import { SAMPLE_PRESETS } from './presets/sampleDesigns';
import {
  BoardComponentId,
  PortDefinition,
  PortIoAssignment,
  SignalHistoryEntry,
} from './types/fpga';
import {
  autoAssignPorts,
  buildBoardMappings,
  clearSavedIoConfig,
  loadSavedIoConfig,
  reconcileIoAssignments,
  saveIoConfig,
  validateIoConfig,
} from './config/ioConfig';
import { BackendMode, ClockControls } from './components/ClockControls';
import { BoardView } from './components/BoardView';
import { MatrixViewer } from './components/MatrixViewer';
import { SignalMonitor } from './components/SignalMonitor';
import { IoConfigPanel } from './components/IoConfigPanel';
import {
  formatValidationIssue,
  getInitialLanguage,
  Language,
  saveLanguage,
  TRANSLATIONS,
} from './i18n/translations';

const createEmpty16x16 = (): number[][] =>
  Array.from({ length: 16 }, () => Array(16).fill(0));

const FRAME_MS = 16; // UI refresh period while the clock runs
const HISTORY_LEN = 64;

interface SourceFile {
  name: string;
  content: string;
}

function getInitialIoAssignments(): Record<string, PortIoAssignment> {
  const firstPreset = SAMPLE_PRESETS[0];
  const parsed = parseVerilogSource([firstPreset.verilogCode]);
  const saved = loadSavedIoConfig(parsed.topModule);
  if (saved && Object.keys(saved).length > 0) {
    return reconcileIoAssignments(saved, parsed.ports);
  }
  return autoAssignPorts(parsed.ports, firstPreset.defaultIoConfig);
}

export const App: React.FC = () => {
  // ------------------------------------------------------------------ i18n
  const [lang, setLang] = useState<Language>(getInitialLanguage);
  const t = TRANSLATIONS[lang];

  const handleToggleLanguage = () => {
    const next: Language = lang === 'en' ? 'zh-TW' : 'en';
    setLang(next);
    saveLanguage(next);
  };

  // ------------------------------------------------------------------ sources
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    SAMPLE_PRESETS[0].id
  );
  const [verilogFiles, setVerilogFiles] = useState<SourceFile[]>([
    {
      name: SAMPLE_PRESETS[0].verilogFilename,
      content: SAMPLE_PRESETS[0].verilogCode,
    },
  ]);
  const [editIndex, setEditIndex] = useState(0);

  // -------------------------------------------------------- I/O configuration
  const [ioAssignments, setIoAssignments] = useState<
    Record<string, PortIoAssignment>
  >(getInitialIoAssignments);

  // --------------------------------------------------------------- sim state
  const [activeTab, setActiveTab] = useState<'board' | 'io' | 'code'>('board');
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
  const wasmCachedRef = useRef(false);
  const debounceCompileRef = useRef(false);
  const prevTopModuleRef = useRef<string>(
    parseVerilogSource([SAMPLE_PRESETS[0].verilogCode]).topModule
  );
  const skipNextReconcileRef = useRef(false);

  // ------------------------------------------------------------ Verilog parsing
  const verilogOnlyContents = useMemo(
    () =>
      verilogFiles
        .filter((f) => /\.(v|sv|vh|svh)$/i.test(f.name))
        .map((f) => f.content),
    [verilogFiles]
  );

  const verilogParsed = useMemo(
    () => parseVerilogSource(verilogOnlyContents),
    [verilogOnlyContents]
  );

  const topModule = verilogParsed.topModule;

  // Ports reported by Verilator are authoritative; fall back to parser before compile completes
  const ports = runtimePorts ?? verilogParsed.ports;

  // Reconcile I/O assignments automatically when ports or topModule change
  useEffect(() => {
    if (skipNextReconcileRef.current) {
      skipNextReconcileRef.current = false;
      prevTopModuleRef.current = topModule;
      return;
    }

    const topChanged = prevTopModuleRef.current !== topModule;
    prevTopModuleRef.current = topModule;

    if (ports.length === 0) return;

    if (topChanged) {
      const saved = loadSavedIoConfig(topModule);
      if (saved && Object.keys(saved).length > 0) {
        setIoAssignments(reconcileIoAssignments(saved, ports));
        return;
      }
      setIoAssignments((prev) =>
        reconcileIoAssignments(prev, ports, { autoAssignIfNoOverlap: true })
      );
      return;
    }

    setIoAssignments((prev) =>
      reconcileIoAssignments(prev, ports, { autoAssignIfNoOverlap: false })
    );
  }, [ports, topModule]);

  // Persist user I/O assignments per topModule in localStorage
  useEffect(() => {
    if (topModule && ports.length > 0) {
      saveIoConfig(topModule, ioAssignments);
    }
  }, [topModule, ports.length, ioAssignments]);

  // Validate I/O assignments and build board & runtime mappings
  const ioValidation = useMemo(
    () => validateIoConfig(ports, ioAssignments),
    [ports, ioAssignments]
  );

  const boardMappings = useMemo(
    () => buildBoardMappings(ioValidation),
    [ioValidation]
  );

  const controlGroups = boardMappings.controlGroups;
  const clkName = boardMappings.clockSignalName;
  const rowSigName = boardMappings.matrixRowSignal;
  const colSigName = boardMappings.matrixColSignal;
  const hasMatrixPorts = boardMappings.hasMatrixConnection;

  // --------------------------------------------------------------- matrix POV
  const sampleMatrix = useCallback(
    (
      sig: Record<string, bigint>,
      usePov: boolean = povEnabled,
      invertCol: boolean = invertColPolarity
    ) => {
      const rowVal = rowSigName ? sig[rowSigName] ?? 0n : 0n;
      const raw = colSigName ? sig[colSigName] ?? 0n : 0n;
      const colVal = invertCol ? ~raw & 0xffffn : raw & 0xffffn;
      const buf = matrixRef.current;

      for (let r = 0; r < 16; r++) {
        const rowActive = ((rowVal >> BigInt(r)) & 1n) === 1n;
        if (!rowActive) {
          if (!usePov) {
            for (let c = 0; c < 16; c++) buf[r][c] = 0;
          } else {
            for (let c = 0; c < 16; c++) buf[r][c] *= 0.96;
          }
          continue;
        }
        for (let c = 0; c < 16; c++) {
          const on = ((colVal >> BigInt(15 - c)) & 1n) === 1n;
          if (on) {
            buf[r][c] = 1;
          } else {
            buf[r][c] = usePov ? buf[r][c] * 0.5 : 0;
          }
        }
      }
    },
    [rowSigName, colSigName, invertColPolarity, povEnabled]
  );

  const publishMatrix = useCallback(() => {
    setMatrixBuffer(matrixRef.current.map((row) => row.slice()));
  }, []);

  const clearMatrix = useCallback(() => {
    matrixRef.current = createEmpty16x16();
    publishMatrix();
  }, [publishMatrix]);

  // Refresh matrix buffer immediately when matrix port bindings change
  useEffect(() => {
    matrixRef.current = createEmpty16x16();
    sampleMatrix(signals, povEnabled, invertColPolarity);
    publishMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSigName, colSigName]);

  // ---------------------------------------------------------------- compile
  const compile = useCallback(async () => {
    const seq = ++compileSeq.current;
    setRunning(false);
    setCompiling(true);
    setCompileInfo('');
    const result = await FpgaRuntime.compile(verilogFiles, topModule);
    if (seq !== compileSeq.current) {
      result.runtime?.dispose();
      return;
    }
    wasmCachedRef.current = true;
    setCompiling(false);
    setMessages(result.messages);

    if (!result.runtime) {
      setBackendMode('none');
      setRuntimePorts(null);
      setCompileInfo(
        `Verilator failed (${result.timings.verilatorMs.toFixed(0)} ms)`
      );
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

  // Compile immediately on initial mount, preset switch, or file upload; debounce only textarea edits
  useEffect(() => {
    const delay = debounceCompileRef.current ? 450 : 0;
    debounceCompileRef.current = false;
    const timer = window.setTimeout(() => void compile(), delay);
    return () => window.clearTimeout(timer);
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
    if (!clkName) {
      setRunning(false);
      return;
    }
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
        const snaps = runCycles(n);
        if (!snaps.length) return;
        publishMatrix();
        setClockLevel(0);
        setCycleCount(cycleRef.current);
        setSignals(snaps[snaps.length - 1].values);
        pushHistory(snaps.slice(-HISTORY_LEN));
      } catch (e) {
        setRunning(false);
        setMessages((m) => [
          ...m,
          { severity: 'error', file: null, line: 0, msg: `Runtime: ${String(e)}` },
        ]);
      }
    }, FRAME_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, clockHz, clkName, sampleMatrix]);

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

    // Record waveform sample when combinational inputs change while clock is paused or absent
    if (!running || !clkName) {
      pushHistory([
        { cycle: cycleRef.current, halfCycle: clockLevelRef.current, values: sig },
      ]);
    }
  };

  const handleToggleInputBit = (name: string, bit: number) =>
    applyInput(name, (cur) => cur ^ (1n << BigInt(bit)));

  const handleSetInputBit = (name: string, bit: number, v: 0 | 1) =>
    applyInput(name, (cur) =>
      v ? cur | (1n << BigInt(bit)) : cur & ~(1n << BigInt(bit))
    );

  const handleReset = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    setRunning(false);
    const inputs: Record<string, bigint> = {};
    const cur = rt.getSignals();
    for (const p of rt.ports) {
      if (p.direction === 'input' && p.name !== clkName) {
        inputs[p.name] = cur[p.name] ?? 0n;
      }
    }
    rt.reset(inputs);
    cycleRef.current = 0;
    clockLevelRef.current = 0;
    const sig = rt.getSignals();
    setClockLevel(0);
    setCycleCount(0);
    setSignals(sig);
    setHistory([{ cycle: 0, halfCycle: 0, values: sig }]);
    matrixRef.current = createEmpty16x16();
    sampleMatrix(sig);
    publishMatrix();
  };

  // ------------------------------------------------------------- I/O config handlers
  const activePresetDefaults = useMemo(() => {
    const preset = SAMPLE_PRESETS.find((p) => p.id === selectedPresetId);
    if (!preset) return undefined;
    const presetTop = parseVerilogSource([preset.verilogCode]).topModule;
    return presetTop === topModule ? preset.defaultIoConfig : undefined;
  }, [selectedPresetId, topModule]);

  const handleAssignPort = (
    port: PortDefinition,
    componentId: BoardComponentId | null
  ) => {
    setIoAssignments((prev) => {
      const next = { ...prev };
      if (!componentId) {
        delete next[port.name];
      } else {
        next[port.name] = {
          componentId,
          configuredDirection: port.direction,
          configuredWidth: port.width,
        };
      }
      return next;
    });
  };

  const handleAutoAssign = () => {
    setIoAssignments((prev) => {
      // Preserve currently valid assignments and auto-assign unassigned ports
      const kept: Record<string, PortIoAssignment> = {};
      const usedComponents = new Set<BoardComponentId>();
      for (const res of ioValidation.results) {
        if (res.status === 'configured' && res.componentId && prev[res.port.name]) {
          kept[res.port.name] = prev[res.port.name];
          usedComponents.add(res.componentId);
        }
      }
      const suggested = autoAssignPorts(ports, activePresetDefaults);
      for (const [portName, assignment] of Object.entries(suggested)) {
        if (kept[portName] || usedComponents.has(assignment.componentId)) continue;
        kept[portName] = assignment;
        usedComponents.add(assignment.componentId);
      }
      return kept;
    });
  };

  const handleResetIoDefaults = () => {
    clearSavedIoConfig(topModule);
    setIoAssignments(autoAssignPorts(ports, activePresetDefaults));
  };

  const handleClearAllIo = () => {
    setIoAssignments({});
  };

  // ------------------------------------------------------------- uploads & presets
  const handleSelectPreset = (presetId: string) => {
    const preset = SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const parsed = parseVerilogSource([preset.verilogCode]);
    setSelectedPresetId(preset.id);
    debounceCompileRef.current = false;
    skipNextReconcileRef.current = true;
    setRuntimePorts(null);
    setEditIndex(0);
    setVerilogFiles([
      { name: preset.verilogFilename, content: preset.verilogCode },
    ]);
    setIoAssignments(autoAssignPorts(parsed.ports, preset.defaultIoConfig));
  };

  const handleUploadVerilogFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const loaded: SourceFile[] = [];
    for (const file of Array.from(fileList)) {
      loaded.push({ name: file.name, content: await file.text() });
    }
    debounceCompileRef.current = false;
    setSelectedPresetId('');
    setRuntimePorts(null);
    setEditIndex(0);
    setVerilogFiles(loaded);
  };

  const errorCount = messages.filter((m) => m.severity === 'error').length;
  const warnCount = messages.length - errorCount;
  const ioErrorCount = ioValidation.conflictCount + ioValidation.invalidCount;
  const ioIssuesToBanner = ioValidation.results.flatMap((r) =>
    r.issues.filter((i) => i.severity === 'error')
  );
  const signalDefs = [...ports, ...runtimeInternals];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950/30 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-indigo-500/25 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 shadow-lg shadow-slate-950/50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/20 border border-emerald-400/40 flex items-center justify-center shadow-inner">
              <Layers className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
                {t.appTitle}
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                  {t.appBadge}
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                {t.topModuleLabel}{' '}
                <span className="font-mono text-cyan-300 font-semibold">
                  {topModule}
                </span>{' '}
                — {t.topSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Preset Selector */}
            <select
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="bg-slate-950 border border-indigo-500/35 hover:border-indigo-400/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-400 transition"
            >
              {selectedPresetId === '' && (
                <option value="" disabled>
                  {t.presetCustomUploaded}
                </option>
              )}
              {SAMPLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t.presetLabel} {p.name}
                </option>
              ))}
            </select>

            {/* Upload .v / .hex */}
            <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 cursor-pointer transition">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>
                {t.uploadVerilog} ({verilogFiles.length} {t.filesSuffix})
              </span>
              <input
                type="file"
                accept=".v,.sv,.vh,.svh,.hex,.mem,.mif,.txt,.binary"
                multiple
                className="hidden"
                onChange={(e) => handleUploadVerilogFiles(e.target.files)}
              />
            </label>

            {/* Language Switcher (EN / 繁體中文) */}
            <button
              type="button"
              onClick={handleToggleLanguage}
              title="Switch Language / 切換語言 (English / 繁體中文)"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/40 transition"
            >
              <Globe className="w-3.5 h-3.5 text-violet-300" />
              <span>{lang === 'en' ? '繁體中文' : 'English'}</span>
            </button>
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
          t={t}
          onCompile={() => void compile()}
          onToggleRun={() => setRunning((r) => !r)}
          onStepFullCycle={stepFullCycle}
          onStepHalfCycle={stepHalfCycle}
          onReset={handleReset}
          onChangeClockHz={setClockHz}
        />

        {/* Compiler & I/O Validation Banner */}
        {(compiling ||
          messages.length > 0 ||
          compileInfo ||
          ioErrorCount > 0 ||
          ioValidation.warningCount > 0) && (
          <div
            className={`rounded-xl border p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto shadow-md ${
              errorCount || ioErrorCount > 0
                ? 'border-rose-500/50 bg-rose-950/35'
                : warnCount || ioValidation.warningCount > 0
                ? 'border-amber-500/50 bg-amber-950/25'
                : 'border-emerald-500/40 bg-emerald-950/25'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-slate-200">
              {compiling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300" />
              ) : errorCount || ioErrorCount > 0 ? (
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
              ) : warnCount || ioValidation.warningCount > 0 ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>
                {compiling
                  ? wasmCachedRef.current
                    ? t.compilingCached
                    : t.compilingFirstRun
                  : `${errorCount} ${t.errorsCount}, ${warnCount} ${t.warningsCount}${
                      ioValidation.conflictCount > 0
                        ? `, ${ioValidation.conflictCount} ${t.ioConflictsCount}`
                        : ''
                    }${
                      ioValidation.invalidCount > 0
                        ? `, ${ioValidation.invalidCount} ${t.ioInvalidCount}`
                        : ''
                    }${
                      ioValidation.warningCount > 0
                        ? `, ${ioValidation.warningCount} ${t.ioWarningsCount}`
                        : ''
                    }`}
              </span>
              {compileInfo && (
                <span className="text-cyan-300/80">• {compileInfo}</span>
              )}
            </div>
            {messages.map((m, i) => (
              <div
                key={`msg-${i}`}
                className={
                  m.severity === 'error' ? 'text-rose-300' : 'text-amber-300'
                }
              >
                {m.severity === 'error' ? (
                  <XCircle className="inline w-3 h-3 mr-1" />
                ) : (
                  <AlertTriangle className="inline w-3 h-3 mr-1" />
                )}
                {m.file ? `${m.file}:${m.line}: ` : ''}
                {m.msg}
              </div>
            ))}
            {ioIssuesToBanner.map((issue, idx) => (
              <div key={`io-${issue.portName}-${idx}`} className="text-rose-300">
                <AlertTriangle className="inline w-3 h-3 mr-1" />
                [{issue.portName}] {formatValidationIssue(issue, lang, t)}
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/20 pb-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                [
                  'board',
                  <FolderUp key="i" className="w-3.5 h-3.5" />,
                  t.tabBoard,
                ],
                [
                  'io',
                  <SlidersHorizontal key="i" className="w-3.5 h-3.5" />,
                  `${t.tabIoConfig} (${ioValidation.configuredCount}/${ports.length})`,
                ],
                [
                  'code',
                  <Code2 key="i" className="w-3.5 h-3.5" />,
                  t.tabCode,
                ],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === id
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
                }`}
              >
                {icon}
                {label}
                {id === 'io' && ioErrorCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/25 text-rose-200 border border-rose-500/45">
                    {ioErrorCount}
                  </span>
                )}
                {id === 'io' &&
                  ioErrorCount === 0 &&
                  ioValidation.warningCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/25 text-amber-200 border border-amber-500/45">
                      {ioValidation.warningCount}
                    </span>
                  )}
              </button>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 font-mono bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {ports.length} {t.portsUnit} • {ioValidation.configuredCount}{' '}
              {t.configuredUnit} • {runtimeInternals.length}{' '}
              {t.internalSignalsUnit}
            </span>
          </div>
        </div>

        {activeTab === 'board' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-8">
              <BoardView
                topModule={topModule}
                groups={controlGroups}
                signals={signals}
                t={t}
                onToggleInputBit={handleToggleInputBit}
                onSetInputBit={handleSetInputBit}
              />
            </div>
            <div className="xl:col-span-4">
              <MatrixViewer
                matrixBuffer={matrixBuffer}
                rowSignalName={rowSigName}
                colSignalName={colSigName}
                rowValue={rowSigName ? signals[rowSigName] ?? 0n : 0n}
                colValue={colSigName ? signals[colSigName] ?? 0n : 0n}
                povEnabled={povEnabled}
                invertColPolarity={invertColPolarity}
                isConnected={hasMatrixPorts}
                t={t}
                onTogglePov={() => {
                  const nextPov = !povEnabled;
                  setPovEnabled(nextPov);
                  sampleMatrix(signals, nextPov, invertColPolarity);
                  publishMatrix();
                }}
                onToggleInvertCol={() => {
                  const nextInv = !invertColPolarity;
                  setInvertColPolarity(nextInv);
                  sampleMatrix(signals, povEnabled, nextInv);
                  publishMatrix();
                }}
                onClearBuffer={clearMatrix}
              />
            </div>
          </div>
        )}

        {activeTab === 'io' && (
          <IoConfigPanel
            topModule={topModule}
            validation={ioValidation}
            lang={lang}
            t={t}
            onAssignPort={handleAssignPort}
            onAutoAssign={handleAutoAssign}
            onResetDefaults={handleResetIoDefaults}
            onClearAll={handleClearAllIo}
          />
        )}

        {activeTab === 'code' && (
          <div className="bg-slate-900/95 border border-emerald-500/25 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {verilogFiles.map((f, i) => (
                  <button
                    key={f.name + i}
                    onClick={() => setEditIndex(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition ${
                      i === editIndex
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
                {!verilogFiles.some((f) => f.name === 'rom_init.hex') && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerilogFiles((prev) => [
                        ...prev,
                        { name: 'rom_init.hex', content: 'A5\n5A\nF0\n0F\n' },
                      ]);
                      setEditIndex(verilogFiles.length);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/40 text-violet-200 transition"
                  >
                    <Plus className="w-3 h-3" />
                    {t.addMemFileBtn}
                  </button>
                )}
              </div>
              <span className="text-xs text-slate-400">
                {t.editorAutoCompileNote}
              </span>
            </div>
            <textarea
              value={verilogFiles[editIndex]?.content ?? ''}
              onChange={(e) => {
                const text = e.target.value;
                debounceCompileRef.current = true;
                if (/\.(v|sv|vh|svh)$/i.test(verilogFiles[editIndex]?.name ?? '')) {
                  setRuntimePorts(null);
                }
                setVerilogFiles((files) =>
                  files.map((f, i) =>
                    i === editIndex ? { ...f, content: text } : f
                  )
                );
              }}
              spellCheck={false}
              className="w-full h-[460px] bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        <SignalMonitor
          signalDefs={signalDefs}
          signals={signals}
          history={history}
          ioValidation={ioValidation}
          t={t}
        />
      </main>
    </div>
  );
};

export default App;
