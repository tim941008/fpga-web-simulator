# Verilog / SystemVerilog & Peripheral Compatibility Matrix

This matrix documents the empirically verified HDL language and hardware peripheral support of **Web FPGA Simulator** (`verilator_bin.wasm` + `VerilogXMLParser` + `HDLModuleWASM` / `HDLModuleJS` + `FpgaRuntime` + GUI `ioConfig`).

**Legend:**
- ✅ **Supported** — Fully functional and verified in the live Verilator WASM pipeline.
- ⚠️ **Partial** — Works under specific constraints or with known UI/runtime caveats.
- ❌ **Unsupported** — Fails compilation, codegen, or runtime execution.

---

## 1. Verilog / SystemVerilog HDL Constructs

| Feature / Construct | Status | Verification Test | Details & Constraints |
|---|---|---|---|
| **Module & Port Declarations (`input`, `output`, `wire`, `reg`, `logic`)** | ✅ Supported | `COMB-001`..`004`, `SEQ-001`, `IOCFG-001` | Supports scalar and packed vector ports up to **64 bits** (`[63:0]`), ANSI and non-ANSI styles, and arbitrary custom port names. |
| **Continuous Assignment (`assign`)** | ✅ Supported | `COMB-001`..`003`, `MAT-002` | Full support for bitwise, logical, shift, relational, and arithmetic expressions. |
| **Combinational Procedural Blocks (`always @(*)`, `always_comb`)** | ✅ Supported | `COMB-004`, `MAT-001` | Settled automatically via Verilator `_eval_settle` and `_eval` delta loop. |
| **Edge-Triggered Sequential Blocks (`always @(posedge/negedge)`, `always_ff`)** | ✅ Supported | `SEQ-001`, `SEQ-002`, `CNT-001` | Supports synchronous and asynchronous resets, blocking (`=`) and non-blocking (`<=`) assignments. |
| **Conditional & Branching (`if / else`, `case / casex / casez`)** | ✅ Supported | `COMB-004`, `FSM-001`, `FSM-002` | Full support for nested conditionals, ternary `?:`, and `case` tables. |
| **Concatenation `{a, b}` & Replication `{N{a}}`** | ✅ Supported | `COMB-004`, `WAV-003` | Works for packed results ≤ 64 bits. |
| **`generate` Blocks & `genvar` For-Loops** | ✅ Supported | `LIM-005` | Elaborated and unrolled by `verilator_bin.wasm` prior to XML codegen (`Verilator → WebAssembly`). |
| **Parameterized Modules (`#(parameter ...)` & `localparam`)** | ✅ Supported | `LIM-006`, `FSM-001`, `FSM-002` | Elaborated by Verilator across module hierarchy (`nibble_adder #(.WIDTH(4))`). |
| **Submodule Instantiation (Inlined Hierarchy)** | ⚠️ Partial | `LIM-006` | Works when Verilator (`-O3`) inlines submodules into `TOP`. Non-inlined cells throw `multiple non-flattened modules not yet supported` in `vxmlparser.ts`. |
| **Finite State Machines (FSM)** | ✅ Supported | `FSM-001`, `FSM-002` | Works cleanly with `parameter` / `localparam` state encodings. SystemVerilog `typedef enum` casts are not supported in `HDLModuleWASM`. |
| **Packed Signals up to 64 Bits (`[63:0]`)** | ✅ Supported | `LIM-001` | Mapped to WebAssembly `i32` (1–32 bits) and `i64` (33–64 bits). |
| **Packed Signals > 64 Bits (`[64:0]`, `[255:0]`)** | ❌ Unsupported | `LIM-002`, `LIM-003` | `HDLModuleWASM` throws `> 64 bits not supported` (falling back to JS), and `FpgaRuntime` filters out all ports/signals with `width > 64`. |
| **1D & 2D Unpacked Arrays (RAM / Registers)** | ⚠️ Partial | `LIM-004` | Uninitialized 1D/2D arrays compile and simulate in WASM, but arrays are hidden from `SignalMonitor` and multidimensional `initarray` literals fail in `HDLModuleWASM`. |
| **`$readmemh` / `$readmemb` External ROM/RAM Files** | ✅ Supported | `LIM-007` | Supported for 1D 8-bit arrays via uploaded `.hex`/`.mem` files or the `+ Add rom_init.hex` editor helper. |
| **Multi-File `` `include `` with Subdirectories** | ⚠️ Partial | — | Flat includes (`"defs.vh"`) work if uploaded together; subdirectory paths (`"sub/defs.vh"`) fail because `verilator-worker.js` flattens `/` to `_`. |
| **SystemVerilog `interface` & `struct` / `union`** | ❌ Unsupported | — | Explicitly rejected by `VerilogXMLParser` (`interfaces not supported`, `structs not supported`). |

---

## 2. GUI I/O Pin Configuration & Board Peripheral Support

| Peripheral / Feature | Status | Verification Test | Details & Constraints |
|---|---|---|---|
| **GUI I/O Pin Configuration & Automatic Port Detection** | ✅ Supported | `IOCFG-001`..`004` | Automatically detects top-module port names, directions, and bit widths; supports arbitrary custom port names, dropdown assignment, `localStorage` persistence, and automatic reconciliation on code edits. |
| **Direction, Width & Resource Conflict Validation** | ✅ Supported | `IOCFG-002`, `IOCFG-003` | Enforces Input/Output direction compatibility, strict 1-bit Clock and >=7-bit HEX checks, width-mismatch warnings, duplicate component conflicts (`Conflict`), and partial matrix warnings. |
| **Slide Switches (`SW`, up to 10-bit) & Discrete LEDs (`LEDR` 10-bit / `LEDG` 8-bit)** | ✅ Supported | `COMB-001`..`004`, `CNT-001`, `IOCFG-001` | Distinct Red (`LEDR`) and Green (`LEDG`) LED banks and interactive slide switches mapped to any compatible custom Verilog port name. |
| **Push Buttons (`KEY`, up to 4-bit)** | ⚠️ Partial | `SEQ-001`, `CNT-001`, `IOCFG-001` | Supports Momentary Push and Toggle Latch modes; defaults to Active-High (`0` idle, `1` pressed) without an Active-Low hardware toggle. |
| **7-Segment Displays (`HEX0`–`HEX5`, 7-bit)** | ✅ Supported | Preset 1–3, `IOCFG-001` | Renders segments `a`–`g` (`[6:0]`) with Active-LOW (`0=ON`) and Active-HIGH (`1=ON`) toggle; warns if 8-bit port (DP bit 7 unused) is assigned. |
| **16×16 LED Dot-Matrix (`MATRIX_ROW` / `MATRIX_COL`, 16-bit)** | ✅ Supported | `MAT-001`..`003`, `IOCFG-003` | Supports direct and scanned multiplexing, 4 LED color themes, POV Scan Hold toggle, and Column Polarity toggle for any assigned Row/Col ports. |
| **Signal Monitor & Waveform Trace** | ✅ Supported | `WAV-001`..`003` | Captures 64 samples (clock edges and combinational input toggles) with SVG 1-bit traces, full-width `HEX`/`BIN`/`DEC` bus chips, and live Assigned Component column. |
