# Phase B Branch Publication & CI Verification Report (`BRANCH_PUBLISH_REPORT.md`)

**Date:** 2026-11-19  
**Repository:** `https://github.com/tim941008/fpga-web-simulator`  
**Branch URL:** `https://github.com/tim941008/fpga-web-simulator/tree/phase-b-stabilization`  
**GitHub Actions Run URL:** `https://github.com/tim941008/fpga-web-simulator/actions/runs/44486676054`

---

## 1. Branch & Commit Metadata

| Field | Value |
|---|---|
| **Branch Name** | `phase-b-stabilization` |
| **Commit SHA** | `4c0ece0a580e47e162fa194b50a3e6eead9cb598` (`4c0ece0`) |
| **Parent (`origin/main`) SHA** | `cacfbc57907192ae7ff5f8a07873ea08e86aacdf` (`cacfbc5`) |
| **Tree SHA** | `e1598a90a6e0dc6501a467669fbacb225052d9ec` |
| **Merged into `main`?** | **No** (`origin/main` remains at `cacfbc5` per user instruction) |

---

## 2. Remote Synchronization & Conflict Resolution

1. **Fetched Latest Remote State:**
   - Remote `origin/main` was at `cacfbc57907192ae7ff5f8a07873ea08e86aacdf` (2 commits ahead of the original local base `3ae2b4eb`: `f4fa3d5` and `cacfbc5`).
2. **Comparison & Conflict Resolution:**
   - Synced updated documentation files (`BUG_REPORT.md`, `COMPATIBILITY_MATRIX.md`, `CONTRIBUTING.md`, `TEST_MATRIX.md`, `TEST_REPORT.md`, `WORK_LOG.md`) and removed obsolete `AUDIT_REPORT.md` from remote `main`.
   - Incorporated the live `runtimePorts` clearing behavior from `cacfbc5` into `src/App.tsx` (clearing stale `runtimePorts` on Verilog `<textarea>` edits and compile failures) and updated `index.html` to remove the old `Quartus QSF` title suffix.
   - Replaced the intermediate `ioConfig.ts` / `IoConfigPanel.tsx` prototype from `f4fa3d5` with the full Phase B component-based configuration architecture (`src/types/hardwareConfig.ts`, `src/config/*`, `src/components/HardwareConfigPanel.tsx`).

---

## 3. Changed Files vs. `origin/main` (`cacfbc5`)

**Summary:** `8 added`, `17 modified`, `12 deleted` (37 files changed)

### Added Files (8)
- `src/types/hardwareConfig.ts`
- `src/config/hardwareMapping.ts`
- `src/config/matrixMapping.ts`
- `src/config/defaultHardwareConfig.ts`
- `src/config/configPersistence.ts`
- `src/config/__tests__/hardwareConfig.test.ts`
- `src/components/HardwareConfigPanel.tsx`
- `vitest.config.ts`

### Modified Files (17)
- `.github/workflows/deploy.yml`
- `index.html`
- `package.json`
- `README.md`
- `LIMITATIONS.md`
- `PROJECT_CONTEXT.md`
- `NEXT_TASKS.md`
- `src/App.tsx`
- `src/components/BoardView.tsx`
- `src/components/MatrixViewer.tsx`
- `src/components/SevenSegmentDisplay.tsx`
- `src/components/SignalMonitor.tsx`
- `src/i18n/translations.ts`
- `src/presets/sampleDesigns.ts`
- `src/sim/fpgaRuntime.ts`
- `src/types/fpga.ts`
- `tests/deployment/run_verification.py`

### Deleted Files (12)
- `src/components/IoConfigPanel.tsx`
- `src/config/ioConfig.ts`
- `tests/io_config/custom_ports.expected.json`
- `tests/io_config/custom_ports.v`
- `tests/io_config/direction_width_validation.expected.json`
- `tests/io_config/direction_width_validation.v`
- `tests/io_config/duplicate_conflicts.expected.json`
- `tests/io_config/duplicate_conflicts.v`
- `tests/io_config/ioConfig.test.ts`
- `tests/io_config/persistence_updates.expected.json`
- `tests/io_config/persistence_updates.v`
- `tests/io_config/run_ts_tests.mjs`

*(Note: `src/parsers/qsfParser.ts` and `tests/qsf/*` are also absent on `phase-b-stabilization`.)*

---

## 4. CI, Test, Build & Deployment Status

| Check | Status | Details |
|---|---|---|
| **CI Workflow Status** | ✅ **SUCCESS** | Workflow Run `#8` (ID `44486676054`, Job ID `135431770107`) on `ubuntu-latest` (Node.js 20) completed with `conclusion: success`. |
| **Dependency Install (`npm ci`)** | ✅ **SUCCESS** | Generated lockfile and executed `npm ci`: `added 167 packages, and audited 168 packages in 2s`. |
| **Unit Test Status (`npm test`)** | ✅ **SUCCESS (16/16 Passed)** | Executed `vitest run` (`v2.1.9`): `src/config/__tests__/hardwareConfig.test.ts` — **16 passed (16)** in `359 ms`. |
| **Build Status (`npm run build`)** | ✅ **SUCCESS** | Executed `tsc -b && vite build` (`vite v5.4.21`): zero TypeScript errors, `1602 modules transformed`, built in `19.14 s`. |
| **Build Artifacts** | ✅ **UPLOADED** | Artifact `dist-build-artifact` (ID `14511340616`, `2,497,893` bytes compressed, `SHA256: 73de46e18b28917ba59f761782bc1c2ab77779c832699aa22425083ba7c0c729`). |
| **Deployment Status** | ⏸️ **GATED (Skipped on Branch)** | `deploy` job (ID `135432108573`) is gated to `main`/`master` (`if: github.ref == 'refs/heads/main'`) so `phase-b-stabilization` does not overwrite production GitHub Pages prior to merge approval. |

---

## 5. Collected CI Logs & Build Artifact Inventory

### 5.1 Verbatim `npm test` (Vitest) Output from CI Job `135431770107`
```text
> web-fpga-simulator@2.0.0 test
> vitest run

 RUN  v2.1.9 /home/runner/work/fpga-web-simulator/fpga-web-simulator

 ✓ src/config/__tests__/hardwareConfig.test.ts (16 tests) 9ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  08:20:08
   Duration  359ms (transform 75ms, setup 0ms, collect 89ms, tests 9ms, environment 0ms, prepare 110ms)
```

### 5.2 Verbatim `npm run build` (`tsc -b && vite build`) Output from CI Job `135431770107`
```text
> web-fpga-simulator@2.0.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
transforming...
✓ 1602 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.57 kB │ gzip:     0.38 kB
dist/assets/index-DtIPW5bI.css     29.03 kB │ gzip:     5.52 kB
dist/assets/index-CoxjHVsk.js   7,410.41 kB │ gzip: 1,148.62 kB
✓ built in 19.14s
```

### 5.3 Uploaded Build Artifact Contents (`dist-build-artifact`, ID `14511340616`)
| File in `dist-build-artifact.zip` | Uncompressed Size |
|---|---|
| `index.html` | `567` bytes |
| `assets/index-DtIPW5bI.css` | `29,029` bytes |
| `assets/index-CoxjHVsk.js` | `7,411,763` bytes |
| `verilator/verilator-worker.js` | `4,270` bytes |
| `verilator/verilator_bin.js` | `269,659` bytes |
| `verilator/verilator_bin.wasm` | `6,149,070` bytes |
