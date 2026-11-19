import { describe, expect, it } from 'vitest';
import {
  addFiles,
  deleteFile,
  findTopCandidates,
  guessTopModule,
  makeProject,
  renameFile,
  replaceFile,
  scanProject,
  validateProject,
  hasErrors,
  createFile,
  VerilogProject,
} from '../projectModel';
import { compileProject, Compiler } from '../projectCompile';
import { filterEntries } from '../projectImport';
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

  it('does not invoke Verilator when validation has errors', async () => {
    const project = makeProject([{ name: 'top.v', content: TOP2 }], 'top'); // counter missing
    let called = false;
    const out = await compileProject(project, async () => {
      called = true;
      return fakeResult();
    });
    expect(called).toBe(false);
    expect(out.result).toBeNull();
    expect(out.messages.some((m) => m.severity === 'error' && /counter/.test(m.msg))).toBe(true);
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
