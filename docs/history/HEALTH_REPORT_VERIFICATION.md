# `PROJECT_HEALTH_REPORT.md` — Execution-Backed Validation Report

**Verification Date:** 2026-11-19  
**Target Report:** [PROJECT_HEALTH_REPORT.md](file:///c:/Users/User/Desktop/SIM_QQ/PROJECT_HEALTH_REPORT.md)  
**Branches Validated:**
- `origin/main` (`0480711`)
- `origin/phase-b-stabilization` (`0480711`)
- `origin/phase-c1-multifile-simulator` (`63615db`)

**Validation Methods Executed:**
1. **Live Browser Validation** on `https://tim941008.github.io/fpga-web-simulator/` (deployed from `origin/main` `0480711`).
2. **Live GitHub Actions CI Inspection** on `https://github.com/tim941008/fpga-web-simulator/actions` (via GitHub UI & `api.github.com`).
3. **Local Python Execution Harness** (Python 3.9.7) running git tree/blob inspections and executing the exact regex/reachability algorithms from `src/project/projectModel.ts` and `src/project/projectCompile.ts` against concrete Verilog test cases.

---

## 1. Summary Table of Validation Verdicts

| Finding ID | Topic | Verdict | Evidence Type |
|---|---|---|---|
| **CRIT-01** | Unverified Phase C.1 Branch | **Partially Confirm** | Live GitHub Actions CI (`Run #14` passed) + Browser/Benchmark gap |
| **CRIT-02** | Regex Module Scanning & `generate`/`ifdef` Detection | **Confirm** | Python execution of exact `scanSource` / `validateProject` / `selectFilesForTop` logic |
| **CRIT-03** | Compile-Failure Runtime Leak | **Confirm** | **Live Browser Execution** on GitHub Pages + Git blob check on both branches |
| **MAJ-01** | Unhandled ZIP/Folder Import Exceptions & Limits | **Confirm** | Direct code-path verification (`App.tsx`, `projectImport.ts`) |
| **MAJ-02** | `SimulationEngine` Stale Closures & Cycle/Pause Desync | **Confirm** | Direct code-path verification (`App.tsx`, `ClockControls.tsx`) |
| **MAJ-03** | `ClockComponentConfig.polarity` & `defaultHz` Ignored | **Confirm** | Direct symbol/reference execution check (`fpgaRuntime.ts`, `App.tsx`) |
| **MAJ-04** | Missing `package-lock.json` | **Confirm** | `git ls-tree` across all 3 branches + `.github/workflows/deploy.yml` |
| **MAJ-05** | Per-Compile 64 MB–1 GB WASM Memory & Filename Mismatch | **Confirm** | Direct verification of `verilator-worker.js` |
| **MAJ-06** | MIT vs. GPL-3.0 Licensing Ambiguity | **Confirm** | `git show` on `LICENSE`, `src/vendor/8bitworkshop/LICENSE`, `fpgaRuntime.ts` + live HTTP 200 check |
| **MIN-01** | Multi-File Examples Validation Errors & Reset Bug | **Confirm** | Direct extraction of `createHardwareConfig` in `exampleProjects.ts` |
| **MIN-02** | Bilingual (`zh-TW`) Regression in Phase C.1 | **Confirm** | Direct inspection of `ProjectExplorer.tsx`, `ClockControls.tsx`, `App.tsx` |
| **MIN-03** | Sample-Rate Dependent POV & Single Matrix/Clock | **Confirm** | Direct inspection of `matrixMapping.ts`, `App.tsx` |
| **MIN-04** | Incomplete Persistence Validation / Duplicate Inputs / Unused `bitOrder` | **Confirm** | Direct inspection of `configPersistence.ts`, `hardwareMapping.ts`, `SevenSegmentDisplay.tsx` |
| **MIN-05** | Hardcoded `rom_init.hex`, `@addr` Stripping, `inout` & >64-bit Drop | **Confirm** | Python verification of `fpgaRuntime.ts` |
| **MIN-06** | `parseVerilogSource` Ignores `selectedTop` & Mouse-Only `KEY` | **Confirm** | Direct inspection of `App.tsx`, `BoardView.tsx` |
| **MIN-07** | `SimulationEngine` 4 ms Idle Churn & Unclosed `MessageChannel` | **Confirm** | Direct inspection of `simulationEngine.ts` |
| **NTH-01..04** | Worker Offload, `App.tsx` Refactor, Doc Clutter, Waveform Upgrade | **Confirm** | Structural repository & source verification |

---

## 2. Detailed Validation of the 5 Focus Areas

### Focus 1: Compile-Failure Runtime Leak (`CRIT-03`) — **CONFIRM**

- **Live Browser Evidence (`https://tim941008.github.io/fpga-web-simulator/`, commit `0480711`):**
  1. **Baseline Compile:** Initial load compiled cleanly (`Sim Backend: Verilator → WebAssembly`, `0 error(s), 0 warning(s) • Verilator 1373 ms + codegen 56 ms`). Clicking `SW[0]` (`0 → 1`) updated `LEDR[9:0]` from `0x0 → 0x1` and `HEX0` from `0x40 → 0x79`.
  2. **Induced Compile Failure:** Switched to the `Verilog / Memory Editor` tab and prepended `SYNTAX_ERROR_TEST;;;` on line 1 of `top_fpga_demo.v`. Auto-compile failed with:
     - `Sim Backend: Not compiled`
     - Banner: `1 error(s), 0 warning(s) • Verilator failed (49 ms)` (`top_fpga_demo.v:1: syntax error, unexpected IDENTIFIER`)
     - Transport controls (`Run Clock`, `Step Cycle`, `Step Edge`, `Reset`) became disabled (`disabled: true`).
  3. **Leak Triggered:** Switched back to the `FPGA Board & 16×16 Matrix` tab and clicked `SW[1]` (`0 → 1`). **The stale WASM runtime still executed and updated outputs:**
     - `SW[9:0]`: `0x001 → 0x003`
     - `LEDR[9:0]`: `0x001 → 0x003` (both `LEDR[1]` and `LEDR[0]` lit)
     - `HEX0[6:0]`: `0x79 → 0x30`
     - `MATRIX_COL[15:0]`: `0x00FF → 0x00FD`
- **Branch Code Execution Check (Python `git show`):**
  - `origin/main` (`src/App.tsx`): `1` compile-failure branch -> `clears_runtimeRef = False`.
  - `origin/phase-c1-multifile-simulator` (`src/App.tsx`): `2` compile-failure branches (`if (!result)` and `if (!result.runtime)`) -> both `clears_runtimeRef = False`.

---

### Focus 2: `package-lock.json` (`MAJ-04`) — **CONFIRM**

- **Execution Evidence (`git ls-tree -r --name-only` across all 3 branches):**
  - `origin/main` (`0480711`): **0** lockfiles (`package-lock.json` absent).
  - `origin/phase-b-stabilization` (`0480711`): **0** lockfiles (`package-lock.json` absent).
  - `origin/phase-c1-multifile-simulator` (`63615db`): **0** lockfiles (`package-lock.json` absent).
- **CI Workflow Evidence (`.github/workflows/deploy.yml`):**
  - Confirmed CI executes `if [ ! -f package-lock.json ]; then npm install --package-lock-only; fi; npm ci`, resolving floating `^` ranges (`binaryen: ^101.0.0`, `fflate: ^0.8.2`, `vite: ^5.4.11`, etc.) dynamically on each CI run.

---

### Focus 3: Licensing Clarification (`MAJ-06`) — **CONFIRM**

- **Execution Evidence (`git show`):**
  - Root `LICENSE` header: `MIT License — Copyright (c) 2026 Web FPGA Simulator Contributors`.
  - `src/vendor/8bitworkshop/LICENSE` header: `GNU GENERAL PUBLIC LICENSE — Version 3, 29 June 2007`.
  - Direct imports in `src/sim/fpgaRuntime.ts`:
    - `import { VerilogXMLParser } from '../vendor/8bitworkshop/hdl/vxmlparser';`
    - `import { HDLModuleJS } from '../vendor/8bitworkshop/hdl/hdlruntime';`
    - `import('../vendor/8bitworkshop/hdl/hdlwasm')`
    - `import('../vendor/8bitworkshop/hdl/binaryen-shim')`
  - **Live Browser Evidence:** `https://tim941008.github.io/fpga-web-simulator/` serves the compiled JS bundle (incorporating `8bitworkshop` GPL-3.0 code) and `verilator-worker.js` / `verilator_bin.wasm` (HTTP `200`). Root `LICENSE` does not disclose GPL-3.0 combined-work obligations.

---

### Focus 4: Regex-Based Module Scanning (`CRIT-02` — Part A) — **CONFIRM**

Executed the exact `KEYWORDS`, `stripComments`, `scanSource`, `validateProject`, and `selectFilesForTop` logic from `origin/phase-c1-multifile-simulator:src/project/projectModel.ts` and `projectCompile.ts` in Python:

| Test Case | Input Summary | Execution Result | Outcome |
|---|---|---|---|
| **Case 5** | `top.v` (valid) + `tb.v` instantiating `sim_clock_gen` (testbench in uploaded folder) | `MISSING_MODULE: ('tb', 'sim_clock_gen', 'tb.v')`, **`compile_blocked = True`** | **Confirmed:** Unreachable testbench blocks compiling valid `top`. |
| **Case 6** | Single file `combined.v` defining `parent` (instantiating `child`) and `child`, with `top = child` | `selectFilesForTop = ['combined.v']` | **Confirmed:** Parent module is still sent to Verilator alongside `child`. |
| **Case 7** | SystemVerilog `typedef logic [7:0] byte_t; byte_t tmp;` | `scanned: [('top', [])]`, `compile_blocked = False` | **Nuance noted:** Plain typedef variable declarations without `(` do *not* false-positive; false positives require a statement matching `^id1 id2(`. |

---

### Focus 5: `generate` / `` `ifdef `` Module Detection (`CRIT-02` — Part B) — **CONFIRM**

Executed against the exact `scanSource` + `selectFilesForTop` logic from `origin/phase-c1-multifile-simulator`:

| Test Case | Input Summary | Execution Result | Outcome |
|---|---|---|---|
| **Case 1** (`generate for`) | `for (i = 0; i < 4; i = i + 1) begin : gen_inv inv_cell u_inv (...); end` + `inv_cell.v` | `scanned: [('top', []), ('inv_cell', [])]`<br>**`selectFilesForTop: ['top.v']`** | **Confirmed:** `inv_cell` missed; **`inv_cell.v` dropped** before Verilator runs. |
| **Case 2** (`generate if/else`) | `if (USE_FAST) begin : g_fast fast_cell u_f (...); end else begin : g_slow slow_cell u_s (...); end` | `scanned: [('top', ['slow_cell']), ...]`<br>**`selectFilesForTop: ['top.v', 'slow_cell.v']`** | **Confirmed:** `fast_cell` missed; **`fast_cell.v` dropped**. |
| **Case 3** (`` `ifdef `` bare) | `` `ifdef USE_VENDOR_PLL\n vendor_pll u_pll (...); `else ... `` | `scanned: [('top', [])]`, `compile_blocked = False` | **Nuance noted:** No false positive when `` `ifdef `` directly precedes instantiation (no intervening `;`). |
| **Case 3b** (`` `ifdef `` + prior `;`) | `` `ifdef USE_VENDOR_PLL\n wire pll_out;\n vendor_pll u_pll (...); `else ... `` | `scanned: [('top', ['vendor_pll'])]`<br>`MISSING_MODULE: ('top', 'vendor_pll', 'top.v')`<br>**`compile_blocked = True`** | **Confirmed:** Inactive `` `ifdef `` branch with a preceding declaration **falsely blocks compilation**. |
| **Case 4** (`` `ifdef `` active submodule) | `` `define USE_SUB\n `ifdef USE_SUB\n sub_mod u_sub (...); `endif `` + `sub_mod.v` | `scanned: [('top', []), ('sub_mod', [])]`<br>**`selectFilesForTop: ['top.v']`** | **Confirmed:** Active submodule directly after `` `ifdef `` missed; **`sub_mod.v` dropped**. |

---

## 3. Validation of Remaining Findings in `PROJECT_HEALTH_REPORT.md`

- **`CRIT-01` (Unverified Phase C.1 Branch) — PARTIALLY CONFIRM:**
  - **Refuted part (CI execution):** Live inspection of `https://github.com/tim941008/fpga-web-simulator/actions` and GitHub Actions API proved **Run #14 (`44492781370`) on `phase-c1-multifile-simulator` (`63615db`) SUCCEEDED** (51s total): `npm ci`, `npm test`, `npm run build`, and `Upload build artifact` (`dist-build-artifact`, 2.39 MB) all reported `success`. (`main` Run #10 `44487970548` and `phase-b-stabilization` Run #11 `44487973321` also succeeded.)
  - **Confirmed part (Browser & Benchmark gap):** `deploy` is skipped on `phase-c1-multifile-simulator`, raw test stdout logs are gated behind GitHub login, and no browser runtime validation or performance benchmarks (`SIMULATION_PERFORMANCE_REPORT.md` still has `_not measured_` across all rows) have been completed.
- **`MAJ-01` (Unsafe Import) — CONFIRM:** Verified `try/catch` absent in `importFileList` / `handleDrop` (`App.tsx`); `entriesFromFiles` / `entriesFromDataTransfer` call `file.text()` / `arrayBuffer()` prior to `filterEntries()`; `unzipSync()` has no size/count bounds.
- **`MAJ-02` (`SimulationEngine` Closures & UI Desync) — CONFIRM:** Verified `setEngineStats` is never called in `stepHalfCycle` / `stepFullCycle` (`App.tsx`), causing `cycleCount` and `engineStats.cycle` to diverge; `sampleRef`/`stepRef` capture stale `activeMatrixConfig`/`clkName`; `ClockControls.tsx` keeps batch buttons enabled while `paused`.
- **`MAJ-03` (`CLOCK` Polarity & `defaultHz` Ignored) — CONFIRM:** Verified `polarity` does not appear in `src/sim/fpgaRuntime.ts` and `defaultHz` does not appear in `src/App.tsx`.
- **`MAJ-05` (Verilator Worker Memory & Filename Sanitization) — CONFIRM:** Verified `wasmMemory: new WebAssembly.Memory({ initial: 1024, maximum: 16384 })` per compile and `s.replace(/[^A-Za-z0-9_.-]/g, '_')` without reverse path mapping in `public/verilator/verilator-worker.js`.
- **`MIN-01` through `MIN-07` & `NTH-01` through `NTH-04` — CONFIRM:** All verified directly in `exampleProjects.ts` (all 4 examples use `createFullDemoHardwareConfig`), `fpgaRuntime.ts` (`rom_init.hex` hardcoded = `True`, `vd.isInput ? 'input' : 'output'`), `ProjectExplorer.tsx`, `ClockControls.tsx`, `BoardView.tsx`, `configPersistence.ts`, `matrixMapping.ts`, and `simulationEngine.ts`.

---

## 4. Updated Release Readiness Impact

Even with **CRIT-01 downgraded from Confirm to Partially Confirm** (because GitHub Actions Run #14 on `63615db` is green for `npm ci` / `npm test` / `npm run build`), the overall release verdict remains **C. Needs fixes before release**, backed by live-confirmed **CRIT-03** (compile-failure runtime leak reproduced in browser) and execution-confirmed **CRIT-02** (`generate`/`ifdef`/testbench failures in regex scanning and file pruning), alongside confirmed **MAJ-01** through **MAJ-06**.
