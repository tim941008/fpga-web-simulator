import { BoardControlGroup, ComponentCategory, PinAssignment, PortDefinition } from '../types/fpga';

export interface QsfPinConflict {
  pinLocation: string;
  signals: string[];
}

export interface QsfParseResult {
  topLevelEntity?: string;
  family?: string;
  device?: string;
  assignments: PinAssignment[];
  conflicts: QsfPinConflict[];
}

export function classifySignalCategory(
  baseName: string,
  direction: 'input' | 'output' | 'inout' = 'inout'
): ComponentCategory {
  const upper = baseName.toUpperCase();

  if (
    upper.includes('CLK') ||
    upper.includes('CLOCK') ||
    upper === 'MAX10_CLK1_50'
  ) {
    return 'CLOCK';
  }
  if (
    upper.startsWith('KEY') ||
    upper.startsWith('BTN') ||
    upper.startsWith('BUTTON') ||
    upper === 'RST' ||
    upper === 'RESET' ||
    upper === 'RST_N'
  ) {
    return 'KEY';
  }
  if (upper.startsWith('SW') || upper.startsWith('SWITCH')) {
    return 'SW';
  }
  if (
    upper.startsWith('HEX') ||
    upper.startsWith('SEG') ||
    upper.startsWith('DISP')
  ) {
    return 'HEX';
  }
  if (
    upper.includes('ROW') ||
    upper.startsWith('MAT_R') ||
    upper.startsWith('M_ROW')
  ) {
    return 'MATRIX_ROW';
  }
  if (
    upper.includes('COL') ||
    upper.startsWith('MAT_C') ||
    upper.startsWith('M_COL')
  ) {
    return 'MATRIX_COL';
  }
  if (upper.includes('MATRIX') || upper.startsWith('DOT_MAT')) {
    return 'MATRIX_PIXEL';
  }
  if (upper.startsWith('LED')) {
    return 'LED';
  }

  return direction === 'input' ? 'SW' : 'LED';
}

export function inferSignalDirection(category: ComponentCategory): 'input' | 'output' {
  switch (category) {
    case 'CLOCK':
    case 'KEY':
    case 'SW':
      return 'input';
    case 'LED':
    case 'HEX':
    case 'MATRIX_ROW':
    case 'MATRIX_COL':
    case 'MATRIX_PIXEL':
    case 'GPIO':
      return 'output';
  }
}

/**
 * Parses Intel/Altera Quartus II / Quartus Prime .qsf files
 * and detects duplicate physical pin conflicts (fixes BUG-004).
 */
export function parseQsfFile(qsfContent: string): QsfParseResult {
  const lines = qsfContent.split(/\r?\n/);
  let topLevelEntity: string | undefined;
  let family: string | undefined;
  let device: string | undefined;

  const pinMap = new Map<string, { pin: string; ioStandard?: string }>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Match global assignments
    const globalMatch = line.match(
      /^set_global_assignment\s+-name\s+(\S+)\s+(?:"([^"]+)"|(\S+))/i
    );
    if (globalMatch) {
      const key = globalMatch[1].toUpperCase();
      const val = globalMatch[2] ?? globalMatch[3];
      if (key === 'TOP_LEVEL_ENTITY') topLevelEntity = val;
      if (key === 'FAMILY') family = val;
      if (key === 'DEVICE') device = val;
      continue;
    }

    // Match location assignments:
    // e.g. set_location_assignment PIN_C10 -to SW[0]
    const locMatch = line.match(
      /^set_location_assignment\s+(PIN_[A-Za-z0-9_]+|[A-Za-z0-9_]+)\s+.*?-to\s+(?:"([^"]+)"|([^\s#]+))/i
    );
    if (locMatch) {
      const pinLocation = locMatch[1];
      const signalName = (locMatch[2] ?? locMatch[3]).trim();
      const existing = pinMap.get(signalName) ?? { pin: pinLocation };
      existing.pin = pinLocation;
      pinMap.set(signalName, existing);
      continue;
    }

    // Match IO_STANDARD instance assignments:
    const ioMatch = line.match(
      /^set_instance_assignment\s+-name\s+IO_STANDARD\s+(?:"([^"]+)"|(\S+))\s+.*?-to\s+(?:"([^"]+)"|([^\s#]+))/i
    );
    if (ioMatch) {
      const ioStandard = ioMatch[1] ?? ioMatch[2];
      const signalName = (ioMatch[3] ?? ioMatch[4]).trim();
      const existing = pinMap.get(signalName) ?? { pin: 'UNASSIGNED' };
      existing.ioStandard = ioStandard;
      pinMap.set(signalName, existing);
    }
  }

  // Detect duplicate physical pin assignments across distinct signals (fixes BUG-004)
  const pinToSignals = new Map<string, string[]>();
  for (const [signalName, info] of pinMap.entries()) {
    if (!info.pin || info.pin === 'UNASSIGNED') continue;
    const list = pinToSignals.get(info.pin) ?? [];
    list.push(signalName);
    pinToSignals.set(info.pin, list);
  }

  const conflicts: QsfPinConflict[] = [];
  const conflictingPins = new Set<string>();
  for (const [pinLocation, sigs] of pinToSignals.entries()) {
    if (sigs.length > 1) {
      conflicts.push({ pinLocation, signals: sigs });
      conflictingPins.add(pinLocation);
    }
  }

  const assignments: PinAssignment[] = [];

  for (const [signalName, info] of pinMap.entries()) {
    const busMatch = signalName.match(/^([A-Za-z_][A-Za-z0-9_$]*)\[(\d+)\]$/);
    const baseName = busMatch ? busMatch[1] : signalName;
    const bitIndex = busMatch ? parseInt(busMatch[2], 10) : null;
    const category = classifySignalCategory(baseName);
    const direction = inferSignalDirection(category);

    assignments.push({
      signalName,
      baseName,
      bitIndex,
      pinLocation: info.pin,
      ioStandard: info.ioStandard,
      category,
      direction,
      hasConflict: conflictingPins.has(info.pin),
    });
  }

  return {
    topLevelEntity,
    family,
    device,
    assignments,
    conflicts,
  };
}

/**
 * Combines Verilog ports and QSF pin assignments to auto-generate board control groups.
 * When `ports` is non-empty, only generates board control groups for actual module ports (fixes BUG-003).
 */
export function buildBoardControlGroups(
  ports: PortDefinition[],
  assignments: PinAssignment[]
): BoardControlGroup[] {
  const groups = new Map<string, BoardControlGroup>();
  const hasModulePorts = ports.length > 0;

  // 1. Register all Verilog ports first
  for (const port of ports) {
    const category = classifySignalCategory(port.name, port.direction);
    groups.set(port.name, {
      category,
      baseName: port.name,
      width: port.width,
      msb: port.msb,
      lsb: port.lsb,
      direction: port.direction,
      pins: {},
    });
  }

  // 2. Attach QSF pin locations to matching module ports (or build from QSF if no Verilog ports exist)
  for (const assign of assignments) {
    let group = groups.get(assign.baseName);
    if (!group) {
      if (hasModulePorts) {
        // Ignore orphan QSF signals that do not exist in the active Verilog module (fixes BUG-003)
        continue;
      }
      const idx = assign.bitIndex ?? 0;
      group = {
        category: assign.category,
        baseName: assign.baseName,
        width: idx + 1,
        msb: idx,
        lsb: 0,
        direction: assign.direction,
        pins: {},
      };
      groups.set(assign.baseName, group);
    } else if (!hasModulePorts && assign.bitIndex !== null) {
      group.msb = Math.max(group.msb, assign.bitIndex);
      group.lsb = Math.min(group.lsb, assign.bitIndex);
      group.width = group.msb - group.lsb + 1;
    }

    const bitKey = assign.bitIndex ?? 0;
    if (bitKey >= group.lsb && bitKey <= group.msb) {
      group.pins[bitKey] = assign.pinLocation;
    }
  }

  return Array.from(groups.values());
}
