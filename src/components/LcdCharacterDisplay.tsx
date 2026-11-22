import React from 'react';
import { AlertTriangle, Monitor } from 'lucide-react';
import {
  ComponentValidationIssue,
  LcdBacklightTheme,
  LcdCharacterComponentConfig,
} from '../types/hardwareConfig';
import { getLcdDisplayView, LcdState } from '../config/lcdController';
import { TranslationDict } from '../i18n/translations';

interface LcdCharacterDisplayProps {
  config: LcdCharacterComponentConfig;
  state: LcdState;
  signals: Record<string, bigint>;
  issues: ComponentValidationIssue[];
  t: TranslationDict;
}

const BACKLIGHT_STYLES: Record<
  LcdBacklightTheme,
  {
    screenBg: string;
    screenOffBg: string;
    cellBg: string;
    text: string;
    cursor: string;
    border: string;
    glow: string;
  }
> = {
  green: {
    screenBg: 'bg-[#8fb826]',
    screenOffBg: 'bg-[#4f6319]',
    cellBg: 'bg-[#7ea61d]/45',
    text: 'text-[#142304]',
    cursor: 'border-b-2 border-[#142304]',
    border: 'border-[#4d6612]',
    glow: 'shadow-[inset_0_2px_12px_rgba(0,0,0,0.45),0_0_18px_rgba(163,230,53,0.18)]',
  },
  amber: {
    screenBg: 'bg-[#d98a16]',
    screenOffBg: 'bg-[#6b440b]',
    cellBg: 'bg-[#bf750d]/45',
    text: 'text-[#241200]',
    cursor: 'border-b-2 border-[#241200]',
    border: 'border-[#7c4c07]',
    glow: 'shadow-[inset_0_2px_12px_rgba(0,0,0,0.45),0_0_18px_rgba(245,158,11,0.2)]',
  },
  blue: {
    screenBg: 'bg-[#174ea6]',
    screenOffBg: 'bg-[#0e2954]',
    cellBg: 'bg-[#123d85]/55',
    text: 'text-[#e8f4ff]',
    cursor: 'border-b-2 border-[#e8f4ff]',
    border: 'border-[#0c2d64]',
    glow: 'shadow-[inset_0_2px_12px_rgba(0,0,0,0.55),0_0_18px_rgba(56,189,248,0.2)]',
  },
};

export const LcdCharacterDisplay: React.FC<LcdCharacterDisplayProps> = ({
  config,
  state,
  signals,
  issues,
  t,
}) => {
  const theme = BACKLIGHT_STYLES[config.backlight] ?? BACKLIGHT_STYLES.green;
  const view = getLcdDisplayView(state);

  const dataVal = Number((signals[config.dataSignalName] ?? 0n) & 0xffn);
  const rsVal = Number((signals[config.rsSignalName] ?? 0n) & 1n);
  const rwVal = config.rwSignalName
    ? Number((signals[config.rwSignalName] ?? 0n) & 1n)
    : 0;
  const enVal = Number((signals[config.enSignalName] ?? 0n) & 1n);

  return (
    <div
      className={`bg-slate-950/90 border rounded-xl p-4 shadow-inner ${
        issues.length > 0 ? 'border-amber-500/60' : 'border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-100">{config.label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
            HD44780 16×2
          </span>
          {issues.length > 0 && (
            <AlertTriangle
              className="w-3.5 h-3.5 text-amber-400"
              aria-label={issues[0].message}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <span>
            {t.lcdWritesLabel}: <b className="text-emerald-300">{state.writeCount}</b>
          </span>
          <span>
            {t.lcdDisplayStateLabel}:{' '}
            <b className={state.displayOn ? 'text-emerald-300' : 'text-slate-500'}>
              {state.displayOn ? t.onLabel : t.offLabel}
            </b>
          </span>
          {state.lastCommand !== null && (
            <span>
              CMD:{' '}
              <b className="text-amber-300">
                0x{state.lastCommand.toString(16).toUpperCase().padStart(2, '0')}
              </b>
            </span>
          )}
        </div>
      </div>

      {/* Realistic LCD PCB + Metal Bezel */}
      <div className="bg-emerald-950/50 border-2 border-emerald-800/60 rounded-xl p-3 relative">
        <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-amber-400/70 absolute top-1.5 left-1.5" />
        <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-amber-400/70 absolute top-1.5 right-1.5" />
        <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-amber-400/70 absolute bottom-1.5 left-1.5" />
        <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-amber-400/70 absolute bottom-1.5 right-1.5" />

        {/* Dark metallic bezel */}
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-2.5 mx-1.5 shadow-lg">
          {/* Backlit LCD glass */}
          <div
            data-testid="lcd-screen"
            className={`rounded border-2 ${theme.border} ${
              state.displayOn ? theme.screenBg : theme.screenOffBg
            } ${theme.glow} px-3 py-2.5 transition-colors`}
          >
            <div className="space-y-1.5 font-mono">
              {view.lines.map((rowChars, rIdx) => (
                <div
                  key={rIdx}
                  data-testid={`lcd-row-${rIdx}`}
                  className="grid grid-cols-16 gap-1"
                  style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                >
                  {rowChars.map((ch, cIdx) => {
                    const isCursor =
                      view.cursor !== null &&
                      view.cursor.row === rIdx &&
                      view.cursor.col === cIdx;
                    return (
                      <div
                        key={cIdx}
                        className={`h-7 sm:h-8 flex items-center justify-center rounded-[2px] text-sm sm:text-base font-bold leading-none select-none ${
                          theme.cellBg
                        } ${theme.text} ${isCursor ? theme.cursor : ''}`}
                      >
                        {ch === ' ' ? '\u00A0' : ch}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live Bus Pinout Strip */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {config.dataSignalName || 'data'}:{' '}
            <b className="text-cyan-300">
              0x{dataVal.toString(16).toUpperCase().padStart(2, '0')}
            </b>
          </span>
          <span>
            {config.rsSignalName || 'rs'}:{' '}
            <b className={rsVal ? 'text-emerald-300' : 'text-amber-300'}>{rsVal}</b>
          </span>
          <span>
            {config.rwSignalName || 'rw'}: <b className="text-slate-200">{rwVal}</b>
          </span>
          <span>
            {config.enSignalName || 'en'}:{' '}
            <b className={enVal ? 'text-emerald-300' : 'text-slate-400'}>{enVal}</b>
          </span>
        </div>
        {config.rstSignalName && (
          <span>
            {config.rstSignalName} ({config.rstPolarity})
          </span>
        )}
      </div>
    </div>
  );
};
