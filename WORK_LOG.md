# Incremental AI Work Log (`WORK_LOG.md`)

## Session: 2026-11-18 (Initial Build, Verilator WASM Integration, Audit & Test Suite)
- Built initial React + TypeScript + Vite + TailwindCSS FPGA simulator and integrated 8bitworkshop's Verilator WASM pipeline (`public/verilator/verilator-worker.js`, `verilator_bin.wasm`, `VerilogXMLParser`, `HDLModuleWASM`, `FpgaRuntime`).
- Stabilized GitHub Actions deployment (`.github/workflows/deploy.yml`), deployed to `https://tim941008.github.io/fpga-web-simulator/`, audited bugs (`BUG-001`..`BUG-011`), and created the 26-test regression suite under `tests/`.

---

## Session: 2026-11-18 (Bug Fixes `BUG-001`..`BUG-010`, UI Enhancement & Bilingual `EN`/`zh-TW` Support)

### 1. Work Completed
- **Fixed P0 Bugs (`BUG-001`, `BUG-002`, `BUG-003`):**
  - `BUG-001` ([src/parsers/verilogParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/verilogParser.ts)): Replaced greedy `ansiPortRegex` with comma-split stateful ANSI port parsing. Verified via `python tests/deployment/run_verification.py` (extracts all 8 ports of `top_fpga_demo`).
  - `BUG-002` ([src/sim/fpgaRuntime.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/sim/fpgaRuntime.ts), [src/vendor/8bitworkshop/hdl/hdlwasm.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/vendor/8bitworkshop/hdl/hdlwasm.ts#L874), [src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx)): Wired `getFileData` on `wasmModel` and `jsModel` before `powercycle()`, added `.hex/.mem/.mif/.txt/.binary` upload + `+ Add rom_init.hex` button in editor, and fixed `hdlwasm.ts:874` (`if ((global.size > 8 || isArrayType(global.type)) && opts && opts.funcarg)`) so unpacked arrays ≤ 8 bytes (such as `reg [7:0] rom [0:3]` in `LIM-007`) pass their memory offset to `$readmem` instead of loading a value.
  - `BUG-003` ([src/parsers/qsfParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/qsfParser.ts)): Updated `buildBoardControlGroups()` to skip orphan QSF signals when `ports.length > 0` (`QSF-003`).
- **Fixed P1 & P2 Bugs (`BUG-004` through `BUG-010`):**
  - `BUG-004` ([src/presets/sampleDesigns.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/presets/sampleDesigns.ts), [src/parsers/qsfParser.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/parsers/qsfParser.ts), [src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx)): Moved `KEY[3]` in `top_fpga_demo.qsf` from `PIN_A8` to `PIN_B15` and added duplicate physical pin conflict detection (`conflicts`, `hasConflict`) with an amber warning banner and red `⚠ Pin Conflict` badges in the QSF Pin Mapper tab.
  - `BUG-005` ([src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx)): Updated `sampleMatrix()` and `onTogglePov` so inactive rows immediately clear to `0` when `POV Scan Hold` is `OFF` and decay per scan step when `ON`.
  - `BUG-006` & `BUG-010` ([src/components/SignalMonitor.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/SignalMonitor.tsx)): Removed the 16-bit cap on `BIN` zero-padding (`padStart(width, '0')`) and formatted multi-bit waveform trace chips with `formatValue(busVal, def.width)`.
  - `BUG-007` ([src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx), [src/components/ClockControls.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/ClockControls.tsx)): Recorded waveform history snapshots on combinational input toggles when paused or clockless, and disabled clock stepping buttons when `clockSignalName === null`.
  - `BUG-008` & `BUG-009` ([src/components/MatrixViewer.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/components/MatrixViewer.tsx), [src/App.tsx](file:///c:/Users/User/Desktop/SIM_QQ/src/App.tsx)): Added `No MATRIX_ROW / MATRIX_COL ports in active module` status indicator, removed the 600 ms delay on initial mount/preset/file load, and tracked `wasmCachedRef` for accurate compile progress messages.
- **UI Visual Enhancement & Bilingual Support (`EN` / `繁體中文`):**
  - Created [src/i18n/translations.ts](file:///c:/Users/User/Desktop/SIM_QQ/src/i18n/translations.ts) supporting English (`en`) and Traditional Chinese (`zh-TW`) with `localStorage` persistence (`web_fpga_sim_lang`) and English fallback.
  - Enhanced visual hierarchy, color-coded badges (`emerald`, `cyan`, `violet`, `amber`, `rose`), borders, and interaction states across `App.tsx`, `ClockControls.tsx`, `BoardView.tsx`, `MatrixViewer.tsx`, and `SignalMonitor.tsx`.

### 2. Issues & Debugging Encountered
- **TypeScript Literal Type Union Error in GitHub Actions Run #2 (`44139539301`):**
  - `export const TRANSLATIONS = { ... } as const` caused `typeof TRANSLATIONS['zh-TW']` to be incompatible with `typeof TRANSLATIONS['en']`, and `wasmModel.getFileData` was inferred as type `null`.
  - Resolved in commit `190a79c` by removing `as const` from `TRANSLATIONS` and casting `(wasmModel as any).getFileData = getFileData`. GitHub Actions Run #3 (`44140974731`) passed both `build` and `deploy`.
- **`$readmemh` Small Array Address Bug in Vendored `hdlwasm.ts:874`:**
  - Live browser testing on Run #3 showed `readmemh_rom.v` (`reg [7:0] rom [0:3]`) compiled in WASM without error, but `LEDR` read `0x00` instead of `0xA5`.
  - Root cause: `varref2wasm` in `src/vendor/8bitworkshop/hdl/hdlwasm.ts:874` checked `if (global.size > 8 && opts && opts.funcarg)` before passing `this.address2wasm(e)`. Because `rom[0:3]` is only 4 bytes (`<= 8`), it passed the loaded 32-bit value (`0`) instead of `rom`'s memory offset!
  - Fixed by changing line 874 to `if ((global.size > 8 || isArrayType(global.type)) && opts && opts.funcarg)`.
