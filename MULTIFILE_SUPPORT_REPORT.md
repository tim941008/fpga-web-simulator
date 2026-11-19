# Multi-File Support Report (Phase C.1)

> **Verification status: NOT VERIFIED.** The authoring environment had no `node`, `npm` or `git` on PATH,
> so `npm test`, `npm run build`, and the GitHub Actions run were **not executed**. All code was written and
> desk-checked only. Do not treat this phase as passing until CI is green.

## Files added
| File | Purpose |
|---|---|
| `src/project/projectModel.ts` | `ProjectFile` / `VerilogProject`, module scanner, top-module detection, validation (missing / duplicate / circular / missing top / missing include), rename / delete / replace / add helpers |
| `src/project/projectCompile.ts` | `compileProject(project, compiler?)`: validate, then compile every project file + top module |
| `src/project/projectImport.ts` | Multi-select, folder (`webkitRelativePath`), drag-and-drop (recursive `webkitGetAsEntry`) and ZIP (`fflate`) import |
| `src/components/ProjectExplorer.tsx` | Project Explorer (view / rename / replace / delete, add files/folder/ZIP) and `TopModuleSelector` |
| `src/presets/exampleProjects.ts` | 4 multi-file example projects (SW-LED, Counter, Seven-seg, Matrix) |
| `src/project/__tests__/project.test.ts` | Vitest: multi-file, top selection, diagnostics, explorer ops, import filter, examples |
| `src/sim/simulationEngine.ts`, `src/sim/__tests__/simulationEngine.test.ts` | See SIMULATION_PERFORMANCE_REPORT.md |

## Files modified
- `src/App.tsx` - rewritten around `ProjectFile[]` + `selectedTop`; header top selector, example picker, Files/Folder/ZIP upload, page-wide drag-and-drop, Explorer in the Code tab, engine integration. (Rewritten whole because a tooling mishap garbled the file's encoding; the original text was reproduced from the earlier read.)
- `src/components/ClockControls.tsx` - rate select (1 Hz ... 100 kHz, Unlimited), batch buttons, Stop, live Cycle / cycles-per-sec / Elapsed.
- `src/sim/fpgaRuntime.ts` - added `readSignal()` and `makeCycleStepper()`; header comment ASCII-fied.
- `public/verilator/verilator-worker.js` - keeps folder structure (mkdir), adds `-I` for every project directory so `` `include `` in subfolders works.
- `package.json` - new dependency `fflate` (ZIP). No lockfile in repo; CI runs `npm install --package-lock-only` first.

## Architecture decisions
- Project state lives in `src/project/*` and `App` state, **not** in `HardwareConfig`. HardwareConfig, matrix mapping, signal validation and the Verilator WASM pipeline are untouched.
- Validation is a pure, pre-Verilator step so Verilator is never invoked on a broken project and diagnostics are readable.
- `compileProject` takes an injectable compiler, so tests need no WASM.
- Top module = user choice if set, else auto-detect (uninstantiated root, preferring a name starting with `top`). A stale choice (e.g. file deleted) shows "Missing top module" rather than silently switching.
- Header/memory files (`.vh`, `.hex`, ...) are sent to Verilator with the sources; only `.v/.sv` are passed as compilation units.

## Known limitations
- Instantiation scanning is regex-based (comments stripped, keyword/primitive filtered). Unusual formatting, macros that expand to instantiations, and `generate`-only instantiations may be missed or mis-flagged. Verilator remains the authority on real errors.
- Self-recursion (`module a` instantiating `a`) is not detected by the scanner.
- Pre-compile port guess (`parseVerilogSource`) still picks its own top; authoritative ports come from Verilator after compile.
- New UI strings are English-only (not added to the zh-TW dictionary).
- Example projects use the default full-demo HardwareConfig; ports not present in an example show normal config warnings.
- Not tested in a browser: folder upload (Chromium/Firefox/Safari support `webkitdirectory`), drag-drop of folders, ZIP import.
- Example designs were validated statically (scan/validate in tests) but **not** simulated in Verilator.
