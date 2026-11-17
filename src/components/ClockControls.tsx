import React from 'react';
import { Play, Pause, StepForward, RotateCcw, Cpu, Activity, Hammer, Loader2 } from 'lucide-react';
import { TranslationDict } from '../i18n/translations';

export type BackendMode = 'verilator-wasm' | 'verilator-js' | 'none';

interface ClockControlsProps {
  running: boolean;
  clockHz: number;
  cycleCount: number;
  clockLevel: 0 | 1;
  clockSignalName: string | null;
  backendMode: BackendMode;
  compiling: boolean;
  t: TranslationDict;
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
  t,
  onCompile,
  onToggleRun,
  onStepFullCycle,
  onStepHalfCycle,
  onReset,
  onChangeClockHz,
}) => {
  const ready = backendMode !== 'none' && !compiling;
  const hasClock = clockSignalName !== null;

  return (
    <div className="bg-slate-900/95 border border-indigo-500/25 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl shadow-indigo-950/20">
      {/* Left: Engine & Clock Status */}
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex items-center gap-2.5 bg-slate-950/90 border border-emerald-500/30 px-3.5 py-2 rounded-xl shadow-inner">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {t.simBackend}
            </div>
            <div className="text-xs font-mono text-emerald-300 font-semibold">
              {compiling
                ? t.backendCompiling
                : backendMode === 'verilator-wasm'
                ? t.backendWasm
                : backendMode === 'verilator-js'
                ? t.backendJs
                : t.backendNone}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-950/90 border border-cyan-500/25 px-3.5 py-2 rounded-xl shadow-inner">
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition ${
              clockLevel === 1
                ? 'bg-amber-500/20 border-amber-400/50'
                : 'bg-slate-900 border-slate-700'
            }`}
          >
            <Activity
              className={`w-4 h-4 ${
                clockLevel === 1 ? 'text-amber-400' : 'text-cyan-400'
              }`}
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {t.clockLabel} (
              <span className="text-cyan-300 font-mono">
                {clockSignalName ?? t.clockCombinational}
              </span>
              )
            </div>
            <div className="text-xs font-mono flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  clockLevel === 1
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-slate-600'
                }`}
              />
              <span className="text-slate-200">
                {clockLevel === 1 ? t.clockHigh : t.clockLow}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-300 font-semibold">
                {t.cycleLabel} #{cycleCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Compile + Transport */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onCompile}
          disabled={compiling}
          title={t.compileTooltip}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-violet-500/20 hover:bg-violet-500/30 disabled:opacity-50 text-violet-200 border border-violet-500/40 transition shadow-sm"
        >
          {compiling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300" />
          ) : (
            <Hammer className="w-3.5 h-3.5 text-violet-300" />
          )}
          {t.compileBtn}
        </button>

        <button
          onClick={onToggleRun}
          disabled={!ready || !hasClock}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-40 shadow-sm ${
            running
              ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50 hover:bg-amber-500/35'
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
          }`}
        >
          {running ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              {t.pauseClock}
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              {t.runClock}
            </>
          )}
        </button>

        <button
          onClick={onStepFullCycle}
          disabled={running || !ready || !hasClock}
          title={t.stepCycleTooltip}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-40 text-cyan-200 border border-cyan-500/35 transition"
        >
          <StepForward className="w-3.5 h-3.5 text-cyan-300" />
          {t.stepCycle}
        </button>

        <button
          onClick={onStepHalfCycle}
          disabled={running || !ready || !hasClock}
          title={t.stepEdgeTooltip}
          className="px-3 py-2 rounded-xl text-xs font-mono font-medium bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 transition"
        >
          {t.stepEdge}
        </button>

        <button
          onClick={onReset}
          disabled={!ready}
          title={t.resetTooltip}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-200 border border-rose-500/35 transition"
        >
          <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
          {t.resetBtn}
        </button>
      </div>

      {/* Right: Clock Speed */}
      <div className="flex items-center gap-2.5 bg-slate-950/90 border border-slate-800 px-3.5 py-2 rounded-xl">
        <span className="text-xs text-slate-400 font-medium">{t.freqLabel}</span>
        <input
          type="range"
          min={1}
          max={1000}
          disabled={!hasClock}
          value={clockHz}
          onChange={(e) => onChangeClockHz(Number(e.target.value))}
          className="w-28 accent-emerald-400 cursor-pointer disabled:opacity-40"
        />
        <span className="text-xs font-mono text-emerald-400 font-semibold w-16 text-right">
          {clockHz} Hz
        </span>
      </div>
    </div>
  );
};
