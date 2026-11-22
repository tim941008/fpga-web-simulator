import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createInitialLcdState,
  extractLcdSample,
  getLcdDisplayView,
  stepLcdState,
} from '../lcdController';
import { createLcdHelloWorldHardwareConfig } from '../defaultHardwareConfig';
import { getMappedComponentsForSignal, validateHardwareConfig } from '../hardwareMapping';
import {
  buildHardwareConfigScopeKey,
  loadScopedHardwareConfig,
  parseStoredHardwareConfig,
  saveScopedHardwareConfig,
  StorageLike,
} from '../configPersistence';
import { EXAMPLE_PROJECTS } from '../../presets/exampleProjects';
import { LcdCharacterComponentConfig } from '../../types/hardwareConfig';
import { PortDefinition } from '../../types/fpga';
import { VerilogXMLParser } from '../../vendor/8bitworkshop/hdl/vxmlparser';
import { HDLModuleWASM } from '../../vendor/8bitworkshop/hdl/hdlwasm';
import { HDLModuleJS } from '../../vendor/8bitworkshop/hdl/hdlruntime';
import { binaryenReady } from '../../vendor/8bitworkshop/hdl/binaryen-shim';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

function pulseWrite(
  state: ReturnType<typeof createInitialLcdState>,
  rs: 0 | 1,
  data: number,
  rw: 0 | 1 = 0
) {
  stepLcdState(state, { data, rs, rw, en: 1, rst: 0 });
  stepLcdState(state, { data, rs, rw, en: 0, rst: 0 });
}

describe('LCD_CHARACTER HD44780 Controller (Phase C.3)', () => {
  it('latches commands and characters on EN falling edge only when RW=0', () => {
    const st = createInitialLcdState();

    // Holding EN=1 should not latch yet
    stepLcdState(st, { data: 0x41, rs: 1, rw: 0, en: 1, rst: 0 });
    expect(st.writeCount).toBe(0);

    // Falling edge EN 1 -> 0 latches 'A'
    stepLcdState(st, { data: 0x41, rs: 1, rw: 0, en: 0, rst: 0 });
    expect(st.writeCount).toBe(1);
    expect(getLcdDisplayView(st).lines[0].join('').trimEnd()).toBe('A');

    // RW=1 (read) should be ignored even on falling edge
    pulseWrite(st, 1, 0x42, 1);
    expect(st.writeCount).toBe(1);
    expect(getLcdDisplayView(st).lines[0].join('').trimEnd()).toBe('A');
  });

  it('supports DDRAM addressing (row 0 = 0x80, row 1 = 0xC0), clear (0x01), display off/on, and cursor', () => {
    const st = createInitialLcdState();
    pulseWrite(st, 0, 0x0e); // Display ON, Cursor visible
    for (const ch of 'LINE1') pulseWrite(st, 1, ch.charCodeAt(0));
    pulseWrite(st, 0, 0xc0); // Row 1 Col 0
    for (const ch of 'LINE2') pulseWrite(st, 1, ch.charCodeAt(0));

    let view = getLcdDisplayView(st);
    expect(view.lines[0].join('').trimEnd()).toBe('LINE1');
    expect(view.lines[1].join('').trimEnd()).toBe('LINE2');
    expect(view.cursor).toEqual({ row: 1, col: 5 });

    // Display OFF blanks visible output while retaining DDRAM
    pulseWrite(st, 0, 0x08);
    expect(getLcdDisplayView(st).lines[0].join('').trim()).toBe('');
    pulseWrite(st, 0, 0x0c);
    expect(getLcdDisplayView(st).lines[0].join('').trimEnd()).toBe('LINE1');

    // Clear display resets DDRAM and cursor
    pulseWrite(st, 0, 0x01);
    view = getLcdDisplayView(st);
    expect(view.lines[0].join('').trim()).toBe('');
    expect(view.lines[1].join('').trim()).toBe('');
  });

  it('resets state when rst is asserted (supporting active-high and active-low polarity)', () => {
    const st = createInitialLcdState();
    pulseWrite(st, 1, 0x58); // 'X'
    expect(st.writeCount).toBe(1);

    const cfg: LcdCharacterComponentConfig = {
      id: 'lcd-test',
      type: 'LCD_CHARACTER',
      label: 'Test LCD',
      enabled: true,
      dataSignalName: 'data',
      rsSignalName: 'rs',
      rwSignalName: 'rw',
      enSignalName: 'en',
      rstSignalName: 'rst_n',
      rstPolarity: 'active-low',
      backlight: 'green',
    };

    const sigMap: Record<string, bigint> = {
      data: 0n,
      rs: 0n,
      rw: 0n,
      en: 0n,
      rst_n: 0n, // active-low asserted
    };
    stepLcdState(st, extractLcdSample(cfg, (n) => sigMap[n] ?? 0n));
    expect(st.writeCount).toBe(0);
    expect(getLcdDisplayView(st).lines[0].join('').trim()).toBe('');
  });
});

describe('LCD_CHARACTER Validation & Persistence (Phase C.3)', () => {
  const lcdPorts: PortDefinition[] = [
    { name: 'CLOCK_50', direction: 'input', width: 1, msb: 0, lsb: 0 },
    { name: 'rst', direction: 'input', width: 1, msb: 0, lsb: 0 },
    { name: 'data', direction: 'output', width: 8, msb: 7, lsb: 0 },
    { name: 'rs', direction: 'output', width: 1, msb: 0, lsb: 0 },
    { name: 'rw', direction: 'output', width: 1, msb: 0, lsb: 0 },
    { name: 'en', direction: 'output', width: 1, msb: 0, lsb: 0 },
  ];

  it('validates createLcdHelloWorldHardwareConfig() with zero issues and reports signal mappings', () => {
    const cfg = createLcdHelloWorldHardwareConfig();
    expect(validateHardwareConfig(cfg.components, lcdPorts)).toEqual([]);
    expect(getMappedComponentsForSignal('data', cfg.components)).toEqual([
      '16×2 Character LCD (DATA)',
    ]);
    expect(getMappedComponentsForSignal('en', cfg.components)).toEqual([
      '16×2 Character LCD (EN)',
    ]);
  });

  it('persists and validates LCD_CHARACTER in scoped localStorage and rejects corrupted payloads', () => {
    const storage = createMemoryStorage();
    const cfg = createLcdHelloWorldHardwareConfig();
    const scope = buildHardwareConfigScopeKey(
      { kind: 'example', id: 'ex5-lcd-hello' },
      ['top_lcd_hello.v', 'lcd_hello_ctrl.v'],
      'top_lcd_hello'
    );

    saveScopedHardwareConfig(scope, cfg, storage);
    const loaded = loadScopedHardwareConfig(scope, cfg, lcdPorts, storage);
    expect(loaded.source).toBe('scoped');
    expect(loaded.config.components.some((c) => c.type === 'LCD_CHARACTER')).toBe(true);

    const bad = {
      ...cfg,
      components: cfg.components.map((c) =>
        c.type === 'LCD_CHARACTER' ? { ...c, backlight: 'invalid-color' } : c
      ),
    };
    expect(parseStoredHardwareConfig(bad)).toBeNull();
  });
});

describe('Example 5: LCD Hello World end-to-end simulation', () => {
  let verilatorSandbox: any;
  let verilatorWasmMod: WebAssembly.Module;

  beforeAll(async () => {
    const root = process.cwd();
    const wasmBytes = fs.readFileSync(path.join(root, 'public/verilator/verilator_bin.wasm'));
    const vjs = fs.readFileSync(path.join(root, 'public/verilator/verilator_bin.js'), 'utf8');
    verilatorWasmMod = await WebAssembly.compile(wasmBytes);
    verilatorSandbox = {
      WebAssembly,
      console,
      setTimeout,
      clearTimeout,
      performance,
      TextDecoder,
      TextEncoder,
      Uint8Array,
      Int32Array,
      Uint32Array,
      Float64Array,
      DataView,
      ArrayBuffer,
    };
    verilatorSandbox.self = verilatorSandbox;
    vm.runInNewContext(vjs, verilatorSandbox);
    await binaryenReady();
  });

  it('compiles Example 5 and renders "Hello, FPGA!" / "16x2 LCD Ready!" on both WASM and JS', async () => {
    const ex = EXAMPLE_PROJECTS.find((x) => x.id === 'ex5-lcd-hello')!;
    expect(ex).toBeDefined();

    const errors: string[] = [];
    const mod = verilatorSandbox.verilator_bin({
      instantiateWasm(imports: any, receiveInstance: any) {
        const inst = new WebAssembly.Instance(verilatorWasmMod, imports);
        receiveInstance(inst);
        return inst.exports;
      },
      noInitialRun: true,
      noExitRuntime: true,
      print: () => {},
      printErr: (s: string) => {
        if (/%Error/i.test(s) && !/Exiting due to \d+/.test(s)) errors.push(s);
      },
      wasmMemory: new WebAssembly.Memory({ initial: 1024, maximum: 16384 }),
    });

    for (const f of ex.files) {
      mod.FS.writeFile(f.name, f.content);
    }
    (mod.callMain || mod.run)([
      '-I.',
      '--cc',
      '-O3',
      '-Wall',
      '-Wno-fatal',
      '--x-assign',
      'fast',
      '--noassert',
      '--pins-sc-biguint',
      '--debug-check',
      '--top-module',
      ex.topModule,
      ...ex.files.map((f) => f.name),
    ]);

    expect(errors).toEqual([]);
    const xml = mod.FS.readFile(`obj_dir/V${ex.topModule}.xml`, { encoding: 'utf8' });
    const parser = new VerilogXMLParser();
    parser.parse(xml);
    const topDef = parser.modules['TOP'];
    const constPool = parser.modules['@CONST-POOL@'];

    const wasmModel = new HDLModuleWASM(topDef, constPool);
    await wasmModel.init();
    wasmModel.powercycle();

    const jsModel = new HDLModuleJS(topDef, constPool);
    jsModel.init();
    jsModel.powercycle();

    const lcdCfg = ex
      .createHardwareConfig()
      .components.find((c): c is LcdCharacterComponentConfig => c.type === 'LCD_CHARACTER')!;

    const wasmLcd = createInitialLcdState();
    const jsLcd = createInitialLcdState();

    for (let cycle = 0; cycle < 80; cycle++) {
      (wasmModel.state as any).CLOCK_50 = 1;
      wasmModel.eval();
      (wasmModel.state as any).CLOCK_50 = 0;
      wasmModel.eval();

      (jsModel.state as any).CLOCK_50 = 1;
      jsModel.eval();
      (jsModel.state as any).CLOCK_50 = 0;
      jsModel.eval();

      stepLcdState(
        wasmLcd,
        extractLcdSample(lcdCfg, (n) => BigInt((wasmModel.state as any)[n] ?? 0))
      );
      stepLcdState(
        jsLcd,
        extractLcdSample(lcdCfg, (n) => BigInt((jsModel.state as any)[n] ?? 0))
      );
    }

    const wView = getLcdDisplayView(wasmLcd);
    const jView = getLcdDisplayView(jsLcd);
    expect(wView.lines[0].join('').trimEnd()).toBe('Hello, FPGA!');
    expect(wView.lines[1].join('').trimEnd()).toBe('16x2 LCD Ready!');
    expect(jView.lines[0].join('').trimEnd()).toBe('Hello, FPGA!');
    expect(jView.lines[1].join('').trimEnd()).toBe('16x2 LCD Ready!');
    expect(wasmLcd.writeCount).toBe(33);
  }, 30000);
});
