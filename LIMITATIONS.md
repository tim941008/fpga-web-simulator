# Known Limitations & Roadmap

This document catalogs the current architectural, simulation, hardware visualization, and build limitations of **Web FPGA Simulator**, classified into:

- **Known Limitation** — Functional constraints in the current runtime or parser implementation.
- **Build Limitation** — Constraints related to compilation, bundling, licensing, or static deployment.
- **Planned Improvement** — Targeted enhancements on the development roadmap.

---

## 1. Verilator WASM & HDL Simulation Backend

| Item | Classification | Description |
|---|---|---|
| **64-Bit Maximum Packed Signal Width** | **Known Limitation** | `HDLModuleWASM` (`src/vendor/8bitworkshop/hdl/hdlwasm.ts`) maps packed signals to WebAssembly `i32` or `i64` types (`data types > 64 bits not supported`), and `FpgaRuntime` skips ports/signals wider than 64 bits (`LIM-002`, `LIM-003`). |
| **Multidimensional Array Initializers & Signal Monitor Visibility** | **Known Limitation** | Uninitialized 1D and 2D unpacked arrays (`reg [7:0] mem2d [0:3][0:3]`) compile and simulate in WASM (`LIM-004`), and 1D 8-bit ROM/RAM arrays can be initialized via `$readmemh`/`$readmemb` (`LIM-007`). However, multidimensional `initarray` literals throw `multidimensional arrays not supported`, `$readmem` in `hdlwasm.ts` writes byte-by-byte (`uint8`), and unpacked arrays are hidden from the Signal Monitor table. |
| **Unflattened Submodule Hierarchy** | **Known Limitation** | `verilator_bin.wasm` runs with `-O3`, which inlines standard submodules into `TOP` (`LIM-006`). If Verilator preserves multiple non-inlined cells in its XML netlist, `VerilogXMLParser` (`vxmlparser.ts`) throws `multiple non-flattened modules not yet supported`. |
| **SystemVerilog `interface`, `struct`, and Typed `enum`** | **Known Limitation** | `VerilogXMLParser` explicitly rejects `interface` and `struct` constructs. Complex SystemVerilog `typedef enum` casts can also fail in `HDLModuleWASM` codegen (`cannot cast`). Standard Verilog-2001 `localparam` / `parameter` state definitions are recommended for FSMs. |
| **Relative Subdirectory `` `include `` Paths** | **Build Limitation** | `public/verilator/verilator-worker.js` sanitizes uploaded filenames into flat root names in Emscripten `FS`, so `` `include "sub/defs.vh" `` with subdirectory paths will not resolve unless flattened. |
| **Single Clock Domain Stepping** | **Planned Improvement** | `App.tsx` drives the first enabled `CLOCK` component mapped to an active Verilog input port. Support for multiple independent clock domains is planned. |

---

## 2. 16×16 LED Matrix Viewer

| Item | Classification | Description |
|---|---|---|
| **Single Active Matrix Display on Board Tab** | **Known Limitation** | Multiple `MATRIX` components can be defined in Hardware Configuration, while the main Board tab currently renders the first enabled `MATRIX` instance. |
| **Monochrome Single-Bit Intensity per Scan** | **Planned Improvement** | Each matrix pixel is sampled as binary ON/OFF per scan step with exponential POV decay. Support for PWM grayscale integration and RGB matrix planes is planned. |

---

## 3. Signal Monitor & Waveform Analyzer

| Item | Classification | Description |
|---|---|---|
| **64-Sample Rolling Buffer & Table-Cell SVG** | **Known Limitation** | `App.tsx` retains the last 64 samples (`HISTORY_LEN = 64`), and `SignalMonitor.tsx` renders 1-bit waveforms in a fixed `240px` SVG cell and multi-bit buses as the last 8 radix-formatted value chips. |
| **Full Canvas Waveform Viewer & VCD Export** | **Planned Improvement** | Upgrading the Signal Monitor to a zoomable/pannable Canvas logic analyzer with time cursors and `.vcd` export is planned. |

---

## 4. Build, Bundle & Licensing

| Item | Classification | Description |
|---|---|---|
| **Initial 6.1 MB `verilator_bin.wasm` Download** | **Build Limitation** | The first compilation in a browser session downloads and compiles `public/verilator/verilator_bin.wasm` (~6.1 MB uncompressed) inside the Web Worker. Subsequent compilations reuse the cached `WebAssembly.Module`. |
| **Upstream GPL-3.0 Vendored Components** | **Build Limitation** | While the simulator UI, configuration system, and parsers are MIT-licensed (`LICENSE`), the vendored Verilator WebAssembly binary (`public/verilator/*`) and HDL runtime (`src/vendor/8bitworkshop/*`) originate from [8bitworkshop](https://github.com/sehugg/8bitworkshop) under **GPL-3.0** (`src/vendor/8bitworkshop/LICENSE`). |
