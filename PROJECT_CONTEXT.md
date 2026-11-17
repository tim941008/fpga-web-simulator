# Project Context & Architecture (`PROJECT_CONTEXT.md`)

## 1. Overview
- **Project:** Web FPGA Simulator (`fpga-web-simulator`)
- **Workspace:** `C:\Users\User\Desktop\SIM_QQ`
- **Repository:** `https://github.com/tim941008/fpga-web-simulator`
- **Live GitHub Pages URL:** `https://tim941008.github.io/fpga-web-simulator/`
- **Stack:** React 18, TypeScript 5.6, Vite 5.4 (`base: './'`), TailwindCSS 3.4, `lucide-react`, `binaryen@^101.0.0`.
- **Localization:** Built-in English (`en`) and Traditional Chinese (`zh-TW`) localization (`src/i18n/translations.ts`) with `localStorage` persistence (`web_fpga_sim_lang`).

## 2. Architecture
- **Verilator WebAssembly Worker (`public/verilator/`):**
  - `verilator-worker.js` loads `verilator_bin.js` and `verilator_bin.wasm` (6.15 MB, from 8bitworkshop, GPL-3.0).
  - Runs Verilator (`--cc -O3 --x-assign fast --noassert --pins-sc-biguint --debug-check --top-module <top>`) in Emscripten virtual `FS` and returns `obj_dir/V<top>.xml`.
- **HDL Compiler & Runtime (`src/vendor/8bitworkshop/hdl/` & `src/sim/fpgaRuntime.ts`):**
  - `VerilogXMLParser` (`vxmlparser.ts`) parses Verilator's XML netlist into an `HDLUnit` AST.
  - `HDLModuleWASM` (`hdlwasm.ts` + `binaryen-shim.ts`) compiles the AST to native WebAssembly (`i32`/`i64` operations) with `HDLModuleJS` (`hdlruntime.ts`) as fallback.
  - `FpgaRuntime` (`src/sim/fpgaRuntime.ts`) wraps the model, wires `getFileData` for `$readmemh`/`$readmemb`, and exposes `compile()`, `getSignals()`, `setSignal()`, `eval()`, `stepEdge()`, `reset()`, and `dispose()`.
- **Parsers (`src/parsers/`):**
  - `qsfParser.ts`: Parses Quartus `.qsf` assignments, detects duplicate physical pin conflicts (`conflicts`, `hasConflict`), and attaches pins to active module ports via `buildBoardControlGroups()`.
  - `verilogParser.ts`: Comma-split stateful ANSI/non-ANSI port and module parser used for initial `topModule` detection and pre-compile port preview.
- **UI Components (`src/components/` & `src/i18n/`):**
  - `BoardView.tsx`, `SevenSegmentDisplay.tsx`, `MatrixViewer.tsx`, `SignalMonitor.tsx`, `ClockControls.tsx`, `translations.ts`.

## 3. Environment & Deployment Constraints
- **No Local Node.js:** `node` and `npm` are not installed on the local Windows machine; Docker daemon is not running. `npm install` and `npm run build` (`tsc -b && vite build`) execute in GitHub Actions (`.github/workflows/deploy.yml`).
- **GitHub Authentication:** `.env` contains `GITHUB_TOKEN` with `repo` and `workflow` scopes (Windows Credential Manager's default token lacks `workflow` scope). Never commit or print `.env`.
