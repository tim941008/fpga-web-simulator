/**
 * Simulation engine (Phase C.1): drives a cycle-stepping function at a target rate,
 * in batches, or at maximum speed, completely independent of React rendering.
 *
 * - The hot loop only calls `step()` (and optionally `onSample()` every `sampleStride` cycles).
 * - `onFrame()` is throttled to `frameMs` (??0 FPS) and fires once more on pause/stop/finish.
 * - Work is time-sliced (`sliceMs`) and yields to the event loop between slices, so the UI
 *   stays responsive and Stop/Pause take effect within one slice.
 */

export type EngineState = 'idle' | 'running' | 'paused' | 'stopped' | 'finished';

export type RunMode =
  | { kind: 'rate'; hz: number }
  | { kind: 'unlimited' }
  | { kind: 'batch'; cycles: number };

export interface EngineStats {
  state: EngineState;
  cycle: number;
  /** Cycles/second measured over a sliding window while running. */
  cyclesPerSec: number;
  /** Wall time spent in the running state (pauses excluded), ms. */
  elapsedMs: number;
}

export interface EngineScheduler {
  now(): number;
  /** Run `fn` later. delayMs === 0 means "yield to the event loop, then run ASAP". */
  schedule(fn: () => void, delayMs: number): void;
  /** Release any underlying resources (e.g. MessageChannel ports). */
  dispose?(): void;
}

export interface EngineHooks {
  /** Advance exactly one full clock cycle. */
  step(): void;
  /** Cheap per-stride sampling (e.g. matrix row/col). Not called every cycle in fast modes. */
  onSample?(cycle: number): void;
  /** Throttled UI refresh. */
  onFrame?(stats: EngineStats): void;
  onError?(err: unknown): void;
}

export interface EngineOptions {
  frameMs?: number;
  sliceMs?: number;
  /** Cycles per time check inside a slice. */
  checkEvery?: number;
  scheduler?: EngineScheduler;
}

export const RATE_PRESETS_HZ = [1, 10, 100, 1_000, 10_000, 100_000] as const;
export const BATCH_SIZES = [10, 100, 1_000, 10_000, 100_000] as const;

const defaultScheduler = (): EngineScheduler => {
  let channel: MessageChannel | null = null;
  const queue: Array<() => void> = [];
  if (typeof MessageChannel !== 'undefined') {
    channel = new MessageChannel();
    channel.port1.onmessage = () => {
      const fn = queue.shift();
      fn?.();
    };
  }
  return {
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    schedule(fn, delayMs) {
      if (delayMs > 0 || !channel) setTimeout(fn, delayMs);
      else {
        queue.push(fn);
        channel.port2.postMessage(0);
      }
    },
    dispose() {
      queue.length = 0;
      if (channel) {
        channel.port1.onmessage = null;
        channel.port1.close();
        channel.port2.close();
        channel = null;
      }
    },
  };
};

export class SimulationEngine {
  private hooks: EngineHooks;
  private sched: EngineScheduler;
  private frameMs: number;
  private sliceMs: number;
  private checkEvery: number;

  private _state: EngineState = 'idle';
  private _cycle = 0;
  private mode: RunMode | null = null;
  private remaining = 0; // batch cycles left
  private token = 0; // invalidates scheduled ticks on pause/stop/restart

  // timing
  private elapsed = 0;
  private lastTickAt = 0;
  private lastFrameAt = 0;
  private rateCarry = 0;
  private lastRateT = 0;
  private winStartT = 0;
  private winStartCycle = 0;
  private cps = 0;

  constructor(hooks: EngineHooks, opts: EngineOptions = {}) {
    this.hooks = hooks;
    this.sched = opts.scheduler ?? defaultScheduler();
    this.frameMs = opts.frameMs ?? 33;
    this.sliceMs = opts.sliceMs ?? 12;
    this.checkEvery = opts.checkEvery ?? 256;
  }

  get state(): EngineState {
    return this._state;
  }
  get cycle(): number {
    return this._cycle;
  }

  stats(): EngineStats {
    return { state: this._state, cycle: this._cycle, cyclesPerSec: this.cps, elapsedMs: this.elapsed };
  }

  /** Set the cycle counter (e.g. after reset or manual stepping). Does not run anything. */
  setCycle(n: number): void {
    const delta = n - this._cycle;
    this._cycle = n;
    if (this._state === 'paused' && this.mode?.kind === 'batch' && delta > 0) {
      this.remaining = Math.max(0, this.remaining - delta);
      if (this.remaining === 0) {
        this._state = 'finished';
      }
    }
  }

  /** Reset counters, invalidate scheduled ticks, and release scheduler resources. */
  dispose(): void {
    this.reset();
    this.sched.dispose?.();
  }

  /** Reset counters and stop. */
  reset(cycle = 0): void {
    this.token++;
    this._state = 'idle';
    this._cycle = cycle;
    this.elapsed = 0;
    this.cps = 0;
    this.mode = null;
    this.remaining = 0;
  }

  /** Start (or restart) running in `mode`. */
  start(mode: RunMode): void {
    this.token++;
    this.mode = mode;
    this.remaining = mode.kind === 'batch' ? Math.max(0, Math.floor(mode.cycles)) : 0;
    this.elapsed = 0;
    this.cps = 0;
    this.begin();
  }

  /** Change the rate while running (rate/unlimited modes). */
  setMode(mode: RunMode): void {
    if (this._state === 'running' && mode.kind !== 'batch') {
      this.token++;
      this.mode = mode;
      this.begin();
    } else if (this._state === 'paused' && mode.kind !== 'batch') {
      this.mode = mode;
    }
  }

  pause(): void {
    if (this._state !== 'running') return;
    this.token++;
    this.accumulateElapsed();
    this._state = 'paused';
    this.emitFrame();
  }

  resume(): void {
    if (this._state !== 'paused' || !this.mode) return;
    this.token++;
    this.begin();
  }

  stop(): void {
    if (this._state !== 'running' && this._state !== 'paused') return;
    this.token++;
    if (this._state === 'running') this.accumulateElapsed();
    this._state = 'stopped';
    this.remaining = 0;
    this.cps = 0;
    this.emitFrame();
  }

  /**
   * Run `n` cycles synchronously (no frames, no yielding). Used by single-step and tests.
   * Fires onSample every `stride` cycles and onFrame once at the end.
   */
  runCyclesSync(n: number, stride = 1): void {
    const s = Math.max(1, stride);
    try {
      let since = 0;
      for (let i = 0; i < n; i++) {
        this.hooks.step();
        this._cycle++;
        if (++since >= s) {
          since = 0;
          this.hooks.onSample?.(this._cycle);
        }
      }
    } catch (e) {
      this.fail(e);
      return;
    }
    this.hooks.onFrame?.(this.stats());
  }

  // ---------------------------------------------------------------- internals
  private begin(): void {
    const now = this.sched.now();
    this._state = 'running';
    this.lastTickAt = now;
    this.lastFrameAt = now;
    this.winStartT = now;
    this.winStartCycle = this._cycle;
    this.rateCarry = 0;
    this.lastRateT = now;
    this.scheduleTick(0);
  }

  private accumulateElapsed(): void {
    this.elapsed += this.sched.now() - this.lastTickAt;
    this.lastTickAt = this.sched.now();
  }

  private scheduleTick(delay: number): void {
    const my = this.token;
    this.sched.schedule(() => {
      if (my === this.token) this.tick();
    }, delay);
  }

  private fail(e: unknown): void {
    this.token++;
    this._state = 'stopped';
    this.hooks.onError?.(e);
    this.emitFrame();
  }

  private emitFrame(): void {
    this.lastFrameAt = this.sched.now();
    this.hooks.onFrame?.(this.stats());
  }

  /** One scheduling slice. Public for deterministic tests. */
  tick(): void {
    if (this._state !== 'running' || !this.mode) return;
    const t0 = this.sched.now();
    const mode = this.mode;
    // how many cycles are we allowed to run in this slice?
    let budget: number;
    if (mode.kind === 'rate') {
      this.rateCarry += ((t0 - this.lastRateT) / 1000) * mode.hz;
      this.lastRateT = t0;
      budget = Math.floor(this.rateCarry);
      this.rateCarry -= budget;
    } else if (mode.kind === 'batch') {
      budget = this.remaining;
    } else {
      budget = Infinity;
    }

    const stride = this.sampleStrideFor(mode, budget);
    let done = 0;
    let since = 0;
    try {
      while (done < budget) {
        const chunk = Math.min(this.checkEvery, budget - done);
        for (let i = 0; i < chunk; i++) {
          this.hooks.step();
          this._cycle++;
          if (++since >= stride) {
            since = 0;
            this.hooks.onSample?.(this._cycle);
          }
        }
        done += chunk;
        if (this.sched.now() - t0 >= this.sliceMs) break;
      }
    } catch (e) {
      this.fail(e);
      return;
    }

    {
      const t1 = this.sched.now();
      this.elapsed += t1 - this.lastTickAt;
      this.lastTickAt = t1;
    }
    if (mode.kind === 'rate' && done < budget) {
      // can't keep up with requested rate: drop the debt instead of snowballing
      this.rateCarry = 0;
    }
    if (mode.kind === 'batch') {
      this.remaining -= done;
      if (this.remaining <= 0) {
        this.updateCps(true);
        this._state = 'finished';
        this.emitFrame();
        return;
      }
    }

    const now = this.sched.now();
    this.updateCps(false);
    if (now - this.lastFrameAt >= this.frameMs) this.emitFrame();

    const nextDelay =
      mode.kind === 'rate'
        ? Math.min(25, Math.max(4, Math.floor(500 / Math.max(mode.hz, 0.1))))
        : 0;
    this.scheduleTick(nextDelay);
  }


  /** Sample the matrix at most ~64 times per slice in fast modes; every cycle when slow. */
  private sampleStrideFor(mode: RunMode, budget: number): number {
    if (mode.kind === 'rate' && budget <= 64) return 1;
    return 61; // prime stride: avoids aliasing with power-of-two scan periods
  }

  private updateCps(force: boolean): void {
    const now = this.sched.now();
    const dt = now - this.winStartT;
    if (dt >= 250 || (force && dt > 0)) {
      this.cps = ((this._cycle - this.winStartCycle) / dt) * 1000;
      this.winStartT = now;
      this.winStartCycle = this._cycle;
    }
  }
}

export function formatCount(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(2)} s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(1)}s`;
}
