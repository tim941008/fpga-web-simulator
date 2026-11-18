import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseVerilogSource } from '../../src/parsers/verilogParser';
import {
  autoAssignPorts,
  buildBoardMappings,
  checkComponentCompatibility,
  reconcileIoAssignments,
  validateIoConfig,
} from '../../src/config/ioConfig';
import { BoardComponentId, PortDefinition, PortIoAssignment } from '../../src/types/fpga';
import { SAMPLE_PRESETS } from '../../src/presets/sampleDesigns';

const ROOT = resolve(process.cwd());

function assignMap(
  ports: PortDefinition[],
  pairs: Record<string, BoardComponentId>
): Record<string, PortIoAssignment> {
  const out: Record<string, PortIoAssignment> = {};
  for (const p of ports) {
    const comp = pairs[p.name];
    if (comp) {
      out[p.name] = {
        componentId: comp,
        configuredDirection: p.direction,
        configuredWidth: p.width,
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Test 1: Port detection & auto-assignment on all built-in presets (no QSF)
// ---------------------------------------------------------------------------
{
  const preset1 = SAMPLE_PRESETS[0];
  const parsed1 = parseVerilogSource([preset1.verilogCode]);
  assert.equal(parsed1.topModule, 'top_fpga_demo');
  assert.equal(parsed1.ports.length, 8);

  const auto1 = autoAssignPorts(parsed1.ports, preset1.defaultIoConfig);
  const val1 = validateIoConfig(parsed1.ports, auto1);
  assert.equal(val1.configuredCount, 8);
  assert.equal(val1.unassignedCount, 0);
  assert.equal(val1.conflictCount, 0);
  assert.equal(val1.invalidCount, 0);
  assert.equal(val1.warningCount, 0);

  const map1 = buildBoardMappings(val1);
  assert.equal(map1.clockSignalName, 'CLOCK_50');
  assert.equal(map1.matrixRowSignal, 'MATRIX_ROW');
  assert.equal(map1.matrixColSignal, 'MATRIX_COL');
  assert.equal(map1.hasMatrixConnection, true);

  // Preset 2: combinational ALU (no clock)
  const preset2 = SAMPLE_PRESETS[1];
  const parsed2 = parseVerilogSource([preset2.verilogCode]);
  const auto2 = autoAssignPorts(parsed2.ports, preset2.defaultIoConfig);
  const val2 = validateIoConfig(parsed2.ports, auto2);
  assert.equal(val2.configuredCount, 4);
  assert.equal(val2.conflictCount, 0);
  assert.equal(val2.invalidCount, 0);
  const map2 = buildBoardMappings(val2);
  assert.equal(map2.clockSignalName, null);
  assert.equal(map2.hasMatrixConnection, false);

  // Preset 3: custom port names with LEDR + LEDG + HEX0
  const preset3 = SAMPLE_PRESETS[2];
  const parsed3 = parseVerilogSource([preset3.verilogCode]);
  const auto3 = autoAssignPorts(parsed3.ports, preset3.defaultIoConfig);
  const val3 = validateIoConfig(parsed3.ports, auto3);
  assert.equal(val3.configuredCount, 6);
  assert.equal(val3.conflictCount, 0);
  assert.equal(val3.invalidCount, 0);
  const map3 = buildBoardMappings(val3);
  assert.equal(map3.clockSignalName, 'sys_pulse');
  assert.ok(map3.controlGroups.some((g) => g.componentId === 'LEDG' && g.baseName === 'green_bar'));
  assert.ok(map3.controlGroups.some((g) => g.componentId === 'LEDR' && g.baseName === 'red_bar'));
  console.log('[PASS] Test 1: Built-in presets port detection & default I/O mapping (zero QSF)');
}

// ---------------------------------------------------------------------------
// Test 2: IOCFG-001 — Arbitrary custom port names + optional unassigned port
// ---------------------------------------------------------------------------
{
  const vSrc = readFileSync(resolve(ROOT, 'tests/io_config/custom_ports.v'), 'utf-8');
  const parsed = parseVerilogSource([vSrc]);
  assert.equal(parsed.topModule, 'custom_ports');
  assert.equal(parsed.ports.length, 7);

  // Unrecognized custom names should default to unassigned rather than wrong guesses
  const heuristic = autoAssignPorts(parsed.ports);
  assert.equal(heuristic['red_bar'], undefined);
  assert.equal(heuristic['green_bar'], undefined);
  assert.equal(heuristic['optional_debug'], undefined);

  // User assigns custom ports via GUI, leaving optional_debug unassigned
  const userAssign = assignMap(parsed.ports, {
    sys_pulse: 'CLOCK',
    ctrl_btns: 'KEY',
    dip_inputs: 'SW',
    red_bar: 'LEDR',
    green_bar: 'LEDG',
    digit_seg: 'HEX0',
  });
  const val = validateIoConfig(parsed.ports, userAssign);
  assert.equal(val.configuredCount, 6);
  assert.equal(val.unassignedCount, 1);
  assert.equal(val.conflictCount, 0);
  assert.equal(val.invalidCount, 0);
  assert.equal(val.byPort['optional_debug'].status, 'unassigned');

  const mappings = buildBoardMappings(val);
  assert.equal(mappings.clockSignalName, 'sys_pulse');
  assert.equal(mappings.controlGroups.length, 6);
  console.log('[PASS] Test 2: IOCFG-001 custom port names & optional unassigned port');
}

// ---------------------------------------------------------------------------
// Test 3: IOCFG-002 — Direction & width compatibility validation
// ---------------------------------------------------------------------------
{
  const vSrc = readFileSync(
    resolve(ROOT, 'tests/io_config/direction_width_validation.v'),
    'utf-8'
  );
  const parsed = parseVerilogSource([vSrc]);
  const byName = Object.fromEntries(parsed.ports.map((p) => [p.name, p]));

  // Input assigned to output component -> invalid (DIRECTION_MISMATCH)
  const dirBad = checkComponentCompatibility(byName['wide_sw'], 'LEDR');
  assert.equal(dirBad.allowed, false);
  assert.ok(dirBad.issues.some((i) => i.code === 'DIRECTION_MISMATCH'));

  // Output assigned to input component -> invalid (DIRECTION_MISMATCH)
  const outToIn = checkComponentCompatibility(byName['short_seg'], 'SW');
  assert.equal(outToIn.allowed, false);
  assert.ok(outToIn.issues.some((i) => i.code === 'DIRECTION_MISMATCH'));

  // 4-bit input assigned to CLOCK (1-bit exact) -> invalid (CLOCK_WIDTH_INVALID)
  const clkBad = checkComponentCompatibility(byName['wide_clk'], 'CLOCK');
  assert.equal(clkBad.allowed, false);
  assert.ok(clkBad.issues.some((i) => i.code === 'CLOCK_WIDTH_INVALID'));

  // 4-bit output assigned to HEX0 (needs >= 7 bits) -> invalid (HEX_WIDTH_TOO_SMALL)
  const hexBad = checkComponentCompatibility(byName['short_seg'], 'HEX0');
  assert.equal(hexBad.allowed, false);
  assert.ok(hexBad.issues.some((i) => i.code === 'HEX_WIDTH_TOO_SMALL'));

  // Full validation with mixed invalid + width-warning assignments
  const assignments = assignMap(parsed.ports, {
    wide_clk: 'CLOCK',
    wide_sw: 'SW',
    short_seg: 'HEX0',
    seg_with_dp: 'HEX1',
    narrow_matrix_row: 'MATRIX_ROW',
  });
  const val = validateIoConfig(parsed.ports, assignments);
  assert.equal(val.byPort['wide_clk'].status, 'invalid');
  assert.equal(val.byPort['short_seg'].status, 'invalid');
  assert.equal(val.byPort['wide_sw'].status, 'configured');
  assert.ok(val.byPort['wide_sw'].issues.some((i) => i.code === 'WIDTH_EXCEEDS_COMPONENT'));
  assert.equal(val.byPort['seg_with_dp'].status, 'configured');
  assert.ok(val.byPort['seg_with_dp'].issues.some((i) => i.code === 'HEX_DP_UNUSED'));
  assert.equal(val.byPort['narrow_matrix_row'].status, 'configured');
  assert.ok(
    val.byPort['narrow_matrix_row'].issues.some((i) => i.code === 'MATRIX_WIDTH_MISMATCH')
  );
  assert.ok(val.resourceWarnings.some((w) => w.code === 'MATRIX_MISSING_COL'));
  assert.equal(val.invalidCount, 2);
  assert.equal(val.configuredCount, 3);
  console.log('[PASS] Test 3: IOCFG-002 direction & width validation');
}

// ---------------------------------------------------------------------------
// Test 4: IOCFG-003 — Duplicate assignments & resource conflicts
// ---------------------------------------------------------------------------
{
  const vSrc = readFileSync(
    resolve(ROOT, 'tests/io_config/duplicate_conflicts.v'),
    'utf-8'
  );
  const parsed = parseVerilogSource([vSrc]);
  const assignments = assignMap(parsed.ports, {
    btn_a: 'KEY',
    btn_b: 'KEY',
    led_a: 'LEDR',
    led_b: 'LEDR',
    mat_r: 'MATRIX_ROW',
  });
  const val = validateIoConfig(parsed.ports, assignments);
  assert.equal(val.conflictCount, 4);
  assert.equal(val.configuredCount, 1);
  assert.equal(val.invalidCount, 0);
  assert.equal(val.byPort['btn_a'].status, 'conflict');
  assert.equal(val.byPort['btn_b'].status, 'conflict');
  assert.equal(val.byPort['led_a'].status, 'conflict');
  assert.equal(val.byPort['led_b'].status, 'conflict');
  assert.equal(val.byPort['mat_r'].status, 'configured');
  assert.ok(val.resourceWarnings.some((w) => w.code === 'MATRIX_MISSING_COL'));

  // Conflicting ports must not be wired to active board mappings until resolved
  const map = buildBoardMappings(val);
  assert.equal(map.controlGroups.length, 1);
  assert.equal(map.matrixRowSignal, 'mat_r');
  console.log('[PASS] Test 4: IOCFG-003 duplicate component & resource conflicts');
}

// ---------------------------------------------------------------------------
// Test 5: IOCFG-004 — Configuration persistence & invalidation across edits
// ---------------------------------------------------------------------------
{
  const v1 = readFileSync(
    resolve(ROOT, 'tests/io_config/persistence_updates.v'),
    'utf-8'
  );
  const p1 = parseVerilogSource([v1]);
  const initial = assignMap(p1.ports, {
    clk_in: 'CLOCK',
    sw_in: 'SW',
    led_out: 'LEDR',
  });

  // 5a. Logic body changes, ports unchanged -> all assignments preserved
  const v2 = `
    module persistence_updates (
      input wire clk_in,
      input wire [3:0] sw_in,
      output wire [3:0] led_out
    );
      assign led_out = ~sw_in;
    endmodule
  `;
  const p2 = parseVerilogSource([v2]);
  const rec2 = reconcileIoAssignments(initial, p2.ports);
  const val2 = validateIoConfig(p2.ports, rec2);
  assert.equal(val2.configuredCount, 3);
  assert.equal(val2.invalidCount, 0);

  // 5b. Add a new port (extra_out), remove led_out, change sw_in direction to output, change clk_in width to 4-bit
  const v3 = `
    module persistence_updates (
      input wire [3:0] clk_in,
      output wire [3:0] sw_in,
      output wire [6:0] extra_out
    );
      assign sw_in = clk_in;
      assign extra_out = 7'd0;
    endmodule
  `;
  const p3 = parseVerilogSource([v3]);
  const rec3 = reconcileIoAssignments(rec2, p3.ports);
  const val3 = validateIoConfig(p3.ports, rec3);
  // clk_in was preserved and flagged invalid due to width change (1 -> 4)
  assert.equal(val3.byPort['clk_in'].status, 'invalid');
  assert.equal(val3.byPort['clk_in'].signatureChanged, true);
  assert.ok(val3.byPort['clk_in'].issues.some((i) => i.code === 'CLOCK_WIDTH_INVALID'));
  // sw_in was preserved and flagged invalid due to direction change (input -> output)
  assert.equal(val3.byPort['sw_in'].status, 'invalid');
  assert.equal(val3.byPort['sw_in'].signatureChanged, true);
  assert.ok(val3.byPort['sw_in'].issues.some((i) => i.code === 'DIRECTION_CHANGED'));
  // extra_out auto-detected as unassigned
  assert.equal(val3.byPort['extra_out'].status, 'unassigned');
  // removed port led_out is no longer present
  assert.equal(rec3['led_out'], undefined);

  // 5c. Temporary syntax error (0 ports parsed mid-edit) preserves existing assignments
  const recSyntaxErr = reconcileIoAssignments(initial, []);
  assert.deepEqual(recSyntaxErr, initial);

  console.log('[PASS] Test 5: IOCFG-004 persistence, port add/remove & invalidation detection');
}

console.log('\nAll TypeScript I/O Pin Configuration unit tests passed!');
