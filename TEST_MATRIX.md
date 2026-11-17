# HDL Compatibility & Regression Test Matrix

This matrix defines all **26 test specifications** across the 9 test directories in [`tests/`](file:///c:/Users/User/Desktop/SIM_QQ/tests), including their Test ID, Purpose, Expected Result, and Pass/Fail Criteria.

---

## 1. Combinational Logic (`tests/combinational/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **COMB-001** | [and_gate.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/combinational/and_gate.v) | Verify 2-input bitwise AND (`SW[0] & SW[1]`) | `LEDR[0] = 1` iff `SW = 2'b11` | Compiles to `verilator-wasm`; all 4 truth-table vectors match [and_gate.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/combinational/and_gate.expected.json). |
| **COMB-002** | [or_gate.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/combinational/or_gate.v) | Verify 2-input bitwise OR (`SW[0] \| SW[1]`) | `LEDR[0] = 0` iff `SW = 2'b00` | Compiles to `verilator-wasm`; all 4 truth-table vectors match [or_gate.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/combinational/or_gate.expected.json). |
| **COMB-003** | [xor_gate.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/combinational/xor_gate.v) | Verify 2-input bitwise XOR (`SW[0] ^ SW[1]`) | `LEDR[0] = 1` for `SW = 2'b01, 2'b10` | Compiles to `verilator-wasm`; all 4 truth-table vectors match [xor_gate.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/combinational/xor_gate.expected.json). |
| **COMB-004** | [alu_4bit.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/combinational/alu_4bit.v) | Verify 4-bit combinational ALU (`+`, `-`, `&`, `^`) via `always @(*)` and `case` | For `a=5, b=3` (`SW=0x35`): `KEY=0 -> 8`, `KEY=1 -> 2`, `KEY=2 -> 1`, `KEY=3 -> 6` | Compiles to `verilator-wasm`; outputs settle combinationally on input change without clock edge. |

---

## 2. Sequential Logic (`tests/sequential/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **SEQ-001** | [dff.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/sequential/dff.v) | Verify rising-edge D Flip-Flop with synchronous reset (`KEY[0]`) | `KEY=1` clears `LEDR=0`; `KEY=0` latches `SW[0]` on `posedge CLOCK_50` | Compiles to `verilator-wasm`; output updates only on rising clock edge. |
| **SEQ-002** | [tff.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/sequential/tff.v) | Verify T Flip-Flop toggle behavior (`LEDR[0] <= ~LEDR[0]` when `SW[0]=1`) | Toggles `0 -> 1 -> 0` on consecutive cycles when `SW=1`; holds when `SW=0` | Compiles to `verilator-wasm`; matches 4-step sequence in [tff.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/sequential/tff.expected.json). |

---

## 3. Counters (`tests/counter/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **CNT-001** | [counter_8bit.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/counter/counter_8bit.v) | Verify 8-bit synchronous up-counter with synchronous reset (`KEY[0]`) and enable (`SW[0]`) | Reset -> `0`; 5 enabled cycles -> `5`; 3 disabled cycles -> `5`; Reset -> `0` | Compiles to `verilator-wasm`; cycle count and `LEDR[7:0]` match [counter_8bit.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/counter/counter_8bit.expected.json). |

---

## 4. Finite State Machines (`tests/fsm/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **FSM-001** | [fsm_2state.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/fsm/fsm_2state.v) | Verify 2-state Moore FSM (`S_IDLE`, `S_ACTIVE`) using `localparam` | Transitions `S_IDLE <-> S_ACTIVE` based on `SW[0]` at `posedge CLOCK_50` | Compiles to `verilator-wasm`; `state` and `LEDR[0]` match [fsm_2state.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/fsm/fsm_2state.expected.json). |
| **FSM-002** | [fsm_4state.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/fsm/fsm_4state.v) | Verify 4-state FSM (`S0->S1->S2->S3->S0`) with one-hot combinational output (`4'b0001 << state`) | `LEDR` sequences `1 -> 2 -> 4 -> 8 -> 1` on consecutive enabled clock cycles | Compiles to `verilator-wasm`; exposes internal `state[1:0]` register and matches [fsm_4state.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/fsm/fsm_4state.expected.json). |

---

## 5. 16×16 LED Matrix (`tests/matrix/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **MAT-001** | [matrix_smiley.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/matrix/matrix_smiley.v) | Verify static smiley LUT indexed by `SW[3:0]` driving `MATRIX_ROW` and `MATRIX_COL` | `SW=0 -> ROW=0x0001, COL=0x07E0`; `SW=3 -> ROW=0x0008, COL=0x4662` | Compiles to `verilator-wasm`; `MatrixViewer` lights matching row/column dots. |
| **MAT-002** | [matrix_scanned.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/matrix/matrix_scanned.v) | Verify time-multiplexed row/column diagonal scanner (`ROW = 1 << row_idx`, `COL = 0x8000 >> row_idx`) | Scans rows `0..15` across 16 clock cycles; POV buffer retains diagonal line | Compiles to `verilator-wasm`; `MATRIX_ROW` and `MATRIX_COL` match [matrix_scanned.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/matrix/matrix_scanned.expected.json). |
| **MAT-003** | [matrix_animated.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/matrix/matrix_animated.v) | Verify animated frame-shifting pattern where `frame_shift` increments every 16 scan rows | `frame_shift` increments after `row_idx == 15`, shifting column pattern | Compiles to `verilator-wasm`; matches [matrix_animated.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/matrix/matrix_animated.expected.json). |

---

## 6. Quartus QSF Pin Parser (`tests/qsf/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **QSF-001** | [valid_mappings.qsf](file:///c:/Users/User/Desktop/SIM_QQ/tests/qsf/valid_mappings.qsf) | Verify parsing of `FAMILY`, `DEVICE`, `TOP_LEVEL_ENTITY`, `IO_STANDARD`, and all 7 peripheral categories | Extracts `MAX 10`, `10M50DAF484C7G`, `valid_top`, and 7 categorized pins | `parseQsfFile()` output matches [valid_mappings.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/qsf/valid_mappings.expected.json). |
| **QSF-002** | [duplicate_pins.qsf](file:///c:/Users/User/Desktop/SIM_QQ/tests/qsf/duplicate_pins.qsf) | Verify handling of duplicate physical pin (`PIN_A8` on `KEY[3]` and `LEDR[0]`) and overwritten signal (`SW[0]`) | Detects that `PIN_A8` is shared by two signals and flags a pin conflict warning | **Fails conflict warning check (`BUG-004`)**: parser silently accepts duplicate `PIN_A8`. |
| **QSF-003** | [missing_signals.qsf](file:///c:/Users/User/Desktop/SIM_QQ/tests/qsf/missing_signals.qsf) | Verify behavior when QSF contains signals (`UNUSED_HEX0`, `ORPHAN_KEY`) absent from the Verilog module | Board View only renders controls for active module ports (`SW`, `LEDR`) | **Fails phantom-control check (`BUG-003`)**: `buildBoardControlGroups()` creates phantom board controls for unmatched QSF pins. |

---

## 7. Waveform & Signal Monitor (`tests/waveform/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **WAV-001** | [clock_transitions.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/waveform/clock_transitions.v) | Verify half-cycle clock and output transition capture in Signal Monitor SVG trace | After 3 full cycles (`Step Cycle` ×3), history holds 7 samples (`0,1,0,1,0,1,0`) | Passes SVG single-bit square wave rendering in `SignalMonitor.tsx`. |
| **WAV-002** | [input_transitions.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/waveform/input_transitions.v) | Verify waveform recording when combinational inputs (`SW`) are toggled without a clock | Toggling `SW` appends transition samples to `history` | **Fails (`BUG-007`)**: `applyInput()` updates `signals` but does not append to `history`. |
| **WAV-003** | [output_transitions.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/waveform/output_transitions.v) | Verify multi-bit bus ring counter (`LEDR[3:0]`) trace and radix switching (`HEX`/`BIN`/`DEC`) | Both `Current Value` and `Waveform Trace` chips respect selected radix | **Partial (`BUG-010`)**: `Current Value` updates radix, but `Waveform Trace` chips remain hex. |

---

## 8. Backend & Language Limitations (`tests/limitations/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **LIM-001** | [signal_64bit.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/limitations/signal_64bit.v) | Verify maximum supported packed bus width (`64-bit` `reg [63:0] wide_out`) | Compiles to `verilator-wasm`; `wide_out[63:0]` is exposed in Signal Monitor | Passes (`Verilator → WebAssembly`, `3 ports` including `wide_out[63:0]`). |
| **LIM-002** | [signal_65bit.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/limitations/signal_65bit.v) | Test 65-bit bus (`reg [64:0] over64_out`) exceeding 64-bit WASM limit | `HDLModuleWASM` throws `> 64 bits not supported`, falls back to JS, and `FpgaRuntime` drops port | Confirmed limitation: falls back to `Verilator → JS (fallback)` and drops `over64_out` (`2 ports`). |
| **LIM-003** | [signal_256bit.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/limitations/signal_256bit.v) | Test 256-bit wide vector (`output wire [255:0] matrix_flat`) | `FpgaRuntime` filters out `matrix_flat` (`width > 64`), leaving only `SW[7:0]` visible | Confirmed limitation: `matrix_flat[255:0]` is silently omitted from `ports` (`1 port`). |
| **LIM-004** | [multidim_array.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/limitations/multidim_array.v) | Test 2D unpacked array (`reg [7:0] mem2d [0:3][0:3]`) | Compiles when uninitialized, fails if initialized via `initarray`, and hides `mem2d` from Signal Monitor | Confirmed partial support: compiles to `verilator-wasm` (`3 ports • 0 internal signals`), array hidden from UI. |
| **LIM-005** | [generate_block.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/limitations/generate_block.v) | Verify `generate` / `genvar` loop elaboration (`for (i = 0; i < 8; i = i + 1)`) | Compiles to `verilator-wasm`; `SW=0 -> LEDR=0xFF` (`255`) | Passes (`Verilator → WebAssembly`, `SW=0` produces `LEDR=0xFF`). |
| **LIM-006** | [module_instantiation.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/limitations/module_instantiation.v) | Verify parameterized submodule instantiation (`nibble_adder #(.WIDTH(4)) u_add`) | Verilator elaborates and inlines `nibble_adder` into `module_instantiation` | Passes (`Verilator → WebAssembly`, `2 ports`, `0 errors`). |
| **LIM-007** | [readmemh_rom.v](file:///c:/Users/User/Desktop/SIM_QQ/tests/limitations/readmemh_rom.v) | Test `$readmemh("rom_init.hex", rom)` external memory file initialization | Fails at reset because `model.getFileData` is unwired (`BUG-002`) | Confirmed failure: throws `no file "rom_init.hex" for $readmem` and `this.getFileData is not a function`. |

---

## 9. Deployment (`tests/deployment/`)

| Test ID | File | Purpose | Expected Result | Pass / Fail Criteria |
|---|---|---|---|---|
| **DEP-001** | [gh_pages_smoke.expected.json](file:///c:/Users/User/Desktop/SIM_QQ/tests/deployment/gh_pages_smoke.expected.json) | Verify live GitHub Pages deployment, relative asset paths (`./`), and Web Worker WASM loading | `https://tim941008.github.io/fpga-web-simulator/` returns HTTP 200 and compiles designs in browser via `verilator_bin.wasm` | Passes: verified live via GitHub Actions Run `#44126611355` and browser QA subagent. |
