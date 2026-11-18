# HDL Compatibility & Regression Test Execution Report

**Execution Date:** 2026-11-18  
**Target Build:** `https://tim941008.github.io/fpga-web-simulator/`  
**Test Suite Location:** `tests/` (27 test specifications across 9 categories + `tests/io_config/ioConfig.test.ts`)

---

## 1. Overall Summary (Post GUI I/O Configuration Migration)

| Category | Total Tests | Passed (Functional / Expected Behavior Verified) | Documented Architectural Boundary (>64-Bit / Unpacked Array UI) |
|---|---|---|---|
| **Combinational (`tests/combinational/`)** | 4 | 4 (`COMB-001`..`004`) | 0 |
| **Sequential (`tests/sequential/`)** | 2 | 2 (`SEQ-001`, `SEQ-002`) | 0 |
| **Counter (`tests/counter/`)** | 1 | 1 (`CNT-001`) | 0 |
| **FSM (`tests/fsm/`)** | 2 | 2 (`FSM-001`, `FSM-002`) | 0 |
| **16×16 Matrix (`tests/matrix/`)** | 3 | 3 (`MAT-001`..`003`) | 0 |
| **GUI I/O Pin Configuration (`tests/io_config/`)** | 4 | 4 (`IOCFG-001`..`004`) | 0 |
| **Waveform (`tests/waveform/`)** | 3 | 3 (`WAV-001`, `WAV-002`, `WAV-003`) | 0 |
| **Limitations (`tests/limitations/`)** | 7 | 4 (`LIM-001`, `LIM-005`, `LIM-006`, `LIM-007`) | 3 (`LIM-002`, `LIM-003` >64-bit cap; `LIM-004` array hidden from UI) |
| **Deployment (`tests/deployment/`)** | 1 | 1 (`DEP-001`) | 0 |
| **Total** | **27** | **24** | **3 (Confirmed >64-bit & array UI boundaries)** |

---

## 2. Detailed Test Run Results

### A. Combinational, Sequential, Counter, FSM & Matrix Tests
Executed against the live in-browser **Verilator WebAssembly** pipeline (`verilator_bin.wasm` → `VerilogXMLParser` → `HDLModuleWASM`) with zero QSF files:

| Test ID | Design | Backend Used | Result | Notes |
|---|---|---|---|---|
| **COMB-001** | `and_gate.v` | `Verilator → WebAssembly` | **PASS** | `SW=0..3` -> `LEDR=0,0,0,1` |
| **COMB-002** | `or_gate.v` | `Verilator → WebAssembly` | **PASS** | `SW=0..3` -> `LEDR=0,1,1,1` |
| **COMB-003** | `xor_gate.v` | `Verilator → WebAssembly` | **PASS** | `SW=0..3` -> `LEDR=0,1,1,0` |
| **COMB-004** | `alu_4bit.v` | `Verilator → WebAssembly` | **PASS** | `SW=0x35`, `KEY=0..3` -> `LEDR=8,2,1,6` |
| **SEQ-001** | `dff.v` | `Verilator → WebAssembly` | **PASS** | Synchronous reset & D capture verified |
| **SEQ-002** | `tff.v` | `Verilator → WebAssembly` | **PASS** | Toggles on `posedge CLOCK_50` when `SW[0]=1` |
| **CNT-001** | `counter_8bit.v` | `Verilator → WebAssembly` | **PASS** | Verified in Preset 1 (`counter[7:0]`) and standalone |
| **FSM-001** | `fsm_2state.v` | `Verilator → WebAssembly` | **PASS** | Transitions cleanly between `S_IDLE` and `S_ACTIVE` |
| **FSM-002** | `fsm_4state.v` | `Verilator → WebAssembly` | **PASS** | Exposes `state[1:0]`, initial `LEDR = 1` (`4'b0001`) |
| **MAT-001** | `matrix_smiley.v` | `Verilator → WebAssembly` | **PASS** | Smiley pattern verified across rows `0..14` |
| **MAT-002** | `matrix_scanned.v` | `Verilator → WebAssembly` | **PASS** | Multiplexed Row / Column scanning verified |
| **MAT-003** | `matrix_animated.v` | `Verilator → WebAssembly` | **PASS** | Frame shift increments after `row_idx == 15` |

---

### B. GUI I/O Pin Configuration Tests (`tests/io_config/` & `ioConfig.test.ts`)

| Test ID | Target | Result | Details |
|---|---|---|---|
| **IOCFG-001** | `custom_ports.v` | **PASS** | Auto-detects 7 custom ports (`sys_pulse`, `ctrl_btns`, `dip_inputs`, `red_bar`, `green_bar`, `digit_seg`, `optional_debug`); maps 6 to `CLOCK`/`KEY`/`SW`/`LEDR`/`LEDG`/`HEX0` and leaves `optional_debug` `Unassigned` without blocking simulation. |
| **IOCFG-002** | `direction_width_validation.v` | **PASS** | Rejects direction mismatches (`DIRECTION_MISMATCH`), 4-bit Clock (`CLOCK_WIDTH_INVALID`), and 4-bit HEX (`HEX_WIDTH_TOO_SMALL`) as `Invalid Assignment`; warns on 12-bit `SW`, 8-bit `HEX` DP, and 12-bit `MATRIX_ROW`. |
| **IOCFG-003** | `duplicate_conflicts.v` | **PASS** | Flags duplicate `KEY` and `LEDR` assignments as `Conflict`, excludes conflicting ports from active board mapping until resolved, and emits `MATRIX_MISSING_COL` resource warning. |
| **IOCFG-004** | `persistence_updates.v` | **PASS** | Preserves unchanged assignments across edits, detects added/removed ports, marks direction/width changes as `Invalid Assignment`, and retains prior assignments during transient mid-edit syntax errors. |

---

### C. Limitations, Waveform & Deployment Tests

| Test ID | Target | Result | Details |
|---|---|---|---|
| **LIM-001** | `signal_64bit.v` | **PASS** | Compiles to `Verilator → WebAssembly`; exposes 64-bit `wide_out[63:0]`. |
| **LIM-002** | `signal_65bit.v` | **BOUNDARY CONFIRMED** | Falls back to `Verilator → JS (fallback)`; `FpgaRuntime` skips >64-bit port. |
| **LIM-003** | `signal_256bit.v` | **BOUNDARY CONFIRMED** | `FpgaRuntime` filters >64-bit `matrix_flat[255:0]`. |
| **LIM-004** | `multidim_array.v` | **PARTIAL** | Uninitialized 2D array compiles in WASM; omitted from `SignalMonitor`. |
| **LIM-005** | `generate_block.v` | **PASS** | `generate` / `genvar` loop elaborated cleanly. |
| **LIM-006** | `module_instantiation.v` | **PASS** | Parameterized submodule elaboration verified. |
| **LIM-007** | `readmemh_rom.v` | **PASS** | `$readmemh` initializes ROM via `getFileData` + `hdlwasm.ts` array address fix. |
| **WAV-001**..**003** | Waveform tests | **PASS** | Clock half-cycles, combinational input toggles, and full-width `HEX`/`BIN`/`DEC` bus traces verified. |
| **DEP-001** | GitHub Pages smoke | **PASS** | Live GitHub Pages deployment serves all bundles, `verilator_bin.wasm`, GUI I/O Pin Configuration, and `EN` / `繁體中文` localization with zero console errors. |
