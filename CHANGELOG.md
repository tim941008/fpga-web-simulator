# Changelog

All notable releases of **Web FPGA Simulator** are documented here. Detailed release reports live in `docs/releases/`.

---

## `v2.2.0` *(Candidate — PR #1 `feature/c2-wave-theme`)* — 2026-11-19
- **Wave Viewer Expansion:** Configurable `Visible Signals` (`24`, `48`, `96`, `All`, persisted), `Showing X of Y signals` indicator, independent vertical/horizontal scroll container, sticky signal labels, alternating rows, and high-contrast `0`/`1`/transition waveforms.
- **Warm FPGA Lab Theme:** Amber/Orange/Slate workbench theme with persisted `FPGA Lab` / `Classic` switcher; all simulated hardware colors (LEDs, 7-Segment, 16×16 Matrix) preserved untouched.
- **Verification:** CI Run #18 (`44529025924`) passed (`40s`); 5/5 browser validation checks passed (`0` console/network errors).
- Details: [docs/releases/v2.2.0-phase-c2.md](docs/releases/v2.2.0-phase-c2.md)

## `v2.1.0` *(Phase C.1 — Released on `main` `76b16a6`)* — 2026-11-19
- **Multi-File Projects:** Multi-file, folder, ZIP, and drag-and-drop import, Project Explorer, Top Module selector, multi-directory `-I` includes in Verilator worker, and 4 multi-file example projects.
- **High-Speed `SimulationEngine`:** React-decoupled time-sliced cycle stepping (`1 Hz`–`100 kHz`, `Unlimited`, `10`–`100k` batch runs) with live telemetry.
- **Stabilization:** Fixed stale `FpgaRuntime` leak on compile failure (`CRIT-03`), downgraded regex validation to advisory warnings with strict-ancestor file filtering (`CRIT-02`), hardened ZIP/folder import (`MAJ-01`), and committed `package-lock.json` (`MAJ-04`).
- **Verification:** CI Runs #16/#17 passed; live GitHub Pages deployment verified (`80,000 cycles/sec` on 1k counter batch, `0` errors).
- Details: [docs/releases/v2.1.0-phase-c1.md](docs/releases/v2.1.0-phase-c1.md)

## `v2.0.0` *(Phase B — `0480711`)* — 2026-11-19
- Removed Quartus QSF support and introduced versioned customizable `HardwareConfig` (`CLOCK`, `SWITCH`, `KEY`, `LED`, `SEVEN_SEGMENT`, `MATRIX`) with `localStorage` persistence.
- Added independent 16×16 Matrix Row/Column bit ordering (`15→0` / `0→15`), polarity, and UI Preview Pattern mode.
- Split and lazy-loaded `binaryen` WASM codegen chunk in Vite.
- Historical review: [docs/history/PHASE_B_MERGE_REVIEW.md](docs/history/PHASE_B_MERGE_REVIEW.md)
