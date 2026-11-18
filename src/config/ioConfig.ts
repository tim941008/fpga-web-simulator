import {
  BoardComponentId,
  BoardComponentSpec,
  BoardControlGroup,
  IoResourceWarning,
  IoValidationSummary,
  PortDefinition,
  PortIoAssignment,
  PortValidationResult,
  ValidationIssue,
} from '../types/fpga';

export const IO_CONFIG_STORAGE_KEY = 'web_fpga_sim_io_config_v1';

export const BOARD_COMPONENTS: BoardComponentSpec[] = [
  // Input components
  {
    id: 'CLOCK',
    category: 'CLOCK',
    direction: 'input',
    nominalWidth: 1,
    minWidth: 1,
    maxWidth: 1,
    strictExactWidth: true,
  },
  {
    id: 'KEY',
    category: 'KEY',
    direction: 'input',
    nominalWidth: 4,
    minWidth: 1,
    maxWidth: 4,
  },
  {
    id: 'SW',
    category: 'SW',
    direction: 'input',
    nominalWidth: 10,
    minWidth: 1,
    maxWidth: 10,
  },
  // Output components
  {
    id: 'LEDR',
    category: 'LEDR',
    direction: 'output',
    nominalWidth: 10,
    minWidth: 1,
    maxWidth: 10,
  },
  {
    id: 'LEDG',
    category: 'LEDG',
    direction: 'output',
    nominalWidth: 8,
    minWidth: 1,
    maxWidth: 8,
  },
  {
    id: 'HEX0',
    category: 'HEX',
    direction: 'output',
    nominalWidth: 7,
    minWidth: 7,
    maxWidth: 7,
    strictMinWidth: true,
  },
  {
    id: 'HEX1',
    category: 'HEX',
    direction: 'output',
    nominalWidth: 7,
    minWidth: 7,
    maxWidth: 7,
    strictMinWidth: true,
  },
  {
    id: 'HEX2',
    category: 'HEX',
    direction: 'output',
    nominalWidth: 7,
    minWidth: 7,
    maxWidth: 7,
    strictMinWidth: true,
  },
  {
    id: 'HEX3',
    category: 'HEX',
    direction: 'output',
    nominalWidth: 7,
    minWidth: 7,
    maxWidth: 7,
    strictMinWidth: true,
  },
  {
    id: 'HEX4',
    category: 'HEX',
    direction: 'output',
    nominalWidth: 7,
    minWidth: 7,
    maxWidth: 7,
    strictMinWidth: true,
  },
  {
    id: 'HEX5',
    category: 'HEX',
    direction: 'output',
    nominalWidth: 7,
    minWidth: 7,
    maxWidth: 7,
    strictMinWidth: true,
  },
  {
    id: 'MATRIX_ROW',
    category: 'MATRIX_ROW',
    direction: 'output',
    nominalWidth: 16,
    minWidth: 1,
    maxWidth: 16,
  },
  {
    id: 'MATRIX_COL',
    category: 'MATRIX_COL',
    direction: 'output',
    nominalWidth: 16,
    minWidth: 1,
    maxWidth: 16,
  },
];

export const BOARD_COMPONENT_MAP: Record<BoardComponentId, BoardComponentSpec> =
  BOARD_COMPONENTS.reduce(
    (acc, spec) => {
      acc[spec.id] = spec;
      return acc;
    },
    {} as Record<BoardComponentId, BoardComponentSpec>
  );

export function isValidComponentId(value: unknown): value is BoardComponentId {
  return typeof value === 'string' && value in BOARD_COMPONENT_MAP;
}

export function isDirectionCompatible(
  portDirection: 'input' | 'output' | 'inout',
  componentDirection: 'input' | 'output'
): boolean {
  if (portDirection === 'inout') return true;
  return portDirection === componentDirection;
}

export interface ComponentCompatibility {
  allowed: boolean;
  issues: ValidationIssue[];
}

/**
 * Evaluates direction and width compatibility between a Verilog port and a board component.
 */
export function checkComponentCompatibility(
  port: PortDefinition,
  componentId: BoardComponentId,
  prev?: { direction?: 'input' | 'output' | 'inout'; width?: number }
): ComponentCompatibility {
  const spec = BOARD_COMPONENT_MAP[componentId];
  const issues: ValidationIssue[] = [];
  let allowed = true;

  // 1. Direction check
  if (!isDirectionCompatible(port.direction, spec.direction)) {
    const changed = prev?.direction !== undefined && prev.direction !== port.direction;
    issues.push({
      code: changed ? 'DIRECTION_CHANGED' : 'DIRECTION_MISMATCH',
      severity: 'error',
      portName: port.name,
      componentId,
      portWidth: port.width,
      componentWidth: spec.nominalWidth,
      portDirection: port.direction,
      componentDirection: spec.direction,
      prevDirection: prev?.direction,
    });
    allowed = false;
  }

  // 2. Runtime 64-bit packed signal limit
  if (port.width > 64) {
    issues.push({
      code: 'WIDTH_EXCEEDS_64',
      severity: 'error',
      portName: port.name,
      componentId,
      portWidth: port.width,
      componentWidth: spec.nominalWidth,
      portDirection: port.direction,
      componentDirection: spec.direction,
      prevWidth: prev?.width,
    });
    allowed = false;
  }

  // 3. Component-specific width rules
  if (spec.strictExactWidth && port.width !== spec.nominalWidth) {
    issues.push({
      code: 'CLOCK_WIDTH_INVALID',
      severity: 'error',
      portName: port.name,
      componentId,
      portWidth: port.width,
      componentWidth: spec.nominalWidth,
      portDirection: port.direction,
      componentDirection: spec.direction,
      prevWidth: prev?.width,
    });
    allowed = false;
  } else if (spec.category === 'HEX') {
    if (port.width < spec.minWidth) {
      issues.push({
        code: 'HEX_WIDTH_TOO_SMALL',
        severity: 'error',
        portName: port.name,
        componentId,
        portWidth: port.width,
        componentWidth: spec.nominalWidth,
        portDirection: port.direction,
        componentDirection: spec.direction,
        prevWidth: prev?.width,
      });
      allowed = false;
    } else if (port.width === 8) {
      issues.push({
        code: 'HEX_DP_UNUSED',
        severity: 'warning',
        portName: port.name,
        componentId,
        portWidth: port.width,
        componentWidth: spec.nominalWidth,
        portDirection: port.direction,
        componentDirection: spec.direction,
      });
    } else if (port.width > 8) {
      issues.push({
        code: 'WIDTH_EXCEEDS_COMPONENT',
        severity: 'warning',
        portName: port.name,
        componentId,
        portWidth: port.width,
        componentWidth: spec.nominalWidth,
        portDirection: port.direction,
        componentDirection: spec.direction,
      });
    }
  } else if (spec.category === 'MATRIX_ROW' || spec.category === 'MATRIX_COL') {
    if (port.width !== spec.nominalWidth) {
      issues.push({
        code: 'MATRIX_WIDTH_MISMATCH',
        severity: 'warning',
        portName: port.name,
        componentId,
        portWidth: port.width,
        componentWidth: spec.nominalWidth,
        portDirection: port.direction,
        componentDirection: spec.direction,
      });
    }
  } else if (port.width > spec.maxWidth) {
    issues.push({
      code: 'WIDTH_EXCEEDS_COMPONENT',
      severity: 'warning',
      portName: port.name,
      componentId,
      portWidth: port.width,
      componentWidth: spec.maxWidth,
      portDirection: port.direction,
      componentDirection: spec.direction,
    });
  }

  return { allowed, issues };
}

/**
 * Validates the complete I/O pin configuration against the detected Verilog ports.
 */
export function validateIoConfig(
  ports: PortDefinition[],
  assignments: Record<string, PortIoAssignment>
): IoValidationSummary {
  // Count component usage across active ports to detect duplicate assignments / resource conflicts
  const componentUsers = new Map<BoardComponentId, string[]>();
  for (const port of ports) {
    const a = assignments[port.name];
    if (!a || !isValidComponentId(a.componentId)) continue;
    const list = componentUsers.get(a.componentId) ?? [];
    list.push(port.name);
    componentUsers.set(a.componentId, list);
  }

  const results: PortValidationResult[] = [];
  const byPort: Record<string, PortValidationResult> = {};
  let configuredCount = 0;
  let unassignedCount = 0;
  let conflictCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  let hasConfiguredMatrixRow = false;
  let hasConfiguredMatrixCol = false;

  for (const port of ports) {
    const assignment = assignments[port.name];
    if (!assignment || !isValidComponentId(assignment.componentId)) {
      const res: PortValidationResult = {
        port,
        componentId: null,
        status: 'unassigned',
        issues: [],
      };
      results.push(res);
      byPort[port.name] = res;
      unassignedCount += 1;
      continue;
    }

    const compId = assignment.componentId;
    const spec = BOARD_COMPONENT_MAP[compId];
    const signatureChanged =
      assignment.configuredDirection !== port.direction ||
      assignment.configuredWidth !== port.width;

    const compat = checkComponentCompatibility(port, compId, {
      direction: assignment.configuredDirection,
      width: assignment.configuredWidth,
    });
    const issues: ValidationIssue[] = [...compat.issues];

    const users = componentUsers.get(compId) ?? [];
    const conflictingPorts = users.filter((name) => name !== port.name);
    const hasConflict = conflictingPorts.length > 0;
    if (hasConflict) {
      issues.push({
        code: 'DUPLICATE_COMPONENT',
        severity: 'error',
        portName: port.name,
        componentId: compId,
        portWidth: port.width,
        componentWidth: spec.nominalWidth,
        portDirection: port.direction,
        componentDirection: spec.direction,
        conflictingPorts,
      });
    }

    let status: PortValidationResult['status'];
    if (!compat.allowed) {
      status = 'invalid';
      invalidCount += 1;
    } else if (hasConflict) {
      status = 'conflict';
      conflictCount += 1;
    } else {
      status = 'configured';
      configuredCount += 1;
      if (compId === 'MATRIX_ROW') hasConfiguredMatrixRow = true;
      if (compId === 'MATRIX_COL') hasConfiguredMatrixCol = true;
    }

    warningCount += issues.filter((i) => i.severity === 'warning').length;

    const res: PortValidationResult = {
      port,
      componentId: compId,
      status,
      issues,
      signatureChanged,
    };
    results.push(res);
    byPort[port.name] = res;
  }

  const resourceWarnings: IoResourceWarning[] = [];
  if (hasConfiguredMatrixRow && !hasConfiguredMatrixCol) {
    resourceWarnings.push({ code: 'MATRIX_MISSING_COL' });
    warningCount += 1;
  } else if (hasConfiguredMatrixCol && !hasConfiguredMatrixRow) {
    resourceWarnings.push({ code: 'MATRIX_MISSING_ROW' });
    warningCount += 1;
  }

  return {
    results,
    byPort,
    configuredCount,
    unassignedCount,
    conflictCount,
    invalidCount,
    warningCount,
    resourceWarnings,
  };
}

/**
 * Infers a suggested board component for conventional Verilog port names.
 * Returns null for unrecognized / custom port names so users can assign them freely.
 */
function suggestComponentForPort(
  port: PortDefinition,
  used: Set<BoardComponentId>
): BoardComponentId | null {
  const upper = port.name.toUpperCase();

  const tryPick = (id: BoardComponentId): BoardComponentId | null => {
    if (used.has(id)) return null;
    const compat = checkComponentCompatibility(port, id);
    return compat.allowed ? id : null;
  };

  if (port.direction === 'input') {
    if (
      port.width === 1 &&
      (upper === 'CLK' ||
        upper === 'CLOCK' ||
        upper === 'CLOCK_50' ||
        upper === 'MAX10_CLK1_50' ||
        upper.includes('CLK') ||
        upper.includes('CLOCK'))
    ) {
      return tryPick('CLOCK');
    }
    if (
      upper.startsWith('KEY') ||
      upper.startsWith('BTN') ||
      upper.startsWith('BUTTON') ||
      upper === 'RST' ||
      upper === 'RESET' ||
      upper === 'RST_N'
    ) {
      return tryPick('KEY');
    }
    if (upper.startsWith('SW') || upper.startsWith('SWITCH')) {
      return tryPick('SW');
    }
    return null;
  }

  if (port.direction === 'output') {
    const hexMatch = upper.match(/^(?:HEX|SEG|DISP)([0-5])$/);
    if (hexMatch) {
      return tryPick(`HEX${hexMatch[1]}` as BoardComponentId);
    }
    if (
      upper === 'MATRIX_ROW' ||
      upper.startsWith('MAT_R') ||
      upper.startsWith('M_ROW') ||
      (upper.includes('ROW') && port.width === 16)
    ) {
      return tryPick('MATRIX_ROW');
    }
    if (
      upper === 'MATRIX_COL' ||
      upper.startsWith('MAT_C') ||
      upper.startsWith('M_COL') ||
      (upper.includes('COL') && port.width === 16)
    ) {
      return tryPick('MATRIX_COL');
    }
    if (upper.startsWith('LEDG')) {
      return tryPick('LEDG');
    }
    if (upper.startsWith('LEDR') || upper.startsWith('LED')) {
      return tryPick('LEDR');
    }
    return null;
  }

  return null;
}

/**
 * Generates default I/O assignments for detected ports, applying optional preset overrides first
 * and falling back to conventional port name heuristics without creating conflicts.
 */
export function autoAssignPorts(
  ports: PortDefinition[],
  presetDefaults?: Partial<Record<string, BoardComponentId>>
): Record<string, PortIoAssignment> {
  const next: Record<string, PortIoAssignment> = {};
  const used = new Set<BoardComponentId>();

  // 1. Apply explicit preset defaults first (supports custom-port-name presets)
  if (presetDefaults) {
    for (const port of ports) {
      const compId = presetDefaults[port.name];
      if (!compId || !isValidComponentId(compId) || used.has(compId)) continue;
      const compat = checkComponentCompatibility(port, compId);
      if (compat.allowed) {
        next[port.name] = {
          componentId: compId,
          configuredDirection: port.direction,
          configuredWidth: port.width,
        };
        used.add(compId);
      }
    }
  }

  // 2. Apply heuristic suggestions for remaining standard port names
  for (const port of ports) {
    if (next[port.name]) continue;
    const suggested = suggestComponentForPort(port, used);
    if (suggested) {
      next[port.name] = {
        componentId: suggested,
        configuredDirection: port.direction,
        configuredWidth: port.width,
      };
      used.add(suggested);
    }
  }

  return next;
}

/**
 * Reconciles existing user I/O assignments when Verilog source changes:
 * - If `newPorts` is empty (e.g., temporary syntax error mid-edit), preserves `prevAssignments` untouched.
 * - Preserves assignments for ports that still exist (retaining original configured direction/width
 *   so invalidated assignments are visibly flagged rather than silently discarded).
 * - Drops ports removed from the module and leaves newly added ports unassigned.
 * - When `autoAssignIfNoOverlap` is true and no existing assigned port overlaps with `newPorts`,
 *   runs `autoAssignPorts(newPorts)` (convenient when uploading a brand-new module).
 */
export function reconcileIoAssignments(
  prevAssignments: Record<string, PortIoAssignment>,
  newPorts: PortDefinition[],
  options: { autoAssignIfNoOverlap?: boolean } = {}
): Record<string, PortIoAssignment> {
  if (newPorts.length === 0) {
    return prevAssignments;
  }

  const prevKeys = Object.keys(prevAssignments);
  const newPortNames = new Set(newPorts.map((p) => p.name));
  const overlapCount = prevKeys.filter((k) => newPortNames.has(k)).length;

  if (options.autoAssignIfNoOverlap && overlapCount === 0) {
    return autoAssignPorts(newPorts);
  }

  const next: Record<string, PortIoAssignment> = {};
  for (const port of newPorts) {
    const existing = prevAssignments[port.name];
    if (!existing) continue;

    // Preserve assignment; if port signature still matches cleanly, keep as-is.
    // If signature changed (direction or width), keep original configuredDirection/configuredWidth
    // so validation clearly flags invalidation rather than silently discarding it.
    next[port.name] = { ...existing };
  }

  return next;
}

export interface BoardMappings {
  controlGroups: BoardControlGroup[];
  clockSignalName: string | null;
  matrixRowSignal: string | null;
  matrixColSignal: string | null;
  hasMatrixConnection: boolean;
}

/**
 * Builds active FPGA board control groups and runtime signal bindings strictly from valid
 * ('configured') I/O assignments. Supports arbitrary Verilog port names.
 */
export function buildBoardMappings(
  validation: IoValidationSummary
): BoardMappings {
  const controlGroups: BoardControlGroup[] = [];
  let clockSignalName: string | null = null;
  let matrixRowSignal: string | null = null;
  let matrixColSignal: string | null = null;

  for (const res of validation.results) {
    if (res.status !== 'configured' || !res.componentId) continue;

    const spec = BOARD_COMPONENT_MAP[res.componentId];
    const hasWidthWarning = res.issues.some((i) => i.severity === 'warning');

    if (res.componentId === 'CLOCK') {
      clockSignalName = res.port.name;
    } else if (res.componentId === 'MATRIX_ROW') {
      matrixRowSignal = res.port.name;
    } else if (res.componentId === 'MATRIX_COL') {
      matrixColSignal = res.port.name;
    }

    controlGroups.push({
      componentId: res.componentId,
      category: spec.category,
      baseName: res.port.name,
      width: res.port.width,
      maxWidth: spec.maxWidth,
      msb: res.port.msb,
      lsb: res.port.lsb,
      direction: res.port.direction,
      hasWidthWarning,
    });
  }

  return {
    controlGroups,
    clockSignalName,
    matrixRowSignal,
    matrixColSignal,
    hasMatrixConnection: Boolean(matrixRowSignal || matrixColSignal),
  };
}

// ---------------------------------------------------------------------------
// localStorage persistence keyed by top module name
// ---------------------------------------------------------------------------
type StoredIoConfigMap = Record<string, Record<string, PortIoAssignment>>;

function readStorageMap(): StoredIoConfigMap {
  try {
    const raw = window.localStorage.getItem(IO_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as StoredIoConfigMap;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

export function loadSavedIoConfig(
  topModule: string
): Record<string, PortIoAssignment> | null {
  const map = readStorageMap();
  const saved = map[topModule];
  if (!saved || typeof saved !== 'object') return null;

  const clean: Record<string, PortIoAssignment> = {};
  for (const [portName, entry] of Object.entries(saved)) {
    if (
      entry &&
      typeof entry === 'object' &&
      isValidComponentId(entry.componentId) &&
      typeof entry.configuredWidth === 'number' &&
      (entry.configuredDirection === 'input' ||
        entry.configuredDirection === 'output' ||
        entry.configuredDirection === 'inout')
    ) {
      clean[portName] = {
        componentId: entry.componentId,
        configuredDirection: entry.configuredDirection,
        configuredWidth: entry.configuredWidth,
      };
    }
  }
  return clean;
}

export function saveIoConfig(
  topModule: string,
  assignments: Record<string, PortIoAssignment>
): void {
  if (!topModule) return;
  try {
    const map = readStorageMap();
    map[topModule] = assignments;
    window.localStorage.setItem(IO_CONFIG_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export function clearSavedIoConfig(topModule: string): void {
  if (!topModule) return;
  try {
    const map = readStorageMap();
    delete map[topModule];
    window.localStorage.setItem(IO_CONFIG_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}
