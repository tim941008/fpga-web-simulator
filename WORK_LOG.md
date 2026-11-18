# Incremental AI Work Log (`WORK_LOG.md`)

## Session: 2026-11-18 (Initial Build, Verilator WASM Integration, Audit & Test Suite)
- Built initial React + TypeScript + Vite + TailwindCSS FPGA simulator and integrated 8bitworkshop's Verilator WASM pipeline (`public/verilator/verilator-worker.js`, `verilator_bin.wasm`, `VerilogXMLParser`, `HDLModuleWASM`, `FpgaRuntime`).
- Stabilized GitHub Actions deployment (`.github/workflows/deploy.yml`), deployed to `https://tim941008.github.io/fpga-web-simulator/`, audited bugs (`BUG-001`..`BUG-011`), and created the regression test suite under `tests/`.

---

## Session: 2026-11-18 (Bug Fixes `BUG-001`..`BUG-010`, UI Enhancement & Bilingual `EN`/`zh-TW` Support)
- Fixed `BUG-001` through `BUG-010` (stateful ANSI port parser, `$readmemh` + `hdlwasm.ts:874` small-array address passing, POV clear, full-width `BIN`, combinational waveform recording, immediate initial compile, radix trace formatting).
- Added English (`en`) and Traditional Chinese (`zh-TW`) localization (`src/i18n/translations.ts`) with `localStorage` persistence and modernized UI styling.

---

## Session: 2026-11-18 (Remove Quartus QSF & Implement GUI-Based I/O Pin Configuration)
- **Removed QSF Support Completely:**
  - Deleted `src/parsers/qsfParser.ts` and `tests/qsf/`.
  - Removed `.qsf` upload button, QSF state/editor/table, QSF presets, and all QSF references across `src/`, `index.html`, and localization files.
- **Implemented Visual I/O Pin Configuration Engine & GUI:**
  - Created `src/config/ioConfig.ts` defining board hardware components (`CLOCK`, `KEY`, `SW`, `LEDR`, `LEDG`, `HEX0`–`HEX5`, `MATRIX_ROW`, `MATRIX_COL`), compatibility checking, validation (`configured`, `unassigned`, `conflict`, `invalid`), resource warnings, edit reconciliation, board mapping generation (`buildBoardMappings()`), and per-module `localStorage` persistence (`web_fpga_sim_io_config_v1`).
  - Created `src/components/IoConfigPanel.tsx` providing an interactive port configuration table with direction-filtered dropdowns, width/conflict/invalidation indicators, summary counters, and `Auto-Assign` / `Reset Defaults` / `Clear All` actions in both English and Traditional Chinese.
  - Updated `src/App.tsx`, `src/components/BoardView.tsx` (distinct Red `LEDR` and Green `LEDG` banks, custom port labels, width clamping badges), `src/components/SevenSegmentDisplay.tsx`, `src/components/SignalMonitor.tsx` (`Assigned Component` column), and `src/presets/sampleDesigns.ts` (added `custom-io-demo` preset with non-standard port names).
- **Testing & CI Integration:**
  - Created `tests/io_config/` (`IOCFG-001`..`IOCFG-004`), TypeScript unit tests (`tests/io_config/ioConfig.test.ts` + `run_ts_tests.mjs` invoked via `npm test`), and updated `tests/deployment/run_verification.py` and `.github/workflows/deploy.yml` to run `npm test` before `npm run build`.
  - Updated `README.md`, `PROJECT_CONTEXT.md`, `NEXT_TASKS.md`, `BUG_REPORT.md`, `LIMITATIONS.md`, `TEST_MATRIX.md`, `COMPATIBILITY_MATRIX.md`, `TEST_REPORT.md`, and `CONTRIBUTING.md`.
