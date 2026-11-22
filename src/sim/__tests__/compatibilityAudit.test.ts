import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  createFile,
  guessTopModule,
  scanProject,
  validateProject,
} from '../../project/projectModel';
import { selectFilesForTop } from '../../project/projectCompile';
import {
  entriesFromDataTransfer,
  entriesFromFiles,
  unzipProject,
} from '../../project/projectImport';
import { parseVerilogSource } from '../../parsers/verilogParser';
import { VerilogXMLParser } from '../../vendor/8bitworkshop/hdl/vxmlparser';
import { HDLModuleWASM } from '../../vendor/8bitworkshop/hdl/hdlwasm';
import { HDLModuleJS } from '../../vendor/8bitworkshop/hdl/hdlruntime';
import { binaryenReady } from '../../vendor/8bitworkshop/hdl/binaryen-shim';

let verilatorSandbox: any;
let verilatorWasmMod: WebAssembly.Module;

function loadWorkerFlags(): string[] {
  const workerSrc = fs.readFileSync(
    path.join(process.cwd(), 'public/verilator/verilator-worker.js'),
    'utf8'
  );
  const m = workerSrc.match(/var args = incArgs\.concat\(\[([\s\S]*?)\]\)\.concat\(paths\)/);
  if (!m) throw new Error('Missing args in verilator-worker.js');
  const flags: string[] = [];
  const strRe = /'([^']+)'/g;
  let sm: RegExpExecArray | null;
  while ((sm = strRe.exec(m[1])) !== null) {
    if (sm[1] !== '--top-module') flags.push(sm[1]);
  }
  return flags;
}

async function compileAndRun(
  rawFiles: Array<{ name: string; content: string }>,
  topModule: string
) {
  const projFiles = rawFiles.map((f) => createFile(f.name, f.content));
  const diags = validateProject({ files: projFiles, topModule });
  const ordered = selectFilesForTop({ files: projFiles, topModule });
  const flags = loadWorkerFlags();
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
  const incDirs = new Set<string>();
  for (const f of ordered) {
    const segs = f.name
      .replace(/\\/g, '/')
      .split('/')
      .filter((s) => s && s !== '.' && s !== '..')
      .map((s) => s.replace(/[^A-Za-z0-9_.-]/g, '_'));
    let dir = '';
    for (let i = 0; i < segs.length - 1; i++) {
      dir = dir ? `${dir}/${segs[i]}` : segs[i];
      try {
        mod.FS.mkdir(dir);
      } catch {
        // exists
      }
    }
    const safe = segs.join('/');
    mod.FS.writeFile(safe, f.content);
    if (dir) incDirs.add(dir);
    if (/\.(v|sv)$/i.test(safe)) paths.push(safe);
  }

  const incArgs = ['-I.', ...[...incDirs].map((d) => `-I${d}`)];
  try {
    (mod.callMain || mod.run)([...incArgs, ...flags, '--top-module', topModule, ...paths]);
  } catch {
    // ExitStatus
  }

  if (errors.length > 0) {
    return { ok: false as const, errors, diags, wasm: null, js: null };
  }

  const xml = mod.FS.readFile(`obj_dir/V${topModule}.xml`, { encoding: 'utf8' });
  const parser = new VerilogXMLParser();
  parser.parse(xml);
  const topDef = parser.modules['TOP'];
  const constPool = parser.modules['@CONST-POOL@'];

  let wasmModel: HDLModuleWASM | null = null;
  let wasmErr: string | null = null;
  try {
    wasmModel = new HDLModuleWASM(topDef, constPool);
    await wasmModel.init();
    wasmModel.powercycle();
  } catch (e) {
    wasmErr = String((e as Error)?.message ?? e);
    wasmModel = null;
  }

  let jsModel: HDLModuleJS | null = null;
  let jsErr: string | null = null;
  try {
    jsModel = new HDLModuleJS(topDef, constPool);
    jsModel.init();
    jsModel.powercycle();
  } catch (e) {
    jsErr = String((e as Error)?.message ?? e);
    jsModel = null;
  }

  return { ok: true as const, errors, diags, wasm: wasmModel, js: jsModel, wasmErr, jsErr };
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

describe('Large FPGA Project Compatibility Audit', () => {
  it('1 & 2. package + import package::* (even when consumer precedes provider)', async () => {
    const res = await compileAndRun(
      [
        {
          name: 'top_pkg_test.sv',
          content: `import defs_pkg::*;
module top_pkg_test (
  input  logic [7:0] a,
  output logic [7:0] y
);
  assign y = a + OFFSET;
endmodule`,
        },
        {
          name: 'defs_pkg.sv',
          content: `package defs_pkg;
  localparam logic [7:0] OFFSET = 8'h15;
endpackage`,
        },
      ],
      'top_pkg_test'
    );
    expect(res.ok).toBe(true);
    expect(res.wasm).not.toBeNull();
    expect(res.js).not.toBeNull();
    (res.wasm!.state as any).a = 0x10;
    res.wasm!.eval();
    (res.js!.state as any).a = 0x10;
    res.js!.eval();
    expect((res.wasm!.state as any).y).toBe(0x25);
    expect((res.js!.state as any).y).toBe(0x25);
  });

  it('3a. typedef scalar packed vector (typedef logic [7:0] byte_t)', async () => {
    const res = await compileAndRun(
      [
        {
          name: 'types_pkg.sv',
          content: `package types_pkg;
  typedef logic [7:0] byte_t;
endpackage`,
        },
        {
          name: 'top_typedef_scalar.sv',
          content: `import types_pkg::*;
module top_typedef_scalar (
  input  byte_t a,
  output byte_t y
);
  assign y = a ^ 8'hFF;
endmodule`,
        },
      ],
      'top_typedef_scalar'
    );
    expect(res.ok).toBe(true);
    expect(res.wasm).not.toBeNull();
    expect(res.js).not.toBeNull();
    (res.wasm!.state as any).a = 0x0f;
    res.wasm!.eval();
    expect((res.wasm!.state as any).y).toBe(0xf0);
  });

  it('3b. typedef enum (without struct)', async () => {
    const res = await compileAndRun(
      [
        {
          name: 'enum_pkg.sv',
          content: `package enum_pkg;
  typedef enum logic [1:0] { IDLE = 2'd0, RUN = 2'd1, DONE = 2'd2 } state_t;
endpackage`,
        },
        {
          name: 'top_typedef_enum.sv',
          content: `import enum_pkg::*;
module top_typedef_enum (
  input  logic clk,
  input  logic go,
  output logic [1:0] state_out
);
  state_t st = IDLE;
  always_ff @(posedge clk) begin
    if (go) st <= RUN;
    else st <= DONE;
  end
  assign state_out = st;
endmodule`,
        },
      ],
      'top_typedef_enum'
    );
    expect(res.ok).toBe(true);
    expect(res.wasm).not.toBeNull();
    (res.wasm!.state as any).go = 1;
    (res.wasm!.state as any).clk = 1;
    res.wasm!.eval();
    expect((res.wasm!.state as any).state_out & 0x3).toBe(1);
  });

  it('3c. typedef struct packed throws CompileError in VerilogXMLParser (vxmlparser.ts:443)', async () => {
    await expect(
      compileAndRun(
        [
          {
            name: 'struct_pkg.sv',
            content: `package struct_pkg;
  typedef struct packed {
    logic [3:0] hi;
    logic [3:0] lo;
  } nibble_pair_t;
endpackage`,
          },
          {
            name: 'top_typedef_struct.sv',
            content: `import struct_pkg::*;
module top_typedef_struct (
  input  logic [3:0] a,
  output logic [7:0] out_bus
);
  nibble_pair_t pkt;
  always_comb begin
    pkt.hi = a;
    pkt.lo = 4'hA;
    out_bus = pkt;
  end
endmodule`,
          },
        ],
        'top_typedef_struct'
      )
    ).rejects.toThrow(/structs not supported/);
  });

  it('4. include .vh and .svh (root and nested include folder)', async () => {
    const res = await compileAndRun(
      [
        {
          name: 'inc/consts.svh',
          content: `localparam logic [7:0] MAGIC_SVH = 8'h42;`,
        },
        {
          name: 'legacy.vh',
          content: `\`define LEGACY_ADD 8'h08`,
        },
        {
          name: 'top_inc.sv',
          content: `\`include "legacy.vh"
module top_inc (
  input  logic [7:0] in_val,
  output logic [7:0] out_val
);
  \`include "consts.svh"
  assign out_val = in_val + MAGIC_SVH + \`LEGACY_ADD;
endmodule`,
        },
      ],
      'top_inc'
    );
    expect(res.ok).toBe(true);
    expect(res.wasm).not.toBeNull();
    (res.wasm!.state as any).in_val = 0x10;
    res.wasm!.eval();
    expect((res.wasm!.state as any).out_val).toBe(0x5a);
  });

  it('5. nested folders (rtl/pkg, rtl/sub, inc) + scanProject + selectFilesForTop', async () => {
    const files = [
      {
        name: 'rtl/pkg/bus_pkg.sv',
        content: `package bus_pkg;
  localparam int W = 8;
endpackage`,
      },
      {
        name: 'rtl/sub/adder.sv',
        content: `import bus_pkg::*;
module adder (input logic [W-1:0] x, output logic [W-1:0] y);
  assign y = x + 8'd1;
endmodule`,
      },
      {
        name: 'rtl/top_nested.sv',
        content: `import bus_pkg::*;
module top_nested (input logic [W-1:0] a, output logic [W-1:0] b);
  adder u_add (.x(a), .y(b));
endmodule`,
      },
    ];
    const mods = scanProject(files.map((f) => createFile(f.name, f.content)));
    expect(guessTopModule(mods)).toBe('top_nested');

    const res = await compileAndRun(files, 'top_nested');
    expect(res.ok).toBe(true);
    expect(res.wasm).not.toBeNull();
    (res.wasm!.state as any).a = 9;
    res.wasm!.eval();
    expect((res.wasm!.state as any).b).toBe(10);
  });

  it('6. recursive folder import (webkitRelativePath, DataTransfer walk, ZIP extraction)', async () => {
    // 6a. FileList with webkitRelativePath
    const makeRelFile = (rel: string, text: string) =>
      ({
        name: rel.split('/').pop()!,
        webkitRelativePath: rel,
        size: text.length,
        text: async () => text,
        arrayBuffer: async () => strToU8(text).buffer,
      }) as unknown as File;

    const importedRel = await entriesFromFiles([
      makeRelFile('my_proj/rtl/pkg/p.sv', 'package p; endpackage'),
      makeRelFile('my_proj/rtl/top.sv', 'module top; endmodule'),
      makeRelFile('my_proj/.git/config', 'ignored'),
    ]);
    expect(importedRel.map((e) => e.name).sort()).toEqual(['rtl/pkg/p.sv', 'rtl/top.sv']);

    // 6b. DataTransfer recursive directory walk
    const makeEntry = (name: string, fullPath: string, content?: string, children?: any[]): any => ({
      isFile: content !== undefined,
      isDirectory: children !== undefined,
      name,
      fullPath,
      file: content !== undefined ? (cb: (f: File) => void) => cb(makeRelFile(name, content)) : undefined,
      createReader: children
        ? () => {
            let done = false;
            return {
              readEntries: (cb: (entries: any[]) => void) => {
                if (done) cb([]);
                else {
                  done = true;
                  cb(children);
                }
              },
            };
          }
        : undefined,
    });
    const rootDir = makeEntry('fpga_root', '/fpga_root', undefined, [
      makeEntry('sub', '/fpga_root/sub', undefined, [
        makeEntry('leaf.sv', '/fpga_root/sub/leaf.sv', 'module leaf; endmodule'),
      ]),
      makeEntry('top.v', '/fpga_root/top.v', 'module top; leaf u(); endmodule'),
    ]);
    const dt = {
      items: [{ webkitGetAsEntry: () => rootDir }],
      files: [],
    } as unknown as DataTransfer;
    const importedDrop = await entriesFromDataTransfer(dt);
    expect(importedDrop.map((e) => e.name).sort()).toEqual(['sub/leaf.sv', 'top.v']);

    // 6c. Nested ZIP extraction
    const zipped = zipSync({
      'proj/inc/a.vh': strToU8('`define X 1'),
      'proj/src/top.v': strToU8('module top; endmodule'),
    });
    const importedZip = unzipProject(zipped);
    expect(importedZip.map((e) => e.name).sort()).toEqual(['inc/a.vh', 'src/top.v']);
  });

  it('7. generate-for (structural unrolling & submodule instantiation)', async () => {
    const res = await compileAndRun(
      [
        {
          name: 'inv1.v',
          content: `module inv1 (input wire a, output wire y);
  assign y = ~a;
endmodule`,
        },
        {
          name: 'top_gen_for.v',
          content: `module top_gen_for (
  input  wire [7:0] d_in,
  output wire [7:0] d_out
);
  genvar i;
  generate
    for (i = 0; i < 8; i = i + 1) begin : gen_inv
      inv1 u_inv (.a(d_in[i]), .y(d_out[i]));
    end
  endgenerate
endmodule`,
        },
      ],
      'top_gen_for'
    );
    expect(res.ok).toBe(true);
    expect(res.wasm).not.toBeNull();
    (res.wasm!.state as any).d_in = 0x5a;
    res.wasm!.eval();
    expect((res.wasm!.state as any).d_out).toBe(0xa5);
  });

  it('8. generate-if (conditional hardware & conditional module instantiation)', async () => {
    const res = await compileAndRun(
      [
        {
          name: 'add_mode.v',
          content: `module add_mode (input wire [7:0] a, output wire [7:0] y);
  assign y = a + 8'd10;
endmodule`,
        },
        {
          name: 'sub_mode.v',
          content: `module sub_mode (input wire [7:0] a, output wire [7:0] y);
  assign y = a - 8'd10;
endmodule`,
        },
        {
          name: 'top_gen_if.v',
          content: `module top_gen_if #(parameter USE_ADD = 1) (
  input  wire [7:0] a,
  output wire [7:0] y
);
  generate
    if (USE_ADD) begin : gen_a
      add_mode u_add (.a(a), .y(y));
    end else begin : gen_s
      sub_mode u_sub (.a(a), .y(y));
    end
  endgenerate
endmodule`,
        },
      ],
      'top_gen_if'
    );
    expect(res.ok).toBe(true);
    expect(res.wasm).not.toBeNull();
    (res.wasm!.state as any).a = 20;
    res.wasm!.eval();
    expect((res.wasm!.state as any).y).toBe(30);
  });

  it('9. parameterized module instantiation (Verilator simulation + fallback verilogParser)', async () => {
    const childSrc = `module param_reg #(parameter W = 8, parameter [W-1:0] INIT = 0) (
  input  wire         clk,
  input  wire [W-1:0] d,
  output reg  [W-1:0] q = INIT
);
  always @(posedge clk) q <= d;
endmodule`;
    const topSrc = `module top_param #(parameter WIDTH = 12) (
  input  wire             clk,
  input  wire [WIDTH-1:0] d,
  output wire [WIDTH-1:0] q
);
  param_reg #(.W(WIDTH), .INIT(12'h321)) u_reg (.clk(clk), .d(d), .q(q));
endmodule`;

    // Check fallback verilogParser on parameterized ports
    const parsed = parseVerilogSource([childSrc, topSrc], 'top_param');
    const qPort = parsed.ports.find((p) => p.name === 'q');
    expect(parsed.topModule).toBe('top_param');
    expect(qPort?.width).toBe(12);

    const res = await compileAndRun(
      [
        { name: 'param_reg.v', content: childSrc },
        { name: 'top_param.v', content: topSrc },
      ],
      'top_param'
    );
    expect(res.ok).toBe(true);
    expect(res.wasm).not.toBeNull();
    expect((res.wasm!.state as any).q).toBe(0x321);
    (res.wasm!.state as any).d = 0xabc;
    (res.wasm!.state as any).clk = 1;
    res.wasm!.eval();
    (res.wasm!.state as any).clk = 0;
    res.wasm!.eval();
    expect((res.wasm!.state as any).q).toBe(0xabc);
  });
});
