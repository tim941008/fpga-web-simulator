# AI Daily Work Report & Engineering Handover Document

**Date:** 2026-11-18  
**Project Name:** Web FPGA Simulator (`fpga-web-simulator`)  
**Workspace Path:** `C:\Users\User\Desktop\SIM_QQ`  
**GitHub Repository:** `https://github.com/tim941008/fpga-web-simulator`  
**Live Deployment (GitHub Pages):** `https://tim941008.github.io/fpga-web-simulator/`

---

## 1. Project Overview

- **Project Name:** Web FPGA Simulator
- **Project Objectives:**
  - Build a static-hostable (GitHub Pages compatible) browser-based FPGA simulator using React, TypeScript, Vite, and TailwindCSS.
  - Accept user-uploaded Verilog HDL files (`.v`, `.sv`) and Intel/Altera Quartus Settings Files (`.qsf`).
  - Parse QSF pin assignments (`set_location_assignment`, `IO_STANDARD`, `FAMILY`, `DEVICE`, `TOP_LEVEL_ENTITY`) and automatically generate interactive FPGA board controls.
  - Support interactive Push Buttons (`KEY`), Slide Switches (`SW`), Discrete LEDs (`LEDR`/`LEDG`), 7-Segment Displays (`HEX0`–`HEX7`), and a 16×16 LED Dot-Matrix (`MATRIX_ROW`, `MATRIX_COL`).
  - Compile and simulate combinational and sequential Verilog designs in the browser using a Verilator WebAssembly backend, with single-cycle / half-cycle clock stepping, continuous clock execution, and a real-time signal monitor / waveform viewer.
- **Hardware & Software Environment:**
  - **OS:** Windows 10/11 (`C:\Users\User\Desktop\SIM_QQ`)
  - **Local Toolchain Status:**
    - `git` is installed (`C:\Program Files\Git\cmd\git.exe`).
    - `python` is installed (`Python 3.13` / `Python 3.9`).
    - **`node` and `npm` are NOT installed on the local Windows workstation.**
    - `docker` CLI is installed (`Docker version 29.9.2`), but the Docker Desktop Linux engine daemon is **not running** (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`).
  - **CI / Production Build Environment:** GitHub Actions `ubuntu-latest` with Node.js 20 (`actions/setup-node@v4`).
- **Frameworks, Libraries & Languages:**
  - **Languages:** TypeScript (`~5.6.2`), JavaScript (ES2022 / Web Worker), Verilog-2001 / SystemVerilog, Python 3 (test verification runner).
  - **Frontend Stack:** React `^18.3.1`, React DOM `^18.3.1`, Vite `^5.4.11`, TailwindCSS `^3.4.15`, `lucide-react` `^0.460.0`.
  - **HDL / WASM Toolchain:** Vendored 8bitworkshop Verilator WebAssembly binary (`public/verilator/verilator_bin.wasm`, 6,149,070 bytes; `verilator_bin.js`, 275,821 bytes) + `VerilogXMLParser` (`src/vendor/8bitworkshop/hdl/vxmlparser.ts`) + Binaryen WASM code generator (`HDLModuleWASM` in `src/vendor/8bitworkshop/hdl/hdlwasm.ts` with `binaryen` `^101.0.0`) + JavaScript fallback (`HDLModuleJS` in `src/vendor/8bitworkshop/hdl/hdlruntime.ts`).
- **Current Development Stage:**
  - Core application is implemented, deployed to GitHub Pages, audited for bugs (`BUG_REPORT.md`), and covered by a 26-test verification suite (`tests/`, `TEST_MATRIX.md`, `COMPATIBILITY_MATRIX.md`, `TEST_REPORT.md`).
  - Identified bugs (`BUG-001` through `BUG-010`) have been documented and reproduced but **intentionally not patched yet** per user instruction during the audit/testing phases.

---

## 2. Work Completed

### Phase 1: Initial Application Scaffold
- Created Vite + React + TypeScript + TailwindCSS configuration:
  - [package.json](file:///c:/Users/User/Desktop/SIM_QQ/package.json), [vite.config.ts](file:///c:/Users/User/Desktop/SIM_QQ/vite.config.ts) (`base: './'`), [tsconfig.json](file:///c:/Users/User/Desktop/SIM_QQ/tsconfig.json), [tailwind.config.js](file:///c:/Users/User/Desktop/SIM_QQ/tailwind.config.js), [postcss.config.js](file:///c:/Users/User/Desktop/SIM_QQ/postcss.config.js), [index.html](file:///c:/Users/User/Desktop/SIM_QQ/index.html), [src/vite-env.d.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vite-env.d.ts).
- Implemented Quartus `.qsf` parser ([src/parsers/qsfParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/qsfParser.ts)) with `parseQsfFile()`, `classifySignalCategory()`, and `buildBoardControlGroups()`.
- Implemented regex-based Verilog port pre-parser ([src/parsers/verilogParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/verilogParser.ts)).
- Created built-in sample designs ([src/presets/sampleDesigns.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/presets/sampleDesigns.ts)):
  1. `full-demo` (`top_fpga_demo.v` + `top_fpga_demo.qsf`): DE10-Lite 8-bit counter, combinational switch XOR, dual active-low 7-segment decoders (`HEX0`, `HEX1`), and 16×16 multiplexed LED matrix scanner (`MATRIX_ROW`, `MATRIX_COL`).
  2. `comb-alu` (`comb_alu.v` + `comb_alu.qsf`): Cyclone V 4-bit combinational ALU (`+`, `-`, `&`, `^`) with `LEDR[7:0]` and `HEX0[6:0]`.
- Implemented UI components:
  - [src/components/BoardView.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/BoardView.tsx)
  - [src/components/SevenSegmentDisplay.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/SevenSegmentDisplay.tsx)
  - [src/components/MatrixViewer.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/MatrixViewer.tsx)
  - [src/components/SignalMonitor.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/SignalMonitor.tsx)
  - [src/components/ClockControls.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/ClockControls.tsx)

### Phase 2: Verilator WebAssembly Integration (Replacing Initial Custom TS Interpreter)
- Replaced the initial custom TypeScript interpreter (`src/sim/verilatorWasmBackend.ts`, deleted) with **8bitworkshop's Verilator-to-WASM pipeline** (commit `f1845f13f5ae8ccd668a69118a43fc721a56a332`):
  - Copied `verilator_bin.js` and `verilator_bin.wasm` into [public/verilator/](file:///c:/Users/User/Desktop/SIM_QQ/public/verilator/).
  - Created Web Worker [public/verilator/verilator-worker.js](file:///c:/Users/User/Desktop/SIM_QQ/public/verilator/verilator-worker.js) that loads `verilator_bin.wasm`, writes `.v`/`.sv` files into Emscripten `FS`, invokes Verilator with:
    ```js
    ['--cc', '-O3', '-Wall', '-Wno-fatal', '-Wno-DECLFILENAME', '-Wno-UNUSED',
     '-Wno-EOFNEWLINE', '-Wno-PROCASSWIRE', '-Wno-WIDTH', '-Wno-CASEINCOMPLETE',
     '-Wno-UNDRIVEN', '-Wno-PINCONNECTEMPTY', '--x-assign', 'fast', '--noassert',
     '--pins-sc-biguint', '--debug-check', '--top-module', top]
    ```
    and returns `obj_dir/V<top>.xml`.
  - Vendored [vxmlparser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/hdl/vxmlparser.ts), [hdlwasm.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/hdl/hdlwasm.ts), [hdlruntime.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/hdl/hdlruntime.ts), [hdltypes.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/hdl/hdltypes.ts), and shims ([binaryen-shim.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/hdl/binaryen-shim.ts), [hdlhost.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/hdl/hdlhost.ts), [emu.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/emu.ts), [util.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/util.ts), [workertypes.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/workertypes.ts)).
  - Implemented [src/sim/fpgaRuntime.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/sim/fpgaRuntime.ts) (`FpgaRuntime`) wrapping `HDLModuleWASM` (with `HDLModuleJS` fallback) and exposing `compile()`, `getSignals()`, `setSignal()`, `eval()`, `stepEdge()`, `reset()`, and `dispose()`.
  - Updated [src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx) to compile via `FpgaRuntime.compile()` and batch continuous clock execution per 16 ms frame.

### Phase 3: Build Stabilization, GitHub Repository Creation & GitHub Pages Deployment
- Added `"binaryen": "^101.0.0"` to [package.json](file:///c:/Users/User/Desktop/SIM_QQ/package.json) and created [src/vite-env.d.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vite-env.d.ts).
- Removed `cache: 'npm'` from [.github/workflows/deploy.yml](file:///c:/Users/User/Desktop/SIM_QQ/.github/workflows/deploy.yml) so GitHub Actions builds cleanly without `package-lock.json`.
- Created [.gitignore](file:///c:/Users/User/Desktop/SIM_QQ/.gitignore) (excluding `.env`, `.env.*`, `node_modules/`, `dist/`).
- Created `tim941008/fpga-web-simulator` on GitHub via REST API, pushed `main`, enabled GitHub Pages (`build_type: "workflow"`), pushed `.github/workflows/deploy.yml` (commit `52d7680`) using the `GITHUB_TOKEN` stored in `.env`, and verified **GitHub Actions Run `#44126611355`** completed with `conclusion: success` across both `build` and `deploy` jobs.

### Phase 4: Bug Audit & 26-Test Verification Suite
- Executed a full live QA audit on `https://tim941008.github.io/fpga-web-simulator/` using the browser subagent and documented 11 bugs in [BUG_REPORT.md](file:///c:/Users/User/Desktop/SIM_QQ/BUG_REPORT.md).
- Documented known limitations in [LIMITATIONS.md](file:///c:/Users/User/Desktop/SIM_QQ/LIMITATIONS.md) and linked it from [README.md](file:///c:/Users/User/Desktop/SIM_QQ/README.md).
- Created the 26-test regression suite under [tests/](file:///c:/Users/User/Desktop/SIM_QQ/tests) (`combinational/`, `sequential/`, `counter/`, `fsm/`, `matrix/`, `qsf/`, `waveform/`, `limitations/`, `deployment/`), executed the HDL and boundary tests against the live Verilator WASM engine in the browser, and produced [TEST_MATRIX.md](file:///c:/Users/User/Desktop/SIM_QQ/TEST_MATRIX.md), [COMPATIBILITY_MATRIX.md](file:///c:/Users/User/Desktop/SIM_QQ/COMPATIBILITY_MATRIX.md), and [TEST_REPORT.md](file:///c:/Users/User/Desktop/SIM_QQ/TEST_REPORT.md).

---

## 3. Current Project Status

### Architecture Pipeline
```
Verilog (.v) ──► Web Worker (public/verilator/verilator-worker.js)
                   │  Runs verilator_bin.wasm (--cc -O3 --debug-check)
                   ▼
                 Verilator XML AST (obj_dir/V<top>.xml)
                   │
                   ▼
                 VerilogXMLParser (src/vendor/8bitworkshop/hdl/vxmlparser.ts)
                   │
                   ▼
                 HDLModuleWASM (src/vendor/8bitworkshop/hdl/hdlwasm.ts + binaryen)
                   │  (Fallback: HDLModuleJS in hdlruntime.ts)
                   ▼
                 FpgaRuntime (src/sim/fpgaRuntime.ts)
                   │
Quartus (.qsf) ──► parseQsfFile & buildBoardControlGroups (src/parsers/qsfParser.ts)
                   │
                   ▼
                 React UI (BoardView, SevenSegmentDisplay, MatrixViewer, SignalMonitor)
```

### Verified Working Features (Confirmed Live on `https://tim941008.github.io/fpga-web-simulator/`)
- **Zero Build / Console Errors:** `tsc -b && vite build` succeeds in GitHub Actions (`Run #44126611355`); browser console reports `0` errors.
- **Verilator WASM Compilation:** Compiles Preset 1 in ~1268 ms (first run including 6.1 MB WASM fetch/compile) and ~7–65 ms on subsequent cached runs (`Sim Backend: Verilator → WebAssembly`).
- **Combinational & Sequential Simulation:** Verified truth tables, 4-bit ALU, DFF, TFF, 8-bit counter, 2-state & 4-state FSMs, `generate` loops (`LIM-005`), parameterized submodule instantiation (`LIM-006`), and 64-bit signals (`LIM-001`).
- **Interactive Peripherals:** `SW` toggle switches, `KEY` buttons (momentary & latch), `LEDR` indicators, `HEX0`/`HEX1` active-low/high 7-segment displays, and 16×16 LED matrix scanning.

### Uncommitted Local Files
Run `git status --short` before starting new work:
- Modified: `README.md`
- Untracked documentation & test suite: `ACTIONS_STATUS_REPORT.md`, `BUG_REPORT.md`, `COMPATIBILITY_MATRIX.md`, `LIMITATIONS.md`, `TEST_MATRIX.md`, `TEST_REPORT.md`, `AI_Handover_Report_2026-11-18.md`, `PROJECT_CONTEXT.md`, `WORK_LOG.md`, `NEXT_TASKS.md`, `tests/`.
- Ignored secret file: `.env` (contains `GITHUB_TOKEN=...` with `repo, workflow` scopes; **never commit `.env`**).

---

## 4. Debugging History and Failed Attempts

### Issue 1: Missing `node` and `npm` on Local Windows Host
- **Symptoms:** Running `node -v` or `npm install` fails with `CommandNotFoundException`.
- **Failed Attempts:**
  1. Checked standard paths (`C:\Program Files\nodejs`, `%LOCALAPPDATA%\Programs\nodejs`, `%APPDATA%\nvm`) — none exist.
  2. Checked Docker (`docker ps`) to see if a Node container could be used — failed with `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine... The system cannot find the file specified`.
- **Resolution / Workaround:** Rely on GitHub Actions (`ubuntu-latest`, Node 20) for `npm install && npm run build` and verify the deployed bundle on `https://tim941008.github.io/fpga-web-simulator/` using the browser subagent, plus local Python (`Python 3.13`) for static/parser regression scripts. **Do not waste time searching for a local Node binary unless the user installs Node.js.**

### Issue 2: Accidental Staging of `.env` During Initial `git add .`
- **Symptoms:** `git add .` staged `.env` (which contained the user's `GITHUB_TOKEN`). Running `git reset HEAD .env` before the initial commit failed with `fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree`.
- **Resolution:** Added `.env` and `.env.*` to `.gitignore`, ran `git rm --cached .env`, and amended the commit before pushing. **Never remove `.env` from `.gitignore`.**

### Issue 3: `git push` Rejected `.github/workflows/deploy.yml` When Using Windows Credential Manager
- **Symptoms:** Standard `git push -u origin main` (which uses Windows Credential Manager's stored OAuth token) failed with:
  ```
  ! [remote rejected] main -> main (refusing to allow an OAuth App to create or update workflow `.github/workflows/deploy.yml` without `workflow` scope)
  ```
- **Root Cause:** The OAuth token in Windows Credential Manager lacks the `workflow` scope, whereas the Personal Access Token stored in `.env` (`GITHUB_TOKEN`) has `admin:repo_hook, repo, workflow, write:network_configurations` scopes.
- **Resolution:** Whenever pushing commits that touch `.github/workflows/*` (or pushing in general), authenticate using the token in `.env` via transient HTTP header (without writing the token to `.git/config` or printing it to stdout):
  ```powershell
  $line = Get-Content .env | Where-Object { $_ -like "GITHUB_TOKEN=*" } | Select-Object -First 1
  $token = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
  $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
  git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $b64" push origin main
  ```

---

## 5. Technical Decisions

1. **Selected Simulation Backend: 8bitworkshop Verilator WASM (`verilator_bin.wasm` + `VerilogXMLParser` + `HDLModuleWASM`)**
   - **Why Selected:** Explicitly chosen by the user (`方案 A`) to match the `Verilog -> Verilator -> WASM -> FPGA Runtime` architecture diagram and provide high-speed native WebAssembly execution in the browser.
   - **Rejected Alternatives:**
     - *Custom TypeScript Verilog Interpreter:* Rejected because supporting `generate`, `parameter`, module hierarchy, and non-blocking semantics accurately in custom TS is infeasible.
     - *YoWASP Yosys (`@yowasp/yosys`) + DigitalJS:* Considered as Option B, rejected by user in favor of Option A (Verilator WASM).
2. **Licensing Constraint:**
   - Root `LICENSE` is MIT (per user request), while `src/vendor/8bitworkshop/LICENSE` preserves the upstream GPL-3.0 license for the vendored 8bitworkshop Verilator WASM and HDL runtime files.

---

## 6. Pending Tasks (Prioritized)

### P0 — Critical Bugs (`BUG-001`, `BUG-002`, `BUG-003`)

1. **Fix `BUG-001`: `parseVerilogSource` ANSI Port Parser Only Extracts the First Port**
   - **File:** [src/parsers/verilogParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/verilogParser.ts#L88-L109)
   - **Problem:** `ansiPortRegex` uses greedy `([^;()]+)` and breaks after the first port (`CLOCK_50`), dropping all subsequent ports before Verilator finishes compiling (or when compilation fails).
   - **Action:** Rewrite ANSI header port parsing in `parseVerilogSource()` by splitting `topMod.headerPorts` on commas and tracking the active `direction`, `isReg`, and `[msb:lsb]` width across comma-separated port declarations.
   - **Acceptance Criteria:** `parseVerilogSource()` extracts all 8 ports of `top_fpga_demo.v` and all 4 ports of `comb_alu.v` immediately on load before Verilator compiles.

2. **Fix `BUG-002`: Wire `$readmemh` / `$readmemb` File Support (`getFileData`)**
   - **File:** [src/sim/fpgaRuntime.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/sim/fpgaRuntime.ts#L180-L215), [src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx#L345-L354)
   - **Problem:** `LIM-007` (`readmemh_rom.v`) crashes during `powercycle()` with `no file "rom_init.hex" for $readmem` in `HDLModuleWASM` and `this.getFileData is not a function` in `HDLModuleJS`.
   - **Action:** Allow uploading `.hex`, `.mem`, `.mif`, `.txt`, `.binary` files in `App.tsx`, pass a file lookup map into `FpgaRuntime.compile()`, and set `wasmModel.getFileData = (name) => fileMap.get(name)` and `jsModel.getFileData = (name) => fileMap.get(name)` **before** calling `powercycle()`.
   - **Acceptance Criteria:** `tests/limitations/readmemh_rom.v` compiles and simulates in `Verilator → WebAssembly` when `rom_init.hex` is present.

3. **Fix `BUG-003`: Filter Unmatched QSF Pins When Building Board Controls**
   - **File:** [src/parsers/qsfParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/qsfParser.ts#L146-L184)
   - **Problem:** When a user uploads a custom `.v` file without uploading a new `.qsf`, `buildBoardControlGroups(ports, assignments)` creates phantom board controls for every pin in the old `.qsf` even if the port does not exist in `ports`.
   - **Action:** In `buildBoardControlGroups()`, when `ports.length > 0`, only attach QSF pin assignments to groups that exist in `ports` (do not create new groups for orphan QSF signals).
   - **Acceptance Criteria:** Test `QSF-003` (`missing_signals.qsf` with `and_gate.v`) renders only `SW[1:0]` and `LEDR[0]` on the board and marks `UNUSED_HEX0` and `ORPHAN_KEY` as `unused`.

### P1 — Important Functional & Hardware Accuracy Fixes (`BUG-004` to `BUG-007`)

4. **Fix `BUG-004`: Fix Duplicate `PIN_A8` in Preset 1 QSF & Add Pin Conflict Detection**
   - **Files:** [src/presets/sampleDesigns.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/presets/sampleDesigns.ts#L118-L135), [src/parsers/qsfParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/qsfParser.ts#L79-L139)
   - **Action:** Change `KEY[3]` in `top_fpga_demo.qsf` from `PIN_A8` to a non-conflicting pin (e.g., `PIN_B15`), and return a `conflicts` array from `parseQsfFile()` whenever two signals share the same `pinLocation`.
   - **Acceptance Criteria:** Preset 1 has zero duplicate physical pins, and `QSF-002` (`duplicate_pins.qsf`) flags `PIN_A8` as a conflict in the `QSF Pin Mapper` tab.

5. **Fix `BUG-005`: Per-Cycle Matrix POV Decay & Immediate Clear of Inactive Rows When POV is OFF**
   - **File:** [src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx#L95-L121)
   - **Action:** In `sampleMatrix()`, when `!povEnabled` and a row is inactive, zero out `buf[r]`. When `povEnabled` is `true`, apply row/pixel decay inside each scan step rather than once per 16 ms UI frame batch.
   - **Acceptance Criteria:** Turning `POV Scan Hold` from `ON` to `OFF` immediately clears non-active rows without requiring `Clear`.

6. **Fix `BUG-006` & `BUG-010`: Signal Monitor Binary Padding (`>16` bits) & Bus Waveform Radix**
   - **File:** [src/components/SignalMonitor.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/SignalMonitor.tsx#L28), [src/components/SignalMonitor.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/SignalMonitor.tsx#L134)
   - **Action:** Replace `Math.min(width, 16)` with `width` in `formatValue()`, and use `formatValue(busVal, def.width)` for multi-bit bus chips in the `Waveform Trace` column.
   - **Acceptance Criteria:** A 20-bit signal formats with 20 binary digits in `BIN` mode, and bus waveform chips update when switching between `HEX`, `BIN`, and `DEC`.

7. **Fix `BUG-007`: Record Waveform Samples on Combinational Input Changes & Disable Clock Stepping on Clockless Modules**
   - **Files:** [src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx#L269-L279), [src/components/ClockControls.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/ClockControls.tsx)
   - **Action:** Append a waveform snapshot in `applyInput()` when `running === false` (or when `clkName === null`), and disable `Run Clock` / `Step Edge` when `clockSignalName === null`.
   - **Acceptance Criteria:** Toggling `SW` on Preset 2 (`comb_alu`) or `WAV-002` records waveform transitions in `SignalMonitor`.

### P2 — UI Polish (`BUG-008`, `BUG-009`)
8. **Fix `BUG-008`:** Hide or collapse `MatrixViewer` when neither `matrixRowGroup` nor `matrixColGroup` is present in the active design.
9. **Fix `BUG-009`:** Trigger `compile()` immediately (`0 ms` timeout) on initial mount and preset/file loads, reserving the `600 ms` debounce strictly for `<textarea>` code edits, and update the progress banner once `verilator_bin.wasm` is cached.

---

## 7. Instructions for the Next AI

1. **Current State:** The simulator is live on GitHub Pages (`https://tim941008.github.io/fpga-web-simulator/`) with a working Verilator WASM backend, a complete bug audit (`BUG_REPORT.md`), and a 26-test regression suite (`tests/`).
2. **Most Important Unresolved Issue:** `BUG-001`, `BUG-002`, and `BUG-003` (the P0 bugs in `src/parsers/verilogParser.ts`, `src/sim/fpgaRuntime.ts`, and `src/parsers/qsfParser.ts`), which have not been fixed yet because the previous prompts forbade modifying simulator code during the audit and test-suite creation phases.
3. **Files to Inspect First:**
   - [PROJECT_CONTEXT.md](file:///c:/Users/User/Desktop/SIM_QQ/PROJECT_CONTEXT.md), [NEXT_TASKS.md](file:///c:/Users/User/Desktop/SIM_QQ/NEXT_TASKS.md), [BUG_REPORT.md](file:///c:/Users/User/Desktop/SIM_QQ/BUG_REPORT.md)
   - [src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx)
   - [src/sim/fpgaRuntime.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/sim/fpgaRuntime.ts)
   - [src/parsers/qsfParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/qsfParser.ts)
   - [src/parsers/verilogParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/verilogParser.ts)
4. **What Has Already Been Verified:**
   - All 26 test cases in `tests/` and both presets have been tested against the live Verilator WASM build. Do not re-run the initial audit.
5. **Approaches That Must NOT Be Repeated:**
   - Do **not** attempt to run `node` or `npm` locally unless you first confirm Node.js has been newly installed (`node -v`).
   - Do **not** use plain `git push` without the `.env` `GITHUB_TOKEN` header when pushing `.github/workflows/*` changes.
   - Do **not** commit `.env` under any circumstances.
6. **Immediate Next Action:**
   - Commit and push the newly added documentation and `tests/` suite if requested, or proceed directly to fixing **P0 bugs (`BUG-001`..`BUG-003`)** and **P1 bugs (`BUG-004`..`BUG-007`)** when the user asks to fix the audited bugs.
7. **How to Test and Verify Changes:**
   - Push changes to `origin/main` using the `.env` `GITHUB_TOKEN` HTTP header.
   - Poll `https://api.github.com/repos/tim941008/fpga-web-simulator/actions/runs` until the `build` (`tsc -b && vite build`) and `deploy` jobs finish with `conclusion: success`.
   - Use the `browser` subagent on `https://tim941008.github.io/fpga-web-simulator/` and `python tests/deployment/run_verification.py` to verify fixes.

---

## 8. Important Technical Reference

- **Paths:**
  - Workspace: `C:\Users\User\Desktop\SIM_QQ`
  - Verilator Worker: `public/verilator/verilator-worker.js`
  - Verilator Binary: `public/verilator/verilator_bin.wasm` (6.15 MB), `public/verilator/verilator_bin.js`
  - Vendored 8bitworkshop HDL Runtime: `src/vendor/8bitworkshop/hdl/{vxmlparser.ts,hdlwasm.ts,hdlruntime.ts,hdltypes.ts,binaryen-shim.ts}`
  - Runtime Adapter: `src/sim/fpgaRuntime.ts`
  - QSF Parser: `src/parsers/qsfParser.ts`
  - Verilog Pre-Parser: `src/parsers/verilogParser.ts`
  - Test Suite: `tests/{combinational,sequential,counter,fsm,matrix,qsf,waveform,limitations,deployment}/`
- **Measured Performance (Live Browser Verilator WASM):**
  - First compile (cold cache + 6.1 MB WASM compile): `1268 ms Verilator + 54 ms Binaryen WASM codegen`
  - Subsequent compiles (warm cache): `7 ms – 65 ms Verilator + 2 ms – 21 ms Binaryen WASM codegen`

---

## 9. Final Handover Summary

- **Overall Status:** Deployed and operational at `https://tim941008.github.io/fpga-web-simulator/` with a full Verilator WASM compilation/simulation pipeline, audited bugs (`BUG_REPORT.md`), documented limitations (`LIMITATIONS.md`), and a 26-test regression suite (`tests/`, `TEST_REPORT.md`).
- **Major Accomplishments:** End-to-end React/TS/Vite/Tailwind FPGA simulator built, 8bitworkshop Verilator WASM integrated, GitHub Actions CI/CD stabilized without `package-lock.json`, deployed to GitHub Pages, and verified against 26 HDL/QSF/waveform/limitation test cases.
- **Most Important Unresolved Issue:** `BUG-001` (broken regex ANSI port pre-parser), `BUG-002` (unwired `$readmem` `getFileData`), and `BUG-003` (orphan QSF pins creating phantom board controls).
- **Immediate Next Action:** Fix `BUG-001` through `BUG-010` in `src/` (once authorized by the user), push to `main` to trigger the GitHub Actions build/deploy pipeline, and re-verify against the 26-test suite.

---

## 10. Next AI Initialization Prompt

```markdown
You are taking over development of the Web FPGA Simulator project in `C:\Users\User\Desktop\SIM_QQ` (GitHub: `https://github.com/tim941008/fpga-web-simulator`, Live URL: `https://tim941008.github.io/fpga-web-simulator/`).

Before taking any action:
1. Read `PROJECT_CONTEXT.md`, `WORK_LOG.md`, `NEXT_TASKS.md`, and `BUG_REPORT.md` in `C:\Users\User\Desktop\SIM_QQ`.
2. Note environment constraints:
   - `node` and `npm` are NOT installed locally on this Windows machine; `tsc -b && vite build` runs in GitHub Actions (`deploy.yml`) on push to `main`.
   - A `GITHUB_TOKEN` with `repo` and `workflow` scopes is stored in `.env` (never print or commit `.env`). Use it via `git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ..."` when pushing to `origin/main`.
3. Do NOT repeat the completed architecture investigation, initial bug audit, or test suite creation.
4. Continue directly from the highest-priority pending tasks in `NEXT_TASKS.md` (starting with P0 bugs `BUG-001`, `BUG-002`, `BUG-003` when requested by the user), verify all changes against `tests/` and the live deployment, and append new progress to `WORK_LOG.md` and `NEXT_TASKS.md`.
```
