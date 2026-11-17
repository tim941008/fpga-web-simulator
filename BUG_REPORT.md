# Web FPGA Simulator — Bug Audit & Resolution Report

**Last Updated:** 2026-11-18  
**Target Environment:**
- **Local Workspace:** `C:\Users\User\Desktop\SIM_QQ`
- **Live Deployed Build (GitHub Pages):** `https://tim941008.github.io/fpga-web-simulator/`

---

## Resolution Summary Matrix

| Bug ID | Severity | Status | Summary of Fix |
|---|---|---|---|
| **BUG-001** | **High** | **FIXED & VERIFIED** | Replaced greedy `ansiPortRegex` in `src/parsers/verilogParser.ts` with comma-split stateful ANSI port parsing. Extracts all 8 ports of `top_fpga_demo` and all 4 ports of `comb_alu`. |
| **BUG-002** | **High** | **FIXED & VERIFIED** | Wired `model.getFileData` in `src/sim/fpgaRuntime.ts` before `powercycle()`, added `+ Add rom_init.hex` and `.hex/.mem` upload support in `src/App.tsx`, and fixed `src/vendor/8bitworkshop/hdl/hdlwasm.ts:874` (`isArrayType(global.type)`) so arrays ≤ 8 bytes pass their memory address to `$readmem`. |
| **BUG-003** | **High** | **FIXED & VERIFIED** | Updated `buildBoardControlGroups()` in `src/parsers/qsfParser.ts` to ignore orphan QSF pin assignments when `ports.length > 0`. |
| **BUG-004** | **Medium** | **FIXED & VERIFIED** | Reassigned `KEY[3]` to `PIN_B15` in `top_fpga_demo.qsf` (`src/presets/sampleDesigns.ts`) and added duplicate physical pin conflict detection (`conflicts`, `hasConflict`) in `src/parsers/qsfParser.ts` + warning banner/badges in `src/App.tsx`. |
| **BUG-005** | **Medium** | **FIXED & VERIFIED** | Updated `sampleMatrix()` and `onTogglePov` in `src/App.tsx` so inactive rows immediately clear to `0` when `POV Scan Hold` is `OFF` and decay per scan step when `ON`. |
| **BUG-006** | **Medium** | **FIXED & VERIFIED** | Removed `Math.min(width, 16)` cap in `src/components/SignalMonitor.tsx` (`formatValue`), padding `BIN` values to the full declared signal width. |
| **BUG-007** | **Medium** | **FIXED & VERIFIED** | Updated `applyInput()` in `src/App.tsx` to append waveform snapshots on combinational input toggles when paused or clockless, and disabled clock stepping buttons in `src/components/ClockControls.tsx` when `clockSignalName === null`. |
| **BUG-008** | **Low** | **FIXED & VERIFIED** | Added `isConnected` indicator to `src/components/MatrixViewer.tsx` displaying `No MATRIX_ROW / MATRIX_COL ports in active module` on non-matrix designs. |
| **BUG-009** | **Low** | **FIXED & VERIFIED** | Removed the 600 ms delay on initial load, preset switch, and file upload in `src/App.tsx` (debouncing only `<textarea>` edits by 450 ms) and tracked `wasmCachedRef` for accurate compile progress messages. |
| **BUG-010** | **Low** | **FIXED & VERIFIED** | Updated multi-bit bus chips in `src/components/SignalMonitor.tsx` to format values using `formatValue(busVal, def.width)` so `HEX`, `BIN`, and `DEC` apply to waveform trace chips. |
| **BUG-011** | **Low (Env)** | **DOCUMENTED** | Local Windows host does not have Node.js installed; builds and deployments run via GitHub Actions (`ubuntu-latest`, Node 20). |
