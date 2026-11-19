# Repository Documentation Cleanup Plan (`DOC_CLEANUP_PLAN.md`)

**Date:** 2026-11-19  
**Branch Inspected:** `feature/c2-wave-theme` (`d9fc516`)  
**Scope:** All **29** Markdown (`.md`) files currently present in the repository root (`20` tracked in git, `9` untracked locally).  
**Status:** **PROPOSAL ONLY — No files have been modified, moved, or deleted.**

---

## 1. Summary Counts

| Group | Action | File Count | Tracked / Untracked |
|---|---|---:|---|
| **A. Permanent Documentation** | `KEEP` | 7 | 7 tracked / 0 untracked |
| **B. Historical Archive (`docs/history/`)** | `MOVE` | 11 | 9 tracked / 2 untracked |
| **C. Consolidate into Release Notes (`CHANGELOG.md` / GitHub Releases)** | `MERGE` | 3 | 0 tracked / 3 untracked |
| **D. Superseded / Transient Logs** | `DELETE` | 8 | 4 tracked / 4 untracked |
| **Total Existing `.md` Files** | — | **29** | **20 tracked / 9 untracked** |

> **Files Mentioned in Review Request Not Present in Repository:**
> - `AUDIT_REPORT.md` — **Not found** (closest equivalents: `REPORT.md` and `PROJECT_HEALTH_REPORT.md`).
> - `PHASE_C1_VALIDATION_REPORT.md` — **Not found** (closest equivalents: `HEALTH_REPORT_VERIFICATION.md` and `FINAL_PHASE_C1_RELEASE_REPORT.md`).

---

## 2. Group A — Keep as Permanent Root Documentation (`KEEP`)

Keep in the repository root as active, user- and developer-facing living documentation.

| File | Tracked | Action | Justification |
|---|---|---|---|
| `README.md` | Yes | **KEEP** | Primary repository entry point (overview, live demo link, feature list, quickstart). |
| `CONTRIBUTING.md` | Yes | **KEEP** | Standard contributor guide and PR workflow. |
| `DEPLOYMENT.md` | Yes | **KEEP** | Active build and GitHub Pages static deployment instructions. |
| `LIMITATIONS.md` | Yes | **KEEP** | Active reference of Verilator WASM, 64-bit, array, and licensing boundaries *(refresh post-C.1/C.2 to remove stale flat-include note)*. |
| `COMPATIBILITY_MATRIX.md` | Yes | **KEEP** | Active Verilog/SystemVerilog construct and peripheral compatibility matrix. |
| `PROJECT_CONTEXT.md` | Yes | **KEEP** | Concise living architecture summary used by engineers and AI sessions *(refresh to include Phase C.1/C.2 modules)*. |
| `NEXT_TASKS.md` | Yes | **KEEP** | Living roadmap and backlog *(refresh to mark Phase C.1/C.2 done and track Logic Analyzer / RAM Viewer / VCD Export)*. |

---

## 3. Group B — Move into `docs/history/` (`MOVE`)

Preserve engineering traceability, audit evidence, and test baselines without cluttering the repository root.

| File | Tracked | Action | Proposed Target | Justification |
|---|---|---|---|---|
| `AI_Handover_Report_2026-11-18.md` | Yes | **MOVE** | `docs/history/AI_Handover_Report_2026-11-18.md` | Detailed Phase A/B engineering handover; valuable historical context, not root docs. |
| `BUG_REPORT.md` | Yes | **MOVE** | `docs/history/BUG_REPORT.md` | Completed historical audit of `BUG-001`..`BUG-010`. |
| `MERGE_REVIEW.md` | Yes | **MOVE** | `docs/history/PHASE_B_MERGE_REVIEW.md` | Completed Phase B merge review (`phase-b-stabilization` already merged & deleted). |
| `PROJECT_HEALTH_REPORT.md` | No | **MOVE** | `docs/history/PROJECT_HEALTH_REPORT.md` | Independent pre-C.1 architecture & release audit (19 classified findings; useful backlog reference for `MAJ-02..06`, `MIN-01..07`). |
| `HEALTH_REPORT_VERIFICATION.md` | No | **MOVE** | `docs/history/HEALTH_REPORT_VERIFICATION.md` | Execution-backed validation evidence for `PROJECT_HEALTH_REPORT.md` (live browser + regex harness). |
| `REPORT.md` | Yes | **MOVE** | `docs/history/INITIAL_TECHNICAL_AUDIT_REPORT.md` | Early technical audit report (predates Phase B/C.1; references removed QSF era). |
| `TEST_MATRIX.md` | Yes | **MOVE** | `docs/history/TEST_MATRIX.md` | Static HDL test fixture catalog (`tests/*`); useful reference alongside `TEST_REPORT.md`. |
| `TEST_REPORT.md` | Yes | **MOVE** | `docs/history/TEST_REPORT.md` | Historical HDL compatibility test execution snapshot. |
| `WORK_LOG.md` | Yes | **MOVE** | `docs/history/WORK_LOG.md` | Chronological AI work log; historical record superseded by git commit history. |
| `MULTIFILE_SUPPORT_REPORT.md` | Yes | **MOVE** | `docs/history/MULTIFILE_SUPPORT_REPORT.md` | Phase C.1 design notes; contains stale `NOT VERIFIED` banner from pre-CI authoring. |
| `SIMULATION_PERFORMANCE_REPORT.md` | Yes | **MOVE** | `docs/history/SIMULATION_PERFORMANCE_REPORT.md` | Phase C.1 `SimulationEngine` design and benchmark template (`_not measured_` placeholders). |

---

## 4. Group C — Merge into Release Notes (`MERGE`)

Consolidate key user-facing changes, verification evidence, and known limitations into a single `CHANGELOG.md` (and GitHub Releases `v2.1.0` / `v2.2.0`), then remove the standalone files.

| File | Tracked | Action | Merge Target | Justification |
|---|---|---|---|---|
| `FINAL_PHASE_C1_RELEASE_REPORT.md` | No | **MERGE** | `CHANGELOG.md` (`v2.1.0`) & GitHub Release `v2.1.0` | Final Phase C.1 summary (closed blockers `CRIT-02`, `CRIT-03`, `MAJ-01`, `MAJ-04`; CI Run #16/#17); belongs in `v2.1.0` release notes. |
| `PHASE_C2_UI_REPORT.md` | No | **MERGE** | `CHANGELOG.md` (`v2.2.0`) & PR #1 / Release `v2.2.0` | Phase C.2 Wave Viewer & Warm FPGA Lab theme summary; belongs in `v2.2.0` release notes. |
| `PHASE_C2_BROWSER_VALIDATION.md` | No | **MERGE** | `CHANGELOG.md` (`v2.2.0`) & PR #1 / Release `v2.2.0` | Final 5/5 browser validation metrics for Phase C.2; concise summary belongs in `v2.2.0` release notes. |

---

## 5. Group D — Safe to Delete (`DELETE`)

Transient process logs, obsolete pre-CI failure reports, or superseded intermediate gate documents. All tracked files remain recoverable via git history if ever needed.

| File | Tracked | Action | Justification |
|---|---|---|---|
| `ACTIONS_STATUS_REPORT.md` | Yes | **DELETE** | Point-in-time early CI status check; superseded by live GitHub Actions history (Runs #15–#18). |
| `BRANCH_PUBLISH_REPORT.md` | Yes | **DELETE** | One-off Phase B branch push log (`phase-b-stabilization` has been merged and deleted). |
| `BUILD_REPORT.md` | Yes | **DELETE** | Obsolete 2026-11-18 report claiming build is blocked and `package-lock.json` is missing; actively contradicts current state (`package-lock.json` committed, CI green). |
| `GITHUB_SETUP_REPORT.md` | Yes | **DELETE** | One-off initial repository & GitHub Pages setup report; superseded by `DEPLOYMENT.md`. |
| `PHASE_C1_MERGE_REVIEW.md` | No | **DELETE** | Pre-stabilization gate (`DO NOT MERGE`), fully superseded by `FINAL_PHASE_C1_RELEASE_REPORT.md` and merged `v2.1.0`. |
| `PHASE_C1_STABILIZATION_REPORT.md` | No | **DELETE** | Intermediate gate (`DO NOT MERGE` pending `MAJ-04`), fully superseded after commit `70e4e1a` and `FINAL_PHASE_C1_RELEASE_REPORT.md`. |
| `PHASE_C1_RELEASE_PREP.md` | No | **DELETE** | Pre-release execution runbook for `v2.1.0`; already executed (`76b16a6` deployed and tagged `v2.1.0`). |
| `REBASE_VERIFICATION_REPORT.md` | No | **DELETE** | Transient local branch-sync log (`3ae2b4e → 0480711 → b46d441`), superseded by `main` merge `76b16a6`. |

---

## 6. Post-Cleanup Root Directory Preview (Upon Approval)

If approved, the repository root will contain only **8** clean Markdown files (down from **29**):
- `README.md`
- `CHANGELOG.md` *(new — consolidated from Group C)*
- `CONTRIBUTING.md`
- `DEPLOYMENT.md`
- `LIMITATIONS.md`
- `COMPATIBILITY_MATRIX.md`
- `PROJECT_CONTEXT.md`
- `NEXT_TASKS.md`
- Plus `docs/history/` holding the **11** archived historical/audit documents.

*(No files have been modified or deleted yet. Reply to approve execution or request adjustments to any file's classification.)*
