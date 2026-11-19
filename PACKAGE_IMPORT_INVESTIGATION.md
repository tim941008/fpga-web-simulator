# SystemVerilog `package` / `import` Compilation Investigation (`PACKAGE_IMPORT_INVESTIGATION.md`)

**Date:** 2026-11-19  
**Failing Project Files Inspected:**
- `game.sv` (`import game_config::*;`, `module game`, top module)
- `game_config.sv` (`package game_config; ... endpackage`)
- `game_display.sv` (`import game_config::*;`, `module game_display`, `led_display`, `board_to_led`, `blink_generate`)
- `game_logic.sv` (`import game_config::*;`, `module game_logic`)

**Observed Verilator Errors:**
```text
Package/class 'game_config' not found
Importing from missing package 'game_config'
```

---

## 1. Executive Root Cause Summary

The multi-file compiler **does NOT currently support SystemVerilog `package`/`import` dependency ordering**.

When the 4 files are uploaded, browsers and ZIP extractors deliver them in **lexicographical (alphabetical) order**:
1. `game.sv` (`'.'` = ASCII 46)
2. `game_config.sv` (`'_'` = ASCII 95)
3. `game_display.sv`
4. `game_logic.sv`

Because neither `src/project/projectCompile.ts` nor `public/verilator/verilator-worker.js` reorders package-declaring files ahead of importing files, Verilator is invoked with:
```text
verilator ... --top-module game game.sv game_config.sv game_display.sv game_logic.sv
```
Per IEEE 1800-2017 §26.3, Verilator parses CLI source files strictly **left-to-right**. When it parses line 2 of `game.sv` (`import game_config::*;`), it has not yet seen `game_config.sv`, causing immediate compilation failure.

---

## 2. Verification Across All 5 Investigation Areas

### 2.1 `package` Declarations (`src/project/projectModel.ts`)
- **Status:** **Not supported.**
- `scanSource()` (`src/project/projectModel.ts:95-124`) only matches `\bmodule\s+(?:automatic\s+|static\s+)?([A-Za-z_][A-Za-z0-9_$]*)([\s\S]*?)\bendmodule\b`.
- It never scans `package <name>; ... endpackage` blocks.
- For `game_config.sv`, `scanProject()` returns `0` modules (`byFileId.get(game_config.id) === undefined`).
- `game_config.sv` only survives `selectFilesForTop()` by coincidence because of `if (fileMods.length === 0) return true;` (`src/project/projectCompile.ts:81`). If a `.sv` file defined both a `package` and an ancestor/testbench `module`, `selectFilesForTop()` would **drop** the file and its package entirely.

### 2.2 `import package::*;` References (`src/project/projectModel.ts`, `src/project/projectCompile.ts`)
- **Status:** **Not supported.**
- Neither `scanSource()`, `validateProject()`, nor `selectFilesForTop()` parses `import <pkg>::*;`, `import <pkg>::<symbol>;`, or scoped `<pkg>::<symbol>` references.
- No package-to-file mapping (`packageName -> fileId`) or file-to-package dependency graph (`fileId -> importedPackages`) is constructed.
- `validateProject()` does not emit an advisory warning if an imported package is missing from the project.

### 2.3 File Ordering Passed to Verilator (`src/project/projectCompile.ts`, `public/verilator/verilator-worker.js`)
- **Status:** **Broken (Primary Root Cause).**
- `selectFilesForTop()` (`src/project/projectCompile.ts:78-86`) runs `project.files.filter(...)`, which **preserves the raw upload/alphabetical order**:
  `['game.sv', 'game_config.sv', 'game_display.sv', 'game_logic.sv']`.
- `verilator-worker.js` (`public/verilator/verilator-worker.js:75-89`) iterates `req.files.forEach(...)` and pushes `.v`/`.sv` paths into `paths` in that exact same order.
- Because `game.sv` precedes `game_config.sv`, Verilator fails before ever reading `game_config.sv`.

### 2.4 Verilator Command Arguments (`public/verilator/verilator-worker.js`)
- **Inspected args (`public/verilator/verilator-worker.js:92-101`):**
  ```js
  ['-I.', ...incDirs, '--cc', '-O3', '-Wall', '-Wno-fatal',
   '-Wno-DECLFILENAME', '-Wno-UNUSED', '-Wno-EOFNEWLINE', '-Wno-PROCASSWIRE',
   '-Wno-WIDTH', '-Wno-CASEINCOMPLETE', '-Wno-UNDRIVEN', '-Wno-PINCONNECTEMPTY',
   '--x-assign', 'fast', '--noassert', '--pins-sc-biguint',
   '--debug-check', '--top-module', top, ...paths]
  ```
- **Findings:**
  - `.sv` files automatically trigger SystemVerilog mode in Verilator, so `package`/`import` syntax is supported by `verilator_bin.wasm` once files are ordered properly.
  - Note: if a user ever places `package`/`import` inside a `.v` file, Verilator requires `--sv` (or `.sv` extension). Adding no extra flag is needed for `.sv`, though auto-detecting `package`/`import` in `.v` files or passing `--sv` only when `.sv` syntax is present is worth considering.
  - Downstream XML check (`src/vendor/8bitworkshop/hdl/vxmlparser.ts:164`): `visit_package(node: XMLNode) {}` is a safe no-op, so Verilator XML `<package>` elements (with `-O3` constant-folded `localparam`s like `PLAYER_1`/`PLAYER_2`) will not throw in `VerilogXMLParser`.

### 2.5 `projectCompile.ts` Dependency Construction
- **Current behavior (`src/project/projectCompile.ts:49-87`):**
  - Builds only a module-level reverse instantiation graph (`parentsOf: Map<string, Set<string>>`) to exclude strict ancestor files of `topModule`.
  - Does **not** detect packages declared in each file.
  - Does **not** protect package-declaring files from ancestor exclusion.
  - Does **not** topologically sort package files before module files (or sort inter-package dependencies when `pkg_b` imports `pkg_a`).

---

## 3. Proposed Fix

### Step 1 — Add Package & Import Scanning in `src/project/projectModel.ts`
Add lightweight, comment-stripped pure helpers:
1. `scanPackages(content: string): string[]`:
   - Matches `\bpackage\s+(?:automatic\s+|static\s+)?([A-Za-z_][A-Za-z0-9_$]*)\b` (excluding `std`).
2. `scanPackageImports(content: string): string[]`:
   - Matches `\bimport\s+([A-Za-z_][A-Za-z0-9_$]*)\s*::` (and optionally scoped references `\b([A-Za-z_][A-Za-z0-9_$]*)\s*::`, excluding `std`).
3. *(Optional advisory diagnostic)* In `validateProject()`: emit a `warning` (`MISSING_PACKAGE`) if an imported package is not declared in any project file (never a hard error — Verilator remains source of truth).

### Step 2 — Topological Package-First Ordering in `src/project/projectCompile.ts`
Update `selectFilesForTop(project: VerilogProject): SourceFile[]`:
1. **Never exclude a file that declares a `package`** (even if it also defines an ancestor module).
2. Partition selected `.v`/`.sv` source files into:
   - **Package files** (files where `scanPackages(f.content).length > 0`)
   - **Non-package source files** (all other `.v`/`.sv` files)
   - **Non-source files** (headers `.vh`/`.svh`, memory files `.hex`/`.mem`, etc.)
3. **Topologically sort package files** using their inter-package `import` dependencies (`pkgA` imported by `pkgB` → `pkgA`'s file comes before `pkgB`'s file; tie-break by original file order; gracefully break cycles if any).
4. Emit files in deterministic compilation order:
   1. Non-source files (headers / memory files)
   2. Topologically sorted **package files** (e.g., `game_config.sv`)
   3. Remaining **module files** (e.g., `game.sv`, `game_display.sv`, `game_logic.sv`)

For the user's project, Verilator will then receive:
```text
verilator ... --top-module game game_config.sv game.sv game_display.sv game_logic.sv
```

### Step 3 — Unit & Regression Tests (`src/project/__tests__/project.test.ts`)
Add tests verifying:
1. Alphabetically-ordered upload `[game.sv, game_config.sv, game_display.sv, game_logic.sv]` dispatches `game_config.sv` **before** `game.sv`, `game_display.sv`, and `game_logic.sv`.
2. Chained packages (`pkg_b.sv` importing `pkg_a.sv`, uploaded as `[top.sv, pkg_b.sv, pkg_a.sv]`) dispatch in order `pkg_a.sv` → `pkg_b.sv` → `top.sv`.
3. A file containing both a `package` and an ancestor module is never dropped when compiling a submodule as top.
4. `game.sv` / `game_config.sv` / `game_display.sv` / `game_logic.sv` compile cleanly with Verilator WASM in browser once fixed.
