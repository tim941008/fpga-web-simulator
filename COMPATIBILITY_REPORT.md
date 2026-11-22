# Large FPGA Project Compatibility Audit (`COMPATIBILITY_REPORT.md`)

**Audit Date:** 2026-11-22  
**Branch / Baseline:** `feature/c2-wave-theme` (synced with `main` @ `9b56d83`)  
**Audit Test Suite:** [src/sim/__tests__/compatibilityAudit.test.ts](src/sim/__tests__/compatibilityAudit.test.ts) (10/10 tests passed)

---

## Summary Matrix

| # | Feature | Classification | Scope / Notes |
|---:|---|---|---|
| 1 | `package` | **PASS** | `package ... endpackage` declarations detected, preserved, and simulated in WASM & JS. |
| 2 | `import package::*` | **PASS** | Topological package dependency ordering ensures providers precede consumers regardless of upload order. |
| 3 | `typedef` | **PARTIAL** | Scalar packed `typedef` and `typedef enum` **PASS**; `typedef struct` / `struct packed` **FAILS** in `VerilogXMLParser` (`structs not supported`). |
| 4 | `include .vh/.svh` | **PASS** | `.vh` and `.svh` files in root and nested subdirectories resolve via `-I.` and `-I<dir>`. |
| 5 | `nested folders` | **PASS** | Multi-level directory trees preserved in Emscripten FS with automatic `-I<dir>` include paths and original-path error mapping. |
| 6 | `recursive folder import` | **PARTIAL** | Recursive folder (`webkitRelativePath`), drag-and-drop (`DataTransfer`), and ZIP extraction work cleanly up to `200` files / `10 MB`; larger repos are rejected by safety caps. |
| 7 | `generate-for` | **PASS** | Structural `genvar` + `generate for` unrolling and module instantiation inside `generate for` compile and simulate accurately. |
| 8 | `generate-if` | **PASS** | Conditional `generate if / else` hardware and module instantiation elaborate and simulate cleanly. |
| 9 | `parameterized module instantiation` | **PASS** | Named parameter overrides `#(.W(WIDTH), .INIT(...))` elaborate in Verilator and simulate in WASM & JS; fallback port parser evaluates parameter expressions. |

---

## Detailed Findings & Evidence

### 1. `package` — **PASS**
- **Pipeline behavior:** `scanPackages()` (`src/project/projectModel.ts`) extracts `package <name>;` declarations while ignoring comments/strings and `std`. `selectFilesForTop()` (`src/project/projectCompile.ts`) explicitly preserves all package-declaring files even when they define no modules.
- **Verified:** `defs_pkg` (`top_pkg_test`), `types_pkg`, `enum_pkg`, `bus_pkg`, and `game_config` (`testV`).

### 2. `import package::*` — **PASS**
- **Pipeline behavior:** `scanPackageImports()` detects `import pkg::*;`, `import pkg::sym;`, and scoped `pkg::sym` references. `orderSourcesByPackageDependencies()` runs Kahn's topological sort so package providers always precede importing files on Verilator's command line.
- **Verified:** `top_pkg_test.sv` uploaded before `defs_pkg.sv` compiled and simulated `0x10 + 0x15 = 0x25` in both `HDLModuleWASM` and `HDLModuleJS`.

### 3. `typedef` — **PARTIAL**
- **What PASSES:**
  - Scalar / packed vector aliases (`typedef logic [7:0] byte_t;`) pass Verilator, `VerilogXMLParser`, `HDLModuleWASM`, and `HDLModuleJS`.
  - Enumerated types (`typedef enum logic [1:0] { IDLE, RUN, DONE } state_t;`) pass Verilator, `VerilogXMLParser`, `HDLModuleWASM`, and `HDLModuleJS`.
- **What FAILS:**
  - Packed and unpacked structs (`typedef struct packed { ... }`) are parsed by Verilator into XML (`<memberdtype>`), but `VerilogXMLParser.visit_memberdtype()` (`src/vendor/8bitworkshop/hdl/vxmlparser.ts:443`) throws:
    `CompileError: structs not supported`
  - **Impact:** Large SystemVerilog projects using `typedef struct packed` for bus/instruction packets cannot be simulated until `VerilogXMLParser` (and downstream width/slice lowering) adds `<memberdtype>` support.

### 4. `include .vh/.svh` — **PASS**
- **Pipeline behavior:** `isAcceptedPath()` (`src/project/projectImport.ts`) accepts `.vh` and `.svh`. `selectFilesForTop()` always retains non-source header files, and `verilator-worker.js` writes them into Emscripten FS and passes `-I.` plus `-I<dir>` for every project subdirectory.
- **Verified:** `top_inc.sv` including both root `legacy.vh` and nested `inc/consts.svh` compiled and simulated `0x10 + 0x42 + 0x08 = 0x5A`.

### 5. `nested folders` — **PASS**
- **Pipeline behavior:** `verilator-worker.js` creates nested directories in Emscripten FS, preserves path segments, builds `-I<dir>` arguments, and maps sanitized paths back to original filenames (`safeToOriginal`) for error reporting. `scanProject()` and `guessTopModule()` handle nested paths (`rtl/pkg/bus_pkg.sv`, `rtl/sub/adder.sv`, `rtl/top_nested.sv`).
- **Verified:** Multi-folder RTL project compiled and simulated `9 + 1 = 10`.

### 6. `recursive folder import` — **PARTIAL**
- **What PASSES:**
  - `entriesFromFiles()` (`webkitRelativePath`), `entriesFromDataTransfer()` (recursive `walk()` using `webkitGetAsEntry` + `createReader`), and `unzipProject()` (`fflate`) all recursively import nested subdirectories, strip a single shared root folder, and filter `.git` / `__MACOSX`.
- **Limitation for Large Projects:**
  - `src/project/projectImport.ts` enforces hard caps: `MAX_IMPORT_FILES = 200` and `MAX_IMPORT_TOTAL_BYTES = 10 * 1024 * 1024` (10 MB). Projects exceeding 200 files or 10 MB throw an import error and are rejected.

### 7. `generate-for` — **PASS**
- **Pipeline behavior:** Verilator elaborates `genvar` + `generate for` loops (both procedural/structural blocks and submodule instantiations). `verilator-worker.js` supplies `--unroll-count 256 --unroll-stmts 65536`.
- **Verified:** `top_gen_for.v` instantiating 8 `inv1` submodules via `generate for` compiled and inverted `0x5A -> 0xA5` in WASM/JS.

### 8. `generate-if` — **PASS**
- **Pipeline behavior:** Verilator elaborates `generate if / else` blocks and conditional module instantiations. `selectFilesForTop()` retains submodules referenced in inactive branches so Verilator performs authoritative elaboration.
- **Verified:** `top_gen_if.v` (`USE_ADD = 1`) instantiating `add_mode` / `sub_mode` compiled and computed `20 + 10 = 30`.

### 9. `parameterized module instantiation` — **PASS**
- **Pipeline behavior:** Verilator elaborates parameterized modules (`#(.W(WIDTH), .INIT(12'h321))`) cleanly for both `HDLModuleWASM` and `HDLModuleJS`. Fallback `parseVerilogSource()` (`src/parsers/verilogParser.ts`) also evaluates `parameter` / `localparam` expressions for port widths before first compile.
- **Verified:** `top_param.v` (`WIDTH = 12`) instantiating `param_reg` initialized `q = 0x321` and latched `0xABC` on `posedge clk`.

---

## Overall Verdict

- **PASS:** 7 / 9 (`package`, `import package::*`, `include .vh/.svh`, `nested folders`, `generate-for`, `generate-if`, `parameterized module instantiation`)
- **PARTIAL:** 2 / 9 (`typedef`, `recursive folder import`)
- **FAIL:** 0 / 9
