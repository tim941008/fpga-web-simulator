import { describe, expect, it } from 'vitest';
import { HARDWARE_CONFIG_SCHEMA_VERSION } from '../../types/hardwareConfig';
import { HARDWARE_CONFIG_STORAGE_KEY, StorageLike } from '../configPersistence';
import {
  DEFAULT_UI_THEME,
  DEFAULT_VISIBLE_SIGNAL_LIMIT,
  formatSignalCountSummary,
  loadUiTheme,
  loadVisibleSignalLimit,
  saveUiTheme,
  saveVisibleSignalLimit,
  sliceVisibleSignals,
  UI_THEME_STORAGE_KEY,
  VISIBLE_SIGNAL_OPTIONS,
  VisibleSignalLimit,
  WAVE_VISIBLE_COUNT_STORAGE_KEY,
} from '../uiPreferences';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('Wave Viewer signal visibility (Phase C.2)', () => {
  const signals147 = Array.from({ length: 147 }, (_, i) => ({ name: `sig_${i}` }));

  it('exposes 24, 48, 96, and All options with 24 as default', () => {
    expect(VISIBLE_SIGNAL_OPTIONS).toEqual([24, 48, 96, 'all']);
    expect(DEFAULT_VISIBLE_SIGNAL_LIMIT).toBe(24);
  });

  it('shows 24 signals when limit is 24', () => {
    const visible = sliceVisibleSignals(signals147, 24);
    expect(visible).toHaveLength(24);
    expect(visible[0].name).toBe('sig_0');
    expect(visible[23].name).toBe('sig_23');
    expect(formatSignalCountSummary(visible.length, signals147.length)).toBe(
      'Showing 24 of 147 signals'
    );
  });

  it('shows 48 signals when limit is 48', () => {
    const visible = sliceVisibleSignals(signals147, 48);
    expect(visible).toHaveLength(48);
    expect(visible[47].name).toBe('sig_47');
    expect(formatSignalCountSummary(visible.length, signals147.length)).toBe(
      'Showing 48 of 147 signals'
    );
  });

  it('shows 96 signals when limit is 96', () => {
    const visible = sliceVisibleSignals(signals147, 96);
    expect(visible).toHaveLength(96);
    expect(visible[95].name).toBe('sig_95');
    expect(formatSignalCountSummary(visible.length, signals147.length)).toBe(
      'Showing 96 of 147 signals'
    );
  });

  it('shows all signals when limit is "all"', () => {
    const visible = sliceVisibleSignals(signals147, 'all');
    expect(visible).toHaveLength(147);
    expect(visible[146].name).toBe('sig_146');
    expect(formatSignalCountSummary(visible.length, signals147.length)).toBe(
      'Showing 147 of 147 signals'
    );
  });

  it('handles signal lists smaller than the configured limit without padding', () => {
    const small = signals147.slice(0, 10);
    expect(sliceVisibleSignals(small, 24)).toHaveLength(10);
    expect(formatSignalCountSummary(10, 10)).toBe('Showing 10 of 10 signals');
  });
});

describe('Wave Viewer & Theme persistence (Phase C.2)', () => {
  it('saves and loads visible signal count across all supported options', () => {
    const storage = createMemoryStorage();
    expect(loadVisibleSignalLimit(storage)).toBe(24);

    for (const opt of [24, 48, 96, 'all'] as VisibleSignalLimit[]) {
      expect(saveVisibleSignalLimit(opt, storage)).toBe(true);
      expect(loadVisibleSignalLimit(storage)).toBe(opt);
    }
  });

  it('falls back to 24 when stored visible signal count is corrupted', () => {
    const storage = createMemoryStorage();
    storage.setItem(WAVE_VISIBLE_COUNT_STORAGE_KEY, '999');
    expect(loadVisibleSignalLimit(storage)).toBe(24);
  });

  it('saves and loads UI theme preference with warm-lab as default', () => {
    const storage = createMemoryStorage();
    expect(DEFAULT_UI_THEME).toBe('warm-lab');
    expect(loadUiTheme(storage)).toBe('warm-lab');

    expect(saveUiTheme('classic', storage)).toBe(true);
    expect(loadUiTheme(storage)).toBe('classic');

    expect(saveUiTheme('warm-lab', storage)).toBe(true);
    expect(loadUiTheme(storage)).toBe('warm-lab');
  });

  it('falls back to warm-lab when stored theme preference is invalid', () => {
    const storage = createMemoryStorage();
    storage.setItem(UI_THEME_STORAGE_KEY, 'neon-invalid');
    expect(loadUiTheme(storage)).toBe('warm-lab');
  });

  it('does not alter HardwareConfig schema version or storage key', () => {
    expect(HARDWARE_CONFIG_SCHEMA_VERSION).toBe(1);
    expect(WAVE_VISIBLE_COUNT_STORAGE_KEY).not.toBe(HARDWARE_CONFIG_STORAGE_KEY);
    expect(UI_THEME_STORAGE_KEY).not.toBe(HARDWARE_CONFIG_STORAGE_KEY);
  });
});
