import React from 'react';
import {
  Plus,
  Trash2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { PortDefinition } from '../types/fpga';
import {
  BitOrder,
  ComponentValidationIssue,
  HardwareComponentConfig,
  HardwareComponentType,
  HardwareConfigSchema,
  KeyBehavior,
  LedColorTheme,
  MatrixBitOrder,
  SevenSegmentBitMap,
  SignalPolarity,
} from '../types/hardwareConfig';
import { createNewComponentConfig } from '../config/defaultHardwareConfig';
import { createDefaultMatrixPattern } from '../config/matrixMapping';
import { TranslationDict } from '../i18n/translations';

interface HardwareConfigPanelProps {
  config: HardwareConfigSchema;
  ports: PortDefinition[];
  validationIssues: ComponentValidationIssue[];
  t: TranslationDict;
  onChangeConfig: (next: HardwareConfigSchema) => void;
  onRestoreDefaults: () => void;
}

const COMPONENT_TYPES: HardwareComponentType[] = [
  'CLOCK',
  'SWITCH',
  'KEY',
  'LED',
  'SEVEN_SEGMENT',
  'MATRIX',
];

const COLORS: LedColorTheme[] = ['rose', 'emerald', 'amber', 'cyan', 'violet'];

export const HardwareConfigPanel: React.FC<HardwareConfigPanelProps> = ({
  config,
  ports,
  validationIssues,
  t,
  onChangeConfig,
  onRestoreDefaults,
}) => {
  const inputPorts = ports.filter((p) => p.direction === 'input' || p.direction === 'inout');
  const outputPorts = ports.filter((p) => p.direction === 'output' || p.direction === 'inout');

  const updateComponent = (id: string, updated: HardwareComponentConfig) => {
    onChangeConfig({
      ...config,
      components: config.components.map((c) => (c.id === id ? updated : c)),
    });
  };

  const removeComponent = (id: string) => {
    onChangeConfig({
      ...config,
      components: config.components.filter((c) => c.id !== id),
    });
  };

  const addComponent = (type: HardwareComponentType) => {
    const newComp = createNewComponentConfig(type, ports, config.components.length);
    onChangeConfig({
      ...config,
      components: [...config.components, newComp],
    });
  };

  const renderSignalSelect = (
    value: string,
    candidatePorts: PortDefinition[],
    onSelect: (sigName: string, port?: PortDefinition) => void
  ) => (
    <div className="flex gap-1.5">
      <select
        value={candidatePorts.some((p) => p.name === value) ? value : '__custom__'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom__') return;
          const found = candidatePorts.find((p) => p.name === v);
          onSelect(v, found);
        }}
        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
      >
        <option value="">{t.selectSignalPlaceholder}</option>
        {candidatePorts.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name} ({p.width}-bit {p.direction})
          </option>
        ))}
        {value && !candidatePorts.some((p) => p.name === value) && (
          <option value="__custom__">Custom: {value}</option>
        )}
      </select>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const name = e.target.value;
          const found = ports.find((p) => p.name === name);
          onSelect(name, found);
        }}
        placeholder="Signal name"
        className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
      />
    </div>
  );

  return (
    <div className="bg-slate-900/95 border border-cyan-500/25 rounded-2xl p-5 space-y-5 shadow-xl">
      {/* Header & Add Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            {t.configPanelTitle}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{t.configPanelSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={onRestoreDefaults}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t.restoreDefaultsBtn}
        </button>
      </div>

      {/* Add Component Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono text-slate-400">{t.addComponentLabel}</span>
        {COMPONENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addComponent(type)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/35 transition"
          >
            <Plus className="w-3 h-3" />
            {type}
          </button>
        ))}
      </div>

      {/* Validation Summary */}
      <div
        className={`rounded-xl border p-3 text-xs font-mono ${
          validationIssues.length === 0
            ? 'border-emerald-500/35 bg-emerald-950/20 text-emerald-300'
            : 'border-amber-500/45 bg-amber-950/25 text-amber-200'
        }`}
      >
        {validationIssues.length === 0 ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{t.validationOk}</span>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              {t.validationIssuesTitle} ({validationIssues.length})
            </div>
            {validationIssues.map((issue, idx) => (
              <div
                key={`${issue.componentId}-${issue.field}-${idx}`}
                className={issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}
              >
                • [{issue.code}] {issue.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Component Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {config.components.map((comp) => {
          const compIssues = validationIssues.filter((i) => i.componentId === comp.id);
          return (
            <div
              key={comp.id}
              className={`bg-slate-950/80 border rounded-xl p-4 space-y-3 ${
                compIssues.length > 0 ? 'border-amber-500/50' : 'border-slate-800'
              }`}
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/35">
                    {comp.type}
                  </span>
                  <input
                    type="text"
                    value={comp.label}
                    onChange={(e) =>
                      updateComponent(comp.id, { ...comp, label: e.target.value })
                    }
                    className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs font-semibold text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={comp.enabled}
                      onChange={(e) =>
                        updateComponent(comp.id, { ...comp, enabled: e.target.checked })
                      }
                      className="accent-emerald-400"
                    />
                    {t.enabledLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => removeComponent(comp.id)}
                    className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition"
                    title={t.removeBtn}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Type-Specific Settings */}
              {comp.type !== 'MATRIX' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {t.signalField}
                    </label>
                    {renderSignalSelect(
                      comp.signalName,
                      comp.type === 'LED' || comp.type === 'SEVEN_SEGMENT'
                        ? outputPorts
                        : inputPorts,
                      (sigName, found) =>
                        updateComponent(comp.id, {
                          ...comp,
                          signalName: sigName,
                          width: found ? found.width : comp.width,
                          ...(comp.type === 'KEY' && found
                            ? {
                                initialPressed: Array.from(
                                  { length: found.width },
                                  (_, idx) => comp.initialPressed[idx] ?? false
                                ),
                              }
                            : {}),
                        })
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {t.widthField}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={comp.width}
                      onChange={(e) => {
                        const w = Math.max(1, Math.min(64, Number(e.target.value) || 1));
                        updateComponent(comp.id, {
                          ...comp,
                          width: w,
                          ...(comp.type === 'KEY'
                            ? {
                                initialPressed: Array.from(
                                  { length: w },
                                  (_, idx) => comp.initialPressed[idx] ?? false
                                ),
                              }
                            : {}),
                        });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {t.polarityField}
                    </label>
                    <select
                      value={comp.polarity}
                      onChange={(e) =>
                        updateComponent(comp.id, {
                          ...comp,
                          polarity: e.target.value as SignalPolarity,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                    >
                      <option value="active-high">{t.activeHighShort}</option>
                      <option value="active-low">{t.activeLowShort}</option>
                    </select>
                  </div>

                  {comp.type !== 'CLOCK' && (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {t.bitOrderField}
                      </label>
                      <select
                        value={comp.bitOrder}
                        onChange={(e) =>
                          updateComponent(comp.id, {
                            ...comp,
                            bitOrder: e.target.value as BitOrder,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                      >
                        <option value="msb-to-lsb">MSB → LSB</option>
                        <option value="lsb-to-msb">LSB → MSB</option>
                      </select>
                    </div>
                  )}

                  {comp.type === 'SWITCH' && (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {t.initialValueField}
                      </label>
                      <input
                        type="text"
                        value={comp.initialValue}
                        onChange={(e) =>
                          updateComponent(comp.id, {
                            ...comp,
                            initialValue: e.target.value,
                          })
                        }
                        placeholder="0 or 0x0F"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                      />
                    </div>
                  )}

                  {comp.type === 'KEY' && (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {t.behaviorField}
                      </label>
                      <select
                        value={comp.behavior}
                        onChange={(e) =>
                          updateComponent(comp.id, {
                            ...comp,
                            behavior: e.target.value as KeyBehavior,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                      >
                        <option value="momentary">{t.momentaryShort}</option>
                        <option value="toggle">{t.toggleShort}</option>
                      </select>
                    </div>
                  )}

                  {(comp.type === 'LED' || comp.type === 'SEVEN_SEGMENT') && (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {t.colorField}
                      </label>
                      <select
                        value={comp.color}
                        onChange={(e) =>
                          updateComponent(comp.id, {
                            ...comp,
                            color: e.target.value as LedColorTheme,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                      >
                        {COLORS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(comp.type === 'SWITCH' || comp.type === 'KEY' || comp.type === 'LED') && (
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {t.bitLabelsField}
                      </label>
                      <input
                        type="text"
                        value={(comp.bitLabels ?? []).join(', ')}
                        onChange={(e) => {
                          const labels = e.target.value
                            .split(',')
                            .map((s) => s.trim());
                          updateComponent(comp.id, {
                            ...comp,
                            bitLabels: labels.every((s) => !s) ? undefined : labels,
                          });
                        }}
                        placeholder="e.g. RST, EN, MODE0"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-slate-100"
                      />
                    </div>
                  )}

                  {comp.type === 'SEVEN_SEGMENT' && (
                    <div className="sm:col-span-2 space-y-2 border-t border-slate-800 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-300 font-semibold">
                          {t.segmentMapTitle}
                        </span>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={comp.showDecimalPoint}
                            onChange={(e) =>
                              updateComponent(comp.id, {
                                ...comp,
                                showDecimalPoint: e.target.checked,
                                segmentMap: {
                                  ...comp.segmentMap,
                                  dp: e.target.checked ? comp.segmentMap.dp ?? 7 : null,
                                },
                              })
                            }
                            className="accent-emerald-400"
                          />
                          {t.showDpLabel}
                        </label>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                        {(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as Array<
                          keyof SevenSegmentBitMap
                        >).map((seg) => (
                          <div key={seg} className="flex flex-col">
                            <span className="text-[10px] font-mono text-slate-400 uppercase">
                              {seg}
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={63}
                              disabled={seg === 'dp' && !comp.showDecimalPoint}
                              value={comp.segmentMap[seg] ?? ''}
                              onChange={(e) => {
                                const val =
                                  e.target.value === '' ? null : Number(e.target.value);
                                updateComponent(comp.id, {
                                  ...comp,
                                  segmentMap: {
                                    ...comp.segmentMap,
                                    [seg]: seg === 'dp' ? val : val ?? 0,
                                  },
                                });
                              }}
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-slate-100 disabled:opacity-40"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* MATRIX Independent Row & Column Configuration */
                <div className="space-y-3 text-xs">
                  {/* Row Axis */}
                  <div className="bg-slate-900/70 border border-emerald-500/25 rounded-lg p-3 space-y-2">
                    <div className="text-[11px] font-mono font-bold text-emerald-300">
                      {t.rowAxisTitle}
                    </div>
                    {renderSignalSelect(comp.row.signalName, outputPorts, (sigName, found) =>
                      updateComponent(comp.id, {
                        ...comp,
                        row: {
                          ...comp.row,
                          signalName: sigName,
                          width: found ? found.width : comp.row.width,
                        },
                      })
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          {t.widthField}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={16}
                          value={comp.row.width}
                          onChange={(e) =>
                            updateComponent(comp.id, {
                              ...comp,
                              row: {
                                ...comp.row,
                                width: Math.max(1, Math.min(16, Number(e.target.value) || 16)),
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          {t.bitOrderField}
                        </label>
                        <select
                          value={comp.row.bitOrder}
                          onChange={(e) =>
                            updateComponent(comp.id, {
                              ...comp,
                              row: {
                                ...comp.row,
                                bitOrder: e.target.value as MatrixBitOrder,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono"
                        >
                          <option value="15-to-0">15 → 0 (Top=15)</option>
                          <option value="0-to-15">0 → 15 (Top=0)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          {t.polarityField}
                        </label>
                        <select
                          value={comp.row.polarity}
                          onChange={(e) =>
                            updateComponent(comp.id, {
                              ...comp,
                              row: {
                                ...comp.row,
                                polarity: e.target.value as SignalPolarity,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono"
                        >
                          <option value="active-high">{t.activeHighShort}</option>
                          <option value="active-low">{t.activeLowShort}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Column Axis */}
                  <div className="bg-slate-900/70 border border-cyan-500/25 rounded-lg p-3 space-y-2">
                    <div className="text-[11px] font-mono font-bold text-cyan-300">
                      {t.colAxisTitle}
                    </div>
                    {renderSignalSelect(comp.col.signalName, outputPorts, (sigName, found) =>
                      updateComponent(comp.id, {
                        ...comp,
                        col: {
                          ...comp.col,
                          signalName: sigName,
                          width: found ? found.width : comp.col.width,
                        },
                      })
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          {t.widthField}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={16}
                          value={comp.col.width}
                          onChange={(e) =>
                            updateComponent(comp.id, {
                              ...comp,
                              col: {
                                ...comp.col,
                                width: Math.max(1, Math.min(16, Number(e.target.value) || 16)),
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          {t.bitOrderField}
                        </label>
                        <select
                          value={comp.col.bitOrder}
                          onChange={(e) =>
                            updateComponent(comp.id, {
                              ...comp,
                              col: {
                                ...comp.col,
                                bitOrder: e.target.value as MatrixBitOrder,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono"
                        >
                          <option value="15-to-0">15 → 0 (Left=15)</option>
                          <option value="0-to-15">0 → 15 (Left=0)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          {t.polarityField}
                        </label>
                        <select
                          value={comp.col.polarity}
                          onChange={(e) =>
                            updateComponent(comp.id, {
                              ...comp,
                              col: {
                                ...comp.col,
                                polarity: e.target.value as SignalPolarity,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono"
                        >
                          <option value="active-high">{t.activeHighShort}</option>
                          <option value="active-low">{t.activeLowShort}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Matrix Pattern Restore */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">{t.colorField}:</span>
                      <select
                        value={comp.color}
                        onChange={(e) =>
                          updateComponent(comp.id, {
                            ...comp,
                            color: e.target.value as LedColorTheme,
                          })
                        }
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono"
                      >
                        {COLORS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateComponent(comp.id, {
                          ...comp,
                          pattern: createDefaultMatrixPattern(),
                        })
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/35 text-violet-200 text-[11px] font-mono transition"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t.matrixRestorePattern}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
