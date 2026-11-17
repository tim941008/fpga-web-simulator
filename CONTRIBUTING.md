# Contributing to Web FPGA Simulator

Thank you for your interest in contributing to **Web FPGA Simulator**!

## Development Setup

1. Ensure you have **Node.js 20+** and **npm** installed.
2. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/web-fpga-simulator.git
   cd web-fpga-simulator
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the local development server:
   ```bash
   npm run dev
   ```

## Submitting Changes

- Create a feature or fix branch from `main` (`git checkout -b feat/your-feature`).
- Keep TypeScript strict-mode clean (`npm run build` must pass without errors).
- Test your changes with both built-in presets (DE10-Lite Counter + Matrix and Combinational ALU) and verify `.v` / `.qsf` uploads work as expected.
- Open a Pull Request with a clear summary of the change and screenshots if UI behavior is affected.

## Third-Party Notice

Vendored Verilator WebAssembly assets and HDL runtime modules under `src/vendor/8bitworkshop/` and `public/verilator/` are sourced from [8bitworkshop](https://github.com/sehugg/8bitworkshop) and remain subject to their upstream GPL-3.0 license (`src/vendor/8bitworkshop/LICENSE`).
