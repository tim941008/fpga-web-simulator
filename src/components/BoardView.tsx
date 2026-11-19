import React from 'react';
import {
  ComponentValidationIssue,
  HardwareComponentConfig,
  KeyComponentConfig,
  LedColorTheme,
  LedComponentConfig,
  SevenSegmentComponentConfig,
  SwitchComponentConfig,
} from '../types/hardwareConfig';
import {
  getOrderedBitIndices,
  isRawBitActive,
  logicalStateToRawBit,
} from '../config/hardwareMapping';
import { SevenSegmentDisplay } from './SevenSegmentDisplay';
import { Cpu, Sliders, Radio, ToggleLeft, AlertTriangle } from 'lucide-react';
import { TranslationDict } from '../i18n/translations';
import { UiTheme } from '../config/uiPreferences';

interface BoardViewProps {
  topModule: string;
  boardName: string;
  components: HardwareComponentConfig[];
  signals: Record<string, bigint>;
  validationIssues: ComponentValidationIssue[];
  t: TranslationDict;
  theme?: UiTheme;
  onToggleInputBit: (signalName: string, bitIndex: number) => void;
  onSetInputBit: (signalName: string, bitIndex: number, bitVal: 0 | 1) => void;
}

const LED_ON_STYLES: Record<LedColorTheme, string> = {
  rose: 'bg-rose-500 border-rose-200 shadow-[0_0_12px_#f43f5e]',
  emerald: 'bg-emerald-400 border-emerald-200 shadow-[0_0_12px_#34d399]',
  amber: 'bg-amber-400 border-amber-200 shadow-[0_0_12px_#fbbf24]',
  cyan: 'bg-cyan-400 border-cyan-200 shadow-[0_0_12px_#22d3ee]',
  violet: 'bg-violet-400 border-violet-200 shadow-[0_0_12px_#a78bfa]',
};

export const BoardView: React.FC<BoardViewProps> = ({
  topModule,
  boardName,
  components,
  signals,
  validationIssues,
  t,
  theme = 'warm-lab',
  onToggleInputBit,
  onSetInputBit,
}) => {
  const isWarm = theme === 'warm-lab';
  const enabled = components.filter((c) => c.enabled);
  const hexComps = enabled.filter(
    (c): c is SevenSegmentComponentConfig => c.type === 'SEVEN_SEGMENT'
  );
  const ledComps = enabled.filter(
    (c): c is LedComponentConfig => c.type === 'LED'
  );
  const switchComps = enabled.filter(
    (c): c is SwitchComponentConfig => c.type === 'SWITCH'
  );
  const keyComps = enabled.filter(
    (c): c is KeyComponentConfig => c.type === 'KEY'
  );

  const issueByCompId = new Map<string, ComponentValidationIssue[]>();
  for (const issue of validationIssues) {
    const list = issueByCompId.get(issue.componentId) ?? [];
    list.push(issue);
    issueByCompId.set(issue.componentId, list);
  }

  return (
    <div
      className={`border-2 rounded-2xl p-5 shadow-2xl relative overflow-hidden ${
        isWarm
          ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/25 border-amber-500/35'
          : 'bg-gradient-to-br from-emerald-950/60 via-slate-900 to-indigo-950/40 border-emerald-600/40'
      }`}
    >
      {/* PCB Corner Mounting Holes */}
      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-amber-400/70 absolute top-3 left-3 shadow-inner" />
      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-amber-400/70 absolute top-3 right-3 shadow-inner" />
      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-amber-400/70 absolute bottom-3 left-3 shadow-inner" />
      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-amber-400/70 absolute bottom-3 right-3 shadow-inner" />

      {/* Board Header Silkscreen */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b px-2 ${
          isWarm ? 'border-amber-500/25' : 'border-emerald-700/40'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl bg-slate-950 border flex items-center justify-center shadow-inner ${
              isWarm ? 'border-amber-500/40' : 'border-emerald-500/40'
            }`}
          >
            <Cpu className={`w-6 h-6 ${isWarm ? 'text-amber-400' : 'text-emerald-400'}`} />
          </div>
          <div>
            <div
              className={`text-xs font-mono uppercase tracking-widest font-bold ${
                isWarm ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {boardName || t.boardSubtitle}
            </div>
            <div className="text-sm font-semibold text-slate-100">
              {t.topEntityLabel}{' '}
              <span className={`font-mono ${isWarm ? 'text-amber-200' : 'text-cyan-300'}`}>
                {topModule}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* 1. 7-Segment Displays */}
        {hexComps.length > 0 && (
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-rose-300 mb-2.5 flex items-center gap-1.5 font-semibold">
              <Radio className="w-3.5 h-3.5 text-rose-400" />
              <span>{t.sectionHex}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {hexComps.map((comp) => (
                <SevenSegmentDisplay
                  key={comp.id}
                  label={comp.label}
                  signalName={comp.signalName}
                  value={signals[comp.signalName] ?? 0n}
                  width={comp.width}
                  polarity={comp.polarity}
                  segmentMap={comp.segmentMap}
                  showDecimalPoint={comp.showDecimalPoint}
                  color={comp.color}
                  hasIssue={(issueByCompId.get(comp.id)?.length ?? 0) > 0}
                />
              ))}
            </div>
          </div>
        )}

        {/* 2. Discrete LEDs */}
        {ledComps.length > 0 && (
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-amber-300 mb-2.5 flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-[0_0_8px_#f43f5e]" />
              <span>{t.sectionLeds}</span>
            </div>
            <div className="space-y-3">
              {ledComps.map((comp) => {
                const indices = getOrderedBitIndices(comp.width, comp.bitOrder);
                const sigVal = signals[comp.signalName] ?? 0n;
                const issues = issueByCompId.get(comp.id) ?? [];

                return (
                  <div
                    key={comp.id}
                    className={`bg-slate-950/85 border rounded-xl p-3.5 shadow-inner ${
                      issues.length > 0 ? 'border-amber-500/60' : 'border-slate-800'
                    }`}
                  >
                    <div className="text-xs font-mono text-slate-300 mb-2.5 flex flex-wrap justify-between gap-2">
                      <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                        {comp.label}
                        <span className="text-slate-400 font-normal">
                          ({comp.signalName}[{comp.width - 1}:0] • {comp.bitOrder} •{' '}
                          {comp.polarity === 'active-low'
                            ? t.activeLowShort
                            : t.activeHighShort}
                          )
                        </span>
                        {issues.length > 0 && (
                          <AlertTriangle
                            className="w-3.5 h-3.5 text-amber-400"
                            aria-label={issues[0].message}
                          />
                        )}
                      </span>
                      <span className="text-cyan-300">
                        0x{sigVal.toString(16).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {indices.map((bitIdx) => {
                        const on = isRawBitActive(sigVal, bitIdx, comp.polarity);
                        const bitLabel = comp.bitLabels?.[bitIdx]?.trim();
                        return (
                          <div
                            key={bitIdx}
                            title={`${comp.signalName}[${bitIdx}] (${comp.polarity})`}
                            className="flex flex-col items-center min-w-[40px]"
                          >
                            <div
                              className={`w-5 h-5 rounded-full border transition-all duration-75 ${
                                on
                                  ? LED_ON_STYLES[comp.color] ?? LED_ON_STYLES.rose
                                  : 'bg-slate-900 border-slate-700'
                              }`}
                            />
                            <span className="text-[10px] font-mono text-slate-300 mt-1">
                              {bitLabel || `[${bitIdx}]`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Slide Switches and Push Buttons */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Slide Switches */}
          <div className="lg:col-span-2 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-cyan-300 flex items-center gap-1.5 font-semibold">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.sectionSwitches}</span>
            </div>

            {switchComps.length === 0 ? (
              <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                {t.noSwConfigured}
              </div>
            ) : (
              switchComps.map((comp) => {
                const indices = getOrderedBitIndices(comp.width, comp.bitOrder);
                const sigVal = signals[comp.signalName] ?? 0n;
                const issues = issueByCompId.get(comp.id) ?? [];

                return (
                  <div
                    key={comp.id}
                    className={`bg-slate-950/85 border rounded-xl p-3.5 shadow-inner ${
                      issues.length > 0 ? 'border-amber-500/60' : 'border-cyan-500/20'
                    }`}
                  >
                    <div className="text-[11px] font-mono text-slate-400 mb-2.5 flex flex-wrap justify-between gap-2">
                      <span className="text-cyan-300 font-semibold flex items-center gap-1.5">
                        {comp.label} ({comp.signalName}[{comp.width - 1}:0])
                        {issues.length > 0 && (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </span>
                      <span>
                        {comp.bitOrder} •{' '}
                        {comp.polarity === 'active-low'
                          ? t.activeLowShort
                          : t.activeHighShort}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {indices.map((bitIdx) => {
                        const active = isRawBitActive(sigVal, bitIdx, comp.polarity);
                        const rawBit = Number((sigVal >> BigInt(bitIdx)) & 1n);
                        const bitLabel = comp.bitLabels?.[bitIdx]?.trim();
                        return (
                          <button
                            key={bitIdx}
                            type="button"
                            onClick={() => onToggleInputBit(comp.signalName, bitIdx)}
                            title={`${comp.signalName}[${bitIdx}] — ${t.clickToToggle}`}
                            className="flex flex-col items-center group focus:outline-none min-w-[38px]"
                          >
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
                              {bitLabel || `${comp.signalName}[${bitIdx}]`}
                            </span>
                            <span
                              className={`text-[9px] font-mono font-bold ${
                                active ? 'text-emerald-400' : 'text-slate-500'
                              }`}
                            >
                              {rawBit}
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

            {keyComps.length === 0 ? (
              <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                {t.noKeyConfigured}
              </div>
            ) : (
              keyComps.map((comp) => {
                const indices = getOrderedBitIndices(comp.width, comp.bitOrder);
                const sigVal = signals[comp.signalName] ?? 0n;
                const issues = issueByCompId.get(comp.id) ?? [];

                return (
                  <div
                    key={comp.id}
                    className={`bg-slate-950/85 border rounded-xl p-3.5 shadow-inner ${
                      issues.length > 0 ? 'border-amber-500/60' : 'border-amber-500/20'
                    }`}
                  >
                    <div className="text-[11px] font-mono text-slate-400 mb-2.5 flex flex-wrap justify-between gap-1">
                      <span className="text-amber-300 font-semibold flex items-center gap-1">
                        {comp.label} ({comp.signalName})
                        {issues.length > 0 && (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </span>
                      <span>
                        {comp.behavior === 'momentary' ? t.momentaryShort : t.toggleShort} •{' '}
                        {comp.polarity === 'active-low'
                          ? t.activeLowShort
                          : t.activeHighShort}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {indices.map((bitIdx) => {
                        const pressed = isRawBitActive(sigVal, bitIdx, comp.polarity);
                        const rawBit = Number((sigVal >> BigInt(bitIdx)) & 1n);
                        const bitLabel = comp.bitLabels?.[bitIdx]?.trim();
                        const pressedRaw = logicalStateToRawBit(true, comp.polarity);
                        const releasedRaw = logicalStateToRawBit(false, comp.polarity);

                        return (
                          <div key={bitIdx} className="flex flex-col items-center">
                            <button
                              type="button"
                              onMouseDown={() => {
                                if (comp.behavior === 'momentary') {
                                  onSetInputBit(comp.signalName, bitIdx, pressedRaw);
                                } else {
                                  onToggleInputBit(comp.signalName, bitIdx);
                                }
                              }}
                              onMouseUp={() => {
                                if (comp.behavior === 'momentary') {
                                  onSetInputBit(comp.signalName, bitIdx, releasedRaw);
                                }
                              }}
                              onMouseLeave={() => {
                                if (comp.behavior === 'momentary' && pressed) {
                                  onSetInputBit(comp.signalName, bitIdx, releasedRaw);
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
                              {bitLabel || `${comp.signalName}[${bitIdx}]`}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {t.valLabel} {rawBit}
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
