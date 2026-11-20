import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFile, guessTopModule, scanProject, validateProject } from '../../project/projectModel';
import { selectFilesForTop } from '../../project/projectCompile';
import { VerilogXMLParser } from '../../vendor/8bitworkshop/hdl/vxmlparser';
import { HDLModuleWASM } from '../../vendor/8bitworkshop/hdl/hdlwasm';
import { HDLModuleJS } from '../../vendor/8bitworkshop/hdl/hdlruntime';
import { binaryenReady } from '../../vendor/8bitworkshop/hdl/binaryen-shim';

let verilatorSandbox: any;
let verilatorWasmMod: WebAssembly.Module;

/** Extract the exact Verilator args list from public/verilator/verilator-worker.js */
function loadWorkerVerilatorFlags(): string[] {
  const workerSrc = fs.readFileSync(
    path.join(process.cwd(), 'public/verilator/verilator-worker.js'),
    'utf8'
  );
  const m = workerSrc.match(/var args = incArgs\.concat\(\[([\s\S]*?)\]\)\.concat\(paths\)/);
  if (!m) throw new Error('Could not locate Verilator args array in verilator-worker.js');
  const flags: string[] = [];
  const strRe = /'([^']+)'/g;
  let sm: RegExpExecArray | null;
  while ((sm = strRe.exec(m[1])) !== null) {
    if (sm[1] !== '--top-module') flags.push(sm[1]);
  }
  return flags;
}

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

describe('testV 4-file SystemVerilog game project (end-to-end)', () => {
  const testVDir = path.join(process.cwd(), 'testV');

  function loadTestVFiles() {
    const names = fs.readdirSync(testVDir).filter((f) => /\.(v|sv|vh|svh)$/i.test(f)).sort();
    return names.map((name) => createFile(name, fs.readFileSync(path.join(testVDir, name), 'utf8')));
  }

  it('scans, orders packages first, validates cleanly, and detects top module "game"', () => {
    const files = loadTestVFiles();
    const modules = scanProject(files);
    const top = guessTopModule(modules);
    expect(top).toBe('game');

    const diags = validateProject({ files, topModule: top });
    expect(diags.filter((d) => d.severity === 'error')).toEqual([]);

    const ordered = selectFilesForTop({ files, topModule: top });
    expect(ordered[0].name).toBe('game_config.sv');
  });

  it('compiles with verilator-worker flags and simulates identically in WASM and JS backends', async () => {
    const files = selectFilesForTop({ files: loadTestVFiles(), topModule: 'game' });
    const flags = loadWorkerVerilatorFlags();
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

    const paths: string[] = [];
    for (const f of files) {
      mod.FS.writeFile(f.name, f.content);
      paths.push(f.name);
    }

    try {
      (mod.callMain || mod.run)(['-I.', ...flags, '--top-module', 'game', ...paths]);
    } catch {
      // ExitStatus on error
    }

    expect(errors).toEqual([]);
    const xml = mod.FS.readFile('obj_dir/Vgame.xml', { encoding: 'utf8' });
    expect(xml.length).toBeGreaterThan(100);

    const parser = new VerilogXMLParser();
    parser.parse(xml);
    const topDef = parser.modules['TOP'];
    const constPool = parser.modules['@CONST-POOL@'];
    expect(topDef).toBeDefined();

    // Run both HDLModuleWASM and HDLModuleJS for 20 clock cycles
    const wasmModel = new HDLModuleWASM(topDef, constPool);
    await wasmModel.init();
    wasmModel.powercycle();

    const jsModel = new HDLModuleJS(topDef, constPool);
    jsModel.init();
    jsModel.powercycle();

    const seenRows = new Set<number>();
    const seenCols = new Set<number>();

    for (let cycle = 0; cycle < 20; cycle++) {
      (wasmModel.state as any).clk = 1;
      wasmModel.eval();
      (wasmModel.state as any).clk = 0;
      wasmModel.eval();

      (jsModel.state as any).clk = 1;
      jsModel.eval();
      (jsModel.state as any).clk = 0;
      jsModel.eval();

      const wRow = (wasmModel.state as any).row & 0xffff;
      const wCol = (wasmModel.state as any).col & 0xffff;
      const jRow = (jsModel.state as any).row & 0xffff;
      const jCol = (jsModel.state as any).col & 0xffff;

      expect(wRow).toBe(jRow);
      expect(wCol).toBe(jCol);

      if (cycle >= 2) {
        seenRows.add(wRow);
        seenCols.add(wCol);
      }
    }

    // Scanning 16 rows should produce multiple distinct one-hot row patterns and non-zero board columns
    expect(seenRows.size).toBeGreaterThanOrEqual(16);
    expect(seenCols.has(0xffff)).toBe(true); // border rows 0, 1, 14, 15 are all 1s
    expect(seenCols.has(0x8001)).toBe(true); // middle rows 3..12 have left+right borders (1000...0001)
  }, 30000);
});
