import { describe, it, expect } from 'vitest';
import {
  annotateCompileMessages,
  FpgaRuntime,
  normalizeMemContent,
  VERILATOR_TIMEOUT_MS,
} from '../fpgaRuntime';

describe('FpgaRuntime helpers & port classification (BUG-12, BUG-13, BUG-16)', () => {
  it('normalizeMemContent strips comments and expands @addr hex offsets (BUG-13)', () => {
    const raw = `
      // header comment
      @02 AA BB /* inline */
      @06 CC
    `;
    expect(normalizeMemContent(raw)).toBe('0\n0\nAA\nBB\n0\n0\nCC');
  });

  it('normalizeMemContent preserves plain sequential hex lines (BUG-13)', () => {
    expect(normalizeMemContent('A5\n5A\nF0\n0F')).toBe('A5\n5A\nF0\n0F');
  });

  it('classifies inout ports and records >64-bit ports in skippedWidePorts (BUG-13)', () => {
    const model = {
      state: { clk: 0, sda: 0, out_led: 0 },
      mod: {
        vardefs: {
          clk: { origName: 'clk', isInput: true, isOutput: false, dtype: { left: 0, right: 0 } },
          sda: { origName: 'sda', isInput: true, isOutput: true, dtype: { left: 0, right: 0 } },
          out_led: { origName: 'out_led', isInput: false, isOutput: true, dtype: { left: 7, right: 0 } },
          wide_bus: { origName: 'wide_bus', isInput: false, isOutput: true, dtype: { left: 127, right: 0 } },
        },
      },
      eval: () => {},
      powercycle: () => {},
      dispose: () => {},
    };

    const rt: FpgaRuntime = new (FpgaRuntime as any)(model, 'verilator-js', 'top');
    expect(rt.ports.find((p) => p.name === 'sda')?.direction).toBe('inout');
    expect(rt.ports.find((p) => p.name === 'clk')?.direction).toBe('input');
    expect(rt.ports.find((p) => p.name === 'out_led')?.direction).toBe('output');
    expect(rt.ports.some((p) => p.name === 'wide_bus')).toBe(false);
    expect(rt.skippedWidePorts).toEqual([{ name: 'wide_bus', width: 128 }]);
  });

  it('annotateCompileMessages adds a generate-for hint for BLKLOOPINIT without recommending = (BUG-16)', () => {
    const msgs = annotateCompileMessages([
      {
        severity: 'error',
        file: 'game.sv',
        line: 42,
        msg: 'Unsupported: Delayed assignment to array inside for loops (non-delayed is ok - see docs)',
      },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[1].severity).toBe('warning');
    expect(msgs[1].msg).toContain('generate for');
    expect(msgs[1].msg).toContain('BLKLOOPINIT');

    // Non-BLKLOOPINIT errors are not annotated
    const other = annotateCompileMessages([
      { severity: 'error', file: 'top.v', line: 1, msg: 'syntax error' },
    ]);
    expect(other).toHaveLength(1);
  });

  it('exports a bounded Verilator compile timeout (BUG-12)', () => {
    expect(VERILATOR_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(VERILATOR_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});
