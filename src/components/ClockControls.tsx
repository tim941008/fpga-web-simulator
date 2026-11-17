import React from 'react';
import { Play, Pause, StepForward, RotateCcw, Cpu, Activity, Hammer, Loader2 } from 'lucide-react';

export type BackendMode = 'verilator-wasm' | 'verilator-js' | 'none';

interface ClockControlsProps {
  running: boolean;
  clockHz: number;
  cycleCount: number;
  clockLevel: 0 | 1;
  clockSignalName: string | null;
  backendMode: BackendMode;
  compiling: boolean;
  onCompile: () => void;
  onToggleRun: () => void;
  onStepFullCycle: () => void;
  onStepHalfCycle: () => void;
  onReset: () => void;
  onChangeClockHz: (hz: number) => void;
}

export const ClockControls: React.FC<ClockControlsProps> = ({
  running,
  clockHz,
  cycleCount,
  clockLevel,
  clockSignalName,
  backendMode,
  compiling,
  onCompile,
  onToggleRun,
  onStepFullCycle,
  onStepHalfCycle,
  onReset,
  onChangeClockHz,
}) => {
  const ready = backendMode !== 'none' && !compiling;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
      {/* Left: Engine & Clock Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-lg">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Sim Backend
            </div>
            <div className="text-xs font-mono text-emerald-300 font-medium">
              {compiling
                ? 'Compiling with Verilator…'
                : backendMode === 'verilator-wasm'
                ? 'Verilator → WebAssembly'
                : backendMode === 'verilator-js'
                ? 'Verilator → JS (fallback)'
                : 'Not compiled'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-lg">
          <Activity className={`w-4 h-4 ${clockLevel === 1 ? 'text-amber-400' : 'text-slate-500'}`} />
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              Clock ({clockSignalName ?? 'none / combinational'})
            </div>
            <div className="text-xs font-mono flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  clockLevel === 1 ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
                }`}
              />
              <span className="text-slate-200">{clockLevel === 1 ? 'HIGH (1)' : 'LOW (0)'}</span>
              <span className="text-slate-500">|</span>
              <span className="text-cyan-400">Cycle #{cycleCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Compile + Transport */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCompile}
          disabled={compiling}
          title="Re-run Verilator on the current sources"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-purple-300 border border-purple-500/40 transition"
        >
          {compiling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />}
          Compile
        </button>

        <button
          onClick={onToggleRun}
          disabled={!ready}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-xs transition disabled:opacity-40 ${
            running
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-semibold'
          }`}
        >
          {running ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              Pause Clock
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              Run Clock
            </>
          )}
        </button>

        <button
          onClick={onStepFullCycle}
          disabled={running || !ready}
          title="Advance 1 full clock cycle (0 → 1 → 0)"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 border border-slate-700 transition"
        >
          <StepForward className="w-3.5 h-3.5 text-cyan-400" />
          Step Cycle
        </button>

        <button
          onClick={onStepHalfCycle}
          disabled={running || !ready}
          title="Toggle clock edge (half cycle)"
          className="px-3 py-2 rounded-lg text-xs font-mono bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 transition"
        >
          Step Edge
        </button>

        <button
          onClick={onReset}
          disabled={!ready}
          title="Power-cycle the Verilated model"
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-rose-950/50 hover:bg-rose-900/60 disabled:opacity-40 text-rose-300 border border-rose-800/60 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Right: Clock Speed */}
      <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg">
        <span className="text-xs text-slate-400">Freq:</span>
        <input
          type="range"
          min={1}
          max={1000}
          value={clockHz}
          onChange={(e) => onChangeClockHz(Number(e.target.value))}
          className="w-28 accent-emerald-400 cursor-pointer"
        />
        <span className="text-xs font-mono text-emerald-400 w-16 text-right">{clockHz} Hz</span>
      </div>
    </div>
  );
};
