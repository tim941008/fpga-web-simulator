import { PortDefinition } from '../types/fpga';
import {
  BitOrder,
  ComponentValidationIssue,
  HardwareComponentConfig,
  KeyComponentConfig,
  SignalPolarity,
  SwitchComponentConfig,
} from '../types/hardwareConfig';

/**
 * Returns the ordered list of Verilog bit indices for UI rendering,
 * given a configured width and bit order.
 *
 * - 'msb-to-lsb': [width - 1, width - 2, ..., 0]
 * - 'lsb-to-msb': [0, 1, ..., width - 1]
 */
export function getOrderedBitIndices(width: number, bitOrder: BitOrder): number[] {
  const safeWidth = Math.max(1, Math.floor(width));
  const indices: number[] = [];
  if (bitOrder === 'msb-to-lsb') {
    for (let b = safeWidth - 1; b >= 0; b--) indices.push(b);
  } else {
    for (let b = 0; b < safeWidth; b++) indices.push(b);
  }
  return indices;
}

/**
 * Maps a visual slot position (0 = leftmost) to its Verilog bit index.
 */
export function mapVisualIndexToBit(
  visualIndex: number,
  width: number,
  bitOrder: BitOrder
): number {
  const safeWidth = Math.max(1, Math.floor(width));
  if (visualIndex < 0 || visualIndex >= safeWidth) {
    throw new RangeError(`visualIndex ${visualIndex} out of range [0, ${safeWidth - 1}]`);
  }
  return bitOrder === 'msb-to-lsb' ? safeWidth - 1 - visualIndex : visualIndex;
}

/**
 * Converts a raw Verilog bit (0 or 1) to logical active state (true = ON/Pressed)
 * according to the configured polarity.
 */
export function isRawBitActive(
  signalValue: bigint,
  bitIndex: number,
  polarity: SignalPolarity
): boolean {
  const rawBit = ((signalValue >> BigInt(bitIndex)) & 1n) === 1n;
  return polarity === 'active-low' ? !rawBit : rawBit;
}

/**
 * Converts a logical active state (true = ON/Pressed) into the raw Verilog bit (0 or 1)
 * according to the configured polarity.
 */
export function logicalStateToRawBit(active: boolean, polarity: SignalPolarity): 0 | 1 {
  if (polarity === 'active-low') {
    return active ? 0 : 1;
  }
  return active ? 1 : 0;
}

/**
 * Sets or clears a single bit in a bigint signal value.
 */
export function setSignalBit(current: bigint, bitIndex: number, rawBit: 0 | 1): bigint {
  const mask = 1n << BigInt(bitIndex);
  return rawBit === 1 ? current | mask : current & ~mask;
}

/**
 * Toggles a single bit in a bigint signal value.
 */
export function toggleSignalBit(current: bigint, bitIndex: number): bigint {
  return current ^ (1n << BigInt(bitIndex));
}

/**
 * Parses a decimal, 0x-hex, or 0b-binary string into a masked unsigned bigint.
 */
export function parseInitialValue(raw: string, width: number): bigint {
  const safeWidth = Math.max(1, Math.min(64, Math.floor(width)));
  const mask = (1n << BigInt(safeWidth)) - 1n;
  const trimmed = raw.trim();
  if (!trimmed) return 0n;
  try {
    const val = BigInt(trimmed);
    return val & mask;
  } catch {
    return 0n;
  }
}

/**
 * Computes the initial raw Verilog signal value for a Switch component,
 * applying its polarity to the logical initialValue.
 */
export function computeSwitchInitialRawValue(cfg: SwitchComponentConfig): bigint {
  const logical = parseInitialValue(cfg.initialValue, cfg.width);
  const mask = (1n << BigInt(Math.max(1, Math.min(64, cfg.width)))) - 1n;
  return cfg.polarity === 'active-low' ? (~logical) & mask : logical & mask;
}

/**
 * Computes the initial raw Verilog signal value for a KEY component,
 * applying its polarity to each button's logical initialPressed state.
 */
export function computeKeyInitialRawValue(cfg: KeyComponentConfig): bigint {
  let raw = 0n;
  const safeWidth = Math.max(1, Math.min(64, cfg.width));
  for (let b = 0; b < safeWidth; b++) {
    const pressed = Boolean(cfg.initialPressed[b]);
    const bitVal = logicalStateToRawBit(pressed, cfg.polarity);
    raw = setSignalBit(raw, b, bitVal);
  }
  return raw;
}

/**
 * Computes initial raw input values for all enabled input components (SWITCH, KEY)
 * whose target signal exists in the compiled ports list.
 */
export function computeInitialInputSignals(
  components: HardwareComponentConfig[],
  ports: PortDefinition[]
): Record<string, bigint> {
  const portByName = new Map(ports.map((p) => [p.name, p]));
  const result: Record<string, bigint> = {};

  for (const comp of components) {
    if (!comp.enabled) continue;
    if (comp.type === 'CLOCK') {
      const port = portByName.get(comp.signalName);
      if (port && port.direction === 'input') {
        result[comp.signalName] = comp.polarity === 'active-low' ? 1n : 0n;
      }
    } else if (comp.type === 'SWITCH') {
      const port = portByName.get(comp.signalName);
      if (port && port.direction === 'input') {
        result[comp.signalName] = computeSwitchInitialRawValue(comp);
      }
    } else if (comp.type === 'KEY') {
      const port = portByName.get(comp.signalName);
      if (port && port.direction === 'input') {
        result[comp.signalName] = computeKeyInitialRawValue(comp);
      }
    }
  }

  return result;
}

/**
 * Validates a single signal binding against compiled Verilog ports.
 */
function validateSignalBinding(
  componentId: string,
  componentLabel: string,
  field: string,
  signalName: string,
  configuredWidth: number,
  expectedDirection: 'input' | 'output',
  portByName: Map<string, PortDefinition>,
  issues: ComponentValidationIssue[]
): PortDefinition | null {
  if (!signalName.trim()) {
    issues.push({
      componentId,
      componentLabel,
      field,
      severity: 'error',
      code: 'EMPTY_SIGNAL',
      message: `${componentLabel} (${field}): no Verilog signal selected.`,
    });
    return null;
  }

  const port = portByName.get(signalName);
  if (!port) {
    issues.push({
      componentId,
      componentLabel,
      field,
      severity: 'error',
      code: 'MISSING_SIGNAL',
      message: `${componentLabel} (${field}): signal "${signalName}" does not exist in active Verilog module.`,
    });
    return null;
  }

  if (port.direction !== expectedDirection && port.direction !== 'inout') {
    issues.push({
      componentId,
      componentLabel,
      field,
      severity: 'error',
      code: 'DIRECTION_MISMATCH',
      message: `${componentLabel} (${field}): signal "${signalName}" is an ${port.direction}, expected ${expectedDirection}.`,
    });
  }

  if (configuredWidth !== port.width) {
    issues.push({
      componentId,
      componentLabel,
      field,
      severity: 'warning',
      code: 'WIDTH_MISMATCH',
      message: `${componentLabel} (${field}): configured width (${configuredWidth}-bit) differs from Verilog port "${signalName}" (${port.width}-bit).`,
    });
  }

  return port;
}

/**
 * Validates all enabled hardware components against the active compiled Verilog ports.
 * Never silently remaps missing or incompatible signals.
 */
export function validateHardwareConfig(
  components: HardwareComponentConfig[],
  ports: PortDefinition[]
): ComponentValidationIssue[] {
  const issues: ComponentValidationIssue[] = [];
  const portByName = new Map(ports.map((p) => [p.name, p]));

  for (const comp of components) {
    if (!comp.enabled) continue;

    switch (comp.type) {
      case 'CLOCK':
        validateSignalBinding(
          comp.id,
          comp.label,
          'signalName',
          comp.signalName,
          comp.width,
          'input',
          portByName,
          issues
        );
        break;

      case 'SWITCH':
      case 'KEY':
        validateSignalBinding(
          comp.id,
          comp.label,
          'signalName',
          comp.signalName,
          comp.width,
          'input',
          portByName,
          issues
        );
        break;

      case 'LED':
        validateSignalBinding(
          comp.id,
          comp.label,
          'signalName',
          comp.signalName,
          comp.width,
          'output',
          portByName,
          issues
        );
        break;

      case 'SEVEN_SEGMENT': {
        const port = validateSignalBinding(
          comp.id,
          comp.label,
          'signalName',
          comp.signalName,
          comp.width,
          'output',
          portByName,
          issues
        );
        const effectiveWidth = port ? port.width : comp.width;
        const segEntries: Array<[string, number | null]> = [
          ['a', comp.segmentMap.a],
          ['b', comp.segmentMap.b],
          ['c', comp.segmentMap.c],
          ['d', comp.segmentMap.d],
          ['e', comp.segmentMap.e],
          ['f', comp.segmentMap.f],
          ['g', comp.segmentMap.g],
          ...(comp.showDecimalPoint ? ([['dp', comp.segmentMap.dp]] as Array<[string, number | null]>) : []),
        ];
        for (const [segKey, bitIdx] of segEntries) {
          if (bitIdx === null || bitIdx < 0 || bitIdx >= effectiveWidth) {
            issues.push({
              componentId: comp.id,
              componentLabel: comp.label,
              field: `segmentMap.${segKey}`,
              severity: 'warning',
              code: 'INVALID_SEGMENT_BIT',
              message: `${comp.label}: segment "${segKey}" bit index (${String(bitIdx)}) is outside [0..${effectiveWidth - 1}].`,
            });
          }
        }
        break;
      }

      case 'MATRIX':
        validateSignalBinding(
          comp.id,
          comp.label,
          'row.signalName',
          comp.row.signalName,
          comp.row.width,
          'output',
          portByName,
          issues
        );
        validateSignalBinding(
          comp.id,
          comp.label,
          'col.signalName',
          comp.col.signalName,
          comp.col.width,
          'output',
          portByName,
          issues
        );
        break;
    }
  }

  return issues;
}

/**
 * Returns the list of component labels mapped to a given Verilog signal name
 * (used by SignalMonitor to display active hardware bindings).
 */
export function getMappedComponentsForSignal(
  signalName: string,
  components: HardwareComponentConfig[]
): string[] {
  const labels: string[] = [];
  for (const comp of components) {
    if (!comp.enabled) continue;
    if (comp.type === 'MATRIX') {
      if (comp.row.signalName === signalName) labels.push(`${comp.label} (ROW)`);
      if (comp.col.signalName === signalName) labels.push(`${comp.label} (COL)`);
    } else if (comp.signalName === signalName) {
      labels.push(comp.label);
    }
  }
  return labels;
}
