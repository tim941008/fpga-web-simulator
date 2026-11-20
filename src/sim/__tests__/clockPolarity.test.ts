import { describe, it, expect } from 'vitest';
import { computeInitialInputSignals } from '../../config/hardwareMapping';
import { FpgaRuntime } from '../fpgaRuntime';
import { ClockComponentConfig } from '../../types/hardwareConfig';
import { PortDefinition } from '../../types/fpga';

function makeMockModel(initialClk = 0) {
  const edgeLog: number[] = [];
  const state: Record<string, number> = { clk: initialClk };
  const model = {
    state,
    mod: {
      vardefs: {
        clk: {
          origName: 'clk',
          isInput: true,
          isOutput: false,
          dtype: { left: 0, right: 0 },
        },
      },
    },
    eval: () => {
      edgeLog.push(state.clk);
    },
    powercycle: () => {
      state.clk = 0;
    },
    dispose: () => {},
  };
  const runtime: FpgaRuntime = new (FpgaRuntime as any)(model, 'verilator-js', 'top');
  return { runtime, edgeLog, state };
}

describe('Clock polarity and initialization (BUG-04)', () => {
  const ports: PortDefinition[] = [
    { name: 'clk', direction: 'input', width: 1, msb: 0, lsb: 0 },
  ];

  it('initializes active-high clock to 0n and active-low clock to 1n', () => {
    const hiClk: ClockComponentConfig = {
      id: 'clk-hi',
      type: 'CLOCK',
      label: 'Clock',
      enabled: true,
      signalName: 'clk',
      width: 1,
      polarity: 'active-high',
      defaultHz: 30,
    };
    const loClk: ClockComponentConfig = {
      ...hiClk,
      id: 'clk-lo',
      polarity: 'active-low',
    };

    expect(computeInitialInputSignals([hiClk], ports)).toEqual({ clk: 0n });
    expect(computeInitialInputSignals([loClk], ports)).toEqual({ clk: 1n });
  });

  it('makeCycleStepper drives 1 -> 0 for active-high polarity', () => {
    const { runtime, edgeLog, state } = makeMockModel(0);
    const step = runtime.makeCycleStepper('clk', 'active-high');
    step();
    step();
    expect(edgeLog).toEqual([1, 0, 1, 0]);
    expect(state.clk).toBe(0);
  });

  it('makeCycleStepper drives 0 -> 1 for active-low polarity (idles high)', () => {
    const { runtime, edgeLog, state } = makeMockModel(1);
    const step = runtime.makeCycleStepper('clk', 'active-low');
    step();
    step();
    expect(edgeLog).toEqual([0, 1, 0, 1]);
    expect(state.clk).toBe(1);
  });
});
