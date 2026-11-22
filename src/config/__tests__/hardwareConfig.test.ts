import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PortDefinition } from '../../types/fpga';
import {
  HARDWARE_CONFIG_SCHEMA_VERSION,
  HardwareConfigSchema,
  MatrixBitOrder,
  MatrixComponentConfig,
} from '../../types/hardwareConfig';
import {
  computeInitialInputSignals,
  computeKeyInitialRawValue,
  computeSwitchInitialRawValue,
  getMappedComponentsForSignal,
  getOrderedBitIndices,
  isRawBitActive,
  logicalStateToRawBit,
  mapVisualIndexToBit,
  validateHardwareConfig,
} from '../hardwareMapping';
import {
  computePovDecayFactor,
  createDefaultMatrixPattern,
  createEmptyMatrixBuffer,
  DEFAULT_MATRIX_PATTERN,
  evaluateMatrixPixel,
  mapMatrixColToBit,
  mapMatrixRowToBit,
  renderPatternToMatrixBuffer,
  sampleLiveMatrixIntoBuffer,
} from '../matrixMapping';
import {
  createCombAluHardwareConfig,
  createFullDemoHardwareConfig,
} from '../defaultHardwareConfig';
import {
  buildHardwareConfigScopeKey,
  HARDWARE_CONFIG_SCOPED_STORAGE_KEY,
  HARDWARE_CONFIG_STORAGE_KEY,
  loadHardwareConfig,
  loadScopedHardwareConfig,
  parseStoredHardwareConfig,
  resetHardwareConfig,
  resetScopedHardwareConfig,
  saveHardwareConfig,
  saveScopedHardwareConfig,
  StorageLike,
} from '../configPersistence';
import { parseVerilogSource } from '../../parsers/verilogParser';
import { EXAMPLE_PROJECTS } from '../../presets/exampleProjects';
import { SAMPLE_PRESETS } from '../../presets/sampleDesigns';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

const DEMO_PORTS: PortDefinition[] = [
  { name: 'CLOCK_50', direction: 'input', msb: 0, lsb: 0, width: 1 },
  { name: 'KEY', direction: 'input', msb: 3, lsb: 0, width: 4 },
  { name: 'SW', direction: 'input', msb: 9, lsb: 0, width: 10 },
  { name: 'LEDR', direction: 'output', msb: 9, lsb: 0, width: 10 },
  { name: 'HEX0', direction: 'output', msb: 6, lsb: 0, width: 7 },
  { name: 'HEX1', direction: 'output', msb: 6, lsb: 0, width: 7 },
  { name: 'MATRIX_ROW', direction: 'output', msb: 15, lsb: 0, width: 16 },
  { name: 'MATRIX_COL', direction: 'output', msb: 15, lsb: 0, width: 16 },
];

describe('1. Complete QSF Removal Verification', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  it('removes src/parsers/qsfParser.ts and tests/qsf directory', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/parsers/qsfParser.ts'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'tests/qsf'))).toBe(false);
  });

  it('contains zero QSF references in src/ application code (excluding tests)', () => {
    const srcDir = path.join(repoRoot, 'src');
    const qsfPattern = /\bqsf\b|qsfParser|buildBoardControlGroups|PinAssignment/i;
    const violations: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'vendor') continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          if (qsfPattern.test(content)) {
            violations.push(path.relative(repoRoot, full));
          }
        }
      }
    };

    walk(srcDir);
    expect(violations).toEqual([]);
  });
});

describe('2. Bit-Order Conversion & Active-High / Active-Low Polarity', () => {
  it('orders bits MSB-to-LSB and LSB-to-MSB without duplication', () => {
    expect(getOrderedBitIndices(4, 'msb-to-lsb')).toEqual([3, 2, 1, 0]);
    expect(getOrderedBitIndices(4, 'lsb-to-msb')).toEqual([0, 1, 2, 3]);
    expect(mapVisualIndexToBit(0, 8, 'msb-to-lsb')).toBe(7);
    expect(mapVisualIndexToBit(7, 8, 'msb-to-lsb')).toBe(0);
    expect(mapVisualIndexToBit(0, 8, 'lsb-to-msb')).toBe(0);
    expect(mapVisualIndexToBit(7, 8, 'lsb-to-msb')).toBe(7);
  });

  it('handles Active-High and Active-Low polarity symmetrically', () => {
    expect(isRawBitActive(0b0100n, 2, 'active-high')).toBe(true);
    expect(isRawBitActive(0b0100n, 2, 'active-low')).toBe(false);
    expect(isRawBitActive(0b0000n, 2, 'active-low')).toBe(true);

    expect(logicalStateToRawBit(true, 'active-high')).toBe(1);
    expect(logicalStateToRawBit(false, 'active-high')).toBe(0);
    expect(logicalStateToRawBit(true, 'active-low')).toBe(0);
    expect(logicalStateToRawBit(false, 'active-low')).toBe(1);
  });

  it('computes Switch and KEY initial raw signal values respecting polarity', () => {
    const swRawHigh = computeSwitchInitialRawValue({
      id: 's1',
      type: 'SWITCH',
      label: 'SW',
      enabled: true,
      signalName: 'SW',
      width: 4,
      bitOrder: 'msb-to-lsb',
      polarity: 'active-high',
      initialValue: '0x5',
    });
    expect(swRawHigh).toBe(0b0101n);

    const swRawLow = computeSwitchInitialRawValue({
      id: 's2',
      type: 'SWITCH',
      label: 'SW',
      enabled: true,
      signalName: 'SW',
      width: 4,
      bitOrder: 'msb-to-lsb',
      polarity: 'active-low',
      initialValue: '0x5',
    });
    expect(swRawLow).toBe(0b1010n);

    // Active-low KEY: idle (not pressed) drives raw 1, pressed drives raw 0
    const keyRawLow = computeKeyInitialRawValue({
      id: 'k1',
      type: 'KEY',
      label: 'KEY',
      enabled: true,
      signalName: 'KEY',
      width: 4,
      bitOrder: 'msb-to-lsb',
      polarity: 'active-low',
      behavior: 'momentary',
      initialPressed: [true, false, false, false],
    });
    expect(keyRawLow).toBe(0b1110n);
  });
});

describe('3. Component Configuration Validation & Signal Mapping', () => {
  it('validates default demo hardware config with zero issues against demo ports', () => {
    const cfg = createFullDemoHardwareConfig();
    const issues = validateHardwareConfig(cfg.components, DEMO_PORTS);
    expect(issues).toEqual([]);
  });

  it('reports missing signals, direction mismatches, width mismatches, and invalid 7-seg bits', () => {
    const cfg = createFullDemoHardwareConfig();
    cfg.components.push(
      {
        id: 'bad-missing',
        type: 'LED',
        label: 'Missing LED',
        enabled: true,
        signalName: 'NON_EXISTENT',
        width: 8,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        color: 'rose',
      },
      {
        id: 'bad-dir',
        type: 'LED',
        label: 'Wrong Direction',
        enabled: true,
        signalName: 'SW',
        width: 10,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        color: 'rose',
      },
      {
        id: 'bad-width',
        type: 'SWITCH',
        label: 'Wrong Width',
        enabled: true,
        signalName: 'SW',
        width: 4,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        initialValue: '0',
      },
      {
        id: 'bad-seg',
        type: 'SEVEN_SEGMENT',
        label: 'Bad Seg',
        enabled: true,
        signalName: 'HEX0',
        width: 7,
        bitOrder: 'lsb-to-msb',
        polarity: 'active-low',
        segmentMap: { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 9, dp: null },
        showDecimalPoint: false,
        color: 'rose',
      }
    );

    const issues = validateHardwareConfig(cfg.components, DEMO_PORTS);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('MISSING_SIGNAL');
    expect(codes).toContain('DIRECTION_MISMATCH');
    expect(codes).toContain('WIDTH_MISMATCH');
    expect(codes).toContain('INVALID_SEGMENT_BIT');
  });

  it('maps custom signal names and computes initial inputs only for existing input ports', () => {
    const cfg = createFullDemoHardwareConfig();
    expect(getMappedComponentsForSignal('MATRIX_ROW', cfg.components)).toEqual([
      '16×16 LED Matrix (ROW)',
    ]);
    expect(getMappedComponentsForSignal('MATRIX_COL', cfg.components)).toEqual([
      '16×16 LED Matrix (COL)',
    ]);

    const initial = computeInitialInputSignals(cfg.components, DEMO_PORTS);
    expect(initial).toHaveProperty('SW', 0n);
    expect(initial).toHaveProperty('KEY', 0n);
    expect(initial).not.toHaveProperty('LEDR');
  });
});

describe('4. 16x16 Matrix Independent Row/Column Bit Ordering & Default Pattern', () => {
  it('maps Row 15→0 (Bit 15 = top row 0, Bit 0 = bottom row 15)', () => {
    expect(mapMatrixRowToBit(0, '15-to-0')).toBe(15);
    expect(mapMatrixRowToBit(15, '15-to-0')).toBe(0);
  });

  it('maps Row 0→15 (Bit 0 = top row 0, Bit 15 = bottom row 15)', () => {
    expect(mapMatrixRowToBit(0, '0-to-15')).toBe(0);
    expect(mapMatrixRowToBit(15, '0-to-15')).toBe(15);
  });

  it('maps Column 15→0 (Bit 15 = leftmost col 0, Bit 0 = rightmost col 15)', () => {
    expect(mapMatrixColToBit(0, '15-to-0')).toBe(15);
    expect(mapMatrixColToBit(15, '15-to-0')).toBe(0);
  });

  it('maps Column 0→15 (Bit 0 = leftmost col 0, Bit 15 = rightmost col 15)', () => {
    expect(mapMatrixColToBit(0, '0-to-15')).toBe(0);
    expect(mapMatrixColToBit(15, '0-to-15')).toBe(15);
  });

  it('evaluates all four Row/Column bit-order combinations without mutating Verilog signals', () => {
    // Drive ONLY Row bit 15 and Col bit 0 high
    const signals = { MATRIX_ROW: 1n << 15n, MATRIX_COL: 1n << 0n };
    const origRow = signals.MATRIX_ROW;
    const origCol = signals.MATRIX_COL;

    const combos: Array<{
      rowOrder: MatrixBitOrder;
      colOrder: MatrixBitOrder;
      expectedDisplayRow: number;
      expectedDisplayCol: number;
    }> = [
      { rowOrder: '15-to-0', colOrder: '15-to-0', expectedDisplayRow: 0, expectedDisplayCol: 15 },
      { rowOrder: '15-to-0', colOrder: '0-to-15', expectedDisplayRow: 0, expectedDisplayCol: 0 },
      { rowOrder: '0-to-15', colOrder: '15-to-0', expectedDisplayRow: 15, expectedDisplayCol: 15 },
      { rowOrder: '0-to-15', colOrder: '0-to-15', expectedDisplayRow: 15, expectedDisplayCol: 0 },
    ];

    for (const c of combos) {
      const hit = evaluateMatrixPixel(
        c.expectedDisplayRow,
        c.expectedDisplayCol,
        signals.MATRIX_ROW,
        signals.MATRIX_COL,
        { bitOrder: c.rowOrder, polarity: 'active-high', width: 16 },
        { bitOrder: c.colOrder, polarity: 'active-high', width: 16 }
      );
      expect(hit.pixelOn).toBe(true);
      expect(hit.rowBit).toBe(15);
      expect(hit.colBit).toBe(0);

      // Verify live buffer sampling lights exactly that one pixel
      const buf = createEmptyMatrixBuffer();
      const matrixCfg: MatrixComponentConfig = {
        id: 'm1',
        type: 'MATRIX',
        label: 'Matrix',
        enabled: true,
        row: { signalName: 'MATRIX_ROW', width: 16, bitOrder: c.rowOrder, polarity: 'active-high' },
        col: { signalName: 'MATRIX_COL', width: 16, bitOrder: c.colOrder, polarity: 'active-high' },
        povEnabled: false,
        color: 'emerald',
        displayMode: 'live',
        pattern: createDefaultMatrixPattern(),
      };
      sampleLiveMatrixIntoBuffer(buf, signals.MATRIX_ROW, signals.MATRIX_COL, matrixCfg);
      expect(buf[c.expectedDisplayRow][c.expectedDisplayCol]).toBe(1);
    }

    // Underlying Verilog signals must remain completely untouched
    expect(signals.MATRIX_ROW).toBe(origRow);
    expect(signals.MATRIX_COL).toBe(origCol);
  });

  it('matches the exact 16-row default Matrix pattern and supports UI preview rendering', () => {
    expect(DEFAULT_MATRIX_PATTERN).toHaveLength(16);
    expect(DEFAULT_MATRIX_PATTERN[0]).toBe(0b1111111111111111);
    expect(DEFAULT_MATRIX_PATTERN[1]).toBe(0b1111111111111111);
    expect(DEFAULT_MATRIX_PATTERN[2]).toBe(0b1000000100000011);
    for (let r = 3; r <= 12; r++) {
      expect(DEFAULT_MATRIX_PATTERN[r]).toBe(0b1000000000000001);
    }
    expect(DEFAULT_MATRIX_PATTERN[13]).toBe(0b1000000010000001);
    expect(DEFAULT_MATRIX_PATTERN[14]).toBe(0b1111111111111111);
    expect(DEFAULT_MATRIX_PATTERN[15]).toBe(0b1111111111111111);

    const buf = renderPatternToMatrixBuffer(DEFAULT_MATRIX_PATTERN, {
      row: { signalName: 'MATRIX_ROW', width: 16, bitOrder: '0-to-15', polarity: 'active-high' },
      col: { signalName: 'MATRIX_COL', width: 16, bitOrder: '15-to-0', polarity: 'active-high' },
    });
    // Row 2 = 1000000100000011 -> Bit 15 (col 0)=1, Bit 8 (col 7)=1, Bit 1 (col 14)=1, Bit 0 (col 15)=1
    expect(buf[2][0]).toBe(1);
    expect(buf[2][7]).toBe(1);
    expect(buf[2][14]).toBe(1);
    expect(buf[2][15]).toBe(1);
    expect(buf[2][1]).toBe(0);
  });
});

describe('5. Configuration Persistence (localStorage)', () => {
  it('saves, loads, handles invalid/outdated schema, and resets to default', () => {
    const storage = createMemoryStorage();
    const defaultCfg = createFullDemoHardwareConfig();
    const customCfg: HardwareConfigSchema = {
      ...createCombAluHardwareConfig(),
      boardName: 'My Persisted Board',
    };

    expect(saveHardwareConfig(customCfg, storage)).toBe(true);
    const loaded = loadHardwareConfig(defaultCfg, storage);
    expect(loaded.recoveredFromInvalid).toBe(false);
    expect(loaded.config.boardName).toBe('My Persisted Board');
    expect(loaded.config.schemaVersion).toBe(HARDWARE_CONFIG_SCHEMA_VERSION);

    // Outdated schemaVersion -> safe fallback
    storage.setItem(
      HARDWARE_CONFIG_STORAGE_KEY,
      JSON.stringify({ ...customCfg, schemaVersion: 999 })
    );
    const outdated = loadHardwareConfig(defaultCfg, storage);
    expect(outdated.recoveredFromInvalid).toBe(true);
    expect(outdated.config.boardName).toBe(defaultCfg.boardName);

    // Corrupted JSON -> safe fallback
    storage.setItem(HARDWARE_CONFIG_STORAGE_KEY, '{invalid-json');
    const corrupted = loadHardwareConfig(defaultCfg, storage);
    expect(corrupted.recoveredFromInvalid).toBe(true);
    expect(corrupted.config.boardName).toBe(defaultCfg.boardName);

    // Reset to default clears storage
    const reset = resetHardwareConfig(defaultCfg, storage);
    expect(reset.boardName).toBe(defaultCfg.boardName);
    expect(storage.getItem(HARDWARE_CONFIG_STORAGE_KEY)).toBeNull();
  });
});

describe('6. Existing Verilog Parser Regression Tests', () => {
  it('extracts all 8 ports from Preset 1 (top_fpga_demo) and all 4 ports from Preset 2 (comb_alu)', () => {
    const demo = parseVerilogSource([SAMPLE_PRESETS[0].verilogCode]);
    expect(demo.topModule).toBe('top_fpga_demo');
    expect(demo.ports.map((p) => p.name)).toEqual([
      'CLOCK_50',
      'KEY',
      'SW',
      'LEDR',
      'HEX0',
      'HEX1',
      'MATRIX_ROW',
      'MATRIX_COL',
    ]);

    const alu = parseVerilogSource([SAMPLE_PRESETS[1].verilogCode]);
    expect(alu.topModule).toBe('comb_alu');
    expect(alu.ports.map((p) => p.name)).toEqual(['KEY', 'SW', 'LEDR', 'HEX0']);
  });
});

describe('7. Project-Scoped Persistence Isolation & Legacy Migration (BUG-01)', () => {
  const demoPorts = parseVerilogSource([SAMPLE_PRESETS[0].verilogCode]).ports;
  const gamePorts: PortDefinition[] = [
    { name: 'clk', direction: 'input', msb: 0, lsb: 0, width: 1 },
    { name: 'row', direction: 'output', msb: 15, lsb: 0, width: 16 },
    { name: 'col', direction: 'output', msb: 15, lsb: 0, width: 16 },
  ];
  const projectBPorts: PortDefinition[] = [
    { name: 'sys_clk', direction: 'input', msb: 0, lsb: 0, width: 1 },
    { name: 'led_out', direction: 'output', msb: 7, lsb: 0, width: 8 },
  ];

  const createGameConfig = (): HardwareConfigSchema => ({
    schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
    boardName: 'Game Board',
    components: [
      {
        id: 'clk-game',
        type: 'CLOCK',
        label: 'System Clock',
        enabled: true,
        signalName: 'clk',
        width: 1,
        polarity: 'active-high',
        defaultHz: 30,
      },
      {
        id: 'mat-game',
        type: 'MATRIX',
        label: '16×16 LED Matrix',
        enabled: true,
        row: { signalName: 'row', width: 16, bitOrder: '0-to-15', polarity: 'active-high' },
        col: { signalName: 'col', width: 16, bitOrder: '15-to-0', polarity: 'active-high' },
        povEnabled: true,
        color: 'emerald',
        displayMode: 'live',
        pattern: createDefaultMatrixPattern(),
      },
    ],
  });

  const demoScope = buildHardwareConfigScopeKey(
    { kind: 'preset', id: SAMPLE_PRESETS[0].id },
    [SAMPLE_PRESETS[0].verilogFilename],
    'top_fpga_demo'
  );
  const gameScope = buildHardwareConfigScopeKey(
    { kind: 'custom' },
    ['game.sv', 'game_config.sv', 'game_display.sv', 'game_logic.sv'],
    'game'
  );
  const gameSubScope = buildHardwareConfigScopeKey(
    { kind: 'custom' },
    ['game.sv', 'game_config.sv', 'game_display.sv', 'game_logic.sv'],
    'game_display'
  );
  const projectBScope = buildHardwareConfigScopeKey(
    { kind: 'custom' },
    ['other_top.v'],
    'other_top'
  );

  it('default example → refresh restores top_fpga_demo intended hardware config', () => {
    const storage = createMemoryStorage();
    const fallback = createFullDemoHardwareConfig();
    const first = loadScopedHardwareConfig(demoScope, fallback, demoPorts, storage);
    expect(first.source).toBe('default');
    expect(validateHardwareConfig(first.config.components, demoPorts)).toEqual([]);

    // User customizes boardName on default example and refreshes
    const customized = { ...first.config, boardName: 'Lab Bench 1' };
    saveScopedHardwareConfig(demoScope, customized, storage);

    const reloaded = loadScopedHardwareConfig(demoScope, fallback, demoPorts, storage);
    expect(reloaded.source).toBe('scoped');
    expect(reloaded.config.boardName).toBe('Lab Bench 1');
    expect(validateHardwareConfig(reloaded.config.components, demoPorts)).toEqual([]);
  });

  it('custom game project → refresh does NOT leak clk/row/col into top_fpga_demo, while retaining game config', () => {
    const storage = createMemoryStorage();
    const gameCfg = createGameConfig();
    saveScopedHardwareConfig(gameScope, gameCfg, storage);

    // Refresh loads default preset top_fpga_demo
    const demoFallback = createFullDemoHardwareConfig();
    const demoLoaded = loadScopedHardwareConfig(demoScope, demoFallback, demoPorts, storage);
    expect(demoLoaded.source).toBe('default');
    expect(demoLoaded.config.components.find((c) => c.type === 'CLOCK')).toMatchObject({
      signalName: 'CLOCK_50',
    });
    expect(validateHardwareConfig(demoLoaded.config.components, demoPorts)).toEqual([]);

    // Re-uploading the custom game project restores its valid custom clk/row/col bindings
    const gameLoaded = loadScopedHardwareConfig(gameScope, demoFallback, gamePorts, storage);
    expect(gameLoaded.source).toBe('scoped');
    expect(gameLoaded.config.boardName).toBe('Game Board');
    expect(validateHardwareConfig(gameLoaded.config.components, gamePorts)).toEqual([]);
  });

  it('isolates default example → custom project, custom project A → custom project B, and top module switches', () => {
    const storage = createMemoryStorage();
    expect(demoScope).not.toBe(gameScope);
    expect(gameScope).not.toBe(projectBScope);
    expect(gameScope).not.toBe(gameSubScope);

    // Save distinct configs for demo and game
    saveScopedHardwareConfig(demoScope, { ...createFullDemoHardwareConfig(), boardName: 'Demo' }, storage);
    saveScopedHardwareConfig(gameScope, createGameConfig(), storage);

    // Loading custom project B must NOT receive game's or demo's config
    const fallback = createFullDemoHardwareConfig();
    const loadedB = loadScopedHardwareConfig(projectBScope, fallback, projectBPorts, storage);
    expect(loadedB.source).toBe('default');
    expect(loadedB.config.boardName).not.toBe('Game Board');

    // Switching top module from `game` to `game_display` must NOT silently reuse `game`'s scoped config
    const loadedSub = loadScopedHardwareConfig(gameSubScope, fallback, gamePorts, storage);
    expect(loadedSub.source).toBe('default');
    expect(loadedSub.config.boardName).not.toBe('Game Board');
  });

  it('handles invalid signal names deterministically (full mismatch falls back; partial mismatch preserves valid bindings and reports errors)', () => {
    const storage = createMemoryStorage();
    const demoFallback = createFullDemoHardwareConfig();

    // 1. Completely incompatible stored config (clk/row/col under demoScope) -> deterministic fallback
    saveScopedHardwareConfig(demoScope, createGameConfig(), storage);
    const fullMismatch = loadScopedHardwareConfig(demoScope, demoFallback, demoPorts, storage);
    expect(fullMismatch.source).toBe('fallback-incompatible');
    expect(fullMismatch.config.components.find((c) => c.type === 'CLOCK')).toMatchObject({
      signalName: 'CLOCK_50',
    });

    // 2. Partially invalid config (clk valid, matrix col typo) -> preserves valid clk binding, reports invalid signal
    const partialGame = createGameConfig();
    const mat = partialGame.components.find((c) => c.type === 'MATRIX') as MatrixComponentConfig;
    mat.col.signalName = 'nonexistent_col';
    saveScopedHardwareConfig(gameScope, partialGame, storage);

    const partialLoaded = loadScopedHardwareConfig(gameScope, demoFallback, gamePorts, storage);
    expect(partialLoaded.source).toBe('scoped');
    const issues = validateHardwareConfig(partialLoaded.config.components, gamePorts);
    expect(issues.some((i) => i.code === 'MISSING_SIGNAL' && i.message.includes('nonexistent_col'))).toBe(true);
    expect(issues.some((i) => i.message.includes('"clk"'))).toBe(false);
  });

  it('migrates compatible legacy v1 localStorage config safely while blocking incompatible legacy leakage', () => {
    const storage = createMemoryStorage();
    const demoFallback = createFullDemoHardwareConfig();

    // Simulate pre-fix bug: legacy global key holds game.sv's clk/row/col config
    saveHardwareConfig(createGameConfig(), storage);

    // Loading default top_fpga_demo MUST reject incompatible legacy config and NOT corrupt demo
    const demoLoaded = loadScopedHardwareConfig(demoScope, demoFallback, demoPorts, storage);
    expect(demoLoaded.source).toBe('fallback-incompatible');
    expect(demoLoaded.config.components.find((c) => c.type === 'CLOCK')).toMatchObject({
      signalName: 'CLOCK_50',
    });
    expect(validateHardwareConfig(demoLoaded.config.components, demoPorts)).toEqual([]);

    // Legacy key is still preserved so when the user loads game.sv, it migrates cleanly!
    const gameMigrated = loadScopedHardwareConfig(gameScope, demoFallback, gamePorts, storage);
    expect(gameMigrated.source).toBe('migrated-legacy');
    expect(gameMigrated.config.boardName).toBe('Game Board');
    expect(validateHardwareConfig(gameMigrated.config.components, gamePorts)).toEqual([]);
    expect(storage.getItem(HARDWARE_CONFIG_SCOPED_STORAGE_KEY)).toContain(gameScope);
  });

  it('resetScopedHardwareConfig clears only the active scope without erasing other projects', () => {
    const storage = createMemoryStorage();
    saveScopedHardwareConfig(demoScope, { ...createFullDemoHardwareConfig(), boardName: 'Demo Custom' }, storage);
    saveScopedHardwareConfig(gameScope, createGameConfig(), storage);

    const resetDemo = resetScopedHardwareConfig(demoScope, createFullDemoHardwareConfig(), storage);
    expect(resetDemo.boardName).toBe(createFullDemoHardwareConfig().boardName);

    // Game project's saved config remains intact
    const stillGame = loadScopedHardwareConfig(gameScope, createFullDemoHardwareConfig(), gamePorts, storage);
    expect(stillGame.source).toBe('scoped');
    expect(stillGame.config.boardName).toBe('Game Board');
  });
});

describe('8. Multi-File Example Hardware Configurations & Restore Default (BUG-05)', () => {
  const expectedByExampleId: Record<string, { signals: string[]; types: string[] }> = {
    'ex1-sw-led': {
      signals: ['SW', 'LEDR'],
      types: ['SWITCH', 'LED'],
    },
    'ex2-counter': {
      signals: ['CLOCK_50', 'KEY', 'LEDR'],
      types: ['CLOCK', 'KEY', 'LED'],
    },
    'ex3-sevenseg': {
      signals: ['CLOCK_50', 'KEY', 'HEX0'],
      types: ['CLOCK', 'KEY', 'SEVEN_SEGMENT'],
    },
    'ex4-matrix': {
      signals: ['CLOCK_50', 'KEY', 'MATRIX_ROW', 'MATRIX_COL'],
      types: ['CLOCK', 'KEY', 'MATRIX'],
    },
    'ex5-lcd-hello': {
      signals: ['CLOCK_50', 'rst', 'data', 'rs', 'rw', 'en', 'rst'],
      types: ['CLOCK', 'KEY', 'LCD_CHARACTER'],
    },
  };

  function collectSignals(cfg: HardwareConfigSchema): string[] {
    const out: string[] = [];
    for (const c of cfg.components) {
      if (c.type === 'MATRIX') {
        out.push(c.row.signalName, c.col.signalName);
      } else if (c.type === 'LCD_CHARACTER') {
        out.push(
          ...[c.dataSignalName, c.rsSignalName, c.rwSignalName, c.enSignalName, c.rstSignalName].filter(
            Boolean
          )
        );
      } else {
        out.push(c.signalName);
      }
    }
    return out;
  }

  for (const ex of EXAMPLE_PROJECTS) {
    it(`loads ${ex.id} (${ex.topModule}) with zero hardware validation issues and exact signal bindings`, () => {
      const storage = createMemoryStorage();
      const parsed = parseVerilogSource(ex.files.map((f) => f.content));
      expect(parsed.topModule).toBe(ex.topModule);

      const scope = buildHardwareConfigScopeKey(
        { kind: 'example', id: ex.id },
        ex.files.map((f) => f.name),
        ex.topModule
      );
      const fallback = ex.createHardwareConfig();
      const loaded = loadScopedHardwareConfig(scope, fallback, parsed.ports, storage);

      expect(loaded.source).toBe('default');
      expect(validateHardwareConfig(loaded.config.components, parsed.ports)).toEqual([]);
      expect(collectSignals(loaded.config)).toEqual(expectedByExampleId[ex.id].signals);
      expect(loaded.config.components.map((c) => c.type)).toEqual(
        expectedByExampleId[ex.id].types
      );
    });

    it(`Restore Default on ${ex.id} restores its own config (not Preset 1 full demo)`, () => {
      const storage = createMemoryStorage();
      const parsed = parseVerilogSource(ex.files.map((f) => f.content));
      const scope = buildHardwareConfigScopeKey(
        { kind: 'example', id: ex.id },
        ex.files.map((f) => f.name),
        ex.topModule
      );
      const customized: HardwareConfigSchema = {
        ...ex.createHardwareConfig(),
        boardName: `Edited ${ex.id}`,
      };
      saveScopedHardwareConfig(scope, customized, storage);

      const restored = resetScopedHardwareConfig(scope, ex.createHardwareConfig(), storage);
      expect(restored.boardName).not.toBe(`Edited ${ex.id}`);
      expect(restored.boardName).not.toBe(createFullDemoHardwareConfig().boardName);
      expect(collectSignals(restored)).toEqual(expectedByExampleId[ex.id].signals);
      expect(validateHardwareConfig(restored.components, parsed.ports)).toEqual([]);
    });
  }

  it('switching between two examples with different hardware configs does not leak bindings', () => {
    const storage = createMemoryStorage();
    const ex1 = EXAMPLE_PROJECTS.find((e) => e.id === 'ex1-sw-led')!;
    const ex4 = EXAMPLE_PROJECTS.find((e) => e.id === 'ex4-matrix')!;
    const ex1Ports = parseVerilogSource(ex1.files.map((f) => f.content)).ports;
    const ex4Ports = parseVerilogSource(ex4.files.map((f) => f.content)).ports;

    const ex1Scope = buildHardwareConfigScopeKey(
      { kind: 'example', id: ex1.id },
      ex1.files.map((f) => f.name),
      ex1.topModule
    );
    const ex4Scope = buildHardwareConfigScopeKey(
      { kind: 'example', id: ex4.id },
      ex4.files.map((f) => f.name),
      ex4.topModule
    );

    saveScopedHardwareConfig(
      ex1Scope,
      { ...ex1.createHardwareConfig(), boardName: 'Custom SW-LED' },
      storage
    );

    const loadedEx4 = loadScopedHardwareConfig(
      ex4Scope,
      ex4.createHardwareConfig(),
      ex4Ports,
      storage
    );
    expect(loadedEx4.source).toBe('default');
    expect(collectSignals(loadedEx4.config)).toEqual([
      'CLOCK_50',
      'KEY',
      'MATRIX_ROW',
      'MATRIX_COL',
    ]);
    expect(validateHardwareConfig(loadedEx4.config.components, ex4Ports)).toEqual([]);

    // Switching back to ex1 preserves ex1 customization
    const loadedEx1Again = loadScopedHardwareConfig(
      ex1Scope,
      ex1.createHardwareConfig(),
      ex1Ports,
      storage
    );
    expect(loadedEx1Again.source).toBe('scoped');
    expect(loadedEx1Again.config.boardName).toBe('Custom SW-LED');
  });

  it('refreshing after loading an example keeps default preset clean and preserves example customization', () => {
    const storage = createMemoryStorage();
    const demoPorts = parseVerilogSource([SAMPLE_PRESETS[0].verilogCode]).ports;
    const demoScope = buildHardwareConfigScopeKey(
      { kind: 'preset', id: SAMPLE_PRESETS[0].id },
      [SAMPLE_PRESETS[0].verilogFilename],
      'top_fpga_demo'
    );
    const ex3 = EXAMPLE_PROJECTS.find((e) => e.id === 'ex3-sevenseg')!;
    const ex3Ports = parseVerilogSource(ex3.files.map((f) => f.content)).ports;
    const ex3Scope = buildHardwareConfigScopeKey(
      { kind: 'example', id: ex3.id },
      ex3.files.map((f) => f.name),
      ex3.topModule
    );

    saveScopedHardwareConfig(
      ex3Scope,
      { ...ex3.createHardwareConfig(), boardName: 'My SevenSeg Bench' },
      storage
    );

    // Refresh restores default Preset 1 (full 7-component demo) without ex3 leakage
    const demoReloaded = loadScopedHardwareConfig(
      demoScope,
      SAMPLE_PRESETS[0].createHardwareConfig(),
      demoPorts,
      storage
    );
    expect(demoReloaded.source).toBe('default');
    expect(demoReloaded.config.components).toHaveLength(7);
    expect(validateHardwareConfig(demoReloaded.config.components, demoPorts)).toEqual([]);

    // Re-selecting ex3 restores user customization
    const ex3Reloaded = loadScopedHardwareConfig(
      ex3Scope,
      ex3.createHardwareConfig(),
      ex3Ports,
      storage
    );
    expect(ex3Reloaded.source).toBe('scoped');
    expect(ex3Reloaded.config.boardName).toBe('My SevenSeg Bench');
    expect(validateHardwareConfig(ex3Reloaded.config.components, ex3Ports)).toEqual([]);
  });

  it('handles invalid signal bindings stored under an example scope deterministically', () => {
    const storage = createMemoryStorage();
    const ex2 = EXAMPLE_PROJECTS.find((e) => e.id === 'ex2-counter')!;
    const ex2Ports = parseVerilogSource(ex2.files.map((f) => f.content)).ports;
    const ex2Scope = buildHardwareConfigScopeKey(
      { kind: 'example', id: ex2.id },
      ex2.files.map((f) => f.name),
      ex2.topModule
    );

    // Completely incompatible stored config -> falls back to ex2 default
    saveScopedHardwareConfig(
      ex2Scope,
      {
        schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
        boardName: 'Wrong Board',
        components: [
          {
            id: 'bad-sw',
            type: 'SWITCH',
            label: 'Bad SW',
            enabled: true,
            signalName: 'NONEXISTENT_SW',
            width: 8,
            bitOrder: 'msb-to-lsb',
            polarity: 'active-high',
            initialValue: '0',
          },
        ],
      },
      storage
    );

    const recovered = loadScopedHardwareConfig(
      ex2Scope,
      ex2.createHardwareConfig(),
      ex2Ports,
      storage
    );
    expect(recovered.source).toBe('fallback-incompatible');
    expect(collectSignals(recovered.config)).toEqual(['CLOCK_50', 'KEY', 'LEDR']);
    expect(validateHardwareConfig(recovered.config.components, ex2Ports)).toEqual([]);
  });
});

// ============================================================================
// 9. Validation & Strict Persistence Guards (BUG-08, BUG-09, BUG-10)
// ============================================================================
describe('9. Validation & Strict Persistence Guards (BUG-08, BUG-09, BUG-10)', () => {
  const demoPorts: PortDefinition[] = [
    { name: 'CLOCK_50', direction: 'input', width: 1, msb: 0, lsb: 0 },
    { name: 'SW', direction: 'input', width: 10, msb: 9, lsb: 0 },
    { name: 'KEY', direction: 'input', width: 4, msb: 3, lsb: 0 },
    { name: 'MATRIX_ROW', direction: 'output', width: 16, msb: 15, lsb: 0 },
    { name: 'MATRIX_COL', direction: 'output', width: 16, msb: 15, lsb: 0 },
  ];

  it('warns when multiple enabled CLOCK or MATRIX components exist (BUG-08)', () => {
    const base = createFullDemoHardwareConfig();
    const clk1 = base.components.find((c) => c.type === 'CLOCK')!;
    const mat1 = base.components.find((c) => c.type === 'MATRIX')!;
    const issues = validateHardwareConfig(
      [
        clk1,
        { ...clk1, id: 'clk-2', label: 'Clock 2' },
        mat1,
        { ...mat1, id: 'mat-2', label: 'Matrix 2' },
      ],
      demoPorts
    );
    expect(issues.some((i) => i.code === 'MULTIPLE_ACTIVE_CLOCKS' && i.componentId === 'clk-2')).toBe(true);
    expect(issues.some((i) => i.code === 'MULTIPLE_ACTIVE_MATRICES' && i.componentId === 'mat-2')).toBe(true);
  });

  it('warns when two input components bind to the same Verilog signal (BUG-10)', () => {
    const base = createFullDemoHardwareConfig();
    const sw1 = base.components.find((c) => c.type === 'SWITCH')!;
    const issues = validateHardwareConfig(
      [sw1, { ...sw1, id: 'sw-2', label: 'Duplicate SW' }],
      demoPorts
    );
    expect(issues.some((i) => i.code === 'DUPLICATE_INPUT_BINDING' && i.componentId === 'sw-2')).toBe(true);
  });

  it('rejects malformed component payloads in parseStoredHardwareConfig (BUG-09)', () => {
    const base = createFullDemoHardwareConfig();

    // Missing segmentMap on SEVEN_SEGMENT
    const brokenSeg = {
      ...base,
      components: base.components.map((c) =>
        c.type === 'SEVEN_SEGMENT' ? { ...c, segmentMap: undefined } : c
      ),
    };
    expect(parseStoredHardwareConfig(brokenSeg)).toBeNull();

    // Invalid KEY behavior / initialPressed
    const brokenKey = {
      ...base,
      components: base.components.map((c) =>
        c.type === 'KEY' ? { ...c, initialPressed: 'not-an-array' } : c
      ),
    };
    expect(parseStoredHardwareConfig(brokenKey)).toBeNull();

    // Invalid MATRIX row.width (NaN / out of range)
    const brokenMatrix = {
      ...base,
      components: base.components.map((c) =>
        c.type === 'MATRIX' ? { ...c, row: { ...c.row, width: 99 } } : c
      ),
    };
    expect(parseStoredHardwareConfig(brokenMatrix)).toBeNull();

    // Valid default config still parses cleanly
    expect(parseStoredHardwareConfig(base)).not.toBeNull();
  });

  it('decays matrix POV consistently over wall time regardless of sampling frequency (BUG-14)', () => {
    expect(computePovDecayFactor(0, 120)).toBe(1);
    expect(computePovDecayFactor(120, 120)).toBeCloseTo(0.5, 5);

    const matrixCfg = createFullDemoHardwareConfig().components.find(
      (c): c is MatrixComponentConfig => c.type === 'MATRIX'
    )!;
    // Simulate 120ms elapsed at 10 Hz (1 sample of 120ms) vs 1 kHz (120 samples of 1ms)
    const bufSlow = createEmptyMatrixBuffer();
    const bufFast = createEmptyMatrixBuffer();
    bufSlow[0][0] = 1;
    bufFast[0][0] = 1;

    sampleLiveMatrixIntoBuffer(bufSlow, 0n, 0n, matrixCfg, 120);
    for (let i = 0; i < 120; i++) {
      sampleLiveMatrixIntoBuffer(bufFast, 0n, 0n, matrixCfg, 1);
    }

    expect(bufSlow[0][0]).toBeCloseTo(0.5, 4);
    expect(bufFast[0][0]).toBeCloseTo(0.5, 4);
    expect(Math.abs(bufSlow[0][0] - bufFast[0][0])).toBeLessThan(1e-6);
  });
});
