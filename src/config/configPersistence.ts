import { PortDefinition } from '../types/fpga';
import {
  HARDWARE_CONFIG_SCHEMA_VERSION,
  HardwareComponentConfig,
  HardwareConfigSchema,
} from '../types/hardwareConfig';
import { validateHardwareConfig } from './hardwareMapping';
import { createDefaultMatrixPattern, MATRIX_SIZE } from './matrixMapping';

export const HARDWARE_CONFIG_STORAGE_KEY = 'web_fpga_sim_hardware_config_v1';
export const HARDWARE_CONFIG_SCOPED_STORAGE_KEY = 'web_fpga_sim_hardware_configs_v2';
const MAX_SCOPED_ENTRIES = 32;

export type ProjectConfigOrigin =
  | { kind: 'preset'; id: string }
  | { kind: 'example'; id: string }
  | { kind: 'custom' };

interface ScopedConfigStore {
  version: number;
  entries: Record<string, HardwareConfigSchema>;
  order: string[];
}

export type ScopedLoadSource =
  | 'scoped'
  | 'migrated-legacy'
  | 'default'
  | 'fallback-invalid'
  | 'fallback-incompatible';

export interface ScopedLoadResult {
  config: HardwareConfigSchema;
  source: ScopedLoadSource;
  recoveredFromInvalid: boolean;
}

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

// ---------------------------------------------------------------------------
// Project + Top-Module Scoped Persistence (BUG-01 fix)
// ---------------------------------------------------------------------------

/**
 * Deterministic 32-bit FNV-1a hash used to fingerprint custom project file sets.
 */
function hashStrings(parts: string[]): string {
  let h = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Builds an isolated persistence scope key for `(project, topModule)`.
 * Built-in presets and examples key by their stable ID; custom uploaded projects key
 * by a deterministic hash of their sorted normalized file names + active top module.
 */
export function buildHardwareConfigScopeKey(
  origin: ProjectConfigOrigin,
  fileNames: readonly string[],
  topModule: string
): string {
  const safeTop = (topModule || 'top').trim();
  if (origin.kind === 'preset') {
    return `preset:${origin.id}::top:${safeTop}`;
  }
  if (origin.kind === 'example') {
    return `example:${origin.id}::top:${safeTop}`;
  }
  const normalizedSorted = fileNames
    .map((n) => n.replace(/\\/g, '/').replace(/^\.?\/+/, '').toLowerCase())
    .sort();
  return `custom:${hashStrings(normalizedSorted)}::top:${safeTop}`;
}

function readScopedStore(storage: StorageLike | null): ScopedConfigStore {
  const empty: ScopedConfigStore = { version: 1, entries: {}, order: [] };
  if (!storage) return empty;
  try {
    const rawText = storage.getItem(HARDWARE_CONFIG_SCOPED_STORAGE_KEY);
    if (!rawText) return empty;
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return empty;
    const rawEntries = parsed.entries;
    if (!rawEntries || typeof rawEntries !== 'object') return empty;

    const entries: Record<string, HardwareConfigSchema> = {};
    for (const [k, v] of Object.entries(rawEntries)) {
      const valid = parseStoredHardwareConfig(v);
      if (valid) entries[k] = valid;
    }
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter((k: unknown): k is string => typeof k === 'string' && k in entries)
      : Object.keys(entries);
    for (const k of Object.keys(entries)) {
      if (!order.includes(k)) order.push(k);
    }
    return { version: 1, entries, order };
  } catch {
    return empty;
  }
}

function writeScopedStore(store: ScopedConfigStore, storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    // Evict oldest entries if exceeding cap
    while (store.order.length > MAX_SCOPED_ENTRIES) {
      const oldest = store.order.shift();
      if (oldest) delete store.entries[oldest];
    }
    storage.setItem(HARDWARE_CONFIG_SCOPED_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

function countEnabledSignalBindings(components: HardwareComponentConfig[]): number {
  let count = 0;
  for (const c of components) {
    if (!c.enabled) continue;
    count += c.type === 'MATRIX' ? 2 : 1;
  }
  return count;
}

/**
 * Evaluates whether a stored configuration is compatible with `ports`.
 * - `allValid`: zero MISSING_SIGNAL or DIRECTION_MISMATCH errors (used for strict legacy migration).
 * - `hasAnyValidBinding`: at least one enabled component binds to an existing compatible port.
 */
function evaluateConfigCompatibility(
  config: HardwareConfigSchema,
  ports: readonly PortDefinition[]
): { allValid: boolean; hasAnyValidBinding: boolean } {
  if (ports.length === 0) {
    return { allValid: true, hasAnyValidBinding: true };
  }
  const totalBindings = countEnabledSignalBindings(config.components);
  if (totalBindings === 0) {
    return { allValid: true, hasAnyValidBinding: true };
  }
  const issues = validateHardwareConfig(config.components, [...ports]);
  const missingOrWrongDir = issues.filter(
    (i) => i.code === 'MISSING_SIGNAL' || i.code === 'DIRECTION_MISMATCH' || i.code === 'EMPTY_SIGNAL'
  );
  return {
    allValid: missingOrWrongDir.length === 0,
    hasAnyValidBinding: missingOrWrongDir.length < totalBindings,
  };
}

/**
 * Loads the hardware configuration isolated to `scopeKey`.
 *
 * 1. If a scoped entry exists for `scopeKey`, validates it against `ports`.
 *    - Preserves valid custom bindings (and partial configs so invalid signals show explicit warnings).
 *    - Falls back deterministically to `fallback` if corrupted or completely incompatible (0 valid bindings).
 * 2. If no scoped entry exists, checks the legacy global key (`web_fpga_sim_hardware_config_v1`):
 *    - Migrates it into `scopeKey` ONLY if all enabled bindings match `ports` (zero missing/wrong-direction signals),
 *      preventing stale custom configs from leaking into unrelated projects or default presets.
 *    - Leaves the legacy key intact when incompatible so the original project can still migrate it later.
 */
export function loadScopedHardwareConfig(
  scopeKey: string,
  fallback: HardwareConfigSchema,
  ports: readonly PortDefinition[] = [],
  storage: StorageLike | null = getDefaultStorage()
): ScopedLoadResult {
  if (!storage) {
    return { config: fallback, source: 'default', recoveredFromInvalid: false };
  }

  const store = readScopedStore(storage);
  const existing = store.entries[scopeKey];
  if (existing) {
    const compat = evaluateConfigCompatibility(existing, ports);
    if (!compat.hasAnyValidBinding) {
      return { config: fallback, source: 'fallback-incompatible', recoveredFromInvalid: false };
    }
    return { config: existing, source: 'scoped', recoveredFromInvalid: false };
  }

  // Backward compatibility: attempt safe migration from legacy global key
  try {
    const legacyText = storage.getItem(HARDWARE_CONFIG_STORAGE_KEY);
    if (legacyText) {
      const legacyParsed = parseStoredHardwareConfig(JSON.parse(legacyText));
      if (!legacyParsed) {
        return { config: fallback, source: 'fallback-invalid', recoveredFromInvalid: true };
      }
      const compat = evaluateConfigCompatibility(legacyParsed, ports);
      if (compat.allValid) {
        saveScopedHardwareConfig(scopeKey, legacyParsed, storage);
        return { config: legacyParsed, source: 'migrated-legacy', recoveredFromInvalid: false };
      }
      return { config: fallback, source: 'fallback-incompatible', recoveredFromInvalid: false };
    }
  } catch {
    return { config: fallback, source: 'fallback-invalid', recoveredFromInvalid: true };
  }

  return { config: fallback, source: 'default', recoveredFromInvalid: false };
}

/**
 * Saves `config` under the isolated `scopeKey` without overwriting other projects' configs.
 */
export function saveScopedHardwareConfig(
  scopeKey: string,
  config: HardwareConfigSchema,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  const store = readScopedStore(storage);
  store.entries[scopeKey] = {
    ...config,
    schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
  };
  store.order = store.order.filter((k) => k !== scopeKey);
  store.order.push(scopeKey);
  return writeScopedStore(store, storage);
}

/**
 * Resets only the current `scopeKey` entry and returns `defaultConfig`.
 */
export function resetScopedHardwareConfig(
  scopeKey: string,
  defaultConfig: HardwareConfigSchema,
  storage: StorageLike | null = getDefaultStorage()
): HardwareConfigSchema {
  if (storage) {
    const store = readScopedStore(storage);
    delete store.entries[scopeKey];
    store.order = store.order.filter((k) => k !== scopeKey);
    writeScopedStore(store, storage);
  }
  return defaultConfig;
}
