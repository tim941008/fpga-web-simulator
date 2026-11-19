import {
  HARDWARE_CONFIG_SCHEMA_VERSION,
  HardwareComponentConfig,
  HardwareConfigSchema,
} from '../types/hardwareConfig';
import { createDefaultMatrixPattern, MATRIX_SIZE } from './matrixMapping';

export const HARDWARE_CONFIG_STORAGE_KEY = 'web_fpga_sim_hardware_config_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

const VALID_COMPONENT_TYPES = new Set([
  'CLOCK',
  'KEY',
  'SWITCH',
  'LED',
  'SEVEN_SEGMENT',
  'MATRIX',
]);

function isValidComponent(item: unknown): item is HardwareComponentConfig {
  if (!item || typeof item !== 'object') return false;
  const c = item as Record<string, unknown>;
  if (typeof c.id !== 'string' || !c.id.trim()) return false;
  if (typeof c.label !== 'string') return false;
  if (typeof c.enabled !== 'boolean') return false;
  if (typeof c.type !== 'string' || !VALID_COMPONENT_TYPES.has(c.type)) return false;

  if (c.type === 'MATRIX') {
    const row = c.row as Record<string, unknown> | undefined;
    const col = c.col as Record<string, unknown> | undefined;
    if (!row || !col) return false;
    if (typeof row.signalName !== 'string' || typeof col.signalName !== 'string') return false;
    if (row.bitOrder !== '15-to-0' && row.bitOrder !== '0-to-15') return false;
    if (col.bitOrder !== '15-to-0' && col.bitOrder !== '0-to-15') return false;
    if (row.polarity !== 'active-high' && row.polarity !== 'active-low') return false;
    if (col.polarity !== 'active-high' && col.polarity !== 'active-low') return false;
    return true;
  }

  if (typeof c.signalName !== 'string') return false;
  if (typeof c.width !== 'number' || !Number.isFinite(c.width) || c.width < 1) return false;
  return true;
}

/**
 * Validates and sanitizes an unknown parsed JSON payload into a valid HardwareConfigSchema.
 * Returns null if the payload is corrupted, invalid, or has an incompatible schemaVersion.
 */
export function parseStoredHardwareConfig(raw: unknown): HardwareConfigSchema | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== HARDWARE_CONFIG_SCHEMA_VERSION) {
    return null;
  }
  if (typeof obj.boardName !== 'string' || !Array.isArray(obj.components)) {
    return null;
  }

  const sanitized: HardwareComponentConfig[] = [];
  for (const item of obj.components) {
    if (!isValidComponent(item)) return null;
    if (item.type === 'MATRIX') {
      const pattern =
        Array.isArray(item.pattern) && item.pattern.length === MATRIX_SIZE
          ? item.pattern.map((n) => (typeof n === 'number' ? n & 0xffff : 0))
          : createDefaultMatrixPattern();
      sanitized.push({
        ...item,
        displayMode: item.displayMode === 'pattern' ? 'pattern' : 'live',
        pattern,
      });
    } else {
      sanitized.push(item);
    }
  }

  return {
    schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
    boardName: obj.boardName,
    components: sanitized,
  };
}

/**
 * Loads the persisted hardware configuration from localStorage.
 * Falls back cleanly to `fallback` if missing, corrupted, or outdated schema version.
 */
export function loadHardwareConfig(
  fallback: HardwareConfigSchema,
  storage: StorageLike | null = getDefaultStorage()
): { config: HardwareConfigSchema; recoveredFromInvalid: boolean } {
  if (!storage) return { config: fallback, recoveredFromInvalid: false };
  try {
    const text = storage.getItem(HARDWARE_CONFIG_STORAGE_KEY);
    if (!text) return { config: fallback, recoveredFromInvalid: false };
    const parsed = JSON.parse(text);
    const valid = parseStoredHardwareConfig(parsed);
    if (!valid) {
      return { config: fallback, recoveredFromInvalid: true };
    }
    return { config: valid, recoveredFromInvalid: false };
  } catch {
    return { config: fallback, recoveredFromInvalid: true };
  }
}

/**
 * Saves the hardware configuration to localStorage (never touches Verilog sources or runtime state).
 */
export function saveHardwareConfig(
  config: HardwareConfigSchema,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    const payload: HardwareConfigSchema = {
      ...config,
      schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
    };
    storage.setItem(HARDWARE_CONFIG_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears persisted hardware configuration and returns the provided default.
 */
export function resetHardwareConfig(
  defaultConfig: HardwareConfigSchema,
  storage: StorageLike | null = getDefaultStorage()
): HardwareConfigSchema {
  try {
    storage?.removeItem(HARDWARE_CONFIG_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  return defaultConfig;
}
