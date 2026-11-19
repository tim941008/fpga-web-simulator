# Phase B Final Release & Merge Review (`MERGE_REVIEW.md`)

**Date:** 2026-11-19  
**Branch Under Review:** `phase-b-stabilization` (`4c0ece0a580e47e162fa194b50a3e6eead9cb598`)  
**Target Branch:** `main` (`cacfbc57907192ae7ff5f8a07873ea08e86aacdf`)  
**CI Workflow Run:** [Run #8 (`44486676054`)](https://github.com/tim941008/fpga-web-simulator/actions/runs/44486676054) — **PASS** (`npm ci`, `npm test` 16/16 passed, `npm run build` 0 errors)

---

## 1. Executive Summary & Final Recommendation

### Recommendation: **B. Merge with known limitations** *(Safe to merge into `main`; zero release blockers)*

- **Why Safe to Merge:**
  - All Phase B primary objectives are 100% complete, verified by automated Vitest unit tests (`16/16 passed`), Python static verification (`run_verification.py`), and a clean production build (`tsc -b && vite build` with `0` errors).
  - All remaining `PARTIAL` or deferred items have been re-audited and confirmed to be **non-blocking technical debt** (documented Verilator WASM >64-bit / array UI boundaries and `binaryen` chunk-splitting optimization).
  - Merging `phase-b-stabilization` into `main` will automatically trigger the gated `deploy` job in `.github/workflows/deploy.yml` to publish the new QSF-free, fully customizable hardware simulator to GitHub Pages.

---

## 2. Architecture & Component Final Review

### 2.1 QSF Removal Completeness — **VERIFIED (100% Complete)**
- **Deleted Files:** `src/parsers/qsfParser.ts` and the entire `tests/qsf/` directory (`valid_mappings.*`, `duplicate_pins.*`, `missing_signals.*`), plus the intermediate `src/config/ioConfig.ts`, `src/components/IoConfigPanel.tsx`, and `tests/io_config/*` prototype files from `origin/main`.
- **Codebase Audit:** Automated regex scan (`/\bqsf\b|qsfParser|buildBoardControlGroups|PinAssignment/i`) across all active TypeScript/React source files (`src/` excluding `__tests__/`) and active user documentation (`README.md`, `LIMITATIONS.md`, `PROJECT_CONTEXT.md`, `index.html`) returned **0 matches**.
- **Remaining Mentions:** Found only in negative regression tests (`src/config/__tests__/hardwareConfig.test.ts`, `tests/deployment/run_verification.py`) that assert QSF remains absent, and in historical session archive documents (`AI_Handover_Report_2026-11-18.md`, `BUG_REPORT.md`, `REPORT.md`, `TEST_MATRIX.md`, `TEST_REPORT.md`, `WORK_LOG.md`, `NEXT_TASKS.md`, `BRANCH_PUBLISH_REPORT.md`).

### 2.2 `HardwareConfig` Architecture — **VERIFIED**
- **Data Model (`src/types/hardwareConfig.ts`):** Clean discriminated union (`HardwareComponentConfig`) across 6 peripheral types (`CLOCK`, `SWITCH`, `KEY`, `LED`, `SEVEN_SEGMENT`, `MATRIX`) wrapped in a versioned root schema (`HardwareConfigSchema`, `schemaVersion = 1`).
- **Decoupling & Single Source of Truth (`src/config/hardwareMapping.ts`):**
  - Completely independent from Verilator and `FpgaRuntime`.
  - Centralizes `getOrderedBitIndices()`, `mapVisualIndexToBit()`, `isRawBitActive()`, `logicalStateToRawBit()`, `computeSwitchInitialRawValue()`, `computeKeyInitialRawValue()`, and `computeInitialInputSignals()` with zero code duplication across UI components.
- **Port Validation (`validateHardwareConfig`):**
  - Strictly validates all enabled components against compiled Verilog ports (`PortDefinition[]`).
  - Emits explicit, user-facing diagnostics for `EMPTY_SIGNAL`, `MISSING_SIGNAL`, `DIRECTION_MISMATCH`, `WIDTH_MISMATCH`, and `INVALID_SEGMENT_BIT`. Never silently maps a missing or incompatible signal.

### 2.3 16×16 Matrix Implementation — **VERIFIED**
- **Independent Row & Column Configuration (`src/config/matrixMapping.ts`, `src/components/MatrixViewer.tsx`):**
  - `row` and `col` axes each have independent `signalName`, `width`, `bitOrder` (`'15-to-0'` | `'0-to-15'`), and `polarity` (`'active-high'` | `'active-low'`).
  - Coordinate-to-bit mapping is implemented in dedicated pure functions (`mapMatrixRowToBit`, `mapMatrixColToBit`, `evaluateMatrixPixel`):
    - **Row `15 → 0`**: Bit 15 → Top row (`displayRow = 0`), Bit 0 → Bottom row (`displayRow = 15`).
    - **Row `0 → 15`**: Bit 0 → Top row (`displayRow = 0`), Bit 15 → Bottom row (`displayRow = 15`).
    - **Column `15 → 0`**: Bit 15 → Leftmost column (`displayCol = 0`), Bit 0 → Rightmost column (`displayCol = 15`).
    - **Column `0 → 15`**: Bit 0 → Leftmost column (`displayCol = 0`), Bit 15 → Rightmost column (`displayCol = 15`).
  - **Non-Mutating Guarantee:** Changing display orientation or polarity re-renders the UI buffer only and **never modifies underlying Verilog signal values** (verified across all 4 Row×Column combinations in Vitest).
- **Default Matrix Pattern (`DEFAULT_MATRIX_PATTERN`):**
  - Matches all 16 required binary rows (`board[0]`..`board[15]`) bit-for-bit.
  - Clearly scoped to `displayMode: 'pattern'` (**UI Preview Pattern** mode) vs. `displayMode: 'live'` (**Live Verilog** mode), with interactive pixel toggling and a **Restore Default Pattern** button. Never injected into `FpgaRuntime` or used to overwrite user Verilog signals.

### 2.4 Seven Segment Implementation — **VERIFIED**
- **Flexible Segment Mapping (`src/components/SevenSegmentDisplay.tsx`):**
  - Supports arbitrary per-segment bit indices (`segmentMap: { a, b, c, d, e, f, g, dp }`), eliminating fixed `HEX[6:0]` assumptions.
  - Supports **Decimal Point (`DP`)** rendering (`showDecimalPoint` toggle + `<circle cx="57" cy="77" r="3.5" />`).
  - Supports independent `active-low` / `active-high` polarity, custom LED color themes (`rose`, `emerald`, `amber`, `cyan`, `violet`), custom labels, and multiple independent display instances.

### 2.5 Configuration Persistence Layer — **VERIFIED**
- **Versioned Storage (`src/config/configPersistence.ts`):**
  - Saves automatically to `localStorage` under `web_fpga_sim_hardware_config_v1` with `schemaVersion: 1`.
  - Validates structure and component invariants on load (`parseStoredHardwareConfig`).
  - Gracefully recovers to the active preset's default configuration when encountering corrupted JSON or an outdated/mismatched `schemaVersion` (`recoveredFromInvalid: true`).
  - `resetHardwareConfig()` clears persisted state and restores defaults without touching Verilog source files or simulation state.

---

## 3. Build Output & Bundle Size Investigation

### 3.1 Build Output Summary (from CI Job `135431770107` / Artifact `14511340616`)

| Asset File | Raw Size | Gzip Size | Role |
|---|---|---|---|
| `dist/index.html` | `567 B` (`0.57 kB`) | `0.38 kB` | HTML entry point |
| `dist/assets/index-DtIPW5bI.css` | `29,029 B` (`29.03 kB`) | `5.52 kB` | TailwindCSS utility stylesheet |
| `dist/assets/index-CoxjHVsk.js` | `7,411,763 B` (`7,410.41 kB`) | `1,148.62 kB` | Main application + Binaryen bundle |
| `dist/verilator/verilator-worker.js` | `4,270 B` (`4.27 kB`) | — | Web Worker script (loaded on demand) |
| `dist/verilator/verilator_bin.js` | `269,659 B` (`269.66 kB`) | — | Emscripten loader for Verilator |
| `dist/verilator/verilator_bin.wasm` | `6,149,070 B` (`6,149.07 kB`) | — | Verilator WASM binary (fetched in Worker) |

### 3.2 Byte-Level Breakdown of `dist/assets/index-CoxjHVsk.js` (~7.41 MB)

Direct inspection of `dist/assets/index-CoxjHVsk.js` reveals the exact composition by byte offset:

| Rank | Contributor | Offset Span in `index-CoxjHVsk.js` | Approx. Size | % of Bundle |
|---|---|---|---|---|
| **1** | **`binaryen` (`^101.0.0`)** | `~143,000` .. `~7,315,000` | **~7,172 KB (~7.17 MB)** | **96.8%** |
| **2** | **`react` + `react-dom` (`^18.3.1`)** | `0` .. `~143,000` | **~143 KB** | **1.9%** |
| **3** | **Vendored 8bitworkshop HDL Runtime** (`vxmlparser.ts`, `hdlwasm.ts`, `hdlruntime.ts`) | `~7,315,000` .. `~7,367,000` | **~52 KB** | **0.7%** |
| **4** | **Simulator App, Phase B Config & Tree-Shaken `lucide-react` Icons** (`src/App.tsx`, `src/components/*`, `src/config/*`, `src/i18n/*`) | `~7,367,000` .. `7,411,763` | **~45 KB** | **0.6%** |

**Root Cause of ~7.4 MB Size:**
- `binaryen@101.0.0` is an Emscripten **asm.js** compilation of the Binaryen C++ WebAssembly optimizer/codegen library.
- Because `src/App.tsx` statically imports `FpgaRuntime` (`src/sim/fpgaRuntime.ts`), which statically imports `HDLModuleWASM` (`src/vendor/8bitworkshop/hdl/hdlwasm.ts`) and `binaryen-shim.ts` (`import binaryenModule from 'binaryen'`), Rollup/Vite bundles the entire 7.17 MB `binaryen` module into the main entry chunk (`index-*.js`).

### 3.3 Lazy-Loading & Code-Splitting Opportunities
1. **Dynamic `import()` of `HDLModuleWASM` & `binaryen-shim` in `FpgaRuntime.compile()` (High Impact — saves ~7.17 MB from initial bundle):**
   - Replace static imports of `HDLModuleWASM` and `binaryenReady` in `src/sim/fpgaRuntime.ts` with dynamic `await import(...)` inside `FpgaRuntime.compile()` (after `runVerilator()` produces XML).
   - **Impact:** Reduces initial UI bundle (`index-*.js`) from **7.41 MB → ~240 KB** (`96.8%` reduction), allowing the React UI to render instantaneously while the `binaryen` chunk downloads in parallel with the Verilator Web Worker.
2. **Rollup `manualChunks` Configuration in `vite.config.ts` (Medium Impact):**
   - Add `manualChunks: { binaryen: ['binaryen'], react: ['react', 'react-dom'] }` so browser HTTP caching caches `binaryen-*.js` independently across UI updates.
3. **Lazy-Load `HardwareConfigPanel` via `React.lazy()` (Low Impact — ~12 KB):**
   - Defer loading the configuration editor tab until the user clicks the **Hardware Configuration** tab.

### 3.4 Dependency Audit (`package.json`)
- **Runtime `dependencies` (`binaryen`, `lucide-react`, `react`, `react-dom`):** **0 unnecessary dependencies.** Every package is actively required (`lucide-react` is tree-shaken by Vite to only the imported icons).
- **Development `devDependencies`:** **0 unnecessary dependencies.** All packages support Vite, TypeScript (`tsc -b`), TailwindCSS, or Vitest (`vitest run`).

---

## 4. Re-Run of Audit Findings: Release Blockers vs. Non-Blocking Technical Debt

| ID / Item | Current Status | Classification | Rationale |
|---|---|---|---|
| **QSF Removal & Phase B Hardware Config** | **PASS (16/16 Vitest)** | **Complete** | Zero QSF code remains; full component config, validation, Matrix bit order, 7-Seg mapping, and persistence verified. |
| **`LIM-002` / `LIM-003` (>64-Bit Packed Signal Cap)** | **PARTIAL / Boundary** | **Non-Blocking Technical Debt** | Inherent 64-bit (`i64`) limit in vendored 8bitworkshop `HDLModuleWASM`. Standard <=64-bit FPGA educational designs work at full WASM speed; documented in `LIMITATIONS.md` for Phase C. |
| **`LIM-004` (Unpacked 1D/2D Arrays Hidden from Signal Monitor)** | **PARTIAL / Boundary** | **Non-Blocking Technical Debt** | Unpacked arrays compile and simulate properly in WASM (including `$readmemh` ROMs in `LIM-007`). Adding a dedicated RAM/ROM table viewer tab is a Phase C feature enhancement. |
| **7.41 MB Main JS Bundle (`binaryen` Eager Import)** | **Functional (1.15 MB gzip)** | **Non-Blocking Technical Debt** | Builds cleanly and loads reliably on GitHub Pages. Code-splitting `binaryen` via dynamic `import()` is a self-contained performance enhancement. |
| **Single Matrix Card Rendered on Board Tab** | **Functional** | **Non-Blocking Technical Debt** | Multiple `MATRIX` components can be stored in `HardwareConfigPanel`; `BoardView` renders the primary enabled `MATRIX`. |
| **High-Frequency (`1000 Hz`) `runCycles` Object Allocation** | **Functional** | **Non-Blocking Technical Debt** | Simulation results are cycle-accurate; reducing intermediate `getSignals()` allocations during 1000 Hz batch frames is an optimization item. |
| **Committed `package-lock.json` in Repo** | **Handled in CI** | **Non-Blocking Technical Debt** | `.github/workflows/deploy.yml` generates `package-lock.json` if missing and runs `npm ci` deterministically. Exporting the lockfile back to the repo is optional housekeeping. |

**Conclusion of Audit Re-Run:** There are **0 Release Blockers**. Every remaining item is **Non-Blocking Technical Debt**.
