# Web FPGA Simulator

A browser-based FPGA hardware simulator built with **React**, **TypeScript**, **Vite**, and **TailwindCSS**, powered by a **Verilator WebAssembly** backend and a **fully customizable Hardware Component Configuration system**. Upload Verilog (`.v`, `.sv`) and memory initialization files (`.hex`, `.mem`) and map any Verilog port to interactive FPGA peripherals directly in your browser.

## Features

- **Verilog HDL simulation** — In-browser compilation and cycle-accurate evaluation of combinational and sequential RTL via Verilator WebAssembly (`verilator_bin.wasm`)
- **Customizable Hardware Configuration** — Add, remove, rename, and map `CLOCK`, `SWITCH`, `KEY`, `LED`, `SEVEN_SEGMENT`, and `MATRIX` components to any Verilog signal with live port validation and `localStorage` persistence
- **Independent Switch & Key Controls** — Configurable bit widths, MSB→LSB / LSB→MSB bit ordering, Active-HIGH / Active-LOW polarity, initial states, momentary or toggle key behavior, and custom bit labels
- **Configurable LEDs & 7-Segment Displays** — Custom colors, polarity, arbitrary `a`–`g` & `dp` segment bit mapping, and multiple independent display instances
- **16×16 LED Dot-Matrix Viewer** — Independent Row (`15→0` / `0→15`) and Column (`15→0` / `0→15`) bit ordering and polarity, POV scan retention, plus an editable UI Preview Pattern mode (never overwrites live Verilog signals)
- **Waveform Viewer** — Real-time signal monitor and digital trace viewer with Hex, Binary, and Decimal radix modes
- **Bilingual UI** — Built-in English (`en`) and Traditional Chinese (`zh-TW`) localization

## Quick Start

```bash
npm install
npm run dev
```

Run unit tests with Vitest:

```bash
npm test
```

For production build and GitHub Pages deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Limitations

See [LIMITATIONS.md](LIMITATIONS.md) for a detailed breakdown of current simulation, Verilator WASM, 16×16 Matrix Viewer, and build limitations.

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.  
*(Note: Vendored Verilator WASM binaries and HDL runtime files in `src/vendor/8bitworkshop/` and `public/verilator/` are licensed under GPL-3.0; see `src/vendor/8bitworkshop/LICENSE`.)*
