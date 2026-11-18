# Web FPGA Simulator

A browser-based FPGA hardware simulator built with **React**, **TypeScript**, **Vite**, and **TailwindCSS**, powered by a **Verilator WebAssembly** backend and a **GUI-based I/O Pin Configuration** system. Write or upload arbitrary Verilog (`.v` / `.sv`) designs, automatically detect top-module ports, map them visually to FPGA board peripherals, and simulate combinational and sequential logic directly in your browser—no Quartus or `.qsf` files required.

## Features

- **Verilog HDL simulation** — In-browser compilation and cycle-accurate evaluation of combinational and sequential RTL via Verilator WebAssembly (`verilator_bin.wasm`)
- **Automatic port detection & GUI I/O Pin Configuration** — Automatically detects top-module port names, directions (`input`/`output`), and bit widths, with dropdown assignment to board components, real-time validation (`Configured`, `Unassigned`, `Conflict`, `Invalid Assignment`), width mismatch warnings, and automatic persistence across edits
- **Custom port name support** — Map arbitrary Verilog port names (e.g., `sys_pulse`, `ctrl_btns`, `dip_inputs`, `red_bar`, `green_bar`, `digit_seg`) to any compatible board component
- **Interactive FPGA board** — Virtual FPGA board featuring `KEY` push buttons (momentary or toggle latch), `SW` slide switches, discrete `LEDR` (red) and `LEDG` (green) LEDs, and multi-digit `HEX0`–`HEX5` 7-segment SVG displays (Active-LOW / Active-HIGH)
- **16×16 LED matrix viewer** — Dot-matrix display with Persistence-of-Vision (POV) scan retention and configurable column polarity
- **Signal monitor & waveform viewer** — Real-time signal monitor and digital trace viewer with Hex, Binary, and Decimal radix modes and live component mapping status
- **Bilingual UI** — Built-in English (`EN`) and Traditional Chinese (`繁體中文`) localization with `localStorage` persistence

## Quick Start

```bash
npm install
npm test
npm run dev
```

For production build and GitHub Pages deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Limitations

See [LIMITATIONS.md](LIMITATIONS.md) for a detailed breakdown of current simulation, Verilator WASM, 16×16 Matrix Viewer, I/O Configuration, and build limitations.

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.  
*(Note: Vendored Verilator WASM binaries and HDL runtime files in `src/vendor/8bitworkshop/` and `public/verilator/` are licensed under GPL-3.0; see `src/vendor/8bitworkshop/LICENSE`.)*
