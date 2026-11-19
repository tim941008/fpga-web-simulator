# FPGA Web Simulator — Independent Project Health & Release Audit Report

**Audit Date:** 2026-11-19  
**Repository:** `https://github.com/tim941008/fpga-web-simulator`  
**Audit Scope (Branches Reviewed):**
- `origin/main` (`0480711` — *Lazy-load binaryen WASM codegen chunk and add Phase B release review reports*)
- `origin/phase-b-stabilization` (`0480711` — *identical to `origin/main`*)
- `origin/phase-c1-multifile-simulator` (`63615db` — *Phase C.1: Add multi-file/folder/ZIP project support and high-speed SimulationEngine*)

> **Note on Local Verification Environment:** `node` and `npm` are not installed on the local audit workstation, and `MULTIFILE_SUPPORT_REPORT.md` / `SIMULATION_PERFORMANCE_REPORT.md` confirm that `phase-c1-multifile-simulator` was also authored without executing `npm test`, `npm run build`, or browser verification. All findings below are based on direct static code inspection, git history/diff analysis across all three branches, and contract/control-flow auditing.

---

## Executive Determination

### Overall Release Verdict: **C. Needs fixes before release**

| Branch | Commit | Merge / Release Status | Rationale |
|---|---|---|---|
| `origin/main` / `origin/phase-b-stabilization` | `0480711` | **Already merged (`main` == `phase-b-stabilization`); needs minor fixes before public release** | Phase B hardware config and lazy-loaded `binaryen` chunk are cleanly architected and CI-tested, but public release is still blocked by missing `package-lock.json`, unresolved GPL-3.0 vs MIT license ambiguity, and stale `runtimeRef` / clock-polarity gaps. |
| `origin/phase-c1-multifile-simulator` | `63615db` | **Do NOT merge / Do NOT release** | Completely unverified in CI/browser; contains **3 Critical** and **6 Major** issues including a regex pre-compile gate that breaks valid Verilog (`generate`/`ifdef`/testbenches), stale `FpgaRuntime` survival on compile failure, unhandled ZIP import exceptions, and `SimulationEngine` closure/UI desync bugs. |

---

## 1. Scorecard Across the 10 Review Dimensions

| # | Dimension | `main` / `phase-b` (`0480711`) | `phase-c1-multifile-simulator` (`63615db`) | Summary |
|---|---|---|---|---|
| 1 | **Architecture** | Strong | Good (with coupling leaks in `App.tsx`) | Clean separation between `HardwareConfig`, `matrixMapping`, `projectModel`, and `SimulationEngine`. `App.tsx` (~880 lines) has grown into a monolith coordinating too many stateful refs. |
| 2 | **Usability** | Good | Mixed (regressions) | Bilingual UI (`en`/`zh-TW`) regressed in Phase C.1 (hardcoded English). Built-in multi-file examples show immediate validation errors. Momentary buttons lack touch/keyboard support. |
| 3 | **Simulation Correctness** | Good (within 64-bit WASM limits) | At Risk | Verilator WASM + 8bitworkshop pipeline is solid for standard <=64-bit Verilog, but `CLOCK.polarity` is ignored, stale `FpgaRuntime` survives compile failures, and `$readmem` strips `@addr` offsets. |
| 4 | **Hardware Mapping Correctness** | Strong | Good | `hardwareMapping.ts` and `matrixMapping.ts` are pure, well-tested, and non-mutating. Minor gaps: multiple `MATRIX`/`CLOCK` instances silently ignored, duplicate input bindings unflagged, POV decay is sample-rate dependent. |
| 5 | **Multi-File Verilog Support** | Single-file oriented | **At Risk** | Good UX direction (Explorer, folder/ZIP/drag-drop, `-I` dirs in worker), but regex-based `validateProject` + `selectFilesForTop` can both falsely block valid Verilog and drop required submodule files. |
| 6 | **Performance** | Moderate | Good design, **unmeasured** | Lazy-loading `binaryen` (Phase B) and time-sliced `SimulationEngine` + `makeCycleStepper` (Phase C.1) are strong improvements. Main-thread execution, per-compile 64 MB–1 GB WASM memory allocation, and 4 ms idle timer churn at 1 Hz remain concerns. |
| 7 | **Future Scalability** | Moderate | Moderate | Main-thread simulation loop, 64-sample SVG waveform buffer, 64-bit signal cap, and single-clock / single-matrix board rendering constrain larger FPGA designs. |
| 8 | **Code Quality** | Good | Fair | Clean TypeScript types and unit test structure, but `App.tsx` lacks error boundaries / `try-catch` on async imports, `noUnusedLocals` is disabled (unused `FolderUp` import), and `configPersistence.ts` has incomplete schema validation. |
| 9 | **Technical Debt** | Moderate | Elevated | Vendored GPL-3.0 8bitworkshop runtime (`@ts-nocheck`), hardcoded `rom_init.hex` fixture in `fpgaRuntime.ts`, no `package-lock.json`, and 16+ overlapping `*_REPORT.md` files cluttering the repository root. |
| 10 | **Release Readiness** | Needs minor fixes | **Not Ready** | Phase C.1 has zero CI/build/browser verification, Critical compile-blocking bugs, and unresolved MIT vs GPL-3.0 licensing disclosure. |

---

## 2. Targeted Subsystem Inspection

### 2.1 `HardwareConfig` (`src/types/hardwareConfig.ts`, `src/config/defaultHardwareConfig.ts`, `src/config/hardwareMapping.ts`, `src/config/configPersistence.ts`, `src/components/HardwareConfigPanel.tsx`)
- **Strengths:** Clean discriminated union schema (`schemaVersion = 1`), pure mapping helpers, explicit validation codes (`EMPTY_SIGNAL`, `MISSING_SIGNAL`, `DIRECTION_MISMATCH`, `WIDTH_MISMATCH`, `INVALID_SEGMENT_BIT`), complete QSF removal.
- **Gaps:** `configPersistence.ts` (`isValidComponent`) does not validate `segmentMap`, `initialPressed`, `behavior`, or `row.width`/`col.width`; `validateHardwareConfig` does not flag duplicate input components mapped to the same port; `SevenSegmentComponentConfig.bitOrder` is unused; `ClockComponentConfig.polarity` and `defaultHz` are ignored at runtime; `App.tsx` only activates the first enabled `CLOCK` and `MATRIX`.

### 2.2 `fpgaRuntime` (`src/sim/fpgaRuntime.ts`)
- **Strengths:** Clean Verilator Worker -> XML -> `HDLModuleWASM` (with `HDLModuleJS` fallback) pipeline; lazy dynamic import of `binaryen` chunk; fast `makeCycleStepper()` and `readSignal()` added in Phase C.1.
- **Gaps:** Hardcoded test fixture `memFiles.set('rom_init.hex', 'A5\n5A\nF0\n0F')` in production code; `normalizeMemContent` strips `@addr` directives; `inout` ports misclassified as `input`; ports > 64 bits silently dropped without warning; `makeCycleStepper` hardcodes active-high `1 -> 0` clock polarity; no compile timeout or cancellation for stuck Verilator jobs.

### 2.3 `simulationEngine` (`src/sim/simulationEngine.ts`)
- **Strengths:** Clean React-independent state machine (`idle`, `running`, `paused`, `stopped`, `finished`), time-sliced `12 ms` slices, `33 ms` throttled UI frames, prime sampling stride (`61`), injectable `EngineScheduler` for deterministic unit tests.
- **Gaps:** Main-thread execution (complex designs can still jank UI if 256 cycles exceed `12 ms`); `scheduleTick(4)` wakes 250 times/sec even at 1 Hz; `MessageChannel` ports are never closed on disposal; `App.tsx` integration introduces stale closures (`sampleRef`, `stepRef`), cycle counter desync (`cycleCount` vs `engineStats.cycle`), and pause/batch interaction bugs.

### 2.4 `matrixMapping` (`src/config/matrixMapping.ts`, `src/components/MatrixViewer.tsx`)
- **Strengths:** Pure, non-mutating coordinate mapping (`mapMatrixRowToBit`, `mapMatrixColToBit`, `evaluateMatrixPixel`) supporting all 4 independent Row×Column bit-order combinations and independent polarities; clean separation of `'live'` vs `'pattern'` display modes.
- **Gaps:** POV decay (`buffer[r][c] *= 0.96` / `0.5`) is applied per sample invocation rather than per wall-clock delta, causing brightness/persistence to vary dramatically with simulation speed and stride; only one `MATRIX` component is rendered on the Board tab.

### 2.5 Project Explorer & Multi-File Support (`src/components/ProjectExplorer.tsx`, `src/project/projectModel.ts`, `src/project/projectCompile.ts`, `src/project/projectImport.ts`)
- **Strengths:** Intuitive file list, inline rename, replace, delete, top-module selector, multi-file/folder/ZIP/drag-drop ingestion, recursive directory walk.
- **Gaps:** Regex-based `scanSource` + hard pre-compile gate in `compileProject` + file pruning in `selectFilesForTop` is brittle and breaks valid Verilog (`generate`, `ifdef`, SV types, testbench files); missing `try/catch` around ZIP/file import; pre-filter memory exhaustion on large folders/ZIPs; hardcoded English UI strings; sanitized filename mismatch breaks error file highlighting.

### 2.6 Verilator Integration (`public/verilator/verilator-worker.js`, `src/vendor/8bitworkshop/hdl/*`)
- **Strengths:** Compiles `verilator_bin.wasm` once and caches the `WebAssembly.Module`; preserves folder hierarchy and adds `-I` flags per directory; sanitizes `..` path traversal segments.
- **Gaps:** Allocates a fresh `64 MB`–`1 GB` `WebAssembly.Memory` on every compile with `noExitRuntime: true`; no worker watchdog/timeout; filename sanitization (`[^A-Za-z0-9_.-] -> _`) desyncs Verilator error filenames from `ProjectFile.name`; GPL-3.0 licensing obligations not reflected in root `LICENSE`.

### 2.7 Browser Deployment (`.github/workflows/deploy.yml`, `vite.config.ts`, `package.json`, `index.html`)
- **Strengths:** Relative `base: './'` works cleanly on GitHub Pages subpaths; `deploy` job is gated to `main`/`master` while feature branches run CI build/test; `binaryen` is split into a lazy-loaded chunk.
- **Gaps:** No committed `package-lock.json` (CI generates a fresh lockfile on every run); `chunkSizeWarningLimit: 8000` masks bundle bloat; `build.target: 'esnext'` may exclude older Safari/enterprise browsers; Phase C.1 has never been executed in CI or a browser.

---

## 3. Detailed Findings Register

### Critical Findings

#### CRIT-01: Phase C.1 Branch Is Completely Unverified (Build, Unit Tests, and Browser)
- **Classification:** Critical
- **Affected Files:** All 16 files modified/added in `origin/phase-c1-multifile-simulator` (`63615db`), including `src/App.tsx`, `src/project/*`, `src/sim/simulationEngine.ts`, `src/components/ProjectExplorer.tsx`, `src/components/ClockControls.tsx`, `public/verilator/verilator-worker.js`, `package.json`
- **Issue:** As explicitly noted in `MULTIFILE_SUPPORT_REPORT.md` and `SIMULATION_PERFORMANCE_REPORT.md`, `npm test`, `npm run build` (`tsc -b && vite build`), and browser runtime testing (folder upload, drag-and-drop, ZIP extraction, Verilator multi-file compilation, and high-speed simulation benchmarks) were never executed.
- **Risk:** TypeScript compilation errors, runtime regressions, broken `fflate` bundling, or Verilator worker failures could ship directly to users if merged without green CI and manual browser verification.
- **Recommended Fix:** Run CI (`npm ci`, `npm test`, `npm run build`) on `phase-c1-multifile-simulator`, verify all 4 multi-file examples in a real browser with Verilator WASM, test ZIP/folder/drag-drop across Chromium/Firefox/Safari, and record actual benchmark numbers in `SIMULATION_PERFORMANCE_REPORT.md`.
- **Estimated Complexity:** Low (verification effort; medium if runtime defects are uncovered)

#### CRIT-02: Regex Pre-Compile Gate & File Pruning Break Valid Multi-File Verilog Designs
- **Classification:** Critical
- **Affected Files:** `src/project/projectModel.ts` (`scanSource`, `validateProject`), `src/project/projectCompile.ts` (`selectFilesForTop`, `compileProject`)
- **Issue:**
  1. `compileProject()` blocks Verilator from running whenever `validateProject()` reports any error. Because `scanSource()` uses a naive semicolon-splitting regex, valid SystemVerilog/Verilog constructs (typed declarations, macros, `ifdef`-disabled instantiations, or a testbench file included in an uploaded folder/ZIP) can trigger false-positive `MISSING_MODULE` or `DUPLICATE_MODULE` errors and prevent compilation.
  2. Conversely, valid submodule instantiations inside `generate for (...) begin sub u(...); end` or `if (...)` are missed by `scanSource()` (because `body.split(';')` splits inside `for (i=0; ...)`). `selectFilesForTop()` then **excludes** the submodule's `.v` file from the files sent to Verilator, causing Verilator compilation to fail.
  3. If a single `.v` file defines both `parent` and `child` and the user selects `child` as top, `selectFilesForTop()` still sends the whole file containing `parent`.
- **Risk:** Legitimate multi-file Verilog projects fail to compile with misleading errors, undermining the core value proposition of Phase C.1.
- **Recommended Fix:**
  1. Downgrade regex-inferred `MISSING_MODULE` and `CIRCULAR_REFERENCE` checks in `validateProject()` to **warnings** (advisory hints), leaving Verilator as the authoritative compiler error gate (only block on `NO_SOURCES` or `MISSING_TOP`).
  2. Stop pruning `.v`/`.sv` files via regex reachability in `selectFilesForTop()`, or only exclude files whose *every* module is provably a strict ancestor of `topModule` (and let Verilator's `-y` / library flags or explicit top-file compilation resolve submodules cleanly).
- **Estimated Complexity:** Medium

#### CRIT-03: Stale `FpgaRuntime` Instance Survives Failed Compilation
- **Classification:** Critical
- **Affected Files:** `src/App.tsx` (`compile`, lines ~345–375)
- **Issue:** When `compile()` fails (either pre-compile validation failure or Verilator error), it sets `setBackendMode('none')` and `setRuntimePorts(null)`, but **never disposes or clears `runtimeRef.current`**.
- **Risk:** The previous compiled WASM/JS model remains live in memory. Clicking switches/buttons on the Board tab (`applyInput`) continues executing `rt.setSignal` / `rt.eval()` on the stale, outdated Verilog circuit while the UI claims `backendMode === 'none'`, misleading users into debugging the wrong design and leaking WASM memory.
- **Recommended Fix:** Immediately call `runtimeRef.current?.dispose(); runtimeRef.current = null;` whenever compilation starts failing (both `!result` and `!result.runtime` branches), and clear `signals` / `history` or mark board outputs as inactive.
- **Estimated Complexity:** Low

---

### Major Findings

#### MAJ-01: Unhandled Exceptions & Missing Resource Limits on File / Folder / ZIP Import
- **Classification:** Major
- **Affected Files:** `src/project/projectImport.ts` (`unzipProject`, `entriesFromFiles`, `entriesFromDataTransfer`), `src/App.tsx` (`importFileList`, `handleDrop`)
- **Issue:**
  1. `importFileList` and `handleDrop` do not wrap `entriesFromFiles` / `entriesFromDataTransfer` in `try/catch`. A corrupted, encrypted, or invalid `.zip` throws synchronously inside `fflate.unzipSync()`, producing an unhandled Promise rejection with no UI error banner.
  2. `entriesFromFiles` and `entriesFromDataTransfer` read *all* files into memory (`await file.text()` / `arrayBuffer()`) *before* `filterEntries()` discards unsupported extensions or hidden directories (`.git/`, `node_modules/`).
  3. `unzipSync()` decompresses synchronously on the main thread with no file-count or uncompressed-size limit (ZIP bomb / OOM risk).
- **Risk:** Dropping a project folder containing build artifacts, `.git`, or a malformed/large ZIP can freeze or crash the browser tab or fail silently.
- **Recommended Fix:** Filter file paths/extensions *before* calling `file.text()`/`arrayBuffer()`; enforce sensible limits (e.g., max 200 files, max 10 MB total uncompressed); wrap import handlers in `try/catch` and surface errors in `messages`.
- **Estimated Complexity:** Low–Medium

#### MAJ-02: `SimulationEngine` Stale Closures & Cycle/Pause UI Desynchronization
- **Classification:** Major
- **Affected Files:** `src/App.tsx` (`startRun`, `stepFullCycle`, `stepHalfCycle`, `handleRunBatch`), `src/components/ClockControls.tsx`
- **Issue:**
  1. `startRun()` captures `activeMatrixConfig` and `clkName` inside `sampleRef.current` and `stepRef.current`. Modifying Hardware Config (matrix polarity, bit order, POV, row/col signals, or clock signal) while running or paused has no effect on the active loop until Stop + Restart.
  2. `stepFullCycle()` and `stepHalfCycle()` update `cycleCount` (displayed on the left of `ClockControls`) and `engine.setCycle()`, but do **not** update `engineStats.cycle` (displayed on the right of `ClockControls`), causing `Cycle #5` and `Cycle: 0` to disagree.
  3. While `paused`, `ClockControls` keeps `Step Cycle`, `Step Edge`, and `BATCH_SIZES` buttons enabled (`disabled={running || ...}`), even though `handleRunBatch` silently returns early when paused, and manual stepping while paused inside a batch does not decrement `engine.remaining`.
- **Risk:** Confusing UI telemetry and silently ignored user actions during interactive debugging.
- **Recommended Fix:** Read `hardwareConfigRef.current` inside `sampleRef.current`; stop/rebind the engine if `clkName` changes; remove duplicate `cycleCount` state (use `engineStats.cycle` as single source of truth, updated on single-step); disable batch buttons when `paused` and either disable stepping during a paused batch or decrement `remaining`.
- **Estimated Complexity:** Low–Medium

#### MAJ-03: `ClockComponentConfig.polarity` and `defaultHz` Are Ignored by Runtime
- **Classification:** Major
- **Affected Files:** `src/sim/fpgaRuntime.ts` (`makeCycleStepper`), `src/App.tsx` (`startRun`, `stepFullCycle`, `stepHalfCycle`), `src/types/hardwareConfig.ts`
- **Issue:** Users can configure a `CLOCK` component with `polarity: 'active-low'` and a `defaultHz` value in `HardwareConfigPanel`, but `makeCycleStepper()` and single-stepping always pulse `1 -> 0` (active-high), and `defaultHz` is never synced to `rateHz`.
- **Risk:** Users testing active-low clock designs or expecting `defaultHz` to initialize clock speed get silently wrong hardware behavior.
- **Recommended Fix:** Pass clock polarity into `makeCycleStepper(clockName, polarity)` and single-step helpers (pulse `0 -> 1` when `active-low`, resting at `1`), and initialize `rateHz` from `activeClockConfig.defaultHz` on preset load (or remove `defaultHz` from the config UI if unused).
- **Estimated Complexity:** Low

#### MAJ-04: Non-Deterministic CI Builds — Missing `package-lock.json`
- **Classification:** Major
- **Affected Files:** `.github/workflows/deploy.yml`, `package.json`
- **Issue:** No `package-lock.json` is committed in any branch. `.github/workflows/deploy.yml` works around this by running `npm install --package-lock-only` followed by `npm ci` on every run.
- **Risk:** Floating semver ranges (`^`) in `package.json` (`binaryen`, `fflate`, `vite`, `vitest`, `react`) can resolve to different transitive versions on any future push, causing sudden, unreproducible CI or production breakages.
- **Recommended Fix:** Generate and commit `package-lock.json` (via `npm install` on Node 20), remove the `--package-lock-only` workaround from `deploy.yml`, and enable `cache: 'npm'` in `actions/setup-node@v4`.
- **Estimated Complexity:** Low

#### MAJ-05: Per-Compile 64 MB–1 GB WASM Memory Allocation & Filename Mismatch in Verilator Worker
- **Classification:** Major
- **Affected Files:** `public/verilator/verilator-worker.js`, `src/sim/fpgaRuntime.ts`, `src/components/ProjectExplorer.tsx`
- **Issue:**
  1. Every `compile()` call in `verilator-worker.js` instantiates `self.verilator_bin(...)` with a brand-new `new WebAssembly.Memory({ initial: 1024, maximum: 16384 })` (64 MB initial, 1 GB max) and `noExitRuntime: true`, relying solely on GC to free previous heaps. Rapid auto-compile edits (450 ms debounce) can trigger memory spikes or OOM (especially in Safari/WebKit where 1 GB reservations are strict).
  2. `runVerilator()` in `fpgaRuntime.ts` has no timeout or worker-restart recovery if Verilator stalls on pathological input.
  3. `verilator-worker.js` rewrites filenames via `s.replace(/[^A-Za-z0-9_.-]/g, '_')`, so Verilator error paths won't match `ProjectFile.name` in `ProjectExplorer.tsx` when filenames contain spaces or non-ASCII characters.
- **Risk:** Browser tab crashes during extended editing sessions; stuck compile spinner; broken error highlighting on valid filenames with spaces.
- **Recommended Fix:** Lower `maximum` memory if feasible (e.g., 256–512 MB), explicitly release references after `compile()`, add a compile timeout (e.g., 30 s) that terminates and recreates the worker, and maintain a `safePath -> originalName` map in `verilator-worker.js` to remap `errors[i].file` back to original names.
- **Estimated Complexity:** Medium

#### MAJ-06: MIT vs. GPL-3.0 Licensing Ambiguity in Distributed Web Bundle
- **Classification:** Major
- **Affected Files:** `LICENSE`, `src/vendor/8bitworkshop/LICENSE`, `src/sim/fpgaRuntime.ts`, `public/verilator/*`, `README.md`
- **Issue:** Root `LICENSE` is MIT, while `src/sim/fpgaRuntime.ts` directly imports GPL-3.0 code from `src/vendor/8bitworkshop/hdl/*` and bundles/serves `public/verilator/verilator_bin.wasm` (also GPL-3.0 from 8bitworkshop/Verilator).
- **Risk:** Distributing a combined browser bundle under MIT without clear GPL-3.0 notices and source-availability compliance creates legal/licensing exposure for public releases.
- **Recommended Fix:** Clarify combined-work licensing in `LICENSE` and `README.md` (either license the combined distribution under GPL-3.0 while noting MIT-licensed original modules, or add a `THIRD_PARTY_LICENSES.md` and explicit attribution/source-offer notice).
- **Estimated Complexity:** Low (documentation/legal review)

---

### Minor Findings

#### MIN-01: Multi-File Examples Trigger Immediate Validation Errors & Break "Restore Defaults"
- **Classification:** Minor
- **Affected Files:** `src/presets/exampleProjects.ts`, `src/App.tsx`
- **Issue:** All 4 `EXAMPLE_PROJECTS` reuse `createFullDemoHardwareConfig()`, causing 4–6 `MISSING_SIGNAL` errors immediately when loading Example 1 (`top_sw_led`) or Example 2 (`top_counter`). Additionally, loading an example or uploaded project does not update `selectedPresetId`, so clicking "Restore Defaults" restores the previously selected single-file preset's config instead.
- **Risk:** Poor first-run experience on built-in multi-file examples; unexpected config resets.
- **Recommended Fix:** Provide tailored `createHardwareConfig` factories for each `ExampleProject` matching its actual ports, and track the active source (`preset` | `example` | `custom`) for "Restore Defaults".
- **Estimated Complexity:** Low

#### MIN-02: Bilingual (`zh-TW`) Regression Across Phase C.1 UI
- **Classification:** Minor
- **Affected Files:** `src/components/ProjectExplorer.tsx`, `src/components/ClockControls.tsx`, `src/App.tsx`, `src/i18n/translations.ts`
- **Issue:** All new Phase C.1 UI labels (`Add files`, `Add folder`, `Add ZIP`, `Multi-file examples...`, `Stop`, `Resume`, `Unlimited (max speed)`, `Cycle / Speed / Elapsed`, drag-drop overlay, delete confirmation) are hardcoded in English instead of using `TRANSLATIONS[lang]`.
- **Risk:** Mixed-language UI when switched to Traditional Chinese (`zh-TW`).
- **Recommended Fix:** Add translation keys for all Phase C.1 strings in `src/i18n/translations.ts` and pass `t` into `ProjectExplorer` and `TopModuleSelector`.
- **Estimated Complexity:** Low

#### MIN-03: Matrix POV Decay Is Sample-Rate Dependent & Multiple `MATRIX`/`CLOCK` Components Silently Ignored
- **Classification:** Minor
- **Affected Files:** `src/config/matrixMapping.ts` (`sampleLiveMatrixIntoBuffer`), `src/App.tsx` (`activeMatrixConfig`, `activeClockConfig`)
- **Issue:**
  1. `sampleLiveMatrixIntoBuffer` decays inactive rows by `*= 0.96` on every *sample call*, regardless of elapsed simulation cycles or wall-clock time. At 10 Hz vs. 100 kHz (stride 61), POV decay behaves completely differently.
  2. `HardwareConfigPanel` allows adding multiple `MATRIX` and `CLOCK` components, but `App.tsx` uses `.find(...)` to render/drive only the first enabled instance.
- **Risk:** Inconsistent matrix persistence across clock speeds; user confusion when adding a second matrix or clock has no effect.
- **Recommended Fix:** Tie POV decay to frame-level time decay (`dt`) or explicit persistence factor; render all enabled `MATRIX` components (or warn/cap at 1 enabled `MATRIX` and 1 enabled `CLOCK` in `HardwareConfigPanel` until multi-clock/multi-matrix is implemented).
- **Estimated Complexity:** Low–Medium

#### MIN-04: Incomplete Persistence Validation, Duplicate Input Bindings, and Unused `SevenSegment.bitOrder`
- **Classification:** Minor
- **Affected Files:** `src/config/configPersistence.ts`, `src/config/hardwareMapping.ts`, `src/components/SevenSegmentDisplay.tsx`, `src/types/hardwareConfig.ts`
- **Issue:**
  1. `isValidComponent()` in `configPersistence.ts` does not validate `segmentMap`, `initialPressed`, `behavior`, or `row.width`/`col.width`, allowing partially corrupted `localStorage` data to crash UI rendering.
  2. `validateHardwareConfig()` does not warn when two enabled input components (`SWITCH`/`KEY`) bind to the same Verilog signal (second silently overwrites first in `computeInitialInputSignals`).
  3. `SevenSegmentComponentConfig.bitOrder` is never read in `SevenSegmentDisplay.tsx`.
- **Risk:** Potential runtime crash on malformed stored JSON; confusing conflicting input controls; dead config field.
- **Recommended Fix:** Tighten `isValidComponent()` per component type, add a `DUPLICATE_INPUT_BINDING` warning in `validateHardwareConfig()`, and remove or apply `bitOrder` on `SEVEN_SEGMENT`.
- **Estimated Complexity:** Low

#### MIN-05: Hardcoded `rom_init.hex` Fixture, `@addr` Stripping, `inout` Misclassification, and Silent >64-Bit Drop
- **Classification:** Minor
- **Affected Files:** `src/sim/fpgaRuntime.ts`
- **Issue:**
  1. `memFiles.set('rom_init.hex', 'A5\n5A\nF0\n0F')` is hardcoded in production `FpgaRuntime.compile()`.
  2. `normalizeMemContent` drops `@address` tokens (`!t.startsWith('@')`), corrupting address-offset `$readmemh`/`$readmemb` files.
  3. `inout` ports (`vd.isInput && vd.isOutput`) are labeled `'input'`.
  4. Ports wider than 64 bits are silently skipped (`if (width > 64) continue;`) with no compiler warning.
- **Risk:** Unexpected ROM contents if a user omits `rom_init.hex`; wrong memory initialization for `@addr` hex files; silent missing ports for >64-bit designs.
- **Recommended Fix:** Remove the hardcoded `rom_init.hex` fallback (include it only in presets/tests), preserve or properly parse `@addr` directives, classify `vd.isInput && vd.isOutput` as `'inout'`, and push a warning to `messages` when a port > 64 bits is skipped.
- **Estimated Complexity:** Low

#### MIN-06: `parseVerilogSource` Ignores `selectedTop` & Momentary `KEY` Lacks Touch/Keyboard Accessibility
- **Classification:** Minor
- **Affected Files:** `src/parsers/verilogParser.ts`, `src/App.tsx`, `src/components/BoardView.tsx`
- **Issue:**
  1. `App.tsx` calls `parseVerilogSource(verilogOnlyContents)` without passing `topModule`, so pre-compile port guessing picks its own heuristic top module instead of the user's `selectedTop`.
  2. Momentary `KEY` buttons in `BoardView.tsx` only bind `onMouseDown`/`onMouseUp`/`onMouseLeave`, so touchscreens and keyboard (`Space`/`Enter`) cannot operate them reliably.
- **Risk:** Wrong pre-compile port list when switching top modules; broken usability on tablets/touch laptops and for keyboard users.
- **Recommended Fix:** Pass `topModule` as an optional parameter to `parseVerilogSource`; switch `KEY` buttons to Pointer Events (`onPointerDown`/`onPointerUp`/`onPointerCancel`) plus `onKeyDown`/`onKeyUp`.
- **Estimated Complexity:** Low

#### MIN-07: `SimulationEngine` Idle Timer Churn at Low Hz & Unclosed `MessageChannel`
- **Classification:** Minor
- **Affected Files:** `src/sim/simulationEngine.ts`
- **Issue:** In `rate` mode, `this.scheduleTick(4)` fires every 4 ms (~250 timers/sec) even at 1 Hz where 99.6% of ticks execute 0 cycles. Additionally, `defaultScheduler()` creates a `MessageChannel` whose ports are never closed when an engine instance is discarded.
- **Risk:** Unnecessary background CPU/battery wakeups at low clock speeds; minor resource leak if engines are recreated.
- **Recommended Fix:** Compute adaptive delay in `rate` mode (e.g., `Math.min(25, Math.max(4, Math.floor(500 / mode.hz)))`) and add `dispose()` to close `MessageChannel` ports.
- **Estimated Complexity:** Low

---

### Nice-to-Have Findings

#### NTH-01: Offload Simulation Execution to a Web Worker
- **Classification:** Nice-to-have
- **Affected Files:** `src/sim/simulationEngine.ts`, `src/sim/fpgaRuntime.ts`, `src/App.tsx`
- **Issue:** `SimulationEngine` runs on the main UI thread. For large designs or JS-fallback models where `checkEvery = 256` cycles take > 12 ms, UI responsiveness degrades.
- **Risk:** Frame drops / sluggish controls on complex user designs.
- **Recommended Fix:** Host the instantiated `HDLModuleWASM` + `SimulationEngine` in a dedicated simulation Web Worker and post throttled state snapshots (~30 FPS) to the main thread.
- **Estimated Complexity:** High

#### NTH-02: Refactor `App.tsx` Monolith & Enable Strict `noUnusedLocals`
- **Classification:** Nice-to-have
- **Affected Files:** `src/App.tsx`, `tsconfig.json`
- **Issue:** `App.tsx` (~880 lines) mixes project management, compile orchestration, simulation engine lifecycle, matrix sampling, hardware config, and UI layout. `tsconfig.json` sets `"noUnusedLocals": false`, allowing dead imports (e.g., `FolderUp` in `App.tsx`).
- **Risk:** Rising maintenance cost and higher regression risk in future phases.
- **Recommended Fix:** Extract `useVerilogProject`, `useSimulationController`, and `useHardwareBoard` hooks; enable `noUnusedLocals: true` in `tsconfig.json`.
- **Estimated Complexity:** Medium

#### NTH-03: Repository Root Documentation Cleanup & `LIMITATIONS.md` Sync
- **Classification:** Nice-to-have
- **Affected Files:** `LIMITATIONS.md`, 16+ root `*_REPORT.md` files (`AI_Handover_Report_2026-11-18.md`, `BUG_REPORT.md`, `BUILD_REPORT.md`, `WORK_LOG.md`, etc.)
- **Issue:** `LIMITATIONS.md` still states that `verilator-worker.js` flattens subdirectory `` `include `` paths (resolved in Phase C.1). Sixteen historical session/handover reports clutter the repo root, several contradicting current architecture (e.g., referencing removed QSF files or unbuilt states).
- **Risk:** Contributor and user confusion over what is current vs. historical.
- **Recommended Fix:** Archive historical reports under `docs/archive/` and update `LIMITATIONS.md` and `README.md` to reflect Phase B/C.1 accurately.
- **Estimated Complexity:** Low

#### NTH-04: Upgrade Signal Monitor Beyond 64-Sample SVG Cells
- **Classification:** Nice-to-have
- **Affected Files:** `src/components/SignalMonitor.tsx`, `src/App.tsx`
- **Issue:** History is capped at 64 samples (`HISTORY_LEN = 64`) rendered via inline SVG/chips, which is insufficient for inspecting multi-thousand-cycle runs enabled by Phase C.1.
- **Risk:** Limited debugging visibility during high-speed batch runs.
- **Recommended Fix:** Introduce a zoomable Canvas waveform viewer with trigger/window capture and `.vcd` export.
- **Estimated Complexity:** High

---

## 4. Prioritized Pre-Release Action Plan

To move from **C. Needs fixes before release** to **B. Ready for beta release** (and safe merge of `phase-c1-multifile-simulator`):

1. **Blockers (Must Fix Before Merge / Release):**
   - **CRIT-01:** Run full CI (`npm test`, `npm run build`) and browser E2E verification on `phase-c1-multifile-simulator`; fill actual benchmark measurements.
   - **CRIT-02:** Downgrade regex `MISSING_MODULE`/`CIRCULAR_REFERENCE` checks to warnings and fix `selectFilesForTop()` so valid `generate`/`ifdef`/multi-module files are never dropped or falsely blocked.
   - **CRIT-03:** Dispose and null `runtimeRef.current` on compile failure in `src/App.tsx`.
   - **MAJ-01:** Add `try/catch`, pre-read extension filtering, and size/count limits to file/folder/ZIP import.
   - **MAJ-02:** Fix `SimulationEngine` stale closures (`sampleRef`/`stepRef`), unify `cycleCount` with `engineStats.cycle`, and fix pause/batch button state.
   - **MAJ-04:** Commit `package-lock.json` and remove the on-the-fly lockfile generation in `.github/workflows/deploy.yml`.
   - **MAJ-06:** Clarify GPL-3.0 vendored runtime licensing in `LICENSE` and `README.md`.
2. **High-Value Stabilization (Recommended for Beta):**
   - **MAJ-03:** Honor `ClockComponentConfig.polarity` and `defaultHz`.
   - **MAJ-05:** Add Verilator compile timeout and remap sanitized filenames in worker error messages.
   - **MIN-01 / MIN-02:** Give multi-file examples matching hardware configs and restore full `zh-TW` translations.
