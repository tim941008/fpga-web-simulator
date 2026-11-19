import { describe, expect, it } from 'vitest';
import { EngineScheduler, SimulationEngine } from '../simulationEngine';

/** Deterministic virtual clock: each step() costs `stepCostMs`. */
function harness(stepCostMs = 0.001, opts: { frameMs?: number; sliceMs?: number } = {}) {
  let clock = 0;
  const queue: Array<{ fn: () => void; at: number }> = [];
  const sched: EngineScheduler = {
    now: () => clock,
    schedule: (fn, delay) => queue.push({ fn, at: clock + delay }),
  };
  const state = { counter: 0, samples: 0, frames: [] as number[], errors: 0 };
  const engine = new SimulationEngine(
    {
      step: () => {
        state.counter++;
        clock += stepCostMs;
      },
      onSample: () => {
        state.samples++;
      },
      onFrame: (s) => state.frames.push(s.cycle),
      onError: () => state.errors++,
    },
    { scheduler: sched, ...opts }
  );
  /** Run queued ticks until idle or `maxTicks` reached; each tick also advances `idleMs`. */
  const pump = (maxTicks = 100000, idleMs = 0) => {
    let n = 0;
    while (queue.length && n++ < maxTicks) {
      const job = queue.shift()!;
      clock = Math.max(clock, job.at) + idleMs;
      job.fn();
    }
    return n;
  };
  return { engine, state, pump, advance: (ms: number) => (clock += ms), queue };
}

describe('SimulationEngine -batch execution', () => {
  for (const n of [10, 100, 1000, 100000]) {
    it(`runs exactly ${n} cycles in batch mode and finishes`, () => {
      const h = harness();
      h.engine.start({ kind: 'batch', cycles: n });
      h.pump();
      expect(h.state.counter).toBe(n);
      expect(h.engine.cycle).toBe(n);
      expect(h.engine.state).toBe('finished');
    });
  }

  it('does not publish a frame for every cycle in a 100k batch', () => {
    const h = harness();
    h.engine.start({ kind: 'batch', cycles: 100000 });
    h.pump();
    expect(h.state.frames.length).toBeLessThan(100000 / 100);
    expect(h.state.frames[h.state.frames.length - 1]).toBe(100000);
  });

  it('does not sample every cycle in fast modes', () => {
    const h = harness();
    h.engine.start({ kind: 'batch', cycles: 100000 });
    h.pump();
    expect(h.state.samples).toBeLessThan(100000 / 10);
    expect(h.state.samples).toBeGreaterThan(0);
  });

  it('runCyclesSync runs n cycles and emits a single frame', () => {
    const h = harness();
    h.engine.runCyclesSync(10);
    expect(h.state.counter).toBe(10);
    expect(h.engine.cycle).toBe(10);
    expect(h.state.frames).toEqual([10]);
  });
});

describe('SimulationEngine -pause / resume / stop', () => {
  it('pause freezes the cycle counter; resume continues without losing or duplicating cycles', () => {
    const h = harness();
    h.engine.start({ kind: 'batch', cycles: 50000 });
    h.pump(3);
    h.engine.pause();
    const frozen = h.engine.cycle;
    expect(frozen).toBeGreaterThan(0);
    expect(frozen).toBeLessThan(50000);
    expect(h.engine.state).toBe('paused');
    h.pump(); // stale ticks must be no-ops
    h.advance(1000);
    expect(h.engine.cycle).toBe(frozen);
    expect(h.state.counter).toBe(frozen);

    h.engine.resume();
    h.pump();
    expect(h.engine.state).toBe('finished');
    expect(h.state.counter).toBe(50000);
    expect(h.engine.cycle).toBe(50000);
  });

  it('stop halts an unlimited run and discards further work', () => {
    const h = harness();
    h.engine.start({ kind: 'unlimited' });
    h.pump(5);
    h.engine.stop();
    const at = h.engine.cycle;
    expect(at).toBeGreaterThan(0);
    expect(h.engine.state).toBe('stopped');
    h.pump(50);
    expect(h.engine.cycle).toBe(at);
    expect(h.state.counter).toBe(at);
    h.engine.resume(); // not paused -> ignored
    expect(h.engine.state).toBe('stopped');
  });

  it('stop emits a final frame carrying the exact cycle count', () => {
    const h = harness();
    h.engine.start({ kind: 'unlimited' });
    h.pump(4);
    h.engine.stop();
    expect(h.state.frames[h.state.frames.length - 1]).toBe(h.engine.cycle);
  });

  it('stopping a 1M-cycle run mid-way leaves counter == executed steps', () => {
    const h = harness();
    h.engine.start({ kind: 'batch', cycles: 1_000_000 });
    h.pump(10);
    h.engine.stop();
    expect(h.engine.cycle).toBe(h.state.counter);
    expect(h.engine.cycle).toBeLessThan(1_000_000);
  });

  it('reports errors thrown by step() and stops', () => {
    let n = 0;
    let err = 0;
    let t = 0;
    const q: Array<() => void> = [];
    const e = new SimulationEngine(
      {
        step: () => {
          if (++n === 5) throw new Error('boom');
        },
        onError: () => err++,
      },
      { scheduler: { now: () => t++ * 0.001, schedule: (fn) => q.push(fn) } }
    );
    e.start({ kind: 'unlimited' });
    while (q.length) q.shift()!();
    expect(err).toBe(1);
    expect(e.state).toBe('stopped');
  });
});

describe('SimulationEngine -clock rate mode', () => {
  it('executes ~hz cycles per simulated second at 1 kHz', () => {
    const h = harness(0.0001);
    h.engine.start({ kind: 'rate', hz: 1000 });
    // 1000 ticks, 4 ms apart = ~4 simulated seconds
    h.pump(1000, 0);
    const secs = 4;
    expect(h.state.counter).toBeGreaterThan(secs * 1000 * 0.9);
    expect(h.state.counter).toBeLessThan(secs * 1000 * 1.1);
  });

  it('1 Hz advances about one cycle per simulated second', () => {
    const h = harness(0.0001);
    h.engine.start({ kind: 'rate', hz: 1 });
    h.pump(2500, 0); // 10 s
    expect(h.state.counter).toBeGreaterThanOrEqual(9);
    expect(h.state.counter).toBeLessThanOrEqual(11);
  });
});

describe('SimulationEngine -state integrity (high-speed vs single-step)', () => {
  // A deterministic LFSR "design": the final state must not depend on how cycles are batched.
  const makeLfsr = () => {
    let s = 0xace1;
    return {
      step: () => {
        const bit = ((s >> 0) ^ (s >> 2) ^ (s >> 3) ^ (s >> 5)) & 1;
        s = ((s >> 1) | (bit << 15)) & 0xffff;
      },
      get: () => s,
    };
  };

  it('unlimited/batched run yields the same state as stepping one cycle at a time', () => {
    const ref = makeLfsr();
    for (let i = 0; i < 123457; i++) ref.step();

    const dut = makeLfsr();
    let t = 0;
    const q: Array<() => void> = [];
    const e = new SimulationEngine(
      { step: dut.step },
      { scheduler: { now: () => (t += 1), schedule: (fn) => q.push(fn) } }
    );
    e.start({ kind: 'batch', cycles: 123457 });
    let guard = 0;
    while (q.length && guard++ < 1e6) q.shift()!();
    expect(e.cycle).toBe(123457);
    expect(dut.get()).toBe(ref.get());
  });

  it('pausing and resuming repeatedly does not change the final state', () => {
    const ref = makeLfsr();
    for (let i = 0; i < 40000; i++) ref.step();

    const dut = makeLfsr();
    let t = 0;
    const q: Array<() => void> = [];
    const e = new SimulationEngine(
      { step: dut.step },
      { scheduler: { now: () => (t += 1), schedule: (fn) => q.push(fn) } }
    );
    e.start({ kind: 'batch', cycles: 40000 });
    let guard = 0;
    while (e.state !== 'finished' && guard++ < 1e6) {
      q.shift()?.();
      if (guard % 7 === 0 && e.state === 'running') {
        e.pause();
        e.resume();
      }
    }
    expect(e.cycle).toBe(40000);
    expect(dut.get()).toBe(ref.get());
  });
});

describe('SimulationEngine - real scheduler benchmark (engine overhead only)', () => {
  it('runs 1,000,000 cycles at max speed with real timers, then reports cycles/sec', async () => {
    let n = 0;
    let last = { cycle: 0, cyclesPerSec: 0, elapsedMs: 0 };
    const done = new Promise<void>((resolve) => {
      const e = new SimulationEngine({
        step: () => {
          n++;
        },
        onFrame: (s) => {
          last = s;
          if (s.state === 'finished') resolve();
        },
      });
      e.start({ kind: 'batch', cycles: 1_000_000 });
    });
    await done;
    expect(n).toBe(1_000_000);
    expect(last.cycle).toBe(1_000_000);
    // eslint-disable-next-line no-console
    console.log('[bench] engine overhead: 1M cycles in ' + last.elapsedMs.toFixed(1) + ' ms (' + Math.round(1_000_000 / (last.elapsedMs / 1000)).toLocaleString() + ' cycles/sec, no-op step)');
  }, 30000);
});