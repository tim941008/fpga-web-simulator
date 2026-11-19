# Simulation Performance Report (Phase C.1)

> **Verification status: NOT MEASURED.** `node`/`npm` were unavailable in the authoring environment, so
> no benchmark, test, or build was run. The numbers sections below are intentionally empty; fill them from the
> CI log or a local run. No performance claim is made.

## Design
- `src/sim/simulationEngine.ts` owns the hot loop and is independent of React.
- Modes: rate (1 Hz, 10 Hz, 100 Hz, 1 kHz, 10 kHz, 100 kHz), Unlimited, and batch (10 / 100 / 1k / 10k / 100k cycles).
- Time-sliced (~12 ms per slice, time checked every 256 cycles), yielding via `MessageChannel` between slices; Pause/Stop take effect within one slice. Runs on the main thread (not a Worker).
- UI is updated only from `onFrame`, throttled to ~30 FPS and once on pause/stop/finish: signals snapshot, matrix publish, history, stats. Nothing per cycle.
- Per-cycle work is `FpgaRuntime.makeCycleStepper()`: clock key resolved once, two state writes + two `eval()`; no BigInt conversion or signal snapshot.
- Live matrix: only row/col are read (`readSignal`) every cycle in slow modes (<= 64 cycles/slice) and every 61st cycle in fast modes (prime stride to avoid aliasing with power-of-two scan counters). Matrix is recomputed/published at frame boundaries only.
- Stats shown: Cycle, cycles/sec (250 ms window), Elapsed (pauses excluded).

## Tests (written, not yet run)
`src/sim/__tests__/simulationEngine.test.ts`: batch 10/100/1000/100000 exact counts; no per-cycle frames/samples; pause/resume/stop exactness; error handling; rate accuracy (virtual clock); LFSR state-equivalence between batched/paused-resumed runs and plain stepping; a real-timer 1M no-op-cycle benchmark that logs `[bench] ...`.

## Results (to fill after CI / local run)
| Measurement | Value |
|---|---|
| Engine overhead, 1M no-op cycles (`[bench]` log line) | _not measured_ |
| Verilated counter design, cycles/sec (WASM backend) | _not measured_ |
| Verilated counter design, cycles/sec (JS fallback) | _not measured_ |
| Bundle size delta (`fflate` + new code) | _not measured_ (expected small; fflate is ~8 KB gzip) |
| Memory delta | _not measured_ (engine holds O(1) state; history stays capped at 64 entries) |

## Known limitations
- Main-thread loop: heavy designs reduce UI smoothness; a Worker-hosted model would be the next step.
- 100 kHz+ and Unlimited throughput depend on the model's `eval()` cost; the requested "100,000+ cycles efficiently" is **unconfirmed** until measured.
- Sampling the matrix every 61 cycles in fast modes can produce a different persistence image than per-cycle sampling.
- Manual input toggling during a run takes effect between slices.
