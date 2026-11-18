import React, { useState } from 'react';
import { BoardControlGroup } from '../types/fpga';
import { SevenSegmentDisplay } from './SevenSegmentDisplay';
import { Cpu, Sliders, Radio, ToggleLeft } from 'lucide-react';
import { TranslationDict } from '../i18n/translations';

interface BoardViewProps {
  topModule: string;
  groups: BoardControlGroup[];
  signals: Record<string, bigint>;
  t: TranslationDict;
  onToggleInputBit: (signalName: string, bitIndex: number) => void;
  onSetInputBit: (signalName: string, bitIndex: number, bitVal: 0 | 1) => void;
}

export const BoardView: React.FC<BoardViewProps> = ({
  topModule,
  groups,
  signals,
  t,
  onToggleInputBit,
  onSetInputBit,
}) => {
  const [hexActiveLow, setHexActiveLow] = useState<boolean>(true);
  const [keyMomentary, setKeyMomentary] = useState<boolean>(true);

  const hexGroups = groups
    .filter((g) => g.category === 'HEX')
    .sort((a, b) => b.componentId.localeCompare(a.componentId));
  const redLedGroups = groups.filter((g) => g.category === 'LEDR');
  const greenLedGroups = groups.filter((g) => g.category === 'LEDG');
  const swGroups = groups.filter((g) => g.category === 'SW');
  const keyGroups = groups.filter((g) => g.category === 'KEY');

  const getBit = (sigName: string, bitOffset: number): boolean => {
    const val = signals[sigName] ?? 0n;
    return ((val >> BigInt(bitOffset)) & 1n) === 1n;
  };

  const buildVisibleBits = (group: BoardControlGroup): Array<{ displayBit: number; runtimeBit: number }> => {
    const count = Math.min(group.width, group.maxWidth);
    const items: Array<{ displayBit: number; runtimeBit: number }> = [];
    for (let offset = count - 1; offset >= 0; offset--) {
      items.push({
        displayBit: group.lsb + offset,
        runtimeBit: offset,
      });
    }
    return items;
  };

  const renderLedBank = (
    group: BoardControlGroup,
    color: 'red' | 'green'
  ) => {
    const isGreen = color === 'green';
    const visibleBits = buildVisibleBits(group);
    const isClamped = group.width > group.maxWidth;

    return (
      <div
        key={`${group.componentId}-${group.baseName}`}
        className="bg-slate-950/85 border border-slate-800 rounded-xl p-3.5 shadow-inner"
      >
        <div className="text-xs font-mono text-slate-300 mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={isGreen ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
              {group.componentId}
            </span>
            <span className="text-slate-500">←</span>
            <span className="font-semibold text-slate-200">
              {group.baseName}
              {group.width > 1 ? `[${group.msb}:${group.lsb}]` : ''}
            </span>
            {isClamped && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300">
                {group.maxWidth}/{group.width}-bit ({t.widthClampedBadge})
              </span>
            )}
          </div>
          <span className="text-cyan-300">
            0x{(signals[group.baseName] ?? 0n).toString(16).toUpperCase()}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {visibleBits.map(({ displayBit, runtimeBit }) => {
            const on = getBit(group.baseName, runtimeBit);
            return (
              <div
                key={displayBit}
                title={`${group.componentId}[${runtimeBit}] ← ${group.baseName}${group.width > 1 ? `[${displayBit}]` : ''}`}
                className="flex flex-col items-center min-w-[38px]"
              >
                <div
                  className={`w-5 h-5 rounded-full border transition-all duration-75 ${
                    on
                      ? isGreen
                        ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_12px_#34d399]'
                        : 'bg-rose-500 border-rose-200 shadow-[0_0_12px_#f43f5e]'
                      : 'bg-slate-900 border-slate-700'
                  }`}
                />
                <span className="text-[10px] font-mono text-slate-300 mt-1">
                  [{displayBit}]
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-br from-emerald-950/60 via-slate-900 to-indigo-950/40 border-2 border-emerald-600/40 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
      {/* PCB Corner Mounting Holes */}
      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-amber-400/70 absolute top-3 left-3 shadow-inner" />
      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-amber-400/70 absolute top-3 right-3 shadow-inner" />
      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-amber-400/70 absolute bottom-3 left-3 shadow-inner" />
      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-amber-400/70 absolute bottom-3 right-3 shadow-inner" />

      {/* Board Header Silkscreen */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-emerald-700/40 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-950 border border-emerald-500/40 flex items-center justify-center shadow-inner">
            <Cpu className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold">
              {t.boardDefaultFamily} • {t.boardDefaultPart}
            </div>
            <div className="text-sm font-semibold text-slate-100">
              {t.topEntityLabel}{' '}
              <span className="font-mono text-cyan-300">{topModule}</span>
            </div>
          </div>
        </div>

        {/* Polarity & Button Mode Toggles */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setHexActiveLow((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-rose-500/35 font-mono text-rose-200 transition"
          >
            {t.segPolarityLabel} {hexActiveLow ? t.segActiveLow : t.segActiveHigh}
          </button>
          <button
            onClick={() => setKeyMomentary((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-amber-500/35 font-mono text-amber-200 transition"
          >
            {t.keyModeLabel} {keyMomentary ? t.keyMomentary : t.keyToggle}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* 1. 7-Segment Displays (HEX) */}
        {hexGroups.length > 0 && (
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-rose-300 mb-2.5 flex items-center gap-1.5 font-semibold">
              <Radio className="w-3.5 h-3.5 text-rose-400" />
              <span>{t.sectionHex}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {hexGroups.map((group) => (
                <SevenSegmentDisplay
                  key={`${group.componentId}-${group.baseName}`}
                  slotLabel={group.componentId}
                  portName={group.baseName}
                  value={signals[group.baseName] ?? 0n}
                  activeLow={hexActiveLow}
                />
              ))}
            </div>
          </div>
        )}

        {/* 2a. Red LEDs (LEDR) */}
        {redLedGroups.length > 0 && (
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-rose-300 mb-2.5 flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-[0_0_8px_#f43f5e]" />
              <span>{t.sectionRedLeds}</span>
            </div>
            <div className="space-y-3">
              {redLedGroups.map((group) => renderLedBank(group, 'red'))}
            </div>
          </div>
        )}

        {/* 2b. Green LEDs (LEDG) */}
        {greenLedGroups.length > 0 && (
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-300 mb-2.5 flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_#34d399]" />
              <span>{t.sectionGreenLeds}</span>
            </div>
            <div className="space-y-3">
              {greenLedGroups.map((group) => renderLedBank(group, 'green'))}
            </div>
          </div>
        )}

        {hexGroups.length === 0 &&
          redLedGroups.length === 0 &&
          greenLedGroups.length === 0 && (
            <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              {t.noOutputsHint}
            </div>
          )}

        {/* 3. Slide Switches (SW) and Push Buttons (KEY) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Slide Switches */}
          <div className="lg:col-span-2 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-cyan-300 flex items-center gap-1.5 font-semibold">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.sectionSwitches}</span>
            </div>

            {swGroups.length === 0 ? (
              <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                {t.noSwDetected}
              </div>
            ) : (
              swGroups.map((group) => {
                const visibleBits = buildVisibleBits(group);
                const isClamped = group.width > group.maxWidth;

                return (
                  <div
                    key={`${group.componentId}-${group.baseName}`}
                    className="bg-slate-950/85 border border-cyan-500/20 rounded-xl p-3.5 shadow-inner"
                  >
                    <div className="text-[11px] font-mono text-slate-400 mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="text-cyan-300 font-semibold">SW</span> →{' '}
                        <span className="text-slate-200 font-semibold">
                          {group.baseName}
                          {group.width > 1 ? `[${group.msb}:${group.lsb}]` : ''}
                        </span>
                      </span>
                      {isClamped && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300">
                          {group.maxWidth}/{group.width}-bit ({t.widthClampedBadge})
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {visibleBits.map(({ displayBit, runtimeBit }) => {
                        const active = getBit(group.baseName, runtimeBit);
                        return (
                          <button
                            key={displayBit}
                            type="button"
                            onClick={() => onToggleInputBit(group.baseName, runtimeBit)}
                            title={`SW${runtimeBit} → ${group.baseName}${group.width > 1 ? `[${displayBit}]` : ''} — ${t.clickToToggle}`}
                            className="flex flex-col items-center group focus:outline-none"
                          >
                            {/* Physical Slide Switch Track */}
                            <div
                              className={`w-7 h-12 rounded-md p-1 flex flex-col justify-between border transition ${
                                active
                                  ? 'bg-emerald-950/90 border-emerald-400/80'
                                  : 'bg-slate-900 border-slate-700 hover:border-cyan-500/50'
                              }`}
                            >
                              <div
                                className={`w-full h-4 rounded-sm transition-all ${
                                  active
                                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                                    : 'bg-transparent'
                                }`}
                              />
                              <div
                                className={`w-full h-4 rounded-sm transition-all ${
                                  !active ? 'bg-slate-500' : 'bg-transparent'
                                }`}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-slate-200 mt-1 font-semibold">
                              SW{runtimeBit}
                            </span>
                            <span
                              className={`text-[9px] font-mono font-bold ${
                                active ? 'text-emerald-400' : 'text-slate-500'
                              }`}
                            >
                              {active ? '1' : '0'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Push Buttons (KEY) */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-amber-300 flex items-center gap-1.5 font-semibold">
              <ToggleLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.sectionButtons}</span>
            </div>

            {keyGroups.length === 0 ? (
              <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                {t.noKeyDetected}
              </div>
            ) : (
              keyGroups.map((group) => {
                const visibleBits = buildVisibleBits(group);
                const isClamped = group.width > group.maxWidth;

                return (
                  <div
                    key={`${group.componentId}-${group.baseName}`}
                    className="bg-slate-950/85 border border-amber-500/20 rounded-xl p-3.5 shadow-inner"
                  >
                    <div className="text-[11px] font-mono text-slate-400 mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="text-amber-300 font-semibold">KEY</span> →{' '}
                        <span className="text-slate-200 font-semibold">
                          {group.baseName}
                          {group.width > 1 ? `[${group.msb}:${group.lsb}]` : ''}
                        </span>
                      </span>
                      {isClamped && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300">
                          {group.maxWidth}/{group.width}-bit
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {visibleBits.map(({ displayBit, runtimeBit }) => {
                        const pressed = getBit(group.baseName, runtimeBit);

                        return (
                          <div key={displayBit} className="flex flex-col items-center">
                            <button
                              type="button"
                              onMouseDown={() => {
                                if (keyMomentary) {
                                  onSetInputBit(group.baseName, runtimeBit, 1);
                                } else {
                                  onToggleInputBit(group.baseName, runtimeBit);
                                }
                              }}
                              onMouseUp={() => {
                                if (keyMomentary) {
                                  onSetInputBit(group.baseName, runtimeBit, 0);
                                }
                              }}
                              onMouseLeave={() => {
                                if (keyMomentary && pressed) {
                                  onSetInputBit(group.baseName, runtimeBit, 0);
                                }
                              }}
                              className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition transform ${
                                pressed
                                  ? 'bg-amber-500 border-amber-200 scale-95 shadow-[0_0_14px_#f59e0b]'
                                  : 'bg-slate-800 border-slate-600 hover:border-amber-400/60'
                              }`}
                            >
                              <div
                                className={`w-6 h-6 rounded-full ${
                                  pressed ? 'bg-slate-950' : 'bg-amber-400/90'
                                }`}
                              />
                            </button>
                            <span className="text-[11px] font-mono text-slate-200 mt-1.5 font-semibold">
                              KEY{runtimeBit}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {t.valLabel} {pressed ? '1' : '0'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
