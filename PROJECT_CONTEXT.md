# Project Context & Architecture (`PROJECT_CONTEXT.md`)

## 1. Overview
- **Project:** Web FPGA Simulator (`fpga-web-simulator`)
- **Repository:** `https://github.com/tim941008/fpga-web-simulator`
- **Live GitHub Pages URL:** `https://tim941008.github.io/fpga-web-simulator/`
- **Stack:** React 18, TypeScript 5.6, Vite 5.4 (`base: './'`), TailwindCSS 3.4, `lucide-react`, `binaryen@^101.0.0`, `vitest@^2.1.8`.
- **Localization:** Built-in English (`en`) and Traditional Chinese (`zh-TW`) localization (`src/i18n/translations.ts`) with `localStorage` persistence (`web_fpga_sim_lang`).

## 2. Architecture
- **Verilator WebAssembly Worker (`public/verilator/`):**
  - `verilator-worker.js` loads `verilator_bin.js` and `verilator_bin.wasm` (6.15 MB, from 8bitworkshop, GPL-3.0).
  - Runs Verilator (`--cc -O3 --x-assign fast --noassert --pins-sc-biguint --debug-check --top-module <top>`) in Emscripten virtual `FS` and returns `obj_dir/V<top>.xml`.
- **HDL Compiler & Runtime (`src/vendor/8bitworkshop/hdl/` & `src/sim/fpgaRuntime.ts`):**
  - `VerilogXMLParser` (`vxmlparser.ts`) parses Verilator's XML netlist into an `HDLUnit` AST.
  - `HDLModuleWASM` (`hdlwasm.ts` + `binaryen-shim.ts`) compiles the AST to native WebAssembly (`i32`/`i64` operations) with `HDLModuleJS` (`hdlruntime.ts`) as fallback.
  - `FpgaRuntime` (`src/sim/fpgaRuntime.ts`) wraps the model, wires `getFileData` for `$readmemh`/`$readmemb`, and exposes `compile()`, `getSignals()`, `setSignal()`, `eval()`, `stepEdge()`, `reset()`, and `dispose()`.
- **Customizable Hardware Configuration Layer (`src/types/hardwareConfig.ts`, `src/config/`):**
  - Independent from Verilator; supports `CLOCK`, `SWITCH`, `KEY`, `LED`, `SEVEN_SEGMENT`, and `MATRIX` components.
  - `hardwareMapping.ts`: Unified bit-order conversion, Active-High/Active-Low polarity helpers, initial input computation, and port validation against compiled Verilog ports.
  - `matrixMapping.ts`: Independent Row (`15→0` / `0→15`) and Column (`15→0` / `0→15`) coordinate-to-bit mapping, polarity evaluation, live sampling, and `DEFAULT_MATRIX_PATTERN` UI preview rendering.
  - `configPersistence.ts`: Versioned (`schemaVersion = 1`) `localStorage` persistence (`web_fpga_sim_hardware_config_v1`) with validation, corrupted/outdated schema recovery, and reset-to-default.
- **Verilog Pre-Parser (`src/parsers/verilogParser.ts`):**
  - Comma-split stateful ANSI/non-ANSI port and module parser used for initial `topModule` detection and pre-compile port preview.
- **UI Components (`src/components/` & `src/i18n/`):**
  - `BoardView.tsx`, `SevenSegmentDisplay.tsx`, `MatrixViewer.tsx`, `SignalMonitor.tsx`, `ClockControls.tsx`, `HardwareConfigPanel.tsx`, `translations.ts`.

## 3. Environment & Deployment Constraints
- **No Local Node.js:** `node` and `npm` are not installed on the local Windows machine; `npm install`, `npm test`, and `npm run build` (`tsc -b && vite build`) execute in GitHub Actions (`.github/workflows/deploy.yml`).
- **GitHub Authentication:** `.env` contains `GITHUB_TOKEN` (never commit or print `.env`).
