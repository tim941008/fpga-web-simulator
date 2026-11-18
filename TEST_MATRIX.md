# HDL Compatibility & Regression Test Matrix

This matrix defines all **27 test specifications** across the 9 test directories in `tests/`, including their Test ID, Purpose, Expected Result, and Pass/Fail Criteria.

---

## 1. Combinational Logic (`tests/combinational/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **COMB-001** | `and_gate.v` | Verify 2-input bitwise AND (`SW[0] & SW[1]`) | `LEDR[0] = 1` iff `SW = 2'b11` | Compiles to `verilator-wasm`; all 4 truth-table vectors match `and_gate.expected.json`. |
| **COMB-002** | `or_gate.v` | Verify 2-input bitwise OR (`SW[0] \| SW[1]`) | `LEDR[0] = 0` iff `SW = 2'b00` | Compiles to `verilator-wasm`; all 4 truth-table vectors match `or_gate.expected.json`. |
| **COMB-003** | `xor_gate.v` | Verify 2-input bitwise XOR (`SW[0] ^ SW[1]`) | `LEDR[0] = 1` for `SW = 2'b01, 2'b10` | Compiles to `verilator-wasm`; all 4 truth-table vectors match `xor_gate.expected.json`. |
| **COMB-004** | `alu_4bit.v` | Verify 4-bit combinational ALU (`+`, `-`, `&`, `^`) via `always @(*)` and `case` | For `a=5, b=3` (`SW=0x35`): `KEY=0 -> 8`, `KEY=1 -> 2`, `KEY=2 -> 1`, `KEY=3 -> 6` | Compiles to `verilator-wasm`; outputs settle combinationally on input change without clock edge. |

---

## 2. Sequential Logic (`tests/sequential/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **SEQ-001** | `dff.v` | Verify rising-edge D Flip-Flop with synchronous reset (`KEY[0]`) | `KEY=1` clears `LEDR=0`; `KEY=0` latches `SW[0]` on `posedge CLOCK_50` | Compiles to `verilator-wasm`; output updates only on rising clock edge. |
| **SEQ-002** | `tff.v` | Verify T Flip-Flop toggle behavior (`LEDR[0] <= ~LEDR[0]` when `SW[0]=1`) | Toggles `0 -> 1 -> 0` on consecutive cycles when `SW=1`; holds when `SW=0` | Compiles to `verilator-wasm`; matches 4-step sequence in `tff.expected.json`. |

---

## 3. Counters (`tests/counter/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **CNT-001** | `counter_8bit.v` | Verify 8-bit synchronous up-counter with synchronous reset (`KEY[0]`) and enable (`SW[0]`) | Reset -> `0`; 5 enabled cycles -> `5`; 3 disabled cycles -> `5`; Reset -> `0` | Compiles to `verilator-wasm`; cycle count and `LEDR[7:0]` match `counter_8bit.expected.json`. |

---

## 4. Finite State Machines (`tests/fsm/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **FSM-001** | `fsm_2state.v` | Verify 2-state Moore FSM (`S_IDLE`, `S_ACTIVE`) using `localparam` | Transitions `S_IDLE <-> S_ACTIVE` based on `SW[0]` at `posedge CLOCK_50` | Compiles to `verilator-wasm`; `state` and `LEDR[0]` match `fsm_2state.expected.json`. |
| **FSM-002** | `fsm_4state.v` | Verify 4-state FSM (`S0->S1->S2->S3->S0`) with one-hot combinational output (`4'b0001 << state`) | `LEDR` sequences `1 -> 2 -> 4 -> 8 -> 1` on consecutive enabled clock cycles | Compiles to `verilator-wasm`; exposes internal `state[1:0]` register and matches `fsm_4state.expected.json`. |

---

## 5. 16×16 LED Matrix (`tests/matrix/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **MAT-001** | `matrix_smiley.v` | Verify static smiley LUT indexed by `SW[3:0]` driving `MATRIX_ROW` and `MATRIX_COL` | `SW=0 -> ROW=0x0001, COL=0x07E0`; `SW=3 -> ROW=0x0008, COL=0x4662` | Compiles to `verilator-wasm`; `MatrixViewer` lights matching row/column dots. |
| **MAT-002** | `matrix_scanned.v` | Verify time-multiplexed row/column diagonal scanner (`ROW = 1 << row_idx`, `COL = 0x8000 >> row_idx`) | Scans rows `0..15` across 16 clock cycles; POV buffer retains diagonal line | Compiles to `verilator-wasm`; `MATRIX_ROW` and `MATRIX_COL` match `matrix_scanned.expected.json`. |
| **MAT-003** | `matrix_animated.v` | Verify animated frame-shifting pattern where `frame_shift` increments every 16 scan rows | `frame_shift` increments after `row_idx == 15`, shifting column pattern | Compiles to `verilator-wasm`; matches `matrix_animated.expected.json`. |

---

## 6. GUI I/O Pin Configuration (`tests/io_config/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **IOCFG-001** | `custom_ports.v` | Verify automatic port detection and GUI assignment of arbitrary custom port names (`sys_pulse`, `ctrl_btns`, `dip_inputs`, `red_bar`, `green_bar`, `digit_seg`) plus optional unassigned `optional_debug` | 6 configured ports (`CLOCK`, `KEY`, `SW`, `LEDR`, `LEDG`, `HEX0`), 1 `Unassigned`, 0 conflicts, 0 invalid | Passes `npm test` (`ioConfig.test.ts`), `run_verification.py`, and live browser simulation without any QSF file. |
| **IOCFG-002** | `direction_width_validation.v` | Verify direction compatibility and width rules (1-bit Clock, >=7-bit HEX, 8-bit HEX DP warning, >10-bit SW warning, non-16-bit Matrix warning) | `wide_clk -> CLOCK` and `short_seg -> HEX0` flagged `Invalid Assignment`; `wide_sw -> SW`, `seg_with_dp -> HEX1`, and `narrow_matrix_row -> MATRIX_ROW` flagged `Configured (Width Warning)` | Passes `npm test` (`ioConfig.test.ts`) and `run_verification.py`. |
| **IOCFG-003** | `duplicate_conflicts.v` | Verify duplicate component assignments (`KEY`, `LEDR` shared by multiple ports) and incomplete 16×16 Matrix resource warning | All 4 duplicate assignments marked `Conflict` and excluded from board mapping until resolved; `MATRIX_MISSING_COL` warning emitted | Passes `npm test` (`ioConfig.test.ts`) and `run_verification.py`. |
| **IOCFG-004** | `persistence_updates.v` | Verify configuration persistence and invalidation when Verilog source changes (unchanged ports, added/removed ports, direction/width changes, mid-edit syntax errors) | Unchanged assignments preserved; added ports shown as `Unassigned`; direction/width incompatibilities marked `Invalid Assignment`; 0-port syntax errors do not wipe saved assignments | Passes `npm test` (`ioConfig.test.ts`) and `run_verification.py`. |

---

## 7. Waveform & Signal Monitor (`tests/waveform/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **WAV-001** | `clock_transitions.v` | Verify half-cycle clock and output transition capture in Signal Monitor SVG trace | After 3 full cycles (`Step Cycle` ×3), history holds 7 samples (`0,1,0,1,0,1,0`) | Passes SVG single-bit square wave rendering in `SignalMonitor.tsx`. |
| **WAV-002** | `input_transitions.v` | Verify waveform recording when combinational inputs (`SW`) are toggled without a clock | Toggling `SW` appends transition samples to `history` immediately | Passes in `App.tsx` (`applyInput`) and `SignalMonitor.tsx`. |
| **WAV-003** | `output_transitions.v` | Verify multi-bit bus ring counter (`LEDR[3:0]`) trace and radix switching (`HEX`/`BIN`/`DEC`) | Both `Current Value` and `Waveform Trace` chips respect selected radix and full bit width | Passes in `SignalMonitor.tsx`. |

---

## 8. Backend & Language Limitations (`tests/limitations/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **LIM-001** | `signal_64bit.v` | Verify maximum supported packed bus width (`64-bit` `reg [63:0] wide_out`) | Compiles to `verilator-wasm`; `wide_out[63:0]` is exposed in Signal Monitor | Passes (`Verilator → WebAssembly`, `3 ports` including `wide_out[63:0]`). |
| **LIM-002** | `signal_65bit.v` | Test 65-bit bus (`reg [64:0] over64_out`) exceeding 64-bit WASM limit | `HDLModuleWASM` throws `> 64 bits not supported`, falls back to JS, and `FpgaRuntime` drops port | Confirmed limitation: falls back to `Verilator → JS (fallback)` and drops `over64_out`. |
| **LIM-003** | `signal_256bit.v` | Test 256-bit wide vector (`output wire [255:0] matrix_flat`) | `FpgaRuntime` filters out `matrix_flat` (`width > 64`), leaving only `SW[7:0]` visible | Confirmed limitation: `matrix_flat[255:0]` omitted from runtime `ports`. |
| **LIM-004** | `multidim_array.v` | Test 2D unpacked array (`reg [7:0] mem2d [0:3][0:3]`) | Compiles when uninitialized, fails if initialized via `initarray`, and hides `mem2d` from Signal Monitor | Confirmed partial support: compiles to `verilator-wasm`, array hidden from UI. |
| **LIM-005** | `generate_block.v` | Verify `generate` / `genvar` loop elaboration (`for (i = 0; i < 8; i = i + 1)`) | Compiles to `verilator-wasm`; `SW=0 -> LEDR=0xFF` (`255`) | Passes (`Verilator → WebAssembly`). |
| **LIM-006** | `module_instantiation.v` | Verify parameterized submodule instantiation (`nibble_adder #(.WIDTH(4)) u_add`) | Verilator elaborates and inlines `nibble_adder` into `module_instantiation` | Passes (`Verilator → WebAssembly`). |
| **LIM-007** | `readmemh_rom.v` | Verify `$readmemh("rom_init.hex", rom)` external memory file initialization | Compiles to `verilator-wasm` and reads `0xA5, 0x5A, 0xF0, 0x0F` | Passes (`BUG-002` fixed via `getFileData` + `hdlwasm.ts` array address fix). |

---

## 9. Deployment (`tests/deployment/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **DEP-001** | `gh_pages_smoke.expected.json` | Verify live GitHub Pages deployment, relative asset paths (`./`), Web Worker WASM loading, and QSF-free GUI I/O configuration | `https://tim941008.github.io/fpga-web-simulator/` returns HTTP 200, compiles designs via `verilator_bin.wasm`, and simulates custom port mappings with zero console errors | Passes via GitHub Actions (`npm test` + `npm run build` + deploy) and live browser verification. |
