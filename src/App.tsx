import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileCode,
  FolderUp,
  Layers,
  Code2,
  Sliders,
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
import { PortDefinition, SignalHistoryEntry } from './types/fpga';
import {
  ClockComponentConfig,
  HardwareConfigSchema,
  MatrixComponentConfig,
} from './types/hardwareConfig';
import {
  computeInitialInputSignals,
  setSignalBit,
  toggleSignalBit,
  validateHardwareConfig,
} from './config/hardwareMapping';
import {
  createEmptyMatrixBuffer,
  renderPatternToMatrixBuffer,
  sampleLiveMatrixIntoBuffer,
} from './config/matrixMapping';
import {
  loadHardwareConfig,
  resetHardwareConfig,
  saveHardwareConfig,
} from './config/configPersistence';
import { BackendMode, ClockControls } from './components/ClockControls';
import { BoardView } from './components/BoardView';
import { MatrixViewer } from './components/MatrixViewer';
import { SignalMonitor } from './components/SignalMonitor';
import { HardwareConfigPanel } from './components/HardwareConfigPanel';
import {
  getInitialLanguage,
  Language,
  saveLanguage,
  TRANSLATIONS,
} from './i18n/translations';

const FRAME_MS = 16; // UI refresh period while the clock runs
const HISTORY_LEN = 64;

interface SourceFile {
  name: string;
  content: string;
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
  const [selectedPresetId, setSelectedPresetId] = useState<string>(SAMPLE_PRESETS[0].id);
  const [verilogFiles, setVerilogFiles] = useState<SourceFile[]>([
    { name: SAMPLE_PRESETS[0].verilogFilename, content: SAMPLE_PRESETS[0].verilogCode },
  ]);
  const [editIndex, setEditIndex] = useState(0);

  // ------------------------------------------------ hardware configuration (persisted)
  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfigSchema>(() => {
    const { config } = loadHardwareConfig(SAMPLE_PRESETS[0].createHardwareConfig());
    return config;
  });

  useEffect(() => {
    saveHardwareConfig(hardwareConfig);
  }, [hardwareConfig]);

  // --------------------------------------------------------------- sim state
  const [activeTab, setActiveTab] = useState<'board' | 'code' | 'config'>('board');
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

  // 16x16 matrix live intensity buffer
  const [matrixBuffer, setMatrixBuffer] = useState<number[][]>(() => createEmptyMatrixBuffer());

  const runtimeRef = useRef<FpgaRuntime | null>(null);
  const cycleRef = useRef(0);
  const clockLevelRef = useRef<0 | 1>(0);
  const matrixRef = useRef<number[][]>(createEmptyMatrixBuffer());
  const compileSeq = useRef(0);
  const wasmCachedRef = useRef(false);
  const debounceCompileRef = useRef(false);
  const hardwareConfigRef = useRef(hardwareConfig);
  hardwareConfigRef.current = hardwareConfig;

  // ------------------------------------------------------------ parsing & validation
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

  // Ports reported by Verilator are authoritative; fall back to the parser before first compile
  const ports = runtimePorts ?? verilogParsed.ports;

  const validationIssues = useMemo(
    () => validateHardwareConfig(hardwareConfig.components, ports),
    [hardwareConfig.components, ports]
  );

  const activeClockConfig = useMemo(
    () =>
      hardwareConfig.components.find(
        (c): c is ClockComponentConfig => c.enabled && c.type === 'CLOCK'
      ) ?? null,
    [hardwareConfig.components]
  );

  const clkName = useMemo(() => {
    if (!activeClockConfig || !activeClockConfig.signalName) return null;
    const exists = ports.some(
      (p) => p.name === activeClockConfig.signalName && p.direction === 'input'
    );
    return exists ? activeClockConfig.signalName : null;
  }, [activeClockConfig, ports]);

  const activeMatrixConfig = useMemo(
    () =>
      hardwareConfig.components.find(
        (c): c is MatrixComponentConfig => c.enabled && c.type === 'MATRIX'
      ) ?? null,
    [hardwareConfig.components]
  );

  const isMatrixConnected = useMemo(() => {
    if (!activeMatrixConfig) return false;
    const hasRow = ports.some((p) => p.name === activeMatrixConfig.row.signalName);
    const hasCol = ports.some((p) => p.name === activeMatrixConfig.col.signalName);
    return hasRow && hasCol;
  }, [activeMatrixConfig, ports]);

  // --------------------------------------------------------------- matrix sampling
  const sampleMatrix = useCallback(
    (sig: Record<string, bigint>, matrixCfg: MatrixComponentConfig | null = activeMatrixConfig) => {
      if (!matrixCfg) return;
      if (matrixCfg.displayMode === 'pattern') {
        matrixRef.current = renderPatternToMatrixBuffer(matrixCfg.pattern, matrixCfg);
        return;
      }
      const rowVal = sig[matrixCfg.row.signalName] ?? 0n;
      const colVal = sig[matrixCfg.col.signalName] ?? 0n;
      sampleLiveMatrixIntoBuffer(matrixRef.current, rowVal, colVal, matrixCfg);
    },
    [activeMatrixConfig]
  );

  const publishMatrix = useCallback(() => {
    setMatrixBuffer(matrixRef.current.map((row) => row.slice()));
  }, []);

  const clearMatrix = useCallback(() => {
    matrixRef.current = createEmptyMatrixBuffer();
    publishMatrix();
  }, [publishMatrix]);

  // Re-render matrix display immediately when Matrix display orientation / polarity / mode changes
  // without ever modifying underlying Verilog signal values.
  useEffect(() => {
    if (!activeMatrixConfig) return;
    if (activeMatrixConfig.displayMode === 'pattern') {
      matrixRef.current = renderPatternToMatrixBuffer(
        activeMatrixConfig.pattern,
        activeMatrixConfig
      );
      publishMatrix();
    } else {
      matrixRef.current = createEmptyMatrixBuffer();
      sampleMatrix(signals, activeMatrixConfig);
      publishMatrix();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatrixConfig]);

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
      setRuntimeInternals([]);
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

    // Apply configured initial input states (respecting Switch initialValue & KEY polarity)
    const initialInputs = computeInitialInputSignals(
      hardwareConfigRef.current.components,
      rt.ports
    );
    for (const [sigName, val] of Object.entries(initialInputs)) {
      rt.setSignal(sigName, val);
    }
    rt.eval();

    cycleRef.current = 0;
    clockLevelRef.current = 0;
    setCycleCount(0);
    setClockLevel(0);
    const sig = rt.getSignals();
    setSignals(sig);
    setHistory([{ cycle: 0, halfCycle: 0, values: sig }]);
    matrixRef.current = createEmptyMatrixBuffer();
    const matrixCfg =
      hardwareConfigRef.current.components.find(
        (c): c is MatrixComponentConfig => c.enabled && c.type === 'MATRIX'
      ) ?? null;
    sampleMatrix(sig, matrixCfg);
    publishMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verilogFiles, topModule]);

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
    if (!rt || !rt.hasSignal(signalName)) return;
    const cur = rt.getSignals()[signalName] ?? 0n;
    rt.setSignal(signalName, update(cur));
    rt.eval();
    const sig = rt.getSignals();
    sampleMatrix(sig);
    publishMatrix();
    setSignals(sig);

    if (!running || !clkName) {
      pushHistory([
        { cycle: cycleRef.current, halfCycle: clockLevelRef.current, values: sig },
      ]);
    }
  };

  const handleToggleInputBit = (name: string, bit: number) =>
    applyInput(name, (cur) => toggleSignalBit(cur, bit));

  const handleSetInputBit = (name: string, bit: number, v: 0 | 1) =>
    applyInput(name, (cur) => setSignalBit(cur, bit, v));

  const handleReset = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    setRunning(false);
    const initialInputs = computeInitialInputSignals(
      hardwareConfigRef.current.components,
      rt.ports
    );
    rt.reset(initialInputs);
    cycleRef.current = 0;
    clockLevelRef.current = 0;
    const sig = rt.getSignals();
    setClockLevel(0);
    setCycleCount(0);
    setSignals(sig);
    setHistory([{ cycle: 0, halfCycle: 0, values: sig }]);
    matrixRef.current = createEmptyMatrixBuffer();
    sampleMatrix(sig);
    publishMatrix();
  };

  // ------------------------------------------------------------- uploads & presets
  const handleUploadVerilogFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const loaded: SourceFile[] = [];
    for (const file of Array.from(fileList)) {
      loaded.push({ name: file.name, content: await file.text() });
    }
    debounceCompileRef.current = false;
    setRuntimePorts(null);
    setEditIndex(0);
    setVerilogFiles(loaded);
  };

  const handleRestoreDefaultConfig = () => {
    const preset =
      SAMPLE_PRESETS.find((p) => p.id === selectedPresetId) ?? SAMPLE_PRESETS[0];
    const restored = resetHardwareConfig(preset.createHardwareConfig());
    setHardwareConfig(restored);
  };

  const handleUpdateMatrixConfig = (updated: MatrixComponentConfig) => {
    setHardwareConfig((prev) => ({
      ...prev,
      components: prev.components.map((c) => (c.id === updated.id ? updated : c)),
    }));
  };

  const errorCount = messages.filter((m) => m.severity === 'error').length;
  const warnCount = messages.length - errorCount;
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
              onChange={(e) => {
                const preset = SAMPLE_PRESETS.find((p) => p.id === e.target.value);
                if (preset) {
                  setSelectedPresetId(preset.id);
                  debounceCompileRef.current = false;
                  setRuntimePorts(null);
                  setEditIndex(0);
                  setVerilogFiles([
                    { name: preset.verilogFilename, content: preset.verilogCode },
                  ]);
                  setHardwareConfig(preset.createHardwareConfig());
                }
              }}
              className="bg-slate-950 border border-indigo-500/35 hover:border-indigo-400/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-400 transition"
            >
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

        {/* Compiler & Hardware Validation Banner */}
        {(compiling ||
          messages.length > 0 ||
          compileInfo ||
          validationIssues.length > 0) && (
          <div
            className={`rounded-xl border p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto shadow-md ${
              errorCount
                ? 'border-rose-500/50 bg-rose-950/35'
                : warnCount || validationIssues.length > 0
                ? 'border-amber-500/50 bg-amber-950/25'
                : 'border-emerald-500/40 bg-emerald-950/25'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-slate-200">
              {compiling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300" />
              ) : errorCount ? (
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
              ) : warnCount || validationIssues.length > 0 ? (
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
                      validationIssues.length > 0
                        ? `, ${validationIssues.length} ${t.configIssuesCount}`
                        : ''
                    }`}
              </span>
              {compileInfo && (
                <span className="text-cyan-300/80">• {compileInfo}</span>
              )}
            </div>
            {messages.map((m, i) => (
              <div
                key={i}
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
            {validationIssues.map((issue, idx) => (
              <div
                key={`${issue.componentId}-${issue.field}-${idx}`}
                className={issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}
              >
                <AlertTriangle className="inline w-3 h-3 mr-1" />
                {issue.message}
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
                  'config',
                  <Sliders key="i" className="w-3.5 h-3.5" />,
                  `${t.tabConfig} (${hardwareConfig.components.length})`,
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
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === id
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 font-mono bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {ports.length} {t.portsUnit} • {runtimeInternals.length}{' '}
              {t.internalSignalsUnit} • {hardwareConfig.components.length}{' '}
              {t.componentsUnit}
            </span>
          </div>
        </div>

        {activeTab === 'board' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className={activeMatrixConfig ? 'xl:col-span-8' : 'xl:col-span-12'}>
              <BoardView
                topModule={topModule}
                boardName={hardwareConfig.boardName}
                components={hardwareConfig.components}
                signals={signals}
                validationIssues={validationIssues}
                t={t}
                onToggleInputBit={handleToggleInputBit}
                onSetInputBit={handleSetInputBit}
              />
            </div>
            {activeMatrixConfig && (
              <div className="xl:col-span-4">
                <MatrixViewer
                  config={activeMatrixConfig}
                  matrixBuffer={matrixBuffer}
                  rowValue={signals[activeMatrixConfig.row.signalName] ?? 0n}
                  colValue={signals[activeMatrixConfig.col.signalName] ?? 0n}
                  isConnected={isMatrixConnected}
                  t={t}
                  onUpdateConfig={handleUpdateMatrixConfig}
                  onClearBuffer={clearMatrix}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'config' && (
          <HardwareConfigPanel
            config={hardwareConfig}
            ports={ports}
            validationIssues={validationIssues}
            t={t}
            onChangeConfig={setHardwareConfig}
            onRestoreDefaults={handleRestoreDefaultConfig}
          />
        )}

        {activeTab === 'code' && (
          <div className="bg-slate-900/95 border border-emerald-500/25 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {verilogFiles.map((f, i) => (
                  <button
                    key={f.name + i}
                    type="button"
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
                setRuntimePorts(null);
                setVerilogFiles((files) =>
                  files.map((f, i) => (i === editIndex ? { ...f, content: text } : f))
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
          components={hardwareConfig.components}
          t={t}
        />
      </main>
    </div>
  );
};

export default App;
