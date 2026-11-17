import React, { useState } from 'react';
import { Grid, Sparkles, Trash2 } from 'lucide-react';
import { TranslationDict } from '../i18n/translations';

interface MatrixViewerProps {
  matrixBuffer: number[][];
  rowSignalName: string | null;
  colSignalName: string | null;
  rowValue: bigint;
  colValue: bigint;
  povEnabled: boolean;
  invertColPolarity: boolean;
  isConnected: boolean;
  t: TranslationDict;
  onTogglePov: () => void;
  onToggleInvertCol: () => void;
  onClearBuffer: () => void;
}

type LedColorTheme = 'emerald' | 'rose' | 'amber' | 'cyan';

export const MatrixViewer: React.FC<MatrixViewerProps> = ({
  matrixBuffer,
  rowSignalName,
  colSignalName,
  rowValue,
  colValue,
  povEnabled,
  invertColPolarity,
  isConnected,
  t,
  onTogglePov,
  onToggleInvertCol,
  onClearBuffer,
}) => {
  const [colorTheme, setColorTheme] = useState<LedColorTheme>('emerald');

  const colorMap: Record<LedColorTheme, { rgb: string; glow: string }> = {
    emerald: { rgb: '52, 211, 153', glow: '#10b981' },
    rose: { rgb: '244, 63, 94', glow: '#f43f5e' },
    amber: { rgb: '251, 191, 36', glow: '#f59e0b' },
    cyan: { rgb: '34, 211, 238', glow: '#06b6d4' },
  };

  const activeTheme = colorMap[colorTheme];

  return (
    <div className="bg-gradient-to-b from-slate-900/95 to-indigo-950/30 border border-indigo-500/30 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-indigo-500/20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Grid className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              {t.matrixTitle}
            </h2>
            {!isConnected && (
              <div className="text-[10px] font-mono text-amber-300/90">
                {t.matrixUnconnected}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {(['emerald', 'rose', 'amber', 'cyan'] as LedColorTheme[]).map((theme) => (
            <button
              key={theme}
              onClick={() => setColorTheme(theme)}
              title={`LED Color: ${theme}`}
              className={`w-4 h-4 rounded-full border transition ${
                colorTheme === theme
                  ? 'border-white scale-110'
                  : 'border-transparent opacity-60 hover:opacity-90'
              }`}
              style={{ backgroundColor: colorMap[theme].glow }}
            />
          ))}
        </div>
      </div>

      {/* 16x16 LED Grid */}
      <div className="flex justify-center my-auto">
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 shadow-inner inline-block">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
          >
            {matrixBuffer.map((rowArr, rIdx) =>
              rowArr.map((intensity, cIdx) => {
                const clamped = Math.max(0, Math.min(1, intensity));
                const isLit = clamped > 0.08;
                return (
                  <div
                    key={`${rIdx}-${cIdx}`}
                    title={`Row ${rIdx}, Col ${15 - cIdx}`}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full transition-colors duration-75"
                    style={{
                      backgroundColor: isLit
                        ? `rgba(${activeTheme.rgb}, ${0.25 + clamped * 0.75})`
                        : '#0f172a',
                      boxShadow:
                        clamped > 0.45
                          ? `0 0 ${Math.round(clamped * 8)}px ${activeTheme.glow}`
                          : 'none',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer Status & Controls */}
      <div className="mt-4 pt-3 border-t border-indigo-500/20 space-y-2.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-400">
          <div>
            ROW ({rowSignalName ?? 'ROW[15:0]'}):{' '}
            <span className="text-emerald-300 font-semibold">
              0x{rowValue.toString(16).toUpperCase().padStart(4, '0')}
            </span>
          </div>
          <div>
            COL ({colSignalName ?? 'COL[15:0]'}):{' '}
            <span className="text-cyan-300 font-semibold">
              0x{colValue.toString(16).toUpperCase().padStart(4, '0')}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onTogglePov}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono text-[11px] transition ${
                povEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/45 text-emerald-200'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              {t.povHold} {povEnabled ? t.onLabel : t.offLabel}
            </button>

            <button
              onClick={onToggleInvertCol}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 font-mono text-[11px] text-cyan-200 transition"
            >
              {t.colPolarity}{' '}
              {invertColPolarity ? t.activeLowShort : t.activeHighShort}
            </button>
          </div>

          <button
            onClick={onClearBuffer}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-[11px] transition"
          >
            <Trash2 className="w-3 h-3" />
            {t.clearBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
