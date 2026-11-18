# Pending Tasks & Roadmap (`NEXT_TASKS.md`)

## Current Status (2026-11-18)
- **Completed & Verified:**
  - Completely removed Quartus `.qsf` support and replaced it with the **GUI-Based I/O Pin Configuration** system (`src/config/ioConfig.ts`, `src/components/IoConfigPanel.tsx`).
  - Added full validation (`Configured`, `Unassigned`, `Conflict`, `Invalid Assignment`), direction/width checks, custom port name mapping (including distinct Red `LEDR` & Green `LEDG` banks), and `localStorage` persistence with automatic edit reconciliation.
  - All prior P0/P1/P2 bugs (`BUG-001` through `BUG-010`) resolved; modernized UI and EN/`zh-TW` localization verified.
  - Automated TypeScript (`npm test`) and Python (`tests/deployment/run_verification.py`) I/O configuration test suites added.

---

## Remaining Enhancement Backlog (Future Features)

### P2 — Future Feature Enhancements
1. **Wide Vector (>64-Bit) Support in `FpgaRuntime` (`LIM-002`, `LIM-003`)**
   - Extend `FpgaRuntime` and `HDLModuleJS` fallback to expose packed ports wider than 64 bits via multi-word `Uint32Array` reads/writes.
2. **Memory Array Inspector Tab (`LIM-004`)**
   - Add a dedicated RAM/ROM table viewer for 1D/2D unpacked arrays (`isArrayType(vd.dtype)`).
3. **Active-Low Push Button (`KEY`) Hardware Polarity Toggle**
   - Add an optional `KEY Polarity: Active-LOW (1=Idle, 0=Pressed)` toggle in `BoardView.tsx` for active-low reset designs.
4. **Canvas Logic Analyzer & `.vcd` Export**
   - Upgrade `SignalMonitor.tsx` with pan/zoom timeline cursors and Value Change Dump (`.vcd`) download.
5. **Multiple Clock Domain Support & Bit-Slice I/O Mapping**
   - Allow independent stepping of multiple assigned clock inputs and optional sub-bit slice binding (e.g., assigning a 1-bit reset port and 1-bit enable port to `KEY[0]` and `KEY[1]` individually).
