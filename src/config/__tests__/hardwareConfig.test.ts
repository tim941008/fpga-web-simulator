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
  resetHardwareConfig,
  resetScopedHardwareConfig,
  saveHardwareConfig,
  saveScopedHardwareConfig,
  StorageLike,
} from '../configPersistence';
import { parseVerilogSource } from '../../parsers/verilogParser';
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
