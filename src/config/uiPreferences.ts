import { StorageLike } from './configPersistence';

export type VisibleSignalLimit = 24 | 48 | 96 | 'all';
export type UiTheme = 'warm-lab' | 'classic';

export const VISIBLE_SIGNAL_OPTIONS: readonly VisibleSignalLimit[] = [24, 48, 96, 'all'];
export const DEFAULT_VISIBLE_SIGNAL_LIMIT: VisibleSignalLimit = 24;
export const DEFAULT_UI_THEME: UiTheme = 'warm-lab';

export const WAVE_VISIBLE_COUNT_STORAGE_KEY = 'web_fpga_sim_wave_visible_count_v1';
export const UI_THEME_STORAGE_KEY = 'web_fpga_sim_ui_theme_v1';

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

export function parseVisibleSignalLimit(raw: string | null): VisibleSignalLimit | null {
  if (raw === '24') return 24;
  if (raw === '48') return 48;
  if (raw === '96') return 96;
  if (raw === 'all') return 'all';
  return null;
}

export function loadVisibleSignalLimit(
  storage: StorageLike | null = getDefaultStorage()
): VisibleSignalLimit {
  if (!storage) return DEFAULT_VISIBLE_SIGNAL_LIMIT;
  try {
    const parsed = parseVisibleSignalLimit(storage.getItem(WAVE_VISIBLE_COUNT_STORAGE_KEY));
    return parsed ?? DEFAULT_VISIBLE_SIGNAL_LIMIT;
  } catch {
    return DEFAULT_VISIBLE_SIGNAL_LIMIT;
  }
}

export function saveVisibleSignalLimit(
  limit: VisibleSignalLimit,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WAVE_VISIBLE_COUNT_STORAGE_KEY, String(limit));
    return true;
  } catch {
    return false;
  }
}

export function sliceVisibleSignals<T>(
  signals: readonly T[],
  limit: VisibleSignalLimit
): T[] {
  if (limit === 'all') return signals.slice();
  return signals.slice(0, limit);
}

export function formatSignalCountSummary(shown: number, total: number): string {
  return `Showing ${shown} of ${total} signals`;
}

export function parseUiTheme(raw: string | null): UiTheme | null {
  if (raw === 'warm-lab' || raw === 'classic') return raw;
  return null;
}

export function loadUiTheme(storage: StorageLike | null = getDefaultStorage()): UiTheme {
  if (!storage) return DEFAULT_UI_THEME;
  try {
    const parsed = parseUiTheme(storage.getItem(UI_THEME_STORAGE_KEY));
    return parsed ?? DEFAULT_UI_THEME;
  } catch {
    return DEFAULT_UI_THEME;
  }
}

export function saveUiTheme(
  theme: UiTheme,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(UI_THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}
