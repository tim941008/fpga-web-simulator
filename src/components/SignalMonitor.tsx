import React, { useMemo, useState } from 'react';
import { PortDefinition, SignalHistoryEntry } from '../types/fpga';
import { HardwareComponentConfig } from '../types/hardwareConfig';
import { getMappedComponentsForSignal } from '../config/hardwareMapping';
import {
  formatSignalCountSummary,
  loadVisibleSignalLimit,
  parseVisibleSignalLimit,
  saveVisibleSignalLimit,
  sliceVisibleSignals,
  UiTheme,
  VISIBLE_SIGNAL_OPTIONS,
  VisibleSignalLimit,
} from '../config/uiPreferences';
import { Activity, Binary, Eye } from 'lucide-react';
import { TranslationDict } from '../i18n/translations';

interface SignalMonitorProps {
  signalDefs: PortDefinition[];
  signals: Record<string, bigint>;
  history: SignalHistoryEntry[];
  components: HardwareComponentConfig[];
  t: TranslationDict;
  theme?: UiTheme;
}

type RadixMode = 'hex' | 'bin' | 'dec';

export const SignalMonitor: React.FC<SignalMonitorProps> = ({
  signalDefs,
  signals,
  history,
  components,
  t,
  theme = 'warm-lab',
}) => {
  const [radix, setRadix] = useState<RadixMode>('hex');
  const [visibleLimit, setVisibleLimit] = useState<VisibleSignalLimit>(() =>
    loadVisibleSignalLimit()
  );

  const isWarm = theme === 'warm-lab';

  const handleVisibleLimitChange = (raw: string) => {
    const parsed = parseVisibleSignalLimit(raw);
    if (!parsed) return;
    setVisibleLimit(parsed);
    saveVisibleSignalLimit(parsed);
  };

  const visibleSignals = useMemo(
    () => sliceVisibleSignals(signalDefs, visibleLimit),
    [signalDefs, visibleLimit]
  );

  const formatValue = (val: bigint, width: number): string => {
    const mask = (1n << BigInt(width)) - 1n;
    const masked = val & mask;
    if (radix === 'hex') {
      const digits = Math.ceil(width / 4);
      return '0x' + masked.toString(16).toUpperCase().padStart(digits, '0');
    }
    if (radix === 'bin') {
      return '0b' + masked.toString(2).padStart(width, '0');
    }
    return masked.toString(10);
  };

  const recentHistory = history.slice(-24);

  // High-contrast waveform strokes on dark slate-950 (#020617)
  const strokeHigh = isWarm ? '#fbbf24' : '#34d399'; // amber-400 / emerald-400
  const strokeLow = '#94a3b8'; // slate-400 (~6.6:1 contrast on #020617)
  const strokeEdge = isWarm ? '#fb923c' : '#38bdf8'; // orange-400 / sky-400

  return (
    <div
      className={`bg-slate-900/95 border rounded-2xl p-5 shadow-xl ${
        isWarm ? 'border-amber-500/30' : 'border-cyan-500/25'
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b ${
          isWarm ? 'border-amber-500/20' : 'border-cyan-500/20'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center ${
              isWarm
                ? 'bg-amber-500/15 border-amber-500/35'
                : 'bg-cyan-500/15 border-cyan-500/30'
            }`}
          >
            <Activity
              className={`w-4 h-4 ${isWarm ? 'text-amber-400' : 'text-cyan-400'}`}
            />
          </div>
          <h2 className="text-sm font-semibold text-slate-100">
            {t.signalMonitorTitle}
          </h2>
          <span
            className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
              isWarm
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-slate-950 border-slate-700 text-slate-300'
            }`}
          >
            {formatSignalCountSummary(visibleSignals.length, signalDefs.length)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Visible Signals Selector (24 / 48 / 96 / All) */}
          <label
            className={`flex items-center gap-1.5 bg-slate-950 border rounded-xl px-2.5 py-1 text-xs font-mono ${
              isWarm ? 'border-amber-500/30 text-slate-200' : 'border-slate-800 text-slate-300'
            }`}
          >
            <Eye className={`w-3.5 h-3.5 ${isWarm ? 'text-amber-400' : 'text-cyan-400'}`} />
            <span className="text-slate-400">Visible Signals</span>
            <select
              aria-label="Visible Signals"
              value={String(visibleLimit)}
              onChange={(e) => handleVisibleLimitChange(e.target.value)}
              className={`bg-slate-900 border rounded-lg px-2 py-0.5 text-xs font-mono font-semibold focus:outline-none ${
                isWarm
                  ? 'border-amber-500/35 text-amber-200 focus:border-amber-400'
                  : 'border-slate-700 text-cyan-200 focus:border-cyan-400'
              }`}
            >
              {VISIBLE_SIGNAL_OPTIONS.map((opt) => (
                <option key={String(opt)} value={String(opt)}>
                  {opt === 'all' ? 'All' : opt}
                </option>
              ))}
            </select>
          </label>

          {/* Radix Selector */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs font-mono">
            <Binary
              className={`w-3.5 h-3.5 ml-1.5 mr-1 ${
                isWarm ? 'text-amber-400' : 'text-cyan-400'
              }`}
            />
            {(['hex', 'bin', 'dec'] as RadixMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRadix(mode)}
                className={`px-2.5 py-1 rounded-lg uppercase font-semibold transition ${
                  radix === mode
                    ? isWarm
                      ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                      : 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Independent Scrollable Waveform Area (vertical + horizontal) */}
      <div className="max-h-[540px] overflow-auto rounded-xl border border-slate-800/90 bg-slate-950/60">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead className="sticky top-0 z-20 bg-slate-900 shadow-sm">
            <tr className="border-b border-slate-800 text-slate-300 text-[11px] uppercase">
              <th className="py-2.5 px-3 sticky left-0 z-30 bg-slate-900 border-r border-slate-800/90 min-w-[150px]">
                {t.colSignal}
              </th>
              <th className="py-2.5 px-2 whitespace-nowrap">{t.colDirection}</th>
              <th className="py-2.5 px-2 whitespace-nowrap">{t.colWidth}</th>
              <th className="py-2.5 px-3 whitespace-nowrap">{t.colHardwareMap}</th>
              <th className="py-2.5 px-3 whitespace-nowrap">{t.colCurrentVal}</th>
              <th className="py-2.5 px-3 min-w-[290px]">{t.colWaveform}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {visibleSignals.map((def, rowIdx) => {
              const val = signals[def.name] ?? 0n;
              const isSingleBit = def.width === 1;
              const mapped = getMappedComponentsForSignal(def.name, components);
              const isEven = rowIdx % 2 === 0;
              const rowBg = isEven ? 'bg-slate-950' : 'bg-slate-900/90';
              const stickyCellBg = isEven ? 'bg-slate-950' : 'bg-slate-900';

              return (
                <tr
                  key={def.name}
                  className={`${rowBg} ${
                    isWarm ? 'hover:bg-amber-500/10' : 'hover:bg-slate-800/60'
                  } transition-colors`}
                >
                  <td
                    className={`py-2.5 px-3 font-semibold text-slate-100 sticky left-0 z-10 ${stickyCellBg} border-r border-slate-800/80 whitespace-nowrap`}
                  >
                    {def.name}
                    {def.width > 1 ? `[${def.msb}:${def.lsb}]` : ''}
                  </td>
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-semibold ${
                        def.direction === 'input'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : def.direction === 'output'
                          ? isWarm
                            ? 'bg-orange-500/20 text-orange-200 border border-orange-500/40'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                          : 'bg-slate-700/60 text-slate-200 border border-slate-600'
                      }`}
                    >
                      {def.direction === 'inout' ? 'reg/wire' : def.direction}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-slate-300 whitespace-nowrap">
                    {def.width}-bit
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                    {mapped.length > 0 ? (
                      <span className={isWarm ? 'text-amber-300' : 'text-emerald-300'}>
                        {mapped.join(', ')}
                      </span>
                    ) : (
                      t.unmappedSignal
                    )}
                  </td>
                  <td
                    className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                      isWarm ? 'text-amber-200' : 'text-cyan-300'
                    }`}
                  >
                    {formatValue(val, def.width)}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
                      {recentHistory.length <= 1 ? (
                        <span className="text-slate-400 text-[10px]">
                          {t.emptyWaveformHint}
                        </span>
                      ) : isSingleBit ? (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col justify-between h-[24px] text-[9px] leading-none select-none">
                            <span
                              className={
                                isWarm ? 'text-amber-300 font-bold' : 'text-emerald-300 font-bold'
                              }
                            >
                              1
                            </span>
                            <span className="text-slate-400 font-semibold">0</span>
                          </div>
                          <svg width="240" height="24" className="overflow-visible shrink-0">
                            <line
                              x1="0"
                              y1="4"
                              x2="240"
                              y2="4"
                              stroke="#1e293b"
                              strokeDasharray="2 3"
                              strokeWidth="1"
                            />
                            <line
                              x1="0"
                              y1="20"
                              x2="240"
                              y2="20"
                              stroke="#1e293b"
                              strokeDasharray="2 3"
                              strokeWidth="1"
                            />
                            {recentHistory.map((h, idx) => {
                              const bit = Number((h.values[def.name] ?? 0n) & 1n);
                              const prevBit =
                                idx > 0
                                  ? Number(
                                      (recentHistory[idx - 1].values[def.name] ?? 0n) & 1n
                                    )
                                  : bit;
                              const x1 = idx * 10;
                              const x2 = (idx + 1) * 10;
                              const y = bit === 1 ? 4 : 20;
                              const prevY = prevBit === 1 ? 4 : 20;
                              return (
                                <g key={idx}>
                                  {idx > 0 && prevY !== y && (
                                    <line
                                      x1={x1}
                                      y1={prevY}
                                      x2={x1}
                                      y2={y}
                                      stroke={strokeEdge}
                                      strokeWidth="2"
                                    />
                                  )}
                                  <line
                                    x1={x1}
                                    y1={y}
                                    x2={x2}
                                    y2={y}
                                    stroke={bit === 1 ? strokeHigh : strokeLow}
                                    strokeWidth={bit === 1 ? '2.2' : '1.8'}
                                  />
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 overflow-x-auto">
                          {recentHistory.slice(-8).map((h, idx) => {
                            const busVal = h.values[def.name] ?? 0n;
                            return (
                              <span
                                key={idx}
                                className={`px-1.5 py-0.5 bg-slate-900 border rounded text-[10px] whitespace-nowrap font-semibold ${
                                  isWarm
                                    ? 'border-amber-500/40 text-amber-200'
                                    : 'border-cyan-500/30 text-emerald-300'
                                }`}
                              >
                                {formatValue(busVal, def.width)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
