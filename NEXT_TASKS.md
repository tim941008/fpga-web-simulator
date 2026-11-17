# Pending Tasks & Roadmap (`NEXT_TASKS.md`)

## Current Status (2026-11-18)
- **Completed & Verified:**
  - All P0 bugs (`BUG-001`, `BUG-002`, `BUG-003`) and P1/P2 bugs (`BUG-004` through `BUG-010`) have been fixed and verified.
  - Modernized engineering UI styling applied across all components.
  - Full English (`en`) / Traditional Chinese (`zh-TW`) language switching with `localStorage` persistence implemented and verified.

---

## Remaining Enhancement Backlog (Future Features)

### P2 — Future Feature Enhancements (Out of Scope for Current Bug-Fix Cycle)
1. **Wide Vector (>64-Bit) Support in `FpgaRuntime` (`LIM-002`, `LIM-003`)**
   - Extend `FpgaRuntime` and `HDLModuleJS` fallback to expose packed ports wider than 64 bits via multi-word `Uint32Array` reads/writes.
2. **Memory Array Inspector Tab (`LIM-004`)**
   - Add a dedicated RAM/ROM table viewer for 1D/2D unpacked arrays (`isArrayType(vd.dtype)`).
3. **Active-Low Push Button (`KEY`) Hardware Polarity Toggle**
   - Add an optional `KEY Polarity: Active-LOW (1=Idle, 0=Pressed)` toggle in `BoardView.tsx` for active-low reset designs.
4. **Canvas Logic Analyzer & `.vcd` Export**
   - Upgrade `SignalMonitor.tsx` with pan/zoom timeline cursors and Value Change Dump (`.vcd`) download.
