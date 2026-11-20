import { describe, it, expect } from 'vitest';
import { parseVerilogSource } from '../verilogParser';

describe('parseVerilogSource (BUG-02)', () => {
  const multiModuleSources = [
    `module helper_sub (
      input wire a,
      output wire y
    );
      assign y = ~a;
    endmodule`,
    `module alt_top (
      input wire clk,
      output wire [0:15] row,
      output wire [0:15] col
    );
      wire tmp;
      helper_sub u0 (.a(clk), .y(tmp));
      assign row = {16{tmp}};
      assign col = 16'h0001;
    endmodule`,
    `module main_top (
      input wire CLOCK_50,
      input wire [3:0] SW,
      output wire [3:0] LEDR
    );
      assign LEDR = SW;
    endmodule`,
  ];

  it('uses preferredTopModule when specified and present', () => {
    const res = parseVerilogSource(multiModuleSources, 'alt_top');
    expect(res.topModule).toBe('alt_top');
    expect(res.ports.map((p) => p.name)).toEqual(['clk', 'row', 'col']);
    expect(res.ports.find((p) => p.name === 'row')?.width).toBe(16);
  });

  it('switches parsed ports when preferredTopModule changes to another module', () => {
    const res = parseVerilogSource(multiModuleSources, 'main_top');
    expect(res.topModule).toBe('main_top');
    expect(res.ports.map((p) => p.name)).toEqual(['CLOCK_50', 'SW', 'LEDR']);
  });

  it('allows selecting an instantiated submodule explicitly as preferredTopModule', () => {
    const res = parseVerilogSource(multiModuleSources, 'helper_sub');
    expect(res.topModule).toBe('helper_sub');
    expect(res.ports.map((p) => p.name)).toEqual(['a', 'y']);
  });

  it('falls back to uninstantiated top module when preferredTopModule is omitted or not found', () => {
    const omitted = parseVerilogSource(multiModuleSources);
    expect(omitted.topModule).toBe('alt_top');

    const unknown = parseVerilogSource(multiModuleSources, 'non_existent_mod');
    expect(unknown.topModule).toBe('alt_top');
  });
});
