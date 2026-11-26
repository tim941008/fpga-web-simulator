import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileCode,
  FolderUp,
  FolderOpen,
  FileArchive,
  Layers,
  Code2,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Globe,
  Plus,
  UploadCloud,
  Palette,
} from 'lucide-react';
import { parseVerilogSource } from './parsers/verilogParser';
import { CompileMessage, FpgaRuntime } from './sim/fpgaRuntime';
import { SAMPLE_PRESETS } from './presets/sampleDesigns';
import { EXAMPLE_PROJECTS } from './presets/exampleProjects';
import { PortDefinition, SignalHistoryEntry } from './types/fpga';
import {
  ClockComponentConfig,
  HardwareConfigSchema,
  LcdCharacterComponentConfig,
  MatrixComponentConfig,
} from './types/hardwareConfig';
import {
  cloneLcdState,
  createInitialLcdState,
  extractLcdSample,
  LcdState,
  stepLcdState,
} from './config/lcdController';
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
  buildHardwareConfigScopeKey,
  loadScopedHardwareConfig,
  ProjectConfigOrigin,
  resetScopedHardwareConfig,
  saveScopedHardwareConfig,
} from './config/configPersistence';
import { loadUiTheme, saveUiTheme, UiTheme } from './config/uiPreferences';
import { BackendMode, ClockControls } from './components/ClockControls';
import { BoardView } from './components/BoardView';
import { MatrixViewer } from './components/MatrixViewer';
import { SignalMonitor } from './components/SignalMonitor';
import { HardwareConfigPanel } from './components/HardwareConfigPanel';
import { CodeEditor } from './components/CodeEditor';
import { ProjectExplorer, TopModuleSelector } from './components/ProjectExplorer';
import {
  getInitialLanguage,
  Language,
  saveLanguage,
  TRANSLATIONS,
} from './i18n/translations';
import {
  addFiles,
  createFile,
  deleteFile,
  findTopCandidates,
  guessTopModule,
  ProjectFile,
  renameFile,
  replaceFile,
  scanProject,
  validateProject,
} from './project/projectModel';
import { compileProject } from './project/projectCompile';
import {
  entriesFromDataTransfer,
  entriesFromFiles,
  ImportedEntry,
} from './project/projectImport';
import { EngineStats, RunMode, SimulationEngine } from './sim/simulationEngine';

const HISTORY_LEN = 64;
const IDLE_STATS: EngineStats = { state: 'idle', cycle: 0, cyclesPerSec: 0, elapsedMs: 0 };

export const App: React.FC = () => {
  // ------------------------------------------------------------------ i18n
  const [lang, setLang] = useState<Language>(getInitialLanguage);
  const t = TRANSLATIONS[lang];

  const handleToggleLanguage = () => {
    const next: Language = lang === 'en' ? 'zh-TW' : 'en';
    setLang(next);
    saveLanguage(next);
  };

  // ------------------------------------------------------------------ UI theme
  const [uiTheme, setUiTheme] = useState<UiTheme>(loadUiTheme);
  const isWarm = uiTheme === 'warm-lab';

  const handleToggleTheme = () => {
    const next: UiTheme = uiTheme === 'warm-lab' ? 'classic' : 'warm-lab';
    setUiTheme(next);
    saveUiTheme(next);
  };

  // ------------------------------------------------------------------ project (multi-file)
  const [selectedPresetId, setSelectedPresetId] = useState<string>(SAMPLE_PRESETS[0].id);
  const [projectOrigin, setProjectOrigin] = useState<ProjectConfigOrigin>({
    kind: 'preset',
    id: SAMPLE_PRESETS[0].id,
  });
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>(() => [
    createFile(SAMPLE_PRESETS[0].verilogFilename, SAMPLE_PRESETS[0].verilogCode),
  ]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  /** User-chosen top module; null = auto-detect from the project */
  const [selectedTop, setSelectedTop] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // ------------------------------------------------ hardware configuration (project + top scoped)
  const initialConfigBootstrap = useMemo(() => {
    const parsed = parseVerilogSource([SAMPLE_PRESETS[0].verilogCode]);
    const scopeKey = buildHardwareConfigScopeKey(
      { kind: 'preset', id: SAMPLE_PRESETS[0].id },
      [SAMPLE_PRESETS[0].verilogFilename],
      parsed.topModule
    );
    const { config } = loadScopedHardwareConfig(
      scopeKey,
      SAMPLE_PRESETS[0].createHardwareConfig(),
      parsed.ports
    );
    return { scopeKey, config };
  }, []);

  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfigSchema>(
    () => initialConfigBootstrap.config
  );
  const loadedScopeKeyRef = useRef<string>(initialConfigBootstrap.scopeKey);

  // --------------------------------------------------------------- sim state
  const [activeTab, setActiveTab] = useState<'board' | 'code' | 'config'>('board');
  const [rateHz, setRateHz] = useState<number>(() => {
    const clk = initialConfigBootstrap.config.components.find(
      (c): c is ClockComponentConfig => c.enabled && c.type === 'CLOCK'
    );
    return clk && Number.isFinite(clk.defaultHz) && clk.defaultHz > 0 ? clk.defaultHz : 100;
  }); // Infinity = unlimited
  const [engineStats, setEngineStats] = useState<EngineStats>(IDLE_STATS);
  const [batchActive, setBatchActive] = useState(false);
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
  const [lcdStates, setLcdStates] = useState<Record<string, LcdState>>({});

  const runtimeRef = useRef<FpgaRuntime | null>(null);
  const cycleRef = useRef(0);
  const clockLevelRef = useRef<0 | 1>(0);
  const matrixRef = useRef<number[][]>(createEmptyMatrixBuffer());
  const lcdStatesRef = useRef<Record<string, LcdState>>({});
  const lastMatrixSampleAtRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  );
  const compileSeq = useRef(0);
  const wasmCachedRef = useRef(false);
  const debounceCompileRef = useRef(false);
  const hardwareConfigRef = useRef(hardwareConfig);
  hardwareConfigRef.current = hardwareConfig;

  // ------------------------------------------------------------ project analysis
  const scannedModules = useMemo(() => scanProject(projectFiles), [projectFiles]);
  const topCandidates = useMemo(() => findTopCandidates(scannedModules), [scannedModules]);
  const topModule = selectedTop ?? (guessTopModule(scannedModules) || 'top');
  const topInvalid = !scannedModules.some((m) => m.name === topModule);

  const projectDiagnostics = useMemo(
    () => validateProject({ files: projectFiles, topModule }),
    [projectFiles, topModule]
  );

  const activeFile = projectFiles.find((f) => f.id === activeFileId) ?? projectFiles[0] ?? null;

  // ------------------------------------------------------------ parsing & validation
  const verilogOnlyContents = useMemo(
    () =>
      projectFiles
        .filter((f) => /\.(v|sv|vh|svh)$/i.test(f.name))
        .map((f) => f.content),
    [projectFiles]
  );

  const verilogParsed = useMemo(
    () => parseVerilogSource(verilogOnlyContents, topModule),
    [verilogOnlyContents, topModule]
  );

  // Ports reported by Verilator are authoritative; fall back to the parser before first compile
  const ports = runtimePorts ?? verilogParsed.ports;

  // Scoped hardware config key isolated per (project origin + files + active topModule)
  const configScopeKey = useMemo(
    () =>
      buildHardwareConfigScopeKey(
        projectOrigin,
        projectFiles.map((f) => f.name),
        topModule
      ),
    [projectOrigin, projectFiles, topModule]
  );

  const getDefaultConfigForOrigin = useCallback((): HardwareConfigSchema => {
    if (projectOrigin.kind === 'preset') {
      const preset =
        SAMPLE_PRESETS.find((p) => p.id === projectOrigin.id) ?? SAMPLE_PRESETS[0];
      return preset.createHardwareConfig();
    }
    if (projectOrigin.kind === 'example') {
      const ex = EXAMPLE_PROJECTS.find((x) => x.id === projectOrigin.id);
      if (ex) return ex.createHardwareConfig();
    }
    return SAMPLE_PRESETS[0].createHardwareConfig();
  }, [projectOrigin]);

  // Switch hardwareConfig whenever the active project or top module scope changes
  useEffect(() => {
    if (loadedScopeKeyRef.current === configScopeKey) return;
    const fallback = getDefaultConfigForOrigin();
    const { config } = loadScopedHardwareConfig(configScopeKey, fallback, ports);
    loadedScopeKeyRef.current = configScopeKey;
    setHardwareConfig(config);
    const clk = config.components.find(
      (c): c is ClockComponentConfig => c.enabled && c.type === 'CLOCK'
    );
    if (clk && Number.isFinite(clk.defaultHz) && clk.defaultHz > 0) {
      setRateHz(clk.defaultHz);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configScopeKey]);

  // Persist edits only when hardwareConfig belongs to the active scopeKey
  useEffect(() => {
    if (loadedScopeKeyRef.current !== configScopeKey) return;
    saveScopedHardwareConfig(configScopeKey, hardwareConfig);
  }, [configScopeKey, hardwareConfig]);

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

  const clockPolarity: 'active-high' | 'active-low' =
    activeClockConfig?.polarity ?? 'active-high';
  const clockPolarityRef = useRef<'active-high' | 'active-low'>(clockPolarity);
  clockPolarityRef.current = clockPolarity;

  const clkNameRef = useRef<string | null>(clkName);
  clkNameRef.current = clkName;
  const activeMatrixConfigRef = useRef<MatrixComponentConfig | null>(activeMatrixConfig);
  activeMatrixConfigRef.current = activeMatrixConfig;

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

  const publishLcdStates = useCallback(() => {
    const next: Record<string, LcdState> = {};
    for (const [id, st] of Object.entries(lcdStatesRef.current)) {
      next[id] = cloneLcdState(st);
    }
    setLcdStates(next);
  }, []);

  const resetLcdStates = useCallback(
    (comps: HardwareConfigSchema['components'] = hardwareConfigRef.current.components) => {
      const next: Record<string, LcdState> = {};
      for (const comp of comps) {
        if (comp.type === 'LCD_CHARACTER') {
          next[comp.id] = createInitialLcdState();
        }
      }
      lcdStatesRef.current = next;
      publishLcdStates();
    },
    [publishLcdStates]
  );

  const stepAllLcds = useCallback((read: (signalName: string) => bigint) => {
    const comps = hardwareConfigRef.current.components;
    for (const comp of comps) {
      if (!comp.enabled || comp.type !== 'LCD_CHARACTER') continue;
      let st = lcdStatesRef.current[comp.id];
      if (!st) {
        st = createInitialLcdState();
        lcdStatesRef.current[comp.id] = st;
      }
      stepLcdState(st, extractLcdSample(comp as LcdCharacterComponentConfig, read));
    }
  }, []);

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

  // ---------------------------------------------------------------- simulation engine
  // The engine owns the hot loop. React only hears about it through throttled `onFrame` calls.
  const stepRef = useRef<() => void>(() => {});
  const sampleRef = useRef<() => void>(() => {});
  const frameRef = useRef<(s: EngineStats) => void>(() => {});
  const errorRef = useRef<(e: unknown) => void>(() => {});
  const engine = useMemo(
    () =>
      new SimulationEngine({
        step: () => stepRef.current(),
        onSample: () => sampleRef.current(),
        onFrame: (s) => frameRef.current(s),
        onError: (e) => errorRef.current(e),
      }),
    []
  );

  const pushHistory = (entries: SignalHistoryEntry[]) =>
    setHistory((h) => [...h, ...entries].slice(-HISTORY_LEN));

  // Frame boundary / batch completion: the ONLY place the run loop touches React state.
  frameRef.current = (s: EngineStats) => {
    const rt = runtimeRef.current;
    setEngineStats(s);
    if (s.state !== 'running' && s.state !== 'paused') setBatchActive(false);
    if (!rt) return;
    const idleLevel: 0 | 1 = clockPolarityRef.current === 'active-low' ? 1 : 0;
    cycleRef.current = s.cycle;
    clockLevelRef.current = idleLevel;
    const sig = rt.getSignals();
    sampleMatrix(sig);
    publishMatrix();
    publishLcdStates();
    setClockLevel(idleLevel);
    setCycleCount(s.cycle);
    setSignals(sig);
    pushHistory([{ cycle: s.cycle, halfCycle: idleLevel, values: sig }]);
  };

  errorRef.current = (e: unknown) => {
    setBatchActive(false);
    setMessages((m) => [
      ...m,
      { severity: 'error', file: null, line: 0, msg: `Runtime: ${String(e)}` },
    ]);
  };

  useEffect(() => () => engine.dispose(), [engine]);

  // Keep stepRef in sync if the active clock signal or polarity changes while running or paused (BUG-03, BUG-04)
  useEffect(() => {
    const rt = runtimeRef.current;
    if (rt && clkName) {
      const baseStep = rt.makeCycleStepper(clkName, clockPolarity);
      stepRef.current = () => {
        baseStep();
        stepAllLcds((name) => rt.readSignal(name));
      };
    }
  }, [clkName, clockPolarity, stepAllLcds]);

  const startRun = (mode: RunMode) => {
    const rt = runtimeRef.current;
    const activeClk = clkNameRef.current;
    if (!rt || !activeClk) return;
    const polarity = clockPolarityRef.current;
    const idleLevel: 0 | 1 = polarity === 'active-low' ? 1 : 0;
    if (clockLevelRef.current !== idleLevel) {
      rt.stepEdge(activeClk, idleLevel);
      clockLevelRef.current = idleLevel;
    }
    const baseStep = rt.makeCycleStepper(activeClk, polarity);
    stepRef.current = () => {
      baseStep();
      stepAllLcds((name) => rt.readSignal(name));
    };
    // Live matrix: read activeMatrixConfigRef dynamically so mid-run config edits take effect immediately (BUG-03)
    // Pass elapsed dtMs for frequency-independent POV decay (BUG-14)
    lastMatrixSampleAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    sampleRef.current = () => {
      const mc = activeMatrixConfigRef.current;
      if (!mc || mc.displayMode === 'pattern') return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dtMs = Math.max(0, now - lastMatrixSampleAtRef.current);
      lastMatrixSampleAtRef.current = now;
      sampleLiveMatrixIntoBuffer(
        matrixRef.current,
        rt.readSignal(mc.row.signalName),
        rt.readSignal(mc.col.signalName),
        mc,
        dtMs
      );
    };
    engine.reset(cycleRef.current);
    setBatchActive(mode.kind === 'batch');
    engine.start(mode);
  };

  const currentMode = (): RunMode =>
    Number.isFinite(rateHz) ? { kind: 'rate', hz: rateHz } : { kind: 'unlimited' };

  const handleToggleRun = () => {
    if (engine.state === 'running') engine.pause();
    else if (engine.state === 'paused') engine.resume();
    else startRun(currentMode());
  };

  const handleChangeRate = (hz: number) => {
    setRateHz(hz);
    if (engine.state === 'running' || engine.state === 'paused') {
      engine.setMode(Number.isFinite(hz) ? { kind: 'rate', hz } : { kind: 'unlimited' });
    }
  };

  const handleRunBatch = (n: number) => {
    if (engine.state === 'running' || engine.state === 'paused') return;
    startRun({ kind: 'batch', cycles: n });
  };

  const handleStop = () => engine.stop();

  // ---------------------------------------------------------------- compile
  const compile = useCallback(async () => {
    const seq = ++compileSeq.current;
    engine.reset();
    setEngineStats(IDLE_STATS);
    setBatchActive(false);
    setCompiling(true);
    setCompileInfo('');
    const outcome = await compileProject({ files: projectFiles, topModule });
    if (seq !== compileSeq.current) {
      outcome.result?.runtime?.dispose();
      return;
    }
    wasmCachedRef.current = true;
    setCompiling(false);
    setMessages(outcome.messages);
    const result = outcome.result;

    if (!result) {
      // project validation failed: Verilator was not invoked
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      setBackendMode('none');
      setRuntimePorts(null);
      setRuntimeInternals([]);
      setCompileInfo('Project validation failed - fix the errors below');
      return;
    }

    if (!result.runtime) {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
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
      `${projectFiles.length} files, top ${topModule}: Verilator ${result.timings.verilatorMs.toFixed(0)} ms + codegen ${result.timings.codegenMs.toFixed(0)} ms`
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

    const initClk = hardwareConfigRef.current.components.find(
      (c): c is ClockComponentConfig => c.enabled && c.type === 'CLOCK'
    );
    const idleLevel: 0 | 1 = initClk?.polarity === 'active-low' ? 1 : 0;
    cycleRef.current = 0;
    clockLevelRef.current = idleLevel;
    setCycleCount(0);
    setClockLevel(idleLevel);
    const sig = rt.getSignals();
    setSignals(sig);
    setHistory([{ cycle: 0, halfCycle: idleLevel, values: sig }]);
    matrixRef.current = createEmptyMatrixBuffer();
    const matrixCfg =
      hardwareConfigRef.current.components.find(
        (c): c is MatrixComponentConfig => c.enabled && c.type === 'MATRIX'
      ) ?? null;
    sampleMatrix(sig, matrixCfg);
    publishMatrix();
    resetLcdStates(hardwareConfigRef.current.components);
    stepAllLcds((name) => sig[name] ?? 0n);
    publishLcdStates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFiles, topModule]);

  useEffect(() => {
    const delay = debounceCompileRef.current ? 450 : 0;
    debounceCompileRef.current = false;
    const timer = window.setTimeout(() => void compile(), delay);
    return () => window.clearTimeout(timer);
  }, [compile]);

  // ------------------------------------------------------------- single stepping
  const stepHalfCycle = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const activeLevel: 0 | 1 = clockPolarityRef.current === 'active-low' ? 0 : 1;
    const next: 0 | 1 = clockLevelRef.current === 0 ? 1 : 0;
    if (clkName) rt.stepEdge(clkName, next);
    else rt.eval();
    clockLevelRef.current = next;
    if (next === activeLevel) cycleRef.current += 1;
    engine.setCycle(cycleRef.current);
    const nextStats = engine.stats();
    setEngineStats(nextStats);
    if (nextStats.state !== 'running' && nextStats.state !== 'paused') setBatchActive(false);
    const sig = rt.getSignals();
    sampleMatrix(sig);
    publishMatrix();
    stepAllLcds((name) => sig[name] ?? 0n);
    publishLcdStates();
    setClockLevel(next);
    setCycleCount(cycleRef.current);
    setSignals(sig);
    pushHistory([{ cycle: cycleRef.current, halfCycle: next, values: sig }]);
  };

  const stepFullCycle = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const polarity = clockPolarityRef.current;
    const activeLevel: 0 | 1 = polarity === 'active-low' ? 0 : 1;
    const idleLevel: 0 | 1 = polarity === 'active-low' ? 1 : 0;
    if (clkName) {
      if (clockLevelRef.current !== idleLevel) rt.stepEdge(clkName, idleLevel);
      rt.stepEdge(clkName, activeLevel);
      cycleRef.current += 1;
      const hi = rt.getSignals();
      sampleMatrix(hi);
      rt.stepEdge(clkName, idleLevel);
    } else {
      rt.eval();
      cycleRef.current += 1;
    }
    clockLevelRef.current = idleLevel;
    engine.setCycle(cycleRef.current);
    const nextStats = engine.stats();
    setEngineStats(nextStats);
    if (nextStats.state !== 'running' && nextStats.state !== 'paused') setBatchActive(false);
    const lo = rt.getSignals();
    sampleMatrix(lo);
    publishMatrix();
    stepAllLcds((name) => lo[name] ?? 0n);
    publishLcdStates();
    setClockLevel(idleLevel);
    setCycleCount(cycleRef.current);
    setSignals(lo);
    pushHistory([{ cycle: cycleRef.current, halfCycle: idleLevel, values: lo }]);
  };

  // ------------------------------------------------------------- inputs
  const running = engineStats.state === 'running';
  const paused = engineStats.state === 'paused';

  const applyInput = (signalName: string, update: (cur: bigint) => bigint) => {
    const rt = runtimeRef.current;
    if (!rt || !rt.hasSignal(signalName)) return;
    const cur = rt.getSignals()[signalName] ?? 0n;
    rt.setSignal(signalName, update(cur));
    rt.eval();
    const sig = rt.getSignals();
    sampleMatrix(sig);
    publishMatrix();
    stepAllLcds((name) => sig[name] ?? 0n);
    publishLcdStates();
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
    engine.reset(0);
    setEngineStats(IDLE_STATS);
    setBatchActive(false);
    const initialInputs = computeInitialInputSignals(
      hardwareConfigRef.current.components,
      rt.ports
    );
    rt.reset(initialInputs);
    const idleLevel: 0 | 1 = clockPolarityRef.current === 'active-low' ? 1 : 0;
    cycleRef.current = 0;
    clockLevelRef.current = idleLevel;
    const sig = rt.getSignals();
    setClockLevel(idleLevel);
    setCycleCount(0);
    setSignals(sig);
    setHistory([{ cycle: 0, halfCycle: idleLevel, values: sig }]);
    matrixRef.current = createEmptyMatrixBuffer();
    sampleMatrix(sig);
    publishMatrix();
    resetLcdStates(hardwareConfigRef.current.components);
    stepAllLcds((name) => sig[name] ?? 0n);
    publishLcdStates();
  };

  // ------------------------------------------------------------- project import / editing
  const loadEntries = (entries: ImportedEntry[], mode: 'replace' | 'append') => {
    if (entries.length === 0) {
      setMessages([
        {
          severity: 'error',
          file: null,
          line: 0,
          msg: 'No supported files found (.v .sv .vh .svh .hex .mem .mif .txt).',
        },
      ]);
      return;
    }
    debounceCompileRef.current = false;
    setRuntimePorts(null);
    if (mode === 'replace') {
      setProjectOrigin({ kind: 'custom' });
      setProjectFiles(entries.map((e) => createFile(e.name, e.content)));
      setSelectedTop(null);
      setActiveFileId(null);
    } else {
      setProjectFiles((prev) => addFiles(prev, entries));
    }
  };

  const importFileList = async (list: FileList | null, mode: 'replace' | 'append') => {
    if (!list || list.length === 0) return;
    try {
      loadEntries(await entriesFromFiles(Array.from(list)), mode);
    } catch (err) {
      setMessages([
        {
          severity: 'error',
          file: null,
          line: 0,
          msg: err instanceof Error ? err.message : String(err),
        },
      ]);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    try {
      loadEntries(await entriesFromDataTransfer(e.dataTransfer), 'replace');
    } catch (err) {
      setMessages([
        {
          severity: 'error',
          file: null,
          line: 0,
          msg: err instanceof Error ? err.message : String(err),
        },
      ]);
    }
  };

  const handleRename = (id: string, newName: string): string | undefined => {
    const res = renameFile(projectFiles, id, newName);
    if (res.error) return res.error;
    setProjectFiles(res.files);
    return undefined;
  };

  const handleDeleteFile = (id: string) => {
    setProjectFiles((files) => deleteFile(files, id));
    if (activeFileId === id) setActiveFileId(null);
  };

  const handleRestoreDefaultConfig = () => {
    const restored = resetScopedHardwareConfig(configScopeKey, getDefaultConfigForOrigin());
    loadedScopeKeyRef.current = configScopeKey;
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

  const uploadBtn = isWarm
    ? 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 cursor-pointer transition'
    : 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 cursor-pointer transition';

  return (
    <div
      className={`min-h-screen text-slate-100 flex flex-col ${
        isWarm
          ? 'bg-gradient-to-b from-slate-950 via-slate-950 to-amber-950/20'
          : 'bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950/30'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div
          className={`fixed inset-0 z-50 pointer-events-none flex items-center justify-center border-4 border-dashed ${
            isWarm
              ? 'bg-amber-950/70 border-amber-400/70'
              : 'bg-emerald-950/70 border-emerald-400/70'
          }`}
        >
          <div
            className={`flex items-center gap-3 text-lg font-semibold ${
              isWarm ? 'text-amber-200' : 'text-emerald-200'
            }`}
          >
            <UploadCloud className="w-8 h-8" />
            {t.dropProjectHint}
          </div>
        </div>
      )}

      {/* Header */}
      <header
        className={`border-b bg-slate-900/95 backdrop-blur-md sticky top-0 z-30 shadow-lg shadow-slate-950/50 ${
          isWarm ? 'border-amber-500/30' : 'border-indigo-500/25'
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-inner ${
                isWarm
                  ? 'bg-gradient-to-br from-amber-500/25 to-orange-500/20 border-amber-400/45'
                  : 'bg-gradient-to-br from-emerald-500/25 to-cyan-500/20 border-emerald-400/40'
              }`}
            >
              <Layers className={`w-5 h-5 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
                {t.appTitle}
                <span
                  className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
                    isWarm
                      ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
                  }`}
                >
                  {t.appBadge}
                </span>
                <span
                  className={`hidden sm:inline-block text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                    isWarm
                      ? 'bg-orange-500/15 text-orange-200 border-orange-500/35'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {t.workbenchBadge}
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                {t.topModuleLabel}{' '}
                <span
                  className={`font-mono font-semibold ${
                    isWarm ? 'text-amber-300' : 'text-cyan-300'
                  }`}
                >
                  {topModule}
                </span>{' '}
                — {t.topSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Preset Selector */}
            <select
              value={projectOrigin.kind === 'preset' ? selectedPresetId : ''}
              onChange={(e) => {
                const preset = SAMPLE_PRESETS.find((p) => p.id === e.target.value);
                if (preset) {
                  setSelectedPresetId(preset.id);
                  setProjectOrigin({ kind: 'preset', id: preset.id });
                  debounceCompileRef.current = false;
                  setRuntimePorts(null);
                  setActiveFileId(null);
                  setSelectedTop(null);
                  setProjectFiles([createFile(preset.verilogFilename, preset.verilogCode)]);
                }
              }}
              className={`bg-slate-950 border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition ${
                isWarm
                  ? 'border-amber-500/35 hover:border-amber-400/60 focus:border-amber-400'
                  : 'border-indigo-500/35 hover:border-indigo-400/60 focus:border-emerald-400'
              }`}
            >
              {projectOrigin.kind !== 'preset' && (
                <option value="" disabled>
                  {t.presetLabel} —
                </option>
              )}
              {SAMPLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t.presetLabel} {p.name}
                </option>
              ))}
            </select>

            {/* Multi-file example projects */}
            <select
              value={projectOrigin.kind === 'example' ? projectOrigin.id : ''}
              onChange={(e) => {
                const ex = EXAMPLE_PROJECTS.find((x) => x.id === e.target.value);
                if (!ex) return;
                setProjectOrigin({ kind: 'example', id: ex.id });
                debounceCompileRef.current = false;
                setRuntimePorts(null);
                setActiveFileId(null);
                setProjectFiles(ex.files.map((f) => createFile(f.name, f.content)));
                setSelectedTop(ex.topModule);
              }}
              className={`bg-slate-950 border rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition ${
                isWarm
                  ? 'border-amber-500/35 hover:border-amber-400/60 focus:border-amber-400'
                  : 'border-indigo-500/35 hover:border-indigo-400/60 focus:border-emerald-400'
              }`}
            >
              <option value="">{t.multiFileExamplesPlaceholder}</option>
              {EXAMPLE_PROJECTS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>

            <TopModuleSelector
              topModule={topModule}
              modules={scannedModules}
              topCandidates={topCandidates}
              invalid={topInvalid}
              theme={uiTheme}
              t={t}
              onChange={setSelectedTop}
            />

            {/* Upload: multi-select / folder / ZIP (drag-and-drop works anywhere on the page) */}
            <label className={uploadBtn} title="Select multiple .v/.sv files">
              <FileCode className={`w-4 h-4 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span>
                {t.uploadVerilog} ({projectFiles.length} {t.filesSuffix})
              </span>
              <input
                type="file"
                accept=".v,.sv,.vh,.svh,.hex,.mem,.mif,.txt,.binary"
                multiple
                className="hidden"
                onChange={(e) => {
                  void importFileList(e.target.files, 'replace');
                  e.target.value = '';
                }}
              />
            </label>
            <label className={uploadBtn} title="Upload a whole project folder">
              <FolderOpen className={`w-4 h-4 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span>{t.folderBtn}</span>
              <input
                type="file"
                multiple
                className="hidden"
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                onChange={(e) => {
                  void importFileList(e.target.files, 'replace');
                  e.target.value = '';
                }}
              />
            </label>
            <label className={uploadBtn} title="Upload a project .zip">
              <FileArchive className={`w-4 h-4 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span>{t.zipBtn}</span>
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  void importFileList(e.target.files, 'replace');
                  e.target.value = '';
                }}
              />
            </label>

            {/* Theme Switcher (Warm FPGA Lab / Classic) */}
            <button
              type="button"
              onClick={handleToggleTheme}
              title="Switch UI Theme (Warm FPGA Lab / Classic)"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                isWarm
                  ? 'bg-orange-500/15 hover:bg-orange-500/25 text-orange-200 border-orange-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
              }`}
            >
              <Palette className={`w-3.5 h-3.5 ${isWarm ? 'text-orange-300' : 'text-emerald-300'}`} />
              <span>{isWarm ? t.themeWarmLab : t.themeClassic}</span>
            </button>

            {/* Language Switcher (EN / 繁體中文) */}
            <button
              type="button"
              onClick={handleToggleLanguage}
              title="Switch Language / 切換語言 (English / 繁體中文)"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                isWarm
                  ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-200 border-slate-700'
                  : 'bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border-violet-500/40'
              }`}
            >
              <Globe className={`w-3.5 h-3.5 ${isWarm ? 'text-amber-300' : 'text-violet-300'}`} />
              <span>{lang === 'en' ? '繁體中文' : 'English'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] w-full mx-auto px-4 py-5 flex-1 space-y-5">
        <ClockControls
          running={running}
          paused={paused}
          rateHz={rateHz}
          stats={engineStats}
          batchRunning={batchActive}
          cycleCount={cycleCount}
          clockLevel={clockLevel}
          clockSignalName={clkName}
          backendMode={backendMode}
          compiling={compiling}
          t={t}
          theme={uiTheme}
          onCompile={() => void compile()}
          onToggleRun={handleToggleRun}
          onStepFullCycle={stepFullCycle}
          onStepHalfCycle={stepHalfCycle}
          onReset={handleReset}
          onChangeRate={handleChangeRate}
          onRunBatch={handleRunBatch}
          onStop={handleStop}
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
                : isWarm
                ? 'border-amber-500/45 bg-amber-950/20'
                : 'border-emerald-500/40 bg-emerald-950/25'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-slate-200">
              {compiling ? (
                <Loader2 className={`w-3.5 h-3.5 animate-spin ${isWarm ? 'text-amber-300' : 'text-violet-300'}`} />
              ) : errorCount ? (
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
              ) : warnCount || validationIssues.length > 0 ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <CheckCircle2 className={`w-3.5 h-3.5 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />
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
                <span className={isWarm ? 'text-amber-300/90' : 'text-cyan-300/80'}>
                  • {compileInfo}
                </span>
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
                {m.file ? `${m.file}${m.line ? `:${m.line}` : ''}: ` : ''}
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
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b pb-2.5 ${
            isWarm ? 'border-amber-500/20' : 'border-indigo-500/20'
          }`}
        >
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
                  `${t.tabCode} (${projectFiles.length})`,
                ],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                  activeTab === id
                    ? isWarm
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-400/50 shadow-sm'
                      : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 font-mono bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
            <CheckCircle2
              className={`w-3.5 h-3.5 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`}
            />
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
                lcdStates={lcdStates}
                validationIssues={validationIssues}
                t={t}
                theme={uiTheme}
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
                  theme={uiTheme}
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
            theme={uiTheme}
            onChangeConfig={setHardwareConfig}
            onRestoreDefaults={handleRestoreDefaultConfig}
          />
        )}

        {activeTab === 'code' && (
          <div
            className={`bg-slate-900/95 border rounded-2xl p-4 shadow-xl ${
              isWarm ? 'border-amber-500/30' : 'border-emerald-500/25'
            }`}
          >
            <div className="flex flex-col lg:flex-row gap-4">
              <ProjectExplorer
                files={projectFiles}
                modules={scannedModules}
                diagnostics={projectDiagnostics}
                activeFileId={activeFile?.id ?? null}
                topModule={topModule}
                topCandidates={topCandidates}
                theme={uiTheme}
                t={t}
                onSelectFile={setActiveFileId}
                onRename={handleRename}
                onDelete={handleDeleteFile}
                onReplace={(id, content) => {
                  debounceCompileRef.current = false;
                  setRuntimePorts(null);
                  setProjectFiles((files) => replaceFile(files, id, content));
                }}
                onAddFiles={(l) => void importFileList(l, 'append')}
                onAddFolder={(l) => void importFileList(l, 'append')}
                onAddZip={(l) => void importFileList(l, 'append')}
                onChangeTop={setSelectedTop}
              />
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border ${
                        isWarm
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                          : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      }`}
                    >
                      {activeFile?.name ?? '(no file)'}
                    </span>
                    {!projectFiles.some((f) => f.name === 'rom_init.hex') && (
                      <button
                        type="button"
                        onClick={() => {
                          const f = createFile('rom_init.hex', 'A5\n5A\nF0\n0F\n');
                          setProjectFiles((prev) => [...prev, f]);
                          setActiveFileId(f.id);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition ${
                          isWarm
                            ? 'bg-orange-500/15 hover:bg-orange-500/25 border-orange-500/40 text-orange-200'
                            : 'bg-violet-500/15 hover:bg-violet-500/25 border-violet-500/40 text-violet-200'
                        }`}
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
                <CodeEditor
                  value={activeFile?.content ?? ''}
                  fileName={activeFile?.name ?? ''}
                  disabled={!activeFile}
                  theme={uiTheme}
                  onChange={(text) => {
                    if (!activeFile) return;
                    debounceCompileRef.current = true;
                    setRuntimePorts(null);
                    setProjectFiles((files) => replaceFile(files, activeFile.id, text));
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <SignalMonitor
          signalDefs={signalDefs}
          signals={signals}
          history={history}
          components={hardwareConfig.components}
          t={t}
          theme={uiTheme}
        />
      </main>
    </div>
  );
};

export default App;
