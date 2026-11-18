import { BoardComponentId, ValidationIssue } from '../types/fpga';

export type Language = 'en' | 'zh-TW';

export const STORAGE_KEY = 'web_fpga_sim_lang';

export function getInitialLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh-TW') return saved;
  } catch {
    // ignore storage errors
  }
  return 'en';
}

export function saveLanguage(lang: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore storage errors
  }
}

export const TRANSLATIONS = {
  en: {
    appTitle: 'Web FPGA Simulator',
    appBadge: 'Verilator WASM + Visual I/O Config',
    topModuleLabel: 'Top Module:',
    topSubtitle: 'Compiled in-browser via Verilator WebAssembly',
    presetLabel: 'Preset:',
    presetCustomUploaded: 'Custom Uploaded Design',
    uploadVerilog: 'Upload .v / .hex',
    filesSuffix: 'file(s)',
    // Clock Controls
    simBackend: 'Sim Backend',
    backendCompiling: 'Compiling with Verilator…',
    backendWasm: 'Verilator → WebAssembly',
    backendJs: 'Verilator → JS (fallback)',
    backendNone: 'Not compiled',
    clockLabel: 'Clock',
    clockCombinational: 'combinational / unassigned',
    clockHigh: 'HIGH (1)',
    clockLow: 'LOW (0)',
    cycleLabel: 'Cycle',
    compileBtn: 'Compile',
    compileTooltip: 'Re-run Verilator on the current sources',
    runClock: 'Run Clock',
    pauseClock: 'Pause Clock',
    stepCycle: 'Step Cycle',
    stepCycleTooltip: 'Advance 1 full clock cycle (0 → 1 → 0)',
    stepEdge: 'Step Edge',
    stepEdgeTooltip: 'Toggle single clock edge (half-cycle)',
    resetBtn: 'Reset',
    resetTooltip: 'Power-cycle and reset the Verilated model',
    freqLabel: 'Freq:',
    // Compiler & I/O banner
    compilingFirstRun: 'Running Verilator (downloading & compiling ~6 MB verilator_bin.wasm)…',
    compilingCached: 'Compiling Verilog RTL with Verilator WASM…',
    errorsCount: 'error(s)',
    warningsCount: 'warning(s)',
    ioConflictsCount: 'I/O conflict(s)',
    ioInvalidCount: 'invalid I/O assignment(s)',
    ioWarningsCount: 'I/O warning(s)',
    // Tabs
    tabBoard: 'FPGA Board & 16×16 Matrix',
    tabIoConfig: 'I/O Pin Configuration',
    tabCode: 'Verilog / Memory Editor',
    portsUnit: 'ports',
    internalSignalsUnit: 'internal signals',
    configuredUnit: 'configured',
    // Board View
    boardDefaultFamily: 'Virtual FPGA Development Board',
    boardDefaultPart: 'GUI I/O Mapped',
    topEntityLabel: 'Top Entity:',
    segPolarityLabel: '7-Seg:',
    segActiveLow: 'Active-LOW (0=ON)',
    segActiveHigh: 'Active-HIGH (1=ON)',
    keyModeLabel: 'KEY Mode:',
    keyMomentary: 'Momentary Push',
    keyToggle: 'Toggle Latch',
    sectionHex: '7-Segment Displays (HEX)',
    sectionRedLeds: 'Red LEDs (LEDR)',
    sectionGreenLeds: 'Green LEDs (LEDG)',
    sectionSwitches: 'Slide Switches (SW)',
    sectionButtons: 'Push Buttons (KEY)',
    noSwDetected: 'No port assigned to Switches (SW). Configure in I/O Pin Configuration.',
    noKeyDetected: 'No port assigned to Push Buttons (KEY). Configure in I/O Pin Configuration.',
    noOutputsHint: 'No output ports assigned to LEDs or 7-Segment displays yet. Open the I/O Pin Configuration tab to map your Verilog ports.',
    widthClampedBadge: 'truncated to board width',
    clickToToggle: 'Click to toggle',
    valLabel: 'Val:',
    // Matrix Viewer
    matrixTitle: '16×16 LED Dot-Matrix Viewer',
    matrixUnconnected: 'No ports assigned to 16×16 Matrix (configure in I/O Pin Configuration)',
    povHold: 'POV Scan Hold:',
    onLabel: 'ON',
    offLabel: 'OFF',
    colPolarity: 'Col Polarity:',
    activeLowShort: 'Active-LOW',
    activeHighShort: 'Active-HIGH',
    clearBtn: 'Clear',
    // Editors
    editorAutoCompileNote: 'Edits re-compile automatically via Verilator WASM. Valid I/O assignments are preserved.',
    addMemFileBtn: '+ Add rom_init.hex',
    // I/O Pin Configuration Panel
    ioPanelTitle: 'I/O Pin Configuration',
    ioPanelSubtitle: 'Map detected Verilog top-module ports directly to FPGA board components.',
    ioAutoAssignBtn: 'Auto-Assign',
    ioResetBtn: 'Reset Defaults',
    ioClearAllBtn: 'Clear All',
    ioUnassignedOption: '— Unassigned —',
    ioGroupInputs: 'Input Components',
    ioGroupOutputs: 'Output Components',
    ioColPortName: 'Port Name',
    ioColDirection: 'Direction',
    ioColWidth: 'Bit Width',
    ioColComponent: 'Assigned Component',
    ioColStatus: 'Status',
    ioStatusConfigured: 'Configured',
    ioStatusConfiguredWarn: 'Configured (Width Warning)',
    ioStatusUnassigned: 'Unassigned',
    ioStatusConflict: 'Conflict',
    ioStatusInvalid: 'Invalid Assignment',
    ioSummaryConfigured: 'Configured',
    ioSummaryUnassigned: 'Unassigned',
    ioSummaryConflicts: 'Conflicts',
    ioSummaryInvalid: 'Invalid',
    ioSummaryWarnings: 'Warnings',
    ioNoPortsDetected: 'No ports detected in the active Verilog top module.',
    ioInUseSuffix: 'in use',
    ioIncompatibleWidthSuffix: 'incompatible width',
    ioWidthMismatchSuffix: 'width mismatch',
    ioSignatureChangedTag: 'Port changed',
    ioOptionalNote: 'Unassigned ports remain driven at 0 (inputs) or observable in Signal Monitor (outputs) and do not block simulation.',
    ioWarnMatrixMissingCol: '16×16 LED Matrix Row is assigned, but Matrix Column is unassigned.',
    ioWarnMatrixMissingRow: '16×16 LED Matrix Column is assigned, but Matrix Row is unassigned.',
    // Component Display Names
    compClock: 'Clock (1-bit)',
    compKey: 'Push Buttons (KEY, 4-bit)',
    compSw: 'Slide Switches (SW, 10-bit)',
    compLedr: 'Red LEDs (LEDR, 10-bit)',
    compLedg: 'Green LEDs (LEDG, 8-bit)',
    compHex0: '7-Segment Display HEX0 (7-bit)',
    compHex1: '7-Segment Display HEX1 (7-bit)',
    compHex2: '7-Segment Display HEX2 (7-bit)',
    compHex3: '7-Segment Display HEX3 (7-bit)',
    compHex4: '7-Segment Display HEX4 (7-bit)',
    compHex5: '7-Segment Display HEX5 (7-bit)',
    compMatrixRow: '16×16 LED Matrix — Row (16-bit)',
    compMatrixCol: '16×16 LED Matrix — Column (16-bit)',
    // Signal Monitor
    signalMonitorTitle: 'Signal Monitor & Logic Waveform Analyzer',
    colSignal: 'Signal',
    colDirection: 'Dir',
    colWidth: 'Width',
    colAssignedComponent: 'Assigned Component',
    colCurrentVal: 'Current Value',
    colWaveform: 'Waveform Trace (Last 24 Samples)',
    internalVirtual: 'Internal / Virtual',
    emptyWaveformHint: 'Step clock or toggle inputs to capture waveform transitions',
  },
  'zh-TW': {
    appTitle: 'Web FPGA 數位電路模擬器',
    appBadge: 'Verilator WASM + 視覺化 I/O 設定',
    topModuleLabel: '頂層模組:',
    topSubtitle: '於瀏覽器內透過 Verilator WebAssembly 即時編譯模擬',
    presetLabel: '範例設計:',
    presetCustomUploaded: '自訂上傳設計',
    uploadVerilog: '上傳 .v / .hex',
    filesSuffix: '個檔案',
    // Clock Controls
    simBackend: '模擬核心',
    backendCompiling: 'Verilator 編譯中…',
    backendWasm: 'Verilator → WebAssembly',
    backendJs: 'Verilator → JS (備援)',
    backendNone: '尚未編譯',
    clockLabel: '時脈',
    clockCombinational: '純組合邏輯 / 未指派',
    clockHigh: '高準位 (1)',
    clockLow: '低準位 (0)',
    cycleLabel: '週期',
    compileBtn: '重新編譯',
    compileTooltip: '使用 Verilator 重新編譯目前設計',
    runClock: '連續執行',
    pauseClock: '暫停時脈',
    stepCycle: '單步週期',
    stepCycleTooltip: '推進 1 個完整時脈週期 (0 → 1 → 0)',
    stepEdge: '單步邊緣',
    stepEdgeTooltip: '切換單一時脈邊緣 (半週期)',
    resetBtn: '重置',
    resetTooltip: '重置暫存器與模擬狀態',
    freqLabel: '頻率:',
    // Compiler & I/O banner
    compilingFirstRun: '正在啟動 Verilator (首次執行需載入 ~6 MB verilator_bin.wasm)…',
    compilingCached: '正在使用 Verilator WASM 編譯 Verilog RTL…',
    errorsCount: '個錯誤',
    warningsCount: '個警告',
    ioConflictsCount: '處 I/O 資源衝突',
    ioInvalidCount: '處無效 I/O 指派',
    ioWarningsCount: '項 I/O 寬度警告',
    // Tabs
    tabBoard: 'FPGA 開發板與 16×16 點陣',
    tabIoConfig: 'I/O 腳位設定',
    tabCode: 'Verilog / 記憶體編輯器',
    portsUnit: '個連接埠',
    internalSignalsUnit: '個內部訊號',
    configuredUnit: '已指派',
    // Board View
    boardDefaultFamily: '虛擬 FPGA 開發板',
    boardDefaultPart: 'GUI 視覺化 I/O 映射',
    topEntityLabel: '頂層實體:',
    segPolarityLabel: '七段極性:',
    segActiveLow: '低準位點亮 (0=ON)',
    segActiveHigh: '高準位點亮 (1=ON)',
    keyModeLabel: '按鍵模式:',
    keyMomentary: '瞬時按壓 (Push)',
    keyToggle: '切換鎖定 (Latch)',
    sectionHex: '七段顯示器 (HEX)',
    sectionRedLeds: '紅色 LED (LEDR)',
    sectionGreenLeds: '綠色 LED (LEDG)',
    sectionSwitches: '撥動開關 (SW)',
    sectionButtons: '按壓按鈕 (KEY)',
    noSwDetected: '尚未指派連接埠至撥動開關 (SW)，請至「I/O 腳位設定」分頁設定。',
    noKeyDetected: '尚未指派連接埠至按壓按鈕 (KEY)，請至「I/O 腳位設定」分頁設定。',
    noOutputsHint: '尚未指派輸出連接埠至 LED 或七段顯示器，請開啟「I/O 腳位設定」分頁進行元件映射。',
    widthClampedBadge: '超過開發板寬度，僅顯示低位元',
    clickToToggle: '點擊切換狀態',
    valLabel: '數值:',
    // Matrix Viewer
    matrixTitle: '16×16 LED 點陣顯示器',
    matrixUnconnected: '尚未指派 16×16 點陣連接埠 (請至 I/O 腳位設定指派)',
    povHold: '視覺暫留 (POV):',
    onLabel: '開啟',
    offLabel: '關閉',
    colPolarity: '行極性 (Col):',
    activeLowShort: '低準位有效',
    activeHighShort: '高準位有效',
    clearBtn: '清除畫面',
    // Editors
    editorAutoCompileNote: '修改程式碼後將自動透過 Verilator WASM 重新編譯，並保留有效的 I/O 設定。',
    addMemFileBtn: '+ 新增 rom_init.hex',
    // I/O Pin Configuration Panel
    ioPanelTitle: 'I/O 腳位與元件設定',
    ioPanelSubtitle: '自動偵測 Verilog 頂層模組連接埠，並直接透過下拉選單映射至開發板周邊元件。',
    ioAutoAssignBtn: '自動指派',
    ioResetBtn: '重設為預設值',
    ioClearAllBtn: '全部清除',
    ioUnassignedOption: '— 未指派 (Unassigned) —',
    ioGroupInputs: '輸入元件',
    ioGroupOutputs: '輸出元件',
    ioColPortName: '連接埠名稱',
    ioColDirection: '方向',
    ioColWidth: '位元寬度',
    ioColComponent: '指派元件',
    ioColStatus: '設定狀態',
    ioStatusConfigured: '已設定',
    ioStatusConfiguredWarn: '已設定 (寬度警告)',
    ioStatusUnassigned: '未指派',
    ioStatusConflict: '資源衝突',
    ioStatusInvalid: '無效指派',
    ioSummaryConfigured: '已設定',
    ioSummaryUnassigned: '未指派',
    ioSummaryConflicts: '衝突',
    ioSummaryInvalid: '無效',
    ioSummaryWarnings: '警告',
    ioNoPortsDetected: '目前 Verilog 頂層模組未偵測到任何連接埠。',
    ioInUseSuffix: '已被使用',
    ioIncompatibleWidthSuffix: '寬度不相容',
    ioWidthMismatchSuffix: '寬度不符',
    ioSignatureChangedTag: '連接埠已變更',
    ioOptionalNote: '未指派的連接埠不會阻擋模擬（輸入預設為 0，輸出仍可於下方訊號監看器觀察）。',
    ioWarnMatrixMissingCol: '已指派 16×16 點陣列 (Row)，但尚未指派點陣行 (Column)。',
    ioWarnMatrixMissingRow: '已指派 16×16 點陣行 (Column)，但尚未指派點陣列 (Row)。',
    // Component Display Names
    compClock: '時脈輸入 (Clock, 1-bit)',
    compKey: '按壓按鈕 (KEY, 4-bit)',
    compSw: '撥動開關 (SW, 10-bit)',
    compLedr: '紅色 LED (LEDR, 10-bit)',
    compLedg: '綠色 LED (LEDG, 8-bit)',
    compHex0: '七段顯示器 HEX0 (7-bit)',
    compHex1: '七段顯示器 HEX1 (7-bit)',
    compHex2: '七段顯示器 HEX2 (7-bit)',
    compHex3: '七段顯示器 HEX3 (7-bit)',
    compHex4: '七段顯示器 HEX4 (7-bit)',
    compHex5: '七段顯示器 HEX5 (7-bit)',
    compMatrixRow: '16×16 LED 點陣 — 列 (Row, 16-bit)',
    compMatrixCol: '16×16 LED 點陣 — 行 (Col, 16-bit)',
    // Signal Monitor
    signalMonitorTitle: '訊號監看與邏輯波形分析儀',
    colSignal: '訊號名稱',
    colDirection: '方向',
    colWidth: '位元寬度',
    colAssignedComponent: '指派元件',
    colCurrentVal: '目前數值',
    colWaveform: '數位波形追蹤 (最近 24 筆取樣)',
    internalVirtual: '內部暫存 / 虛擬訊號',
    emptyWaveformHint: '推進時脈或切換開關以記錄數位波形變化',
  },
};

export type TranslationDict = (typeof TRANSLATIONS)['en'];

export function getComponentLabel(
  id: BoardComponentId,
  t: TranslationDict
): string {
  switch (id) {
    case 'CLOCK':
      return t.compClock;
    case 'KEY':
      return t.compKey;
    case 'SW':
      return t.compSw;
    case 'LEDR':
      return t.compLedr;
    case 'LEDG':
      return t.compLedg;
    case 'HEX0':
      return t.compHex0;
    case 'HEX1':
      return t.compHex1;
    case 'HEX2':
      return t.compHex2;
    case 'HEX3':
      return t.compHex3;
    case 'HEX4':
      return t.compHex4;
    case 'HEX5':
      return t.compHex5;
    case 'MATRIX_ROW':
      return t.compMatrixRow;
    case 'MATRIX_COL':
      return t.compMatrixCol;
  }
}

export function formatValidationIssue(
  issue: ValidationIssue,
  lang: Language,
  t: TranslationDict
): string {
  const compLabel = getComponentLabel(issue.componentId, t);

  if (lang === 'zh-TW') {
    switch (issue.code) {
      case 'DIRECTION_CHANGED':
        return `連接埠方向已由 ${issue.prevDirection} 變更為 ${issue.portDirection}，與 ${compLabel}（${issue.componentDirection}）不相容。`;
      case 'DIRECTION_MISMATCH':
        return `方向不相容：${issue.portDirection} 連接埠無法指派至 ${issue.componentDirection} 元件「${compLabel}」。`;
      case 'CLOCK_WIDTH_INVALID':
        return issue.prevWidth && issue.prevWidth !== issue.portWidth
          ? `連接埠寬度已由 ${issue.prevWidth}-bit 變更為 ${issue.portWidth}-bit；時脈僅支援 1-bit 輸入。`
          : `寬度不相容：${compLabel} 需要 1-bit 連接埠，但目前為 ${issue.portWidth}-bit。`;
      case 'HEX_WIDTH_TOO_SMALL':
        return issue.prevWidth && issue.prevWidth !== issue.portWidth
          ? `連接埠寬度已由 ${issue.prevWidth}-bit 變更為 ${issue.portWidth}-bit；七段顯示器至少需要 7-bit。`
          : `寬度不足：${compLabel} 需要至少 7-bit，但目前連接埠僅 ${issue.portWidth}-bit。`;
      case 'WIDTH_EXCEEDS_64':
        return `連接埠寬度 (${issue.portWidth}-bit) 超過模擬器 64-bit 上限。`;
      case 'DUPLICATE_COMPONENT':
        return `重複指派衝突：「${compLabel}」同時被指派給 ${(issue.conflictingPorts ?? []).join(', ')}。`;
      case 'WIDTH_EXCEEDS_COMPONENT':
        return `寬度不符警告：連接埠為 ${issue.portWidth}-bit，超過元件容量 (${issue.componentWidth}-bit)，高位元將不會顯示於開發板。`;
      case 'HEX_DP_UNUSED':
        return `寬度提示：連接埠為 8-bit，七段顯示器將使用 [6:0]，第 7 位元 (DP) 不顯示。`;
      case 'MATRIX_WIDTH_MISMATCH':
        return `寬度不符警告：16×16 點陣預期 16-bit，但連接埠為 ${issue.portWidth}-bit。`;
    }
  }

  switch (issue.code) {
    case 'DIRECTION_CHANGED':
      return `Port direction changed (${issue.prevDirection} → ${issue.portDirection}); incompatible with ${compLabel} (${issue.componentDirection}).`;
    case 'DIRECTION_MISMATCH':
      return `Direction mismatch: ${issue.portDirection} port cannot be assigned to ${issue.componentDirection} component "${compLabel}".`;
    case 'CLOCK_WIDTH_INVALID':
      return issue.prevWidth && issue.prevWidth !== issue.portWidth
        ? `Port width changed (${issue.prevWidth}-bit → ${issue.portWidth}-bit); Clock requires a 1-bit input.`
        : `Width incompatible: ${compLabel} requires a 1-bit port, got ${issue.portWidth}-bit.`;
    case 'HEX_WIDTH_TOO_SMALL':
      return issue.prevWidth && issue.prevWidth !== issue.portWidth
        ? `Port width changed (${issue.prevWidth}-bit → ${issue.portWidth}-bit); 7-Segment Display requires at least 7 bits.`
        : `Width too narrow: ${compLabel} requires at least 7 bits, got ${issue.portWidth}-bit.`;
    case 'WIDTH_EXCEEDS_64':
      return `Port width (${issue.portWidth}-bit) exceeds the 64-bit simulator runtime limit.`;
    case 'DUPLICATE_COMPONENT':
      return `Resource conflict: "${compLabel}" is also assigned to ${(issue.conflictingPorts ?? []).join(', ')}.`;
    case 'WIDTH_EXCEEDS_COMPONENT':
      return `Width mismatch warning: port is ${issue.portWidth}-bit, exceeding ${issue.componentWidth}-bit component width (upper bits unmapped on board).`;
    case 'HEX_DP_UNUSED':
      return `Width note: 8-bit port mapped to 7-Segment Display; segments [6:0] are displayed and bit [7] (DP) is unused.`;
    case 'MATRIX_WIDTH_MISMATCH':
      return `Width mismatch warning: 16×16 LED Matrix expects 16-bit port, got ${issue.portWidth}-bit.`;
  }
}
