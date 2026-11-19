import { describe, expect, it } from 'vitest';
import {
  addFiles,
  deleteFile,
  findTopCandidates,
  guessTopModule,
  makeProject,
  renameFile,
  replaceFile,
  scanPackageImports,
  scanPackages,
  scanProject,
  validateProject,
  hasErrors,
  createFile,
  VerilogProject,
} from '../projectModel';
import { compileProject, Compiler, selectFilesForTop } from '../projectCompile';
import {
  entriesFromFiles,
  filterEntries,
  isAcceptedPath,
  unzipProject,
} from '../projectImport';
import { zipSync, strToU8 } from 'fflate';
import { EXAMPLE_PROJECTS } from '../../presets/exampleProjects';
import { SAMPLE_PRESETS } from '../../presets/sampleDesigns';
import type { CompileResult } from '../../sim/fpgaRuntime';

const COUNTER = `module counter(input clk, output reg [7:0] q);
  always @(posedge clk) q <= q + 1;
endmodule`;
const DECODER = `module decoder(input [3:0] v, output reg [6:0] seg);
  always @(*) seg = {3'b0, v};
endmodule`;
const TOP2 = `module top(input clk, output [7:0] q);
  counter u0 (.clk(clk), .q(q));
endmodule`;
const TOP3 = `module top(input clk, output [7:0] q, output [6:0] seg);
  counter u0 (.clk(clk), .q(q));
  decoder #(.X(1)) u1 (.v(q[3:0]), .seg(seg));
endmodule`;

const codes = (p: VerilogProject) => validateProject(p).map((d) => d.code);

describe('multi-file project compile (validation + dispatch)', () => {
  const fakeResult = (): CompileResult => ({
    runtime: null,
    messages: [],
    log: [],
    timings: { verilatorMs: 0, codegenMs: 0 },
  });

  it('two-file project passes validation and sends both files + top to the compiler', async () => {
    const project = makeProject(
      [
        { name: 'top.v', content: TOP2 },
        { name: 'counter.v', content: COUNTER },
      ],
      'top'
    );
    let seen: { files: string[]; top: string } | null = null;
    const compiler: Compiler = async (files, top) => {
      seen = { files: files.map((f) => f.name), top };
      return fakeResult();
    };
    const out = await compileProject(project, compiler);
    expect(hasErrors(out.diagnostics)).toBe(false);
    expect(seen).toEqual({ files: ['top.v', 'counter.v'], top: 'top' });
  });

  it('three-file project (incl. a header) compiles every file together', async () => {
    const project = makeProject(
      [
        { name: 'top.v', content: TOP3 },
        { name: 'counter.v', content: COUNTER },
        { name: 'sub/decoder.v', content: DECODER },
        { name: 'defines.vh', content: '`define X 1' },
      ],
      'top'
    );
    expect(codes(project)).toEqual([]);
    let names: string[] = [];
    await compileProject(project, async (files) => {
      names = files.map((f) => f.name);
      return fakeResult();
    });
    expect(names).toEqual(['top.v', 'counter.v', 'sub/decoder.v', 'defines.vh']);
  });

  it('does not invoke Verilator when validation has hard errors (MISSING_TOP / NO_SOURCES)', async () => {
    const project = makeProject([{ name: 'top.v', content: TOP2 }], 'nonexistent_top');
    let called = false;
    const out = await compileProject(project, async () => {
      called = true;
      return fakeResult();
    });
    expect(called).toBe(false);
    expect(out.result).toBeNull();
    expect(out.messages.some((m) => m.severity === 'error' && /Missing top module/.test(m.msg))).toBe(true);
  });

  it('invokes Verilator when regex-inferred diagnostics are warning-level only (CRIT-02)', async () => {
    const project = makeProject([{ name: 'top.v', content: TOP2 }], 'top'); // counter missing -> warning only
    let called = false;
    const out = await compileProject(project, async () => {
      called = true;
      return fakeResult();
    });
    expect(called).toBe(true);
    expect(out.result).not.toBeNull();
    expect(hasErrors(out.diagnostics)).toBe(false);
    expect(out.messages.some((m) => m.severity === 'warning' && /counter/.test(m.msg))).toBe(true);
  });

  it('preserves generate/ifdef submodule files and does not block on unrelated tb.v (CRIT-02)', async () => {
    const genTop = `module top(input [3:0] a, output [3:0] y);
      genvar i;
      generate
        for (i = 0; i < 4; i = i + 1) begin : g
          inv_cell u_inv (.a(a[i]), .y(y[i]));
        end
      endgenerate
    endmodule`;
    const inv = `module inv_cell(input a, output y); assign y = ~a; endmodule`;
    const tb = `module tb; top dut(); missing_sim_helper u_h(); endmodule`;
    const project = makeProject(
      [
        { name: 'top.v', content: genTop },
        { name: 'inv_cell.v', content: inv },
        { name: 'tb.v', content: tb },
      ],
      'top'
    );
    let sentFiles: string[] = [];
    const out = await compileProject(project, async (files) => {
      sentFiles = files.map((f) => f.name);
      return fakeResult();
    });
    expect(hasErrors(out.diagnostics)).toBe(false);
    expect(sentFiles).toContain('top.v');
    expect(sentFiles).toContain('inv_cell.v');
    // tb.v is a strict ancestor of top, so it is excluded to avoid Verilator --top-module errors
    expect(sentFiles).not.toContain('tb.v');
  });
});

describe('top module selection', () => {
  const files = [
    { name: 'counter.v', content: COUNTER },
    { name: 'decoder.v', content: DECODER },
    { name: 'top_fpga.v', content: TOP3.replace('module top', 'module top_fpga') },
  ];

  it('discovers all modules across files', () => {
    const mods = scanProject(makeProject(files).files).map((m) => m.name);
    expect(mods).toEqual(['counter', 'decoder', 'top_fpga']);
  });

  it('auto-detects the uninstantiated root (not necessarily named "top")', () => {
    const mods = scanProject(makeProject(files).files);
    expect(findTopCandidates(mods)).toEqual(['top_fpga']);
    expect(guessTopModule(mods)).toBe('top_fpga');
  });

  it('allows manually selecting any existing module', () => {
    const p = makeProject(files, 'counter');
    expect(p.topModule).toBe('counter');
    expect(codes(p)).not.toContain('MISSING_TOP');
  });

  it('reports MISSING_TOP when the selected module does not exist', () => {
    const p = makeProject(files, 'nonexistent');
    const d = validateProject(p).find((x) => x.code === 'MISSING_TOP');
    expect(d?.severity).toBe('error');
    expect(d?.message).toMatch(/Missing top module/);
  });

  it('reports MISSING_TOP when no top is selected', () => {
    expect(codes({ ...makeProject(files), topModule: '' })).toContain('MISSING_TOP');
  });
});

describe('diagnostics', () => {
  it('detects a missing (undefined) module', () => {
    const p = makeProject([{ name: 'top.v', content: TOP3 }, { name: 'counter.v', content: COUNTER }], 'top');
    const missing = validateProject(p).filter((d) => d.code === 'MISSING_MODULE');
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toContain('decoder');
    expect(missing[0].file).toBe('top.v');
  });

  it('detects duplicate module definitions across files', () => {
    const p = makeProject(
      [
        { name: 'top.v', content: TOP2 },
        { name: 'counter.v', content: COUNTER },
        { name: 'counter_old.v', content: COUNTER },
      ],
      'top'
    );
    const dup = validateProject(p).filter((d) => d.code === 'DUPLICATE_MODULE');
    expect(dup).toHaveLength(1);
    expect(dup[0].message).toMatch(/counter.*counter_old\.v/);
  });

  it('detects circular references', () => {
    const a = `module a(input x); b ib(.x(x)); endmodule`;
    const b = `module b(input x); a ia(.x(x)); endmodule`;
    const p = makeProject([{ name: 'a.v', content: a }, { name: 'b.v', content: b }], 'a');
    const c = validateProject(p).find((d) => d.code === 'CIRCULAR_REFERENCE');
    expect(c).toBeDefined();
    expect(c!.message).toMatch(/a.*b.*a|b.*a.*b/);
  });

  it('does not report a false MISSING_MODULE for a self-named instance', () => {
    const a = `module a(input x); a inner(.x(x)); endmodule`;
    // self-instantiation is ignored by the scanner (name === module name), so no false MISSING_MODULE
    expect(codes(makeProject([{ name: 'a.v', content: a }], 'a'))).not.toContain('MISSING_MODULE');
  });

  it('warns about unresolved `include files', () => {
    const v = '`include "defs.vh"\nmodule m(input a); endmodule';
    const d = validateProject(makeProject([{ name: 'm.v', content: v }], 'm'));
    expect(d.find((x) => x.code === 'MISSING_INCLUDE')?.severity).toBe('warning');
    const ok = validateProject(
      makeProject([{ name: 'm.v', content: v }, { name: 'inc/defs.vh', content: '' }], 'm')
    );
    expect(ok.find((x) => x.code === 'MISSING_INCLUDE')).toBeUndefined();
  });

  it('ignores comments and primitives when scanning', () => {
    const v = `module m(input a, b, output y);
      // foo bar (x);
      /* baz qux (y); */
      and g1 (y, a, b);
    endmodule`;
    expect(codes(makeProject([{ name: 'm.v', content: v }], 'm'))).toEqual([]);
  });

  it('errors when the project has no sources', () => {
    expect(codes({ files: [createFile('x.hex', '00')], topModule: 'top' })).toEqual(['NO_SOURCES']);
  });

  it('supports SystemVerilog (.sv) in mixed projects', () => {
    const p = makeProject(
      [{ name: 'top.sv', content: TOP2 }, { name: 'counter.v', content: COUNTER }],
      'top'
    );
    expect(codes(p)).toEqual([]);
  });
});

describe('project explorer operations', () => {
  const base = makeProject([
    { name: 'top.v', content: TOP2 },
    { name: 'counter.v', content: COUNTER },
  ]);

  it('renames, rejecting collisions and empty names', () => {
    const [top, counter] = base.files;
    expect(renameFile(base.files, counter.id, 'cnt.v').files[1].name).toBe('cnt.v');
    expect(renameFile(base.files, counter.id, 'top.v').error).toMatch(/already exists/);
    expect(renameFile(base.files, top.id, '  ').error).toBeDefined();
  });

  it('deletes a file and the dependency is then reported missing', () => {
    const files = deleteFile(base.files, base.files[1].id);
    expect(files).toHaveLength(1);
    expect(codes({ files, topModule: 'top' })).toContain('MISSING_MODULE');
  });

  it('replaces content without changing id/name', () => {
    const f = base.files[1];
    const files = replaceFile(base.files, f.id, 'module counter(); endmodule');
    expect(files[1].id).toBe(f.id);
    expect(files[1].name).toBe('counter.v');
    expect(files[1].content).toContain('counter()');
  });

  it('addFiles appends new files and overwrites same-path files', () => {
    const files = addFiles(base.files, [
      { name: 'counter.v', content: 'X' },
      { name: 'new.v', content: 'Y' },
    ]);
    expect(files.map((f) => f.name)).toEqual(['top.v', 'counter.v', 'new.v']);
    expect(files[1].content).toBe('X');
    expect(files[1].id).toBe(base.files[1].id);
  });
});

describe('import filtering', () => {
  it('drops hidden / OS junk and strips a shared top folder', () => {
    const out = filterEntries([
      { name: 'project/top.v', content: 'a' },
      { name: 'project/sub/alu.v', content: 'b' },
      { name: 'project/.git/config', content: 'x' },
      { name: '__MACOSX/project/._top.v', content: 'x' },
      { name: 'project/readme.md', content: 'x' },
    ]);
    expect(out.map((e) => e.name)).toEqual(['top.v', 'sub/alu.v']);
  });

  it('keeps flat file selections untouched', () => {
    const out = filterEntries([
      { name: 'top.v', content: '' },
      { name: 'counter.v', content: '' },
      { name: 'defs.vh', content: '' },
    ]);
    expect(out.map((e) => e.name)).toEqual(['top.v', 'counter.v', 'defs.vh']);
  });

  it('rejects unsupported extensions and traversal paths early (MAJ-01)', () => {
    expect(isAcceptedPath('src/top.v')).toBe(true);
    expect(isAcceptedPath('.git/config')).toBe(false);
    expect(isAcceptedPath('../evil.v')).toBe(false);
    expect(isAcceptedPath('assets/big.bin')).toBe(false);
  });

  it('throws a friendly error on corrupt ZIP data and enforces ZIP limits (MAJ-01)', () => {
    expect(() => unzipProject(new Uint8Array([1, 2, 3, 4]))).toThrow(/Failed to extract ZIP archive/);

    const zipBytes = zipSync({
      'a.v': strToU8('module a; endmodule'),
      'b.v': strToU8('module b; endmodule'),
      'c.v': strToU8('module c; endmodule'),
    });
    expect(unzipProject(zipBytes).map((e) => e.name)).toEqual(['a.v', 'b.v', 'c.v']);
    expect(() => unzipProject(zipBytes, { maxFiles: 2 })).toThrow(/maximum allowed file count/i);
    expect(() => unzipProject(zipBytes, { maxTotalBytes: 10 })).toThrow(/exceeds/i);
  });

  it('skips unsupported files before reading content and enforces limits in entriesFromFiles (MAJ-01)', async () => {
    let readUnsupported = false;
    const fakeUnsupported = {
      name: 'huge.bin',
      size: 999_999_999,
      text: async () => {
        readUnsupported = true;
        return '';
      },
    } as unknown as File;
    const fakeValid = {
      name: 'top.v',
      size: 20,
      text: async () => 'module top; endmodule',
    } as unknown as File;

    const entries = await entriesFromFiles([fakeUnsupported, fakeValid]);
    expect(readUnsupported).toBe(false);
    expect(entries.map((e) => e.name)).toEqual(['top.v']);

    await expect(
      entriesFromFiles([fakeValid, fakeValid], { maxFiles: 1 })
    ).rejects.toThrow(/maximum allowed file count/i);
  });
});

describe('example projects', () => {
  for (const ex of EXAMPLE_PROJECTS) {
    it(`${ex.id} validates cleanly with its declared top "${ex.topModule}"`, () => {
      const p = makeProject(ex.files, ex.topModule);
      expect(validateProject(p)).toEqual([]);
      expect(guessTopModule(scanProject(p.files))).toBe(ex.topModule);
    });
  }

  for (const preset of SAMPLE_PRESETS) {
    it(`preset ${preset.id} (${preset.verilogFilename}) validates with zero false-positive missing modules`, () => {
      const p = makeProject([{ name: preset.verilogFilename, content: preset.verilogCode }]);
      expect(validateProject(p)).toEqual([]);
    });
  }
});

describe('SystemVerilog package / import scanning and dependency ordering', () => {
  const fakeResult = (): CompileResult => ({
    runtime: null,
    messages: [],
    log: [],
    timings: { verilatorMs: 0, codegenMs: 0 },
  });

  it('scans package declarations and imports while ignoring comments and strings', () => {
    const src = `
      // package fake_line;
      /* package fake_block; import ignored_pkg::*; */
      localparam string S = "package fake_str; import str_pkg::*;";
      package alpha_pkg;
        localparam int X = 1;
      endpackage
      package automatic beta_pkg;
        import alpha_pkg::*;
        localparam int Y = alpha_pkg::X + gamma_pkg::Z;
      endpackage
      import delta_pkg::FOO, eps_pkg::*;
    `;
    expect(scanPackages(src)).toEqual(['alpha_pkg', 'beta_pkg']);
    expect(scanPackageImports(src)).toEqual(['alpha_pkg', 'delta_pkg', 'eps_pkg', 'gamma_pkg']);
  });

  it('orders single package provider before importing module files (alphabetical upload)', async () => {
    const project = makeProject(
      [
        { name: 'game.sv', content: 'import game_config::*;\nmodule game(input clk); game_display d(.clk(clk)); endmodule' },
        { name: 'game_config.sv', content: 'package game_config;\n  localparam logic P1 = 1\'b0;\nendpackage' },
        { name: 'game_display.sv', content: 'import game_config::*;\nmodule game_display(input clk); endmodule' },
        { name: 'game_logic.sv', content: 'import game_config::*;\nmodule game_logic; endmodule' },
      ],
      'game'
    );
    let dispatched: string[] = [];
    const out = await compileProject(project, async (files) => {
      dispatched = files.map((f) => f.name);
      return fakeResult();
    });
    expect(out.diagnostics).toEqual([]);
    expect(dispatched).toEqual(['game_config.sv', 'game.sv', 'game_display.sv', 'game_logic.sv']);
  });

  it('orders multiple independent packages before modules deterministically', () => {
    const project = makeProject(
      [
        { name: 'top.sv', content: 'import pkg_a::*; import pkg_b::*;\nmodule top; endmodule' },
        { name: 'pkg_b.sv', content: 'package pkg_b; localparam int B = 2; endpackage' },
        { name: 'pkg_a.sv', content: 'package pkg_a; localparam int A = 1; endpackage' },
      ],
      'top'
    );
    expect(selectFilesForTop(project).map((f) => f.name)).toEqual([
      'pkg_b.sv',
      'pkg_a.sv',
      'top.sv',
    ]);
  });

  it('topologically sorts chained package imports regardless of upload order', () => {
    const project = makeProject(
      [
        { name: 'top.sv', content: 'import pkg_c::*;\nmodule top; endmodule' },
        { name: 'pkg_c.sv', content: 'package pkg_c; import pkg_b::*; endpackage' },
        { name: 'pkg_b.sv', content: 'package pkg_b; import pkg_a::*; endpackage' },
        { name: 'pkg_a.sv', content: 'package pkg_a; localparam int BASE = 1; endpackage' },
      ],
      'top'
    );
    expect(selectFilesForTop(project).map((f) => f.name)).toEqual([
      'pkg_a.sv',
      'pkg_b.sv',
      'pkg_c.sv',
      'top.sv',
    ]);
  });

  it('supports multiple packages declared in one source file', () => {
    const project = makeProject(
      [
        { name: 'top.sv', content: 'import p2::*;\nmodule top; endmodule' },
        { name: 'user.sv', content: 'import p1::*;\nmodule user; endmodule' },
        {
          name: 'all_pkgs.sv',
          content: 'package p1; localparam int A = 1; endpackage\npackage p2; import p1::*; localparam int B = A; endpackage',
        },
      ],
      'top'
    );
    expect(validateProject(project)).toEqual([]);
    expect(selectFilesForTop(project).map((f) => f.name)).toEqual([
      'all_pkgs.sv',
      'top.sv',
      'user.sv',
    ]);
  });

  it('never excludes a mixed package+ancestor-module file when compiling a submodule as top', () => {
    const project = makeProject(
      [
        {
          name: 'parent_and_pkg.sv',
          content:
            'package shared_pkg; localparam int W = 8; endpackage\nmodule parent; child u_c(); endmodule',
        },
        {
          name: 'child.sv',
          content: 'import shared_pkg::*;\nmodule child; endmodule',
        },
      ],
      'child'
    );
    expect(selectFilesForTop(project).map((f) => f.name)).toEqual([
      'parent_and_pkg.sv',
      'child.sv',
    ]);
  });

  it('warns on missing package imports without blocking compilation or corrupting order', async () => {
    const project = makeProject(
      [
        { name: 'top.sv', content: 'import nonexistent_pkg::*;\nmodule top; helper u_h(); endmodule' },
        { name: 'helper.sv', content: 'module helper; endmodule' },
      ],
      'top'
    );
    let dispatched: string[] = [];
    const out = await compileProject(project, async (files) => {
      dispatched = files.map((f) => f.name);
      return fakeResult();
    });
    expect(hasErrors(out.diagnostics)).toBe(false);
    expect(out.diagnostics.some((d) => d.code === 'MISSING_PACKAGE' && d.severity === 'warning')).toBe(
      true
    );
    expect(dispatched).toEqual(['top.sv', 'helper.sv']);
  });

  it('handles cyclic package dependencies gracefully with a clear diagnostic and no dropped files', async () => {
    const project = makeProject(
      [
        { name: 'top.sv', content: 'import pkg_a::*;\nmodule top; endmodule' },
        { name: 'pkg_a.sv', content: 'package pkg_a; import pkg_b::*; endpackage' },
        { name: 'pkg_b.sv', content: 'package pkg_b; import pkg_a::*; endpackage' },
      ],
      'top'
    );
    let dispatched: string[] = [];
    const out = await compileProject(project, async (files) => {
      dispatched = files.map((f) => f.name);
      return fakeResult();
    });
    expect(hasErrors(out.diagnostics)).toBe(false);
    expect(
      out.diagnostics.some((d) => d.code === 'CIRCULAR_PACKAGE' && d.severity === 'warning')
    ).toBe(true);
    expect(dispatched).toHaveLength(3);
    expect(dispatched.slice(0, 2)).toEqual(['pkg_a.sv', 'pkg_b.sv']);
    expect(dispatched[2]).toBe('top.sv');
  });

  it('preserves exact file ordering for existing Verilog projects without packages', () => {
    const project = makeProject(
      [
        { name: 'top.v', content: TOP3 },
        { name: 'counter.v', content: COUNTER },
        { name: 'sub/decoder.v', content: DECODER },
        { name: 'defines.vh', content: '`define X 1' },
      ],
      'top'
    );
    expect(selectFilesForTop(project).map((f) => f.name)).toEqual([
      'top.v',
      'counter.v',
      'sub/decoder.v',
      'defines.vh',
    ]);
  });
});
