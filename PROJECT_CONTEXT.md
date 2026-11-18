# Project Context & Architecture (`PROJECT_CONTEXT.md`)

## 1. Overview
- **Project:** Web FPGA Simulator (`fpga-web-simulator`)
- **Repository:** `https://github.com/tim941008/fpga-web-simulator`
- **Live GitHub Pages URL:** `https://tim941008.github.io/fpga-web-simulator/`
- **Stack:** React 18, TypeScript 5.6, Vite 5.4 (`base: './'`), TailwindCSS 3.4, `lucide-react`, `binaryen@^101.0.0`.
- **Localization:** Built-in English (`en`) and Traditional Chinese (`zh-TW`) localization (`src/i18n/translations.ts`) with `localStorage` persistence (`web_fpga_sim_lang`).

## 2. Architecture
Workflow: **Verilog Source → Automatic Port Detection → GUI-Based I/O Component Assignment → FPGA Simulation**

- **Verilator WebAssembly Worker (`public/verilator/`):**
  - `verilator-worker.js` loads `verilator_bin.js` and `verilator_bin.wasm` (6.15 MB, from 8bitworkshop, GPL-3.0).
  - Runs Verilator (`--cc -O3 --x-assign fast --noassert --pins-sc-biguint --debug-check --top-module <top>`) in Emscripten virtual `FS` and returns `obj_dir/V<top>.xml`.
- **HDL Compiler & Runtime (`src/vendor/8bitworkshop/hdl/` & `src/sim/fpgaRuntime.ts`):**
  - `VerilogXMLParser` (`vxmlparser.ts`) parses Verilator's XML netlist into an `HDLUnit` AST.
  - `HDLModuleWASM` (`hdlwasm.ts` + `binaryen-shim.ts`) compiles the AST to native WebAssembly (`i32`/`i64` operations) with `HDLModuleJS` (`hdlruntime.ts`) as fallback.
  - `FpgaRuntime` (`src/sim/fpgaRuntime.ts`) wraps the model, wires `getFileData` for `$readmemh`/`$readmemb`, and exposes `compile()`, `getSignals()`, `setSignal()`, `eval()`, `stepEdge()`, `reset()`, and `dispose()`.
- **Verilog Parser & Visual I/O Configuration (`src/parsers/verilogParser.ts` & `src/config/ioConfig.ts`):**
  - `verilogParser.ts`: Comma-split stateful ANSI/non-ANSI module and port parser used for automatic `topModule` detection and pre-compile port discovery (direction & bit width).
  - `ioConfig.ts`: Defines board hardware components (`CLOCK`, `KEY`, `SW`, `LEDR`, `LEDG`, `HEX0`–`HEX5`, `MATRIX_ROW`, `MATRIX_COL`), validates direction/width compatibility and duplicate resource conflicts (`configured`, `unassigned`, `conflict`, `invalid`), reconciles and persists user assignments across Verilog source edits (`localStorage` key `web_fpga_sim_io_config_v1`), and builds runtime board mappings (`buildBoardMappings()`).
- **UI Components (`src/components/` & `src/i18n/`):**
  - `BoardView.tsx`, `IoConfigPanel.tsx`, `SevenSegmentDisplay.tsx`, `MatrixViewer.tsx`, `SignalMonitor.tsx`, `ClockControls.tsx`, `translations.ts`.

## 3. Environment & Deployment Constraints
- **No Local Node.js:** `node` and `npm` are not installed on the local Windows machine; Docker daemon is not running. `npm install`, `npm test`, and `npm run build` (`tsc -b && vite build`) execute in GitHub Actions (`.github/workflows/deploy.yml`).
- **GitHub Authentication:** `.env` contains `GITHUB_TOKEN` with `repo` and `workflow` scopes (Windows Credential Manager's default token lacks `workflow` scope). Never commit or print `.env`.
