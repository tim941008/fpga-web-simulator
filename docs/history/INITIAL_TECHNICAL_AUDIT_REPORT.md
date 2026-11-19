# Web FPGA Simulator — Technical Audit Report

**Date:** 2026-11-18  
**Scope:** Full codebase audit (`src/`, `public/verilator/`, `.github/`, build & dependency configuration).  
**Important Note on Codebase State:** Although the project originally started with a custom TypeScript Verilog interpreter (`verilatorWasmBackend.ts`), that file has since been **removed and replaced** by an integration of **8bitworkshop's Verilator-to-WASM pipeline** (`public/verilator/verilator_bin.wasm` + `src/vendor/8bitworkshop/hdl/*` + `src/sim/fpgaRuntime.ts`). However, **Node.js is not installed in the current environment**, so neither `npm install` nor `npm run build` has been executed yet, and **none of the code has been runtime-verified**.

---

## 1. Component Readiness Assessment

### Production-Ready (or Near Production-Ready, Pending Build Verification)

| Component / File | Status | Notes |
|---|---|---|
| **QSF Pin Parser & Mapper** (`src/parsers/qsfParser.ts`) | **Solid / Near Production** | Accurately parses `set_global_assignment` (`FAMILY`, `DEVICE`, `TOP_LEVEL_ENTITY`), `set_location_assignment`, and `set_instance_assignment -name IO_STANDARD`. Auto-classifies `CLOCK`, `KEY`, `SW`, `LED`, `HEX`, `MATRIX_ROW`, `MATRIX_COL`, `MATRIX_PIXEL` and merges with module ports via `buildBoardControlGroups()`. |
| **7-Segment Display** (`src/components/SevenSegmentDisplay.tsx`) | **Production-Ready** | Clean SVG 7-segment renderer (`a`–`g` bits 0–6), supports Active-LOW (`0=ON`) and Active-HIGH (`1=ON`) polarity toggle, displays hex value and pin tooltips. |
| **Sample Presets** (`src/presets/sampleDesigns.ts`) | **Production-Ready** | Includes two well-structured `.v` + `.qsf` pairs: DE10-Lite Counter + 7-Seg + 16×16 Matrix Scanner, and Combinational 4-Bit ALU. |
| **UI Layout & Styling** (`src/App.tsx`, `tailwind.config.js`, `index.html`) | **Near Production** | Clean dark-mode TailwindCSS layout, multi-file `.v` upload/editor, `.qsf` upload/viewer, compiler diagnostics panel, and GitHub Pages-compatible Vite config (`base: './'`). |

### Prototypes Only / Incomplete / Blocked

| Component / File | Status | Issues & Gaps Found |
|---|---|---|
| **Build & Dependency Config** (`package.json`, `.github/workflows/deploy.yml`) | **Broken (Blocker)** | `src/vendor/8bitworkshop/hdl/binaryen-shim.ts` imports `binaryen`, **but `binaryen` is missing from `package.json`**. `tsc -b` and `vite build` will fail until `binaryen` (`^101.0.0`) is added. Also, `deploy.yml` specifies `cache: 'npm'`, which fails in GitHub Actions if `package-lock.json` is not committed. |
| **Verilator WASM Backend** (`src/sim/fpgaRuntime.ts`, `public/verilator/verilator-worker.js`, `src/vendor/8bitworkshop/`) | **Prototype (Unverified)** | Uses 8bitworkshop's `verilator_bin.wasm` (6.1 MB) in a classic Web Worker to emit Verilator XML, parsed by `VerilogXMLParser` and compiled to WASM via `HDLModuleWASM` (with `HDLModuleJS` fallback). Unverified in a browser; `getFileData` is not wired (breaks `$readmemh`/`$readmemb`); signals `> 64` bits and arrays are skipped in `FpgaRuntime`. |
| **Regex Verilog Pre-Parser** (`src/parsers/verilogParser.ts`) | **Prototype** | Regex-based module/port extractor still used by `App.tsx` to guess `topModule` and show ports before Verilator finishes. Breaks on preprocessor macros/`` `include ``, nested modules, and complex parameter expressions. |
| **Interactive FPGA Board** (`src/components/BoardView.tsx`) | **Prototype** | Functional for `SW`, `KEY`, `LEDR`/`LEDG`, `HEX`, but lacks generic `GPIO` pin rendering, 7-segment decimal point (`DP`, bit 7), and hardware-accurate active-low `KEY` default (`1` idle, `0` pressed) for boards like DE10-Lite. |
| **16×16 Matrix Viewer** (`src/components/MatrixViewer.tsx` + `App.tsx` sampling) | **Prototype** | Renders 16×16 LEDs with POV decay (`0.85` per frame) and polarity toggle, but **only updates once per UI frame or single-step**, not accurately synced to high-speed multiplexed scan frequencies (> 60 Hz) where `runCycles(n)` runs `n` cycles in a tight loop and overwrites `buf[r][c]` without per-cycle decay. |
| **Signal Monitor / Waveform Viewer** (`src/components/SignalMonitor.tsx`) | **Prototype** | Captures only the last 24–64 samples in a plain HTML table. Single-bit signals render a basic fixed-width (`240px`) SVG trace; multi-bit buses only show the last 8 hex values as text badges (no bus waveform, no zoom/pan, no cursor, no VCD export). |
| **Clock Controls** (`src/components/ClockControls.tsx`) | **Prototype** | Supports only a single auto-detected clock signal (`clkName`). Designs with multiple clocks or PLL-derived clocks cannot be stepped independently. |

---

## 2. Verilog Syntax Support Analysis

Because simulation now runs through **Verilator (`verilator_bin.wasm`) → XML AST (`VerilogXMLParser`) → Binaryen WASM (`HDLModuleWASM`) / JS (`HDLModuleJS`)**, syntax support is determined by the **intersection** of Verilator's elaboration and 8bitworkshop's `vxmlparser.ts` / `hdlwasm.ts` codegen.

### Actually Supported Syntax
- **Module & Ports:** ANSI and non-ANSI `input`/`output`/`inout` ports, scalar and packed vectors up to **64 bits** (`wire`, `reg`, `logic`, `signed`).
- **Combinational Logic:** Continuous `assign`, `always @(*)`, `always_comb`, bitwise/logical/arithmetic/relational/shift operators, ternary `?:`, concatenation `{a, b}`, replication `{N{a}}`, bit-selects and part-selects.
- **Sequential Logic:** `always @(posedge clk)`, `always @(negedge clk)`, `always_ff`, blocking (`=`) and non-blocking (`<=`) assignments, asynchronous reset (`always @(posedge clk or posedge rst)`).
- **Control Flow:** `if / else`, `case / casex / casez / default`.
- **System Tasks (partial):** `$finish`, `$stop`, `$time`, `$urandom`/`$rand` (via `builtins` imports in `hdlwasm.ts`). `$display` is parsed as a no-op (`visit_display` returns `null`).

### Syntax That Will Fail or Partially Fail

| Verilog Feature | Status in Current Pipeline | Root Cause in Codebase |
|---|---|---|
| **Module Instantiation** | **Partial / Fragile** | Verilator flattens small/standard submodules into `TOP`. However, if Verilator keeps cells unflattened, `vxmlparser.ts:387` throws `CompileError: multiple non-flattened modules not yet supported`. Also, multi-file `` `include `` paths in `verilator-worker.js` are flattened to root filenames (`safe = f.name.replace(...)`), breaking relative directory includes. |
| **`generate` / `genvar`** | **Supported (via Verilator)** | Unlike a custom TS interpreter, `verilator_bin.wasm` elaborates `generate` blocks and `genvar` loops into flat AST nodes before emitting XML. However, `verilogParser.ts` (pre-compile UI preview) ignores `generate` blocks. |
| **`for` loop** | **Partial** | Static loops unrolled by Verilator work. Dynamic `for`/`while` loops lower to `HDLWhileOp` (`while` in `hdlwasm.ts:1005`), which works for simple counters but can fail on complex loop-carried dependencies or hit `maxEvalIterations = 100`. |
| **Memory Arrays** | **Partial / Broken for `$readmem`** | 1D unpacked arrays (`reg [7:0] mem [0:255]`) with element width ≤ 64 bits are supported by `hdlwasm.ts`. **Fails on:** (1) multidimensional arrays (`hdlwasm.ts:563` throws `non-const expr in initarray (multidimensional arrays not supported)`), (2) elements > 64 bits (`hdlwasm.ts:72`), (3) **`$readmemh`/`$readmemb`** — `fpgaRuntime.ts` never assigns `model.getFileData`, so any ROM/RAM init via `$readmem` throws `no file "..." for $readmem`, and (4) arrays are hidden from `SignalMonitor` (`fpgaRuntime.ts:144`). |
| **Parameterized Modules** | **Supported (via Verilator)** | `verilator_bin.wasm` elaborates `parameter` and `localparam` overrides `#(...)` at compile time. However, `verilogParser.ts` does not resolve `#(...)` overrides on instantiations for the pre-compile UI preview. |
| **FSM (Finite State Machines)** | **Mostly Supported** | Standard `localparam`/`parameter` state encodings with `always @(posedge clk)` + `case (state)` work cleanly. **Fails/Issues:** (1) SystemVerilog `enum` / `typedef` can trigger `Unknown data type` or `cannot cast` in `vxmlparser.ts`/`hdlwasm.ts`, (2) multi-clock FSMs cannot be driven because `App.tsx` only steps one clock, and (3) DE10-Lite-style active-low `rst_n` connected to `KEY[0]` starts at `0` (reset asserted) because `BoardView.tsx` initializes `KEY` to `0` instead of `1`. |

### Additional Hard Limits in Current Backend
- **Signals > 64 bits** (`reg [127:0]`): Rejected by `hdlwasm.ts:779` (`data types > 64 bits not supported`) and skipped by `fpgaRuntime.ts:147`.
- **SystemVerilog Interfaces & Structs:** Explicitly throw `CompileError: interfaces not supported` (`vxmlparser.ts:316`) and `structs not supported` (`vxmlparser.ts:443`).
- **GPL-3.0 License Viral Requirement:** Vendoring `8bitworkshop` (`verilator_bin.wasm` + `hdlwasm.ts`) places the entire repository under **GPL-3.0** (`LICENSE`).

---

## 3. Architecture Recommendation: A vs. B vs. C

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Custom Verilog Interpreter** | Zero WASM download, permissive license, full control. | Re-implementing IEEE 1364/1800 elaboration (`generate`, `parameter`, hierarchy, non-blocking semantics, signed math, bit-width propagation) in TypeScript is a multi-year compiler project. | **Reject** |
| **B. Tree-Sitter + Interpreter** | Real CST parsing (solves syntax tokenization). | Tree-sitter only gives a syntax tree—no elaboration, no type/width inference, no `generate` unrolling, no cycle-accurate scheduling. Still requires writing a full Verilog elaborator + simulator. | **Reject** |
| **C. Verilator + WASM** | Industry-standard SystemVerilog/Verilog parser, elaborator, optimizer, and cycle-accurate scheduler in the browser. Handles `generate`, `parameter`, module hierarchy, `for` loops, and FSMs out of the box. | 6.1 MB WASM payload; 8bitworkshop's `HDLModuleWASM` has a 64-bit signal cap and GPL-3.0 license. (Alternative: YoWASP `@yowasp/yosys` + gate/RTL sim if ISC/MIT license is required, though slower than Verilator WASM.) | **Recommend C (Continue & Harden Current Path)** |

**Recommendation:** Continue with **Option C (Verilator + WASM)**, which is already partially integrated in `src/sim/fpgaRuntime.ts`. Fix the missing `binaryen` dependency, replace the regex `verilogParser.ts` port/top-module hacks with Verilator XML metadata, and wire `$readmem` / memory file uploads.

---

## 4. Migration & Stabilization Roadmap

### Phase 1: Fix Build & Verify Baseline (Immediate)
1. Install Node.js LTS (v20+) locally.
2. Add `"binaryen": "^101.0.0"` to `package.json` dependencies.
3. Run `npm install` (generating `package-lock.json` for `.github/workflows/deploy.yml`) and `npm run build` to fix any TypeScript/Vite bundling issues with `binaryen-shim.ts` and `verilator-worker.js`.
4. Smoke-test both built-in presets in `vite preview` and verify `verilator_bin.wasm` loads cleanly under GitHub Pages relative paths (`./verilator/...`).

### Phase 2: Harden Verilator WASM Runtime
1. **Wire `$readmem` file support:** Pass uploaded `.hex` / `.mem` / `.mif` / `.txt` files into `model.getFileData` in `FpgaRuntime`.
2. **Eliminate `verilogParser.ts` drift:** Keep `verilogParser.ts` only as a lightweight fallback for `topModule` guessing; use Verilator's parsed `HDLUnit` / `HDLModuleDef` for all port widths, directions, and hierarchies.
3. **Fix > 64-bit & array visibility:** Support wide vectors in `FpgaRuntime` (via `HDLModuleJS` fallback or multi-word reads) and expose memory arrays to a dedicated Memory Inspector tab.
4. **Support multi-file directories:** Preserve relative paths in `verilator-worker.js` Emscripten `FS` (`FS.mkdirTree`) so `` `include "foo/bar.vh" `` works.

### Phase 3: Hardware & QSF Accuracy
1. **Pin Mapper enhancements:** Parse `set_parameter`, `DIFF`/`LVDS` standards, and support active-low `KEY` polarity toggle (default `1` when unpressed on Altera/Intel boards) plus `HEX` bit 7 (`DP`).
2. **Multi-clock support:** Allow the user to designate which `CLOCK` pin(s) are driven by the main clock vs. independent dividers.
3. **Accurate 16×16 Matrix Scanner:** Accumulate row/col brightness **inside** the `runCycles(n)` loop with per-cycle or fixed-time-constant exponential decay, rather than only decaying once per 16 ms UI frame.

### Phase 4: Pro Waveform & Board UX
1. Upgrade `SignalMonitor.tsx` to a canvas/SVG waveform viewer with time-axis zoom/pan, cursor delta measurement, multi-bit bus rendering (hex/bin/dec), and **VCD export** for GTKWave/Surfer.
2. Add generic GPIO / UART / VGA virtual peripheral views driven by QSF pin assignments.

---

## 5. Development Effort Estimates

*Assumes 1 senior full-stack / EDA-savvy TypeScript engineer (1 person-day ≈ 6–8 focused hours).*

| Workstream | Scope | Estimated Effort |
|---|---|---|
| **1. Build Fix & Stabilization** | Add `binaryen` to `package.json`, generate `package-lock.json`, verify Vite + Worker + WASM bundling & GitHub Pages deploy. | **0.5 – 1 day** |
| **2. QSF Support** | Expand `qsfParser.ts` for comments/continuations, bus ranges, `set_parameter`, active-low pin polarity metadata, pin conflict warnings, and DE10-Lite / DE1-SoC / Cyclone IV board templates. | **1.5 – 2 days** |
| **3. Full Verilator Integration** | Wire `$readmem` data files, preserve virtual FS subdirectories for `` `include ``, handle `HDLModuleWASM` fallback/wide vectors cleanly, add memory array inspector, and remove reliance on regex `verilogParser.ts`. | **3 – 5 days** |
| **4. Interactive FPGA Board** | Active-low `KEY` polarity toggle, 7-seg `DP` segment, bidirectional/GPIO pin bank, board-specific visual layouts, and pin-highlight on hover. | **2 – 3 days** |
| **5. Waveform Viewer** | Replace table-cell SVG with a scrollable/zoomable Canvas waveform viewer supporting multi-bit buses, radix switching, cursor measurement, signal filtering, and `.vcd` download. | **4 – 6 days** |
| **6. 16×16 Matrix Scanner** | Per-cycle brightness integration in `runCycles()`, configurable row/col active polarity, scan-rate FPS indicator, and optional RGB/PWM brightness levels. | **1 – 2 days** |
| **Total Estimated Effort** | End-to-end production hardening | **12 – 19 person-days** (~2.5 – 4 weeks) |
