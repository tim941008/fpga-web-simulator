# Pending Tasks & Roadmap (`NEXT_TASKS.md`)

## Current Status (2026-11-19)
- **Completed:**
  - **Phase B Architecture Redesign:** Completely removed Quartus QSF functionality (`src/parsers/qsfParser.ts`, `tests/qsf/`, QSF UI/types/state/docs) and introduced a fully customizable Hardware Component Configuration system (`CLOCK`, `SWITCH`, `KEY`, `LED`, `SEVEN_SEGMENT`, `MATRIX`).
  - Independent 16×16 Matrix Row (`15→0` / `0→15`) and Column (`15→0` / `0→15`) bit ordering & polarity, plus editable UI Preview Default Pattern (never overwrites Verilog simulation signals).
  - Versioned `localStorage` configuration persistence (`web_fpga_sim_hardware_config_v1`) with validation, corrupted/outdated schema recovery, and reset-to-default.
  - Added Vitest unit test suite (`src/config/__tests__/hardwareConfig.test.ts`) and wired `npm test` into GitHub Actions (`.github/workflows/deploy.yml`).
  - *(Note: Local host lacks Node.js/npm/git, so `npm test` and `npm run build` await execution in Node.js / GitHub Actions once authorized to push.)*

---

## Remaining Enhancement Backlog (Future Features)

1. **Wide Vector (>64-Bit) Support in `FpgaRuntime` (`LIM-002`, `LIM-003`)**
   - Extend `FpgaRuntime` and `HDLModuleJS` fallback to expose packed ports wider than 64 bits via multi-word `Uint32Array` reads/writes.
2. **Memory Array Inspector Tab (`LIM-004`)**
   - Add a dedicated RAM/ROM table viewer for 1D/2D unpacked arrays (`isArrayType(vd.dtype)`).
3. **Multiple Active Matrix Displays & High-Frequency `runCycles` Optimization**
   - Render multiple enabled `MATRIX` instances simultaneously on the Board tab and avoid allocating full signal snapshots on intermediate cycles during high-Hz continuous runs.
4. **Canvas Logic Analyzer & `.vcd` Export**
   - Upgrade `SignalMonitor.tsx` with pan/zoom timeline cursors and Value Change Dump (`.vcd`) download.
