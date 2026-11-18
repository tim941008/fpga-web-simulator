import React from 'react';
import {
  SlidersHorizontal,
  Wand2,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  Info,
} from 'lucide-react';
import {
  BoardComponentId,
  IoValidationSummary,
  PortDefinition,
  PortValidationResult,
} from '../types/fpga';
import {
  BOARD_COMPONENTS,
  BOARD_COMPONENT_MAP,
  checkComponentCompatibility,
  isDirectionCompatible,
} from '../config/ioConfig';
import {
  formatValidationIssue,
  getComponentLabel,
  Language,
  TranslationDict,
} from '../i18n/translations';

interface IoConfigPanelProps {
  topModule: string;
  validation: IoValidationSummary;
  lang: Language;
  t: TranslationDict;
  onAssignPort: (port: PortDefinition, componentId: BoardComponentId | null) => void;
  onAutoAssign: () => void;
  onResetDefaults: () => void;
  onClearAll: () => void;
}

export const IoConfigPanel: React.FC<IoConfigPanelProps> = ({
  topModule,
  validation,
  lang,
  t,
  onAssignPort,
  onAutoAssign,
  onResetDefaults,
  onClearAll,
}) => {
  // Map of componentId -> list of port names currently assigned to it
  const usedByComponent = new Map<BoardComponentId, string[]>();
  for (const res of validation.results) {
    if (res.componentId) {
      const list = usedByComponent.get(res.componentId) ?? [];
      list.push(res.port.name);
      usedByComponent.set(res.componentId, list);
    }
  }

  const renderStatusBadge = (res: PortValidationResult) => {
    const hasWarning = res.issues.some((i) => i.severity === 'warning');

    if (res.status === 'invalid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/45">
          <XCircle className="w-3 h-3 shrink-0" />
          {t.ioStatusInvalid}
        </span>
      );
    }

    if (res.status === 'conflict') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/45">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {t.ioStatusConflict}
        </span>
      );
    }

    if (res.status === 'configured') {
      if (hasWarning) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/45">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {t.ioStatusConfiguredWarn}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          {t.ioStatusConfigured}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700">
        <MinusCircle className="w-3 h-3 shrink-0" />
        {t.ioStatusUnassigned}
      </span>
    );
  };

  const inputSpecs = BOARD_COMPONENTS.filter((c) => c.direction === 'input');
  const outputSpecs = BOARD_COMPONENTS.filter((c) => c.direction === 'output');

  return (
    <div className="bg-slate-900/95 border border-cyan-500/25 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-cyan-500/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center">
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex flex-wrap items-center gap-2">
              <span>{t.ioPanelTitle}</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-950 border border-cyan-500/30 text-cyan-300">
                {topModule}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{t.ioPanelSubtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAutoAssign}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 transition"
          >
            <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
            {t.ioAutoAssignBtn}
          </button>
          <button
            type="button"
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            {t.ioResetBtn}
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/35 transition"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-300" />
            {t.ioClearAllBtn}
          </button>
        </div>
      </div>

      {/* Status Summary Bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300">
          {t.ioSummaryConfigured}: <strong>{validation.configuredCount}</strong>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-300">
          {t.ioSummaryUnassigned}: <strong>{validation.unassignedCount}</strong>
        </span>
        {validation.warningCount > 0 && (
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300">
            {t.ioSummaryWarnings}: <strong>{validation.warningCount}</strong>
          </span>
        )}
        {validation.conflictCount > 0 && (
          <span className="px-2.5 py-1 rounded-lg bg-orange-500/20 border border-orange-500/45 text-orange-300">
            {t.ioSummaryConflicts}: <strong>{validation.conflictCount}</strong>
          </span>
        )}
        {validation.invalidCount > 0 && (
          <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/45 text-rose-300">
            {t.ioSummaryInvalid}: <strong>{validation.invalidCount}</strong>
          </span>
        )}
      </div>

      {/* Resource-level warnings (e.g. partial 16x16 matrix assignment) */}
      {validation.resourceWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/45 bg-amber-950/25 p-3 text-xs space-y-1">
          {validation.resourceWarnings.map((rw) => (
            <div key={rw.code} className="flex items-center gap-2 text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {rw.code === 'MATRIX_MISSING_COL'
                  ? t.ioWarnMatrixMissingCol
                  : t.ioWarnMatrixMissingRow}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Port Configuration Table */}
      {validation.results.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-6 text-center text-xs text-slate-400">
          {t.ioNoPortsDetected}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-mono uppercase">
                <th className="py-2.5 px-3">{t.ioColPortName}</th>
                <th className="py-2.5 px-3">{t.ioColDirection}</th>
                <th className="py-2.5 px-3 text-right">{t.ioColWidth}</th>
                <th className="py-2.5 px-3 min-w-[260px]">{t.ioColComponent}</th>
                <th className="py-2.5 px-3 min-w-[240px]">{t.ioColStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {validation.results.map((res) => {
                const { port, componentId, status, issues, signatureChanged } = res;
                const currentVal = componentId ?? '';

                // Check if current selection is from the opposite direction (e.g. direction changed in Verilog)
                const showPreservedInvalidOption =
                  componentId !== null &&
                  !isDirectionCompatible(
                    port.direction,
                    BOARD_COMPONENT_MAP[componentId].direction
                  );

                const renderOption = (specId: BoardComponentId) => {
                  const compat = checkComponentCompatibility(port, specId);
                  const otherUsers = (usedByComponent.get(specId) ?? []).filter(
                    (n) => n !== port.name
                  );
                  const hasWarn = compat.issues.some((i) => i.severity === 'warning');

                  let label = getComponentLabel(specId, t);
                  if (!compat.allowed) {
                    label += ` — ${t.ioIncompatibleWidthSuffix}`;
                  } else if (hasWarn) {
                    label += ` (${t.ioWidthMismatchSuffix})`;
                  }
                  if (otherUsers.length > 0) {
                    label += ` [${t.ioInUseSuffix}: ${otherUsers.join(', ')}]`;
                  }

                  return (
                    <option
                      key={specId}
                      value={specId}
                      disabled={!compat.allowed && currentVal !== specId}
                    >
                      {label}
                    </option>
                  );
                };

                const rowHighlight =
                  status === 'invalid'
                    ? 'bg-rose-950/20'
                    : status === 'conflict'
                    ? 'bg-orange-950/20'
                    : 'hover:bg-slate-800/35';

                return (
                  <tr key={port.name} className={`transition ${rowHighlight}`}>
                    {/* Port Name */}
                    <td className="py-3 px-3 font-mono font-semibold text-slate-100 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>
                          {port.name}
                          {port.width > 1 ? `[${port.msb}:${port.lsb}]` : ''}
                        </span>
                        {signatureChanged && status === 'invalid' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-normal">
                            {t.ioSignatureChangedTag}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Direction */}
                    <td className="py-3 px-3 font-mono whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-semibold ${
                          port.direction === 'input'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/35'
                            : port.direction === 'output'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                            : 'bg-violet-500/15 text-violet-300 border border-violet-500/35'
                        }`}
                      >
                        {port.direction}
                      </span>
                    </td>

                    {/* Bit Width */}
                    <td className="py-3 px-3 font-mono text-right text-cyan-300 whitespace-nowrap">
                      {port.width}-bit
                    </td>

                    {/* Assigned Component Dropdown */}
                    <td className="py-3 px-3">
                      <select
                        aria-label={`${port.name} ${t.ioColComponent}`}
                        value={currentVal}
                        onChange={(e) => {
                          const v = e.target.value;
                          onAssignPort(port, v ? (v as BoardComponentId) : null);
                        }}
                        className={`w-full max-w-sm bg-slate-950 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-100 border focus:outline-none transition ${
                          status === 'invalid'
                            ? 'border-rose-500/60 focus:border-rose-400'
                            : status === 'conflict'
                            ? 'border-orange-500/60 focus:border-orange-400'
                            : status === 'configured'
                            ? 'border-emerald-500/45 focus:border-emerald-400'
                            : 'border-slate-700 hover:border-cyan-500/50 focus:border-cyan-400'
                        }`}
                      >
                        <option value="">{t.ioUnassignedOption}</option>

                        {showPreservedInvalidOption && componentId && (
                          <option value={componentId}>
                            ⚠ {getComponentLabel(componentId, t)} ({t.ioStatusInvalid})
                          </option>
                        )}

                        {(port.direction === 'input' || port.direction === 'inout') && (
                          <optgroup label={t.ioGroupInputs}>
                            {inputSpecs.map((spec) => renderOption(spec.id))}
                          </optgroup>
                        )}

                        {(port.direction === 'output' || port.direction === 'inout') && (
                          <optgroup label={t.ioGroupOutputs}>
                            {outputSpecs.map((spec) => renderOption(spec.id))}
                          </optgroup>
                        )}
                      </select>
                    </td>

                    {/* Configuration Status & Validation Details */}
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <div>{renderStatusBadge(res)}</div>
                        {issues.map((issue, idx) => (
                          <div
                            key={`${issue.code}-${idx}`}
                            className={`text-[11px] leading-snug ${
                              issue.severity === 'error'
                                ? 'text-rose-300'
                                : 'text-amber-300/90'
                            }`}
                          >
                            {formatValidationIssue(issue, lang, t)}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Helpful Footer Hint */}
      <div className="flex items-start gap-2 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
        <span>{t.ioOptionalNote}</span>
      </div>
    </div>
  );
};
