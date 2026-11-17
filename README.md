# Web FPGA Simulator

A browser-based FPGA hardware simulator built with **React**, **TypeScript**, **Vite**, and **TailwindCSS**, powered by a **Verilator WebAssembly** backend and **Intel/Altera Quartus `.qsf`** pin mapping. Upload Verilog (`.v`) and Quartus Settings (`.qsf`) files to auto-generate interactive FPGA board controls and simulate combinational and sequential logic directly in your browser.

## Features

- **Verilog HDL simulation** — In-browser compilation and cycle-accurate evaluation of combinational and sequential RTL
- **Quartus QSF parser** — Parses `set_location_assignment`, `IO_STANDARD`, `FAMILY`, `DEVICE`, and `TOP_LEVEL_ENTITY`
- **Interactive FPGA board** — Auto-generated board layout mapped to your `.qsf` pin assignments
- **Button and switch simulation** — Interactive `KEY` push buttons (momentary or toggle latch) and `SW` slide switches
- **LED visualization** — Discrete `LEDR`/`LEDG` status LEDs with pin labels
- **7-segment display visualization** — Multi-digit `HEX` SVG displays supporting Active-LOW and Active-HIGH polarity
- **16x16 LED matrix viewer** — Dot-matrix display with Persistence-of-Vision (POV) scan retention and configurable column polarity
- **Waveform viewer** — Real-time signal monitor and digital trace viewer with Hex, Binary, and Decimal radix modes
- **Verilator WASM backend** — Runs Verilator (`verilator_bin.wasm`) inside a Web Worker with WebAssembly / JS execution

## Screenshots

Screenshots coming soon.

## Quick Start

```bash
npm install
npm run dev
```

For production build and GitHub Pages deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.  
*(Note: Vendored Verilator WASM binaries and HDL runtime files in `src/vendor/8bitworkshop/` and `public/verilator/` are licensed under GPL-3.0; see `src/vendor/8bitworkshop/LICENSE`.)*
