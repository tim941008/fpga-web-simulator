import React from 'react';
import { Play, Pause, StepForward, RotateCcw, Cpu, Activity, Hammer, Loader2, Square, Zap } from 'lucide-react';
import { BATCH_SIZES, EngineStats, formatCount, formatElapsed, RATE_PRESETS_HZ } from '../sim/simulationEngine';
import { TranslationDict } from '../i18n/translations';
import { UiTheme } from '../config/uiPreferences';

export type BackendMode = 'verilator-wasm' | 'verilator-js' | 'none';

interface ClockControlsProps {
  running: boolean;
  paused: boolean;
  /** Target clock in Hz; Infinity = run at maximum speed */
  rateHz: number;
  stats: EngineStats;
  batchRunning: boolean;
  cycleCount: number;
  clockLevel: 0 | 1;
  clockSignalName: string | null;
  backendMode: BackendMode;
  compiling: boolean;
  t: TranslationDict;
  theme?: UiTheme;
  onCompile: () => void;
  onToggleRun: () => void;
  onStepFullCycle: () => void;
  onStepHalfCycle: () => void;
  onReset: () => void;
  onChangeRate: (hz: number) => void;
  onRunBatch: (cycles: number) => void;
  onStop: () => void;
}

export const ClockControls: React.FC<ClockControlsProps> = ({
  running,
  paused,
  rateHz,
  stats,
  batchRunning,
  cycleCount,
  clockLevel,
  clockSignalName,
  backendMode,
  compiling,
  t,
  theme = 'warm-lab',
  onCompile,
  onToggleRun,
  onStepFullCycle,
  onStepHalfCycle,
  onReset,
  onChangeRate,
  onRunBatch,
  onStop,
}) => {
  const ready = backendMode !== 'none' && !compiling;
  const hasClock = clockSignalName !== null;
  const isWarm = theme === 'warm-lab';

  return (
    <div
      className={`bg-slate-900/95 border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl ${
        isWarm
          ? 'border-amber-500/30 shadow-amber-950/15'
          : 'border-indigo-500/25 shadow-indigo-950/20'
      }`}
    >
      {/* Left: Engine & Clock Status */}
      <div className="flex flex-wrap items-center gap-3.5">
        <div
          className={`flex items-center gap-2.5 bg-slate-950/90 border px-3.5 py-2 rounded-xl shadow-inner ${
            isWarm ? 'border-amber-500/35' : 'border-emerald-500/30'
          }`}
        >
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center ${
              isWarm
                ? 'bg-amber-500/15 border-amber-500/35'
                : 'bg-emerald-500/15 border-emerald-500/30'
            }`}
          >
            <Cpu className={`w-4 h-4 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {t.simBackend}
            </div>
            <div
              className={`text-xs font-mono font-semibold ${
                isWarm ? 'text-amber-300' : 'text-emerald-300'
              }`}
            >
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

        <div
          className={`flex items-center gap-3 bg-slate-950/90 border px-3.5 py-2 rounded-xl shadow-inner ${
            isWarm ? 'border-orange-500/30' : 'border-cyan-500/25'
          }`}
        >
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition ${
              clockLevel === 1
                ? 'bg-amber-500/20 border-amber-400/50'
                : 'bg-slate-900 border-slate-700'
            }`}
          >
            <Activity
              className={`w-4 h-4 ${
                clockLevel === 1
                  ? 'text-amber-400'
                  : isWarm
                  ? 'text-orange-300'
                  : 'text-cyan-400'
              }`}
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {t.clockLabel} (
              <span className={`font-mono ${isWarm ? 'text-amber-300' : 'text-cyan-300'}`}>
                {clockSignalName ?? t.clockCombinational}
              </span>
              )
            </div>
            <div className="text-xs font-mono flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  clockLevel === 1
                    ? isWarm
                      ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                      : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-slate-600'
                }`}
              />
              <span className="text-slate-200">
                {clockLevel === 1 ? t.clockHigh : t.clockLow}
              </span>
              <span className="text-slate-600">|</span>
              <span className={`font-semibold ${isWarm ? 'text-amber-300' : 'text-cyan-300'}`}>
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
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 border transition shadow-sm ${
            isWarm
              ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-200 border-orange-500/45'
              : 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border-violet-500/40'
          }`}
        >
          {compiling ? (
            <Loader2 className={`w-3.5 h-3.5 animate-spin ${isWarm ? 'text-orange-300' : 'text-violet-300'}`} />
          ) : (
            <Hammer className={`w-3.5 h-3.5 ${isWarm ? 'text-orange-300' : 'text-violet-300'}`} />
          )}
          {t.compileBtn}
        </button>

        <button
          onClick={onToggleRun}
          disabled={!ready || !hasClock}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-40 shadow-sm ${
            running
              ? 'bg-orange-500/25 text-orange-200 border border-orange-400/50 hover:bg-orange-500/35'
              : isWarm
              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
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
              {paused ? t.resumeClock : t.runClock}
            </>
          )}
        </button>

        <button
          onClick={onStop}
          disabled={!running && !paused}
          title={t.stopTooltip}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 disabled:opacity-40 text-rose-200 border border-rose-500/40 transition"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          {t.stopClock}
        </button>

        <button
          onClick={onStepFullCycle}
          disabled={running || !ready || !hasClock}
          title={t.stepCycleTooltip}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 border transition ${
            isWarm
              ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/40'
              : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-500/35'
          }`}
        >
          <StepForward className={`w-3.5 h-3.5 ${isWarm ? 'text-amber-300' : 'text-cyan-300'}`} />
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
      <div className="flex flex-col gap-2 bg-slate-950/90 border border-slate-800 px-3.5 py-2 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">{t.freqLabel}</span>
          <select
            disabled={!hasClock}
            value={Number.isFinite(rateHz) ? String(rateHz) : 'max'}
            onChange={(e) => onChangeRate(e.target.value === 'max' ? Infinity : Number(e.target.value))}
            className={`bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono disabled:opacity-40 ${
              isWarm ? 'text-amber-300' : 'text-emerald-300'
            }`}
          >
            {Number.isFinite(rateHz) &&
              !(RATE_PRESETS_HZ as readonly number[]).includes(rateHz) && (
                <option value={rateHz}>
                  {rateHz >= 1000 ? `${rateHz / 1000} kHz` : `${rateHz} Hz`}
                </option>
              )}
            {RATE_PRESETS_HZ.map((hz) => (
              <option key={hz} value={hz}>
                {hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}
              </option>
            ))}
            <option value="max">{t.unlimitedSpeed}</option>
          </select>
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] text-slate-500">{t.runBatchLabel}</span>
          {BATCH_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              disabled={!ready || !hasClock || running || paused || batchRunning}
              onClick={() => onRunBatch(n)}
              title={`Run ${formatCount(n)} cycles, update outputs when done`}
              className={`px-1.5 py-1 rounded-md text-[10px] font-mono bg-slate-900 disabled:opacity-40 text-slate-200 border ${
                isWarm
                  ? 'border-slate-700 hover:border-amber-500/50 hover:text-amber-200'
                  : 'border-slate-700 hover:bg-slate-800'
              }`}
            >
              {n >= 1000 ? `${n / 1000}k` : n}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] font-mono text-slate-300">
          <span>
            {t.statsCycle} <b className={isWarm ? 'text-amber-300' : 'text-cyan-300'}>{formatCount(stats.cycle)}</b>
          </span>
          <span>
            {t.statsSpeed} <b className={isWarm ? 'text-orange-300' : 'text-emerald-300'}>{formatCount(stats.cyclesPerSec)}</b> {t.statsCyclesPerSec}
          </span>
          <span>
            {t.statsElapsed} <b className="text-slate-100">{formatElapsed(stats.elapsedMs)}</b>
          </span>
          <span className="text-slate-400">{stats.state}</span>
        </div>
      </div>
    </div>
  );
};
