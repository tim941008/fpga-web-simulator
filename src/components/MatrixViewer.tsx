import React from 'react';
import { Grid, Sparkles, Trash2, RotateCcw } from 'lucide-react';
import { TranslationDict } from '../i18n/translations';
import { UiTheme } from '../config/uiPreferences';
import {
  LedColorTheme,
  MatrixComponentConfig,
} from '../types/hardwareConfig';
import {
  createDefaultMatrixPattern,
  mapMatrixColToBit,
  mapMatrixRowToBit,
} from '../config/matrixMapping';

interface MatrixViewerProps {
  config: MatrixComponentConfig;
  matrixBuffer: number[][];
  rowValue: bigint;
  colValue: bigint;
  isConnected: boolean;
  t: TranslationDict;
  theme?: UiTheme;
  onUpdateConfig: (updated: MatrixComponentConfig) => void;
  onClearBuffer: () => void;
}

const COLOR_MAP: Record<LedColorTheme, { rgb: string; glow: string }> = {
  emerald: { rgb: '52, 211, 153', glow: '#10b981' },
  rose: { rgb: '244, 63, 94', glow: '#f43f5e' },
  amber: { rgb: '251, 191, 36', glow: '#f59e0b' },
  cyan: { rgb: '34, 211, 238', glow: '#06b6d4' },
  violet: { rgb: '167, 139, 250', glow: '#8b5cf6' },
};

export const MatrixViewer: React.FC<MatrixViewerProps> = ({
  config,
  matrixBuffer,
  rowValue,
  colValue,
  isConnected,
  t,
  theme = 'warm-lab',
  onUpdateConfig,
  onClearBuffer,
}) => {
  const isWarm = theme === 'warm-lab';
  const activeTheme = COLOR_MAP[config.color] ?? COLOR_MAP.emerald;

  const handleTogglePatternPixel = (displayRow: number, displayCol: number) => {
    if (config.displayMode !== 'pattern') return;
    const patternRowIdx = mapMatrixRowToBit(displayRow, config.row.bitOrder, config.row.width);
    const colBit = mapMatrixColToBit(displayCol, config.col.bitOrder, config.col.width);
    const nextPattern = [...config.pattern];
    nextPattern[patternRowIdx] = ((nextPattern[patternRowIdx] ?? 0) ^ (1 << colBit)) & 0xffff;
    onUpdateConfig({ ...config, pattern: nextPattern });
  };

  return (
    <div
      className={`border rounded-2xl p-5 shadow-xl flex flex-col justify-between h-full ${
        isWarm
          ? 'bg-gradient-to-b from-slate-900/95 to-amber-950/20 border-amber-500/30'
          : 'bg-gradient-to-b from-slate-900/95 to-indigo-950/30 border-indigo-500/30'
      }`}
    >
      {/* Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b ${
          isWarm ? 'border-amber-500/20' : 'border-indigo-500/20'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center ${
              isWarm
                ? 'bg-amber-500/15 border-amber-500/35'
                : 'bg-emerald-500/15 border-emerald-500/30'
            }`}
          >
            <Grid className={`w-4 h-4 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              {config.label || t.matrixTitle}
            </h2>
            {!isConnected && config.displayMode === 'live' && (
              <div className="text-[10px] font-mono text-amber-300/90">
                {t.matrixUnconnected}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {(['emerald', 'rose', 'amber', 'cyan', 'violet'] as LedColorTheme[]).map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => onUpdateConfig({ ...config, color: theme })}
              title={`LED Color: ${theme}`}
              className={`w-4 h-4 rounded-full border transition ${
                config.color === theme
                  ? 'border-white scale-110'
                  : 'border-transparent opacity-60 hover:opacity-90'
              }`}
              style={{ backgroundColor: COLOR_MAP[theme].glow }}
            />
          ))}
        </div>
      </div>

      {/* Display Mode Switcher: Live Verilog vs UI Preview Pattern */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-[11px] font-mono">
        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => onUpdateConfig({ ...config, displayMode: 'live' })}
            className={`px-2 py-1 rounded-md transition ${
              config.displayMode === 'live'
                ? isWarm
                  ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40'
                  : 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.matrixLiveMode}
          </button>
          <button
            type="button"
            onClick={() => onUpdateConfig({ ...config, displayMode: 'pattern' })}
            className={`px-2 py-1 rounded-md transition ${
              config.displayMode === 'pattern'
                ? 'bg-violet-500/25 text-violet-200 border border-violet-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.matrixPatternMode}
          </button>
        </div>

        {config.displayMode === 'pattern' && (
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({ ...config, pattern: createDefaultMatrixPattern() })
            }
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/35 text-violet-200 transition"
          >
            <RotateCcw className="w-3 h-3" />
            {t.matrixRestorePattern}
          </button>
        )}
      </div>

      {config.displayMode === 'pattern' && (
        <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-violet-950/40 border border-violet-500/30 text-[10px] font-mono text-violet-200">
          {t.matrixPatternNotice}
        </div>
      )}

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
                const rowBit = mapMatrixRowToBit(rIdx, config.row.bitOrder, config.row.width);
                const colBit = mapMatrixColToBit(cIdx, config.col.bitOrder, config.col.width);
                return (
                  <div
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => handleTogglePatternPixel(rIdx, cIdx)}
                    title={`Display (R${rIdx}, C${cIdx}) → Bit (Row[${rowBit}], Col[${colBit}])`}
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full transition-colors duration-75 ${
                      config.displayMode === 'pattern' ? 'cursor-pointer hover:scale-110' : ''
                    }`}
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

      {/* Footer Status & Independent Row/Column Controls */}
      <div className="mt-4 pt-3 border-t border-indigo-500/20 space-y-2.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-400">
          <div>
            ROW ({config.row.signalName || 'unmapped'}):{' '}
            <span className="text-emerald-300 font-semibold">
              0x{rowValue.toString(16).toUpperCase().padStart(4, '0')}
            </span>
          </div>
          <div>
            COL ({config.col.signalName || 'unmapped'}):{' '}
            <span className="text-cyan-300 font-semibold">
              0x{colValue.toString(16).toUpperCase().padStart(4, '0')}
            </span>
          </div>
        </div>

        {/* Independent Row & Column Bit Order Toggles */}
        <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                ...config,
                row: {
                  ...config.row,
                  bitOrder: config.row.bitOrder === '15-to-0' ? '0-to-15' : '15-to-0',
                },
              })
            }
            className="px-2 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-emerald-200 transition text-left"
          >
            {t.rowOrderLabel}{' '}
            <span className="font-bold">
              {config.row.bitOrder === '15-to-0' ? '15→0' : '0→15'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                ...config,
                col: {
                  ...config.col,
                  bitOrder: config.col.bitOrder === '15-to-0' ? '0-to-15' : '15-to-0',
                },
              })
            }
            className="px-2 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-cyan-200 transition text-left"
          >
            {t.colOrderLabel}{' '}
            <span className="font-bold">
              {config.col.bitOrder === '15-to-0' ? '15→0' : '0→15'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                ...config,
                row: {
                  ...config.row,
                  polarity: config.row.polarity === 'active-high' ? 'active-low' : 'active-high',
                },
              })
            }
            className="px-2 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 transition text-left"
          >
            {t.rowPolarityLabel}{' '}
            {config.row.polarity === 'active-low' ? t.activeLowShort : t.activeHighShort}
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                ...config,
                col: {
                  ...config.col,
                  polarity: config.col.polarity === 'active-high' ? 'active-low' : 'active-high',
                },
              })
            }
            className="px-2 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 transition text-left"
          >
            {t.colPolarityLabel}{' '}
            {config.col.polarity === 'active-low' ? t.activeLowShort : t.activeHighShort}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onUpdateConfig({ ...config, povEnabled: !config.povEnabled })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono text-[11px] transition ${
              config.povEnabled
                ? 'bg-emerald-500/20 border-emerald-500/45 text-emerald-200'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Sparkles className="w-3 h-3 text-emerald-400" />
            {t.povHold} {config.povEnabled ? t.onLabel : t.offLabel}
          </button>

          <button
            type="button"
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
