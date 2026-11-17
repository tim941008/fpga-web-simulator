# HDL Compatibility & Regression Test Execution Report

**Execution Date:** 2026-11-18  
**Target Build:** `https://tim941008.github.io/fpga-web-simulator/`  
**Test Suite Location:** [`tests/`](file:///c:/Users/User/Desktop/SIM_QQ/tests) (26 test specifications across 9 categories)

---

## 1. Overall Summary (Post Bug-Fix Verification)

| Category | Total Tests | Passed (Functional / Expected Behavior Verified) | Documented Architectural Boundary (>64-Bit / Unpacked Array UI) |
|---|---|---|---|
| **Combinational (`tests/combinational/`)** | 4 | 4 (`COMB-001`..`004`) | 0 |
| **Sequential (`tests/sequential/`)** | 2 | 2 (`SEQ-001`, `SEQ-002`) | 0 |
| **Counter (`tests/counter/`)** | 1 | 1 (`CNT-001`) | 0 |
| **FSM (`tests/fsm/`)** | 2 | 2 (`FSM-001`, `FSM-002`) | 0 |
| **16×16 Matrix (`tests/matrix/`)** | 3 | 3 (`MAT-001`..`003`) | 0 (`BUG-005` fixed) |
| **Quartus QSF (`tests/qsf/`)** | 3 | 3 (`QSF-001`, `QSF-002`, `QSF-003`) | 0 (`BUG-003` & `BUG-004` fixed) |
| **Waveform (`tests/waveform/`)** | 3 | 3 (`WAV-001`, `WAV-002`, `WAV-003`) | 0 (`BUG-007` & `BUG-010` fixed) |
| **Limitations (`tests/limitations/`)** | 7 | 4 (`LIM-001`, `LIM-005`, `LIM-006`, `LIM-007`) | 3 (`LIM-002`, `LIM-003` >64-bit cap; `LIM-004` array hidden from UI) |
| **Deployment (`tests/deployment/`)** | 1 | 1 (`DEP-001`) | 0 |
| **Total** | **26** | **23** | **3 (Confirmed >64-bit & array UI boundaries)** |

---

## 2. Detailed Test Run Results

### A. Combinational, Sequential, Counter, FSM & Matrix Tests
Executed against the live in-browser **Verilator WebAssembly** pipeline (`verilator_bin.wasm` → `VerilogXMLParser` → `HDLModuleWASM`):

| Test ID | Design | Backend Used | Compile Time | Result | Notes |
|---|---|---|---|---|---|
| **COMB-001** | `and_gate.v` | `Verilator → WebAssembly` | ~10 ms + 4 ms | **PASS** | `SW=0..3` -> `LEDR=0,0,0,1` |
| **COMB-002** | `or_gate.v` | `Verilator → WebAssembly` | ~10 ms + 4 ms | **PASS** | `SW=0..3` -> `LEDR=0,1,1,1` |
| **COMB-003** | `xor_gate.v` | `Verilator → WebAssembly` | ~10 ms + 4 ms | **PASS** | `SW=0..3` -> `LEDR=0,1,1,0` |
| **COMB-004** | `alu_4bit.v` | `Verilator → WebAssembly` | 61 ms + 17 ms | **PASS** | `SW=0x35`, `KEY=0..3` -> `LEDR=8,2,1,6` |
| **SEQ-001** | `dff.v` | `Verilator → WebAssembly` | 65 ms + 8 ms | **PASS** | `4 ports • 0 internal signals`; synchronous reset & D capture verified |
| **SEQ-002** | `tff.v` | `Verilator → WebAssembly` | ~15 ms + 5 ms | **PASS** | Toggles on `posedge CLOCK_50` when `SW[0]=1` |
| **CNT-001** | `counter_8bit.v` | `Verilator → WebAssembly` | 45 ms + 20 ms | **PASS** | Verified in Preset 1 (`counter[7:0]`) and standalone |
| **FSM-001** | `fsm_2state.v` | `Verilator → WebAssembly` | ~12 ms + 6 ms | **PASS** | Transitions cleanly between `S_IDLE` and `S_ACTIVE` |
| **FSM-002** | `fsm_4state.v` | `Verilator → WebAssembly` | 13 ms + 8 ms | **PASS** | `4 ports • 1 internal signal` (`state[1:0]`), initial `LEDR = 1` (`4'b0001`) |
| **MAT-001** | `matrix_smiley.v` | `Verilator → WebAssembly` | ~20 ms + 11 ms | **PASS** | Smiley pattern verified across rows `0..14` |
| **MAT-002** | `matrix_scanned.v` | `Verilator → WebAssembly` | ~20 ms + 11 ms | **PASS** | Multiplexed `MATRIX_ROW` / `MATRIX_COL` scanning verified |
| **MAT-003** | `matrix_animated.v` | `Verilator → WebAssembly` | ~20 ms + 11 ms | **PASS** | Frame shift increments after `row_idx == 15` |

---

### B. Limitations & Boundary Tests (`tests/limitations/`)

| Test ID | Design | Observed Backend | Compile Time | Observed Behavior | Verdict |
|---|---|---|---|---|---|
| **LIM-001** | `signal_64bit.v` (`[63:0]`) | `Verilator → WebAssembly` | 12 ms + 5 ms | `0 errors, 0 warnings`; exposes all `3 ports` (`CLOCK_50`, `KEY`, `wide_out[63:0]`). | **PASS (Supported up to 64-bit)** |
| **LIM-002** | `signal_65bit.v` (`[64:0]`) | `Verilator → JS (fallback)` | 56 ms + 2 ms | Emits warning: `WASM codegen failed (cannot load 16 bytes (> 64 bits not supported)); using JS backend`. `FpgaRuntime` drops `over64_out[64:0]` (`2 ports` shown). | **BOUNDARY CONFIRMED (>64-bit cap)** |
| **LIM-003** | `signal_256bit.v` (`[255:0]`) | `Verilator → WebAssembly` | 8 ms + 10 ms | `FpgaRuntime` (`if (width > 64) continue`) omits `matrix_flat[255:0]`, leaving `1 port` (`SW[7:0]`). | **BOUNDARY CONFIRMED (>64-bit port filter)** |
| **LIM-004** | `multidim_array.v` (`[7:0] mem2d [0:3][0:3]`) | `Verilator → WebAssembly` | 60 ms + 3 ms | Uninitialized 2D unpacked array compiles with `0 errors, 0 warnings`, while `mem2d` is omitted from `SignalMonitor`. | **PARTIAL (Compiles uninitialized; hidden from UI)** |
| **LIM-005** | `generate_block.v` (`genvar i`) | `Verilator → WebAssembly` | 9 ms + 4 ms | `0 errors, 0 warnings`; `2 ports` (`SW[7:0] = 0`, `LEDR[7:0] = 0xFF`). | **PASS (`generate` fully elaborated by Verilator)** |
| **LIM-006** | `module_instantiation.v` (`nibble_adder #(.WIDTH(4))`) | `Verilator → WebAssembly` | 7 ms + 3 ms | `0 errors, 0 warnings`; Verilator elaborates parameter override and inlines `u_add` (`2 ports`: `SW[7:0]`, `LEDR[4:0]`). | **PASS (Parameterized submodule supported)** |
| **LIM-007** | `readmemh_rom.v` (`$readmemh`) | `Verilator → WebAssembly` | 7 ms + 8 ms | Wired `getFileData` (`src/sim/fpgaRuntime.ts`) and fixed small-array address passing (`isArrayType(global.type)` in `hdlwasm.ts:874`). | **PASS (`BUG-002` Fixed)** |

---

### C. QSF, Waveform & Deployment Tests (`tests/qsf/`, `tests/waveform/`, `tests/deployment/`)

| Test ID | Target | Result | Details |
|---|---|---|---|
| **QSF-001** | `valid_mappings.qsf` | **PASS** | All 7 pin categories (`CLOCK`, `KEY`, `SW`, `LED`, `HEX`, `MATRIX_ROW`, `MATRIX_COL`) and globals parsed accurately. |
| **QSF-002** | `duplicate_pins.qsf` | **PASS (`BUG-004` Fixed)** | `parseQsfFile()` detects duplicate `PIN_A8` (`KEY[3]`, `LEDR[0]`) and surfaces an amber conflict warning banner and red `⚠ Pin Conflict` badges in UI. |
| **QSF-003** | `missing_signals.qsf` | **PASS (`BUG-003` Fixed)** | `buildBoardControlGroups()` filters out unconnected QSF signals when `ports.length > 0`; no phantom board controls are rendered. |
| **WAV-001** | `clock_transitions.v` | **PASS** | `Step Cycle` records rising and falling half-cycles and renders 1-bit SVG waveforms. |
| **WAV-002** | `input_transitions.v` | **PASS (`BUG-007` Fixed)** | Toggling combinational inputs (`SW`) appends transition samples to `history` immediately. |
| **WAV-003** | `output_transitions.v` | **PASS (`BUG-010` Fixed)** | Multi-bit bus waveform chips dynamically format in `HEX`, `BIN` (full bit width, `BUG-006` fixed), or `DEC`. |
| **DEP-001** | `gh_pages_smoke.expected.json` | **PASS** | Live GitHub Pages deployment serves all bundles, `verilator_bin.wasm`, and `EN` / `繁體中文` localization with zero console errors. |
