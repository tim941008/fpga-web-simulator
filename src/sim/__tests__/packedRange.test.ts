import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  getLogicBitWidth,
  getLogicMask32,
  isAscendingRange,
} from '../../vendor/8bitworkshop/hdl/hdltypes';
import { VerilogXMLParser } from '../../vendor/8bitworkshop/hdl/vxmlparser';
import { HDLModuleWASM } from '../../vendor/8bitworkshop/hdl/hdlwasm';
import { HDLModuleJS } from '../../vendor/8bitworkshop/hdl/hdlruntime';
import { binaryenReady } from '../../vendor/8bitworkshop/hdl/binaryen-shim';

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

async function compileBothBackends(svCode: string, top: string) {
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
      if (/%Error/i.test(s)) errors.push(s);
    },
    wasmMemory: new WebAssembly.Memory({ initial: 1024, maximum: 16384 }),
  });

  mod.FS.writeFile(`${top}.sv`, svCode);
  try {
    (mod.callMain || mod.run)([
      '-I.',
      '--cc',
      '-O3',
      '-Wall',
      '-Wno-fatal',
      '-Wno-DECLFILENAME',
      '-Wno-UNUSED',
      '-Wno-EOFNEWLINE',
      '-Wno-PROCASSWIRE',
      '-Wno-WIDTH',
      '-Wno-CASEINCOMPLETE',
      '-Wno-UNDRIVEN',
      '-Wno-PINCONNECTEMPTY',
      '--x-assign',
      'fast',
      '--noassert',
      '--pins-sc-biguint',
      '--debug-check',
      '--top-module',
      top,
      `${top}.sv`,
    ]);
  } catch {
    // non-zero exit captured in errors
  }
  expect(errors).toEqual([]);

  const xml = mod.FS.readFile(`obj_dir/V${top}.xml`, { encoding: 'utf8' });
  const parser = new VerilogXMLParser();
  parser.parse(xml);
  const topDef = parser.modules['TOP'];
  const constPool = parser.modules['@CONST-POOL@'];
  expect(topDef).toBeDefined();

  const wasm = new HDLModuleWASM(topDef, constPool);
  await wasm.init();
  wasm.powercycle();
  wasm.eval();

  const js = new HDLModuleJS(topDef, constPool);
  js.init();
  js.powercycle();
  js.eval();

  return { wasm, js, topDef };
}

describe('HDL packed range helpers (hdltypes)', () => {
  it('computes widths, directions, and masks for ascending and descending ranges', () => {
    expect(getLogicBitWidth({ left: 0, right: 7, signed: false })).toBe(8);
    expect(getLogicBitWidth({ left: 7, right: 0, signed: false })).toBe(8);
    expect(getLogicBitWidth({ left: 0, right: 15, signed: false })).toBe(16);
    expect(getLogicBitWidth({ left: 15, right: 0, signed: false })).toBe(16);
    expect(getLogicBitWidth({ left: 0, right: 31, signed: false })).toBe(32);
    expect(getLogicBitWidth({ left: 31, right: 0, signed: false })).toBe(32);

    expect(isAscendingRange({ left: 0, right: 15, signed: false })).toBe(true);
    expect(isAscendingRange({ left: 15, right: 0, signed: false })).toBe(false);

    expect(getLogicMask32({ left: 0, right: 7, signed: false })).toBe(0xff);
    expect(getLogicMask32({ left: 0, right: 15, signed: false })).toBe(0xffff);
    expect(getLogicMask32({ left: 0, right: 31, signed: false })).toBe(-1);
  });
});

describe('Ascending & descending packed bit ranges (WASM == JS)', () => {
  it('supports [0:7] ascending and [7:0] descending 8-bit vectors with boundary bit-selects and part-selects', async () => {
    const sv = `
      module vec8_test(
        input  wire [0:7] asc_in,
        input  wire [7:0] desc_in,
        output wire [0:7] asc_out,
        output wire [7:0] desc_out,
        output wire       asc_msb,
        output wire       asc_lsb,
        output wire       desc_msb,
        output wire       desc_lsb,
        output wire [0:3] asc_hi,
        output wire [0:3] asc_lo,
        output wire [3:0] desc_hi,
        output wire [3:0] desc_lo
      );
        assign asc_out  = asc_in;
        assign desc_out = desc_in;
        assign asc_msb  = asc_in[0];
        assign asc_lsb  = asc_in[7];
        assign desc_msb = desc_in[7];
        assign desc_lsb = desc_in[0];
        assign asc_hi   = asc_in[0:3];
        assign asc_lo   = asc_in[4:7];
        assign desc_hi  = desc_in[7:4];
        assign desc_lo  = desc_in[3:0];
      endmodule
    `;
    const { wasm, js } = await compileBothBackends(sv, 'vec8_test');
    for (const pat of [0x81, 0xa5, 0x3c, 0xf0]) {
      for (const m of [wasm, js]) {
        m.state.asc_in = pat;
        m.state.desc_in = pat;
        m.eval();
        expect(m.state.asc_out).toBe(pat);
        expect(m.state.desc_out).toBe(pat);
        expect(m.state.asc_msb).toBe((pat >> 7) & 1);
        expect(m.state.asc_lsb).toBe(pat & 1);
        expect(m.state.desc_msb).toBe((pat >> 7) & 1);
        expect(m.state.desc_lsb).toBe(pat & 1);
        expect(m.state.asc_hi).toBe((pat >> 4) & 0xf);
        expect(m.state.asc_lo).toBe(pat & 0xf);
        expect(m.state.desc_hi).toBe((pat >> 4) & 0xf);
        expect(m.state.desc_lo).toBe(pat & 0xf);
      }
    }
    wasm.dispose?.();
  });

  it('supports [0:15] ascending and [15:0] descending 16-bit vectors without 8-bit truncation', async () => {
    const sv = `
      module vec16_test(
        input  wire [0:15] asc_in,
        input  wire [15:0] desc_in,
        output wire [0:15] asc_out,
        output wire [15:0] desc_out,
        output wire        asc_b0_msb,
        output wire        asc_b15_lsb,
        output wire        desc_b15_msb,
        output wire        desc_b0_lsb,
        output wire [0:7]  asc_hi_byte,
        output wire [0:7]  asc_lo_byte,
        output wire [7:0]  desc_hi_byte,
        output wire [7:0]  desc_lo_byte
      );
        assign asc_out      = asc_in;
        assign desc_out     = desc_in;
        assign asc_b0_msb   = asc_in[0];
        assign asc_b15_lsb  = asc_in[15];
        assign desc_b15_msb = desc_in[15];
        assign desc_b0_lsb  = desc_in[0];
        assign asc_hi_byte  = asc_in[0:7];
        assign asc_lo_byte  = asc_in[8:15];
        assign desc_hi_byte = desc_in[15:8];
        assign desc_lo_byte = desc_in[7:0];
      endmodule
    `;
    const { wasm, js } = await compileBothBackends(sv, 'vec16_test');
    for (const pat of [0x8001, 0xa53c, 0xf00f, 0xffff]) {
      for (const m of [wasm, js]) {
        m.state.asc_in = pat;
        m.state.desc_in = pat;
        m.eval();
        expect(m.state.asc_out).toBe(pat);
        expect(m.state.desc_out).toBe(pat);
        expect(m.state.asc_b0_msb).toBe((pat >> 15) & 1);
        expect(m.state.asc_b15_lsb).toBe(pat & 1);
        expect(m.state.desc_b15_msb).toBe((pat >> 15) & 1);
        expect(m.state.desc_b0_lsb).toBe(pat & 1);
        expect(m.state.asc_hi_byte).toBe((pat >> 8) & 0xff);
        expect(m.state.asc_lo_byte).toBe(pat & 0xff);
        expect(m.state.desc_hi_byte).toBe((pat >> 8) & 0xff);
        expect(m.state.desc_lo_byte).toBe(pat & 0xff);
      }
    }
    wasm.dispose?.();
  });

  it('supports [0:31] ascending and [31:0] descending 32-bit vectors', async () => {
    const sv = `
      module vec32_test(
        input  wire [0:31] asc_in,
        input  wire [31:0] desc_in,
        output wire [0:31] asc_out,
        output wire [31:0] desc_out,
        output wire        asc_msb,
        output wire        asc_lsb,
        output wire [0:15] asc_hi,
        output wire [0:15] asc_lo
      );
        assign asc_out  = asc_in;
        assign desc_out = desc_in;
        assign asc_msb  = asc_in[0];
        assign asc_lsb  = asc_in[31];
        assign asc_hi   = asc_in[0:15];
        assign asc_lo   = asc_in[16:31];
      endmodule
    `;
    const { wasm, js } = await compileBothBackends(sv, 'vec32_test');
    for (const pat of [0x80000001, 0xa53cf00f, 0xf00f8001]) {
      for (const m of [wasm, js]) {
        m.state.asc_in = pat;
        m.state.desc_in = pat;
        m.eval();
        expect(m.state.asc_out >>> 0).toBe(pat >>> 0);
        expect(m.state.desc_out >>> 0).toBe(pat >>> 0);
        expect(m.state.asc_msb).toBe((pat >>> 31) & 1);
        expect(m.state.asc_lsb).toBe(pat & 1);
        expect(m.state.asc_hi).toBe((pat >>> 16) & 0xffff);
        expect(m.state.asc_lo).toBe(pat & 0xffff);
      }
    }
    wasm.dispose?.();
  });

  it('preserves full 16-bit values in unpacked arrays of ascending [0:15] vectors (no Uint8Array truncation)', async () => {
    const sv = `
      module arr_asc16_test(
        input  wire        clk,
        input  wire [1:0]  idx,
        output reg  [0:15] out_val
      );
        reg [0:15] mem [0:3];
        initial begin
          mem[0] = 16'hFFFF;
          mem[1] = 16'h8001;
          mem[2] = 16'hA53C;
          mem[3] = 16'hF00F;
        end
        always @(posedge clk) begin
          out_val <= mem[idx];
        end
      endmodule
    `;
    const { wasm, js } = await compileBothBackends(sv, 'arr_asc16_test');
    const expected = [0xffff, 0x8001, 0xa53c, 0xf00f];
    for (let i = 0; i < 4; i++) {
      for (const m of [wasm, js]) {
        m.state.idx = i;
        m.state.clk = 1;
        m.eval();
        m.state.clk = 0;
        m.eval();
        expect(m.state.out_val).toBe(expected[i]);
      }
    }
    wasm.dispose?.();
  });

  it('supports signed and unsigned ascending/descending 16-bit vectors and mixed ports', async () => {
    const sv = `
      module signed_mixed_test(
        input  wire signed [0:15] s_asc,
        input  wire signed [15:0] s_desc,
        input  wire        [0:15] u_asc,
        output wire signed [31:0] s_asc_ext,
        output wire signed [31:0] s_desc_ext,
        output wire        [15:0] mixed_desc_out,
        output wire        [0:15] mixed_asc_out
      );
        assign s_asc_ext      = s_asc;
        assign s_desc_ext     = s_desc;
        assign mixed_desc_out = u_asc;
        assign mixed_asc_out  = s_desc;
      endmodule
    `;
    const { wasm, js } = await compileBothBackends(sv, 'signed_mixed_test');
    for (const pat of [0x8001, 0xa53c, 0x700f, 0xf00f]) {
      const signExt32 = (pat & 0x8000 ? pat | 0xffff0000 : pat) >>> 0;
      for (const m of [wasm, js]) {
        m.state.s_asc = pat;
        m.state.s_desc = pat;
        m.state.u_asc = pat;
        m.eval();
        expect(m.state.s_asc_ext >>> 0).toBe(signExt32);
        expect(m.state.s_desc_ext >>> 0).toBe(signExt32);
        expect(m.state.mixed_desc_out).toBe(pat);
        expect(m.state.mixed_asc_out).toBe(pat);
      }
    }
    wasm.dispose?.();
  });
});
