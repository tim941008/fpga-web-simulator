# Verilog / SystemVerilog & Peripheral Compatibility Matrix

This matrix documents the empirically verified HDL language and hardware peripheral support of **Web FPGA Simulator** (`verilator_bin.wasm` + `VerilogXMLParser` + `HDLModuleWASM` / `HDLModuleJS` + `FpgaRuntime` + `qsfParser`).

**Legend:**
- ✅ **Supported** — Fully functional and verified in the live Verilator WASM pipeline.
- ⚠️ **Partial** — Works under specific constraints or with known UI/runtime caveats.
- ❌ **Unsupported** — Fails compilation, codegen, or runtime execution.

---

## 1. Verilog / SystemVerilog HDL Constructs

| Feature / Construct | Status | Verification Test | Details & Constraints |
|---|---|---|---|
| **Module & Port Declarations (`input`, `output`, `wire`, `reg`, `logic`)** | ✅ Supported | `COMB-001`..`004`, `SEQ-001` | Supports scalar and packed vector ports up to **64 bits** (`[63:0]`). *(Note: Pre-compile regex parser `verilogParser.ts` has `BUG-001`, resolved once Verilator finishes compiling.)* |
| **Continuous Assignment (`assign`)** | ✅ Supported | `COMB-001`..`003`, `MAT-002` | Full support for bitwise, logical, shift, relational, and arithmetic expressions. |
| **Combinational Procedural Blocks (`always @(*)`, `always_comb`)** | ✅ Supported | `COMB-004`, `MAT-001` | Settled automatically via Verilator `_eval_settle` and `_eval` delta loop. |
| **Edge-Triggered Sequential Blocks (`always @(posedge/negedge)`, `always_ff`)** | ✅ Supported | `SEQ-001`, `SEQ-002`, `CNT-001` | Supports synchronous and asynchronous resets, blocking (`=`) and non-blocking (`<=`) assignments. |
| **Conditional & Branching (`if / else`, `case / casex / casez`)** | ✅ Supported | `COMB-004`, `FSM-001`, `FSM-002` | Full support for nested conditionals, ternary `?:`, and `case` tables. |
| **Concatenation `{a, b}` & Replication `{N{a}}`** | ✅ Supported | `COMB-004`, `WAV-003` | Works for packed results ≤ 64 bits. |
| **`generate` Blocks & `genvar` For-Loops** | ✅ Supported | `LIM-005` | Elaborated and unrolled by `verilator_bin.wasm` prior to XML codegen (`Verilator → WebAssembly`, 9 ms). |
| **Parameterized Modules (`#(parameter ...)` & `localparam`)** | ✅ Supported | `LIM-006`, `FSM-001`, `FSM-002` | Elaborated by Verilator across module hierarchy (`nibble_adder #(.WIDTH(4))`). |
| **Submodule Instantiation (Inlined Hierarchy)** | ⚠️ Partial | `LIM-006` | Works when Verilator (`-O3`) inlines submodules into `TOP`. Non-inlined cells throw `multiple non-flattened modules not yet supported` in `vxmlparser.ts`. |
| **Finite State Machines (FSM)** | ✅ Supported | `FSM-001`, `FSM-002` | Works cleanly with `parameter` / `localparam` state encodings. SystemVerilog `typedef enum` casts are not supported in `HDLModuleWASM`. |
| **Packed Signals up to 64 Bits (`[63:0]`)** | ✅ Supported | `LIM-001` | Mapped to WebAssembly `i32` (1–32 bits) and `i64` (33–64 bits). |
| **Packed Signals > 64 Bits (`[64:0]`, `[255:0]`)** | ❌ Unsupported | `LIM-002`, `LIM-003` | `HDLModuleWASM` throws `> 64 bits not supported` (or splits stores), and `FpgaRuntime` filters out all ports/signals with `width > 64`. |
| **1D & 2D Unpacked Arrays (RAM / Registers)** | ⚠️ Partial | `LIM-004` | Uninitialized 1D/2D arrays compile and simulate in WASM, but arrays are hidden from `SignalMonitor` and multidimensional `initarray` literals fail in `HDLModuleWASM`. |
| **`$readmemh` / `$readmemb` External ROM/RAM Files** | ❌ Unsupported | `LIM-007` | Fails at reset (`no file "..." for $readmem` / `this.getFileData is not a function`) because `FpgaRuntime` does not wire `model.getFileData` (`BUG-002`). |
| **Multi-File `` `include `` with Subdirectories** | ⚠️ Partial | — | Flat includes (`"defs.vh"`) work if uploaded together; subdirectory paths (`"sub/defs.vh"`) fail because `verilator-worker.js` flattens `/` to `_`. |
| **SystemVerilog `interface` & `struct` / `union`** | ❌ Unsupported | — | Explicitly rejected by `VerilogXMLParser` (`interfaces not supported`, `structs not supported`). |

---

## 2. Quartus QSF & Board Peripheral Support

| Peripheral / Feature | Status | Verification Test | Details & Constraints |
|---|---|---|---|
| **QSF Global & Location Assignments (`PIN_...`, `IO_STANDARD`)** | ✅ Supported | `QSF-001` | Parses `FAMILY`, `DEVICE`, `TOP_LEVEL_ENTITY`, `set_location_assignment`, and `IO_STANDARD`. |
| **Slide Switches (`SW`) & Discrete LEDs (`LEDR` / `LEDG`)** | ✅ Supported | `COMB-001`..`004`, `CNT-001` | Interactive toggle switches and red/emerald LEDs with physical pin labels. |
| **Push Buttons (`KEY`)** | ⚠️ Partial | `SEQ-001`, `CNT-001` | Supports both Momentary Push and Toggle Latch modes, but defaults to Active-High (`0` idle, `1` pressed) without an Active-Low hardware toggle. |
| **7-Segment Displays (`HEX0`–`HEX7`)** | ✅ Supported | Preset 1 & 2 | Renders segments `a`–`g` (`[6:0]`) with Active-LOW (`0=ON`) and Active-HIGH (`1=ON`) toggle. (Bit 7 `DP` is not rendered.) |
| **16×16 LED Dot-Matrix (`MATRIX_ROW` / `MATRIX_COL`)** | ⚠️ Partial | `MAT-001`..`003` | Supports direct and scanned multiplexing, 4 LED color themes, and Column Polarity toggle; POV decay runs per 16 ms UI frame rather than per clock cycle (`BUG-005`). |
| **QSF Duplicate Pin Conflict Detection** | ❌ Unsupported | `QSF-002` | Duplicate physical pin assignments (e.g., `PIN_A8` on both `KEY[3]` and `LEDR[0]`) are accepted without warning (`BUG-004`). |
| **QSF Orphan Pin Filtering on Custom `.v` Upload** | ⚠️ Partial | `QSF-003` | Unmatched QSF pins generate phantom board controls if an older QSF remains loaded (`BUG-003`). |
| **Signal Monitor & Waveform Trace** | ⚠️ Partial | `WAV-001`..`003` | Captures 64 half-cycle samples with SVG 1-bit traces and Hex/Bin/Dec formatting, but `BIN` pads up to 16 bits (`BUG-006`) and combinational input changes do not append trace samples (`BUG-007`). |
