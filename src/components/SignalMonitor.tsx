import React, { useState } from 'react';
import { PinAssignment, PortDefinition, SignalHistoryEntry } from '../types/fpga';
import { Activity, Binary } from 'lucide-react';

interface SignalMonitorProps {
  signalDefs: PortDefinition[];
  signals: Record<string, bigint>;
  history: SignalHistoryEntry[];
  pinAssignments: PinAssignment[];
}

type RadixMode = 'hex' | 'bin' | 'dec';

export const SignalMonitor: React.FC<SignalMonitorProps> = ({
  signalDefs,
  signals,
  history,
  pinAssignments,
}) => {
  const [radix, setRadix] = useState<RadixMode>('hex');

  const formatValue = (val: bigint, width: number): string => {
    const mask = (1n << BigInt(width)) - 1n;
    const masked = val & mask;
    if (radix === 'hex') {
      const digits = Math.ceil(width / 4);
      return '0x' + masked.toString(16).toUpperCase().padStart(digits, '0');
    }
    if (radix === 'bin') {
      return '0b' + masked.toString(2).padStart(Math.min(width, 16), '0');
    }
    return masked.toString(10);
  };

  const getPinSummaryForSignal = (baseName: string): string => {
    const matches = pinAssignments.filter((p) => p.baseName === baseName);
    if (matches.length === 0) return 'Internal / Virtual';
    if (matches.length === 1) return matches[0].pinLocation;
    return `${matches[0].pinLocation} .. ${matches[matches.length - 1].pinLocation} (${matches.length} pins)`;
  };

  const recentHistory = history.slice(-24);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Signal Monitor & Logic Waveform Analyzer
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs font-mono">
          <Binary className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1" />
          {(['hex', 'bin', 'dec'] as RadixMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setRadix(mode)}
              className={`px-2.5 py-0.5 rounded uppercase transition ${
                radix === mode
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
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
              <th className="py-2 px-3">Signal</th>
              <th className="py-2 px-2">Dir</th>
              <th className="py-2 px-2">Width</th>
              <th className="py-2 px-3">QSF Pin Mapping</th>
              <th className="py-2 px-3">Current Value</th>
              <th className="py-2 px-3 min-w-[260px]">Waveform Trace (Last 24 Steps)</th>
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
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                        def.direction === 'input'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : def.direction === 'output'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
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
                    <div className="bg-slate-950 border border-slate-800/90 rounded px-2 py-1">
                      {recentHistory.length === 0 ? (
                        <span className="text-slate-600 text-[10px]">
                          Step or run clock to capture waveform
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
                        <div className="flex items-center gap-0.5 overflow-hidden">
                          {recentHistory.slice(-8).map((h, idx) => {
                            const busVal = h.values[def.name] ?? 0n;
                            return (
                              <span
                                key={idx}
                                className="px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-emerald-300"
                              >
                                { busVal.toString(16).toUpperCase() }
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
