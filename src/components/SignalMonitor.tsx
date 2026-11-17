import React, { useState } from 'react';
import { PinAssignment, PortDefinition, SignalHistoryEntry } from '../types/fpga';
import { Activity, Binary } from 'lucide-react';
import { TranslationDict } from '../i18n/translations';

interface SignalMonitorProps {
  signalDefs: PortDefinition[];
  signals: Record<string, bigint>;
  history: SignalHistoryEntry[];
  pinAssignments: PinAssignment[];
  t: TranslationDict;
}

type RadixMode = 'hex' | 'bin' | 'dec';

export const SignalMonitor: React.FC<SignalMonitorProps> = ({
  signalDefs,
  signals,
  history,
  pinAssignments,
  t,
}) => {
  const [radix, setRadix] = useState<RadixMode>('hex');

  // Fixes BUG-006: Pad binary representation to full declared bit width
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

  const getPinSummaryForSignal = (baseName: string): string => {
    const matches = pinAssignments.filter((p) => p.baseName === baseName);
    if (matches.length === 0) return t.internalVirtual;
    if (matches.length === 1) return matches[0].pinLocation;
    return `${matches[0].pinLocation} .. ${matches[matches.length - 1].pinLocation} (${matches.length} ${t.pinsUnit})`;
  };

  const recentHistory = history.slice(-24);

  return (
    <div className="bg-slate-900/95 border border-cyan-500/25 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-cyan-500/20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <h2 className="text-sm font-semibold text-slate-100">
            {t.signalMonitorTitle}
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs font-mono">
          <Binary className="w-3.5 h-3.5 text-cyan-400 ml-1.5 mr-1" />
          {(['hex', 'bin', 'dec'] as RadixMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setRadix(mode)}
              className={`px-2.5 py-1 rounded-lg uppercase font-semibold transition ${
                radix === mode
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
              <th className="py-2 px-3">{t.colSignal}</th>
              <th className="py-2 px-2">{t.colDirection}</th>
              <th className="py-2 px-2">{t.colWidth}</th>
              <th className="py-2 px-3">{t.colQsfPin}</th>
              <th className="py-2 px-3">{t.colCurrentVal}</th>
              <th className="py-2 px-3 min-w-[260px]">{t.colWaveform}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {signalDefs.map((def) => {
              const val = signals[def.name] ?? 0n;
              const isSingleBit = def.width === 1;

              return (
                <tr key={def.name} className="hover:bg-slate-800/40 transition">
                  <td className="py-2.5 px-3 font-semibold text-slate-100">
                    {def.name}
                    {def.width > 1 ? `[${def.msb}:${def.lsb}]` : ''}
                  </td>
                  <td className="py-2.5 px-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-semibold ${
                        def.direction === 'input'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/35'
                          : def.direction === 'output'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                          : 'bg-violet-500/15 text-violet-300 border border-violet-500/35'
                      }`}
                    >
                      {def.direction === 'inout' ? 'reg/wire' : def.direction}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-slate-400">{def.width}-bit</td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                    {getPinSummaryForSignal(def.name)}
                  </td>
                  <td className="py-2.5 px-3 text-cyan-300 font-semibold">
                    {formatValue(val, def.width)}
                  </td>
                  <td className="py-2.5 px-3">
                    {/* Render SVG Digital Waveform */}
                    <div className="bg-slate-950 border border-slate-800/90 rounded-lg px-2 py-1">
                      {recentHistory.length <= 1 ? (
                        <span className="text-slate-500 text-[10px]">
                          {t.emptyWaveformHint}
                        </span>
                      ) : isSingleBit ? (
                        <svg width="240" height="22" className="overflow-visible">
                          {recentHistory.map((h, idx) => {
                            const bit = Number((h.values[def.name] ?? 0n) & 1n);
                            const prevBit =
                              idx > 0
                                ? Number((recentHistory[idx - 1].values[def.name] ?? 0n) & 1n)
                                : bit;
                            const x1 = idx * 10;
                            const x2 = (idx + 1) * 10;
                            const y = bit === 1 ? 4 : 18;
                            const prevY = prevBit === 1 ? 4 : 18;
                            return (
                              <g key={idx}>
                                {idx > 0 && prevY !== y && (
                                  <line
                                    x1={x1}
                                    y1={prevY}
                                    x2={x1}
                                    y2={y}
                                    stroke="#34d399"
                                    strokeWidth="1.5"
                                  />
                                )}
                                <line
                                  x1={x1}
                                  y1={y}
                                  x2={x2}
                                  y2={y}
                                  stroke={bit === 1 ? '#34d399' : '#64748b'}
                                  strokeWidth="1.8"
                                />
                              </g>
                            );
                          })}
                        </svg>
                      ) : (
                        <div className="flex items-center gap-1 overflow-x-auto">
                          {recentHistory.slice(-8).map((h, idx) => {
                            const busVal = h.values[def.name] ?? 0n;
                            return (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 bg-slate-900 border border-cyan-500/30 rounded text-[10px] text-emerald-300 whitespace-nowrap"
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
