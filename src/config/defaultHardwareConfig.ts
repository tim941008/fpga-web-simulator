import { PortDefinition } from '../types/fpga';
import {
  HARDWARE_CONFIG_SCHEMA_VERSION,
  HardwareComponentConfig,
  HardwareComponentType,
  HardwareConfigSchema,
  SevenSegmentBitMap,
} from '../types/hardwareConfig';
import { createDefaultMatrixPattern } from './matrixMapping';

export const STANDARD_SEVEN_SEG_MAP: SevenSegmentBitMap = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  g: 6,
  dp: 7,
};

/**
 * Default hardware configuration for Preset 1 (`top_fpga_demo`).
 */
export function createFullDemoHardwareConfig(): HardwareConfigSchema {
  return {
    schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
    boardName: 'Custom FPGA Board — Complete Demo',
    components: [
      {
        id: 'clk-1',
        type: 'CLOCK',
        label: 'System Clock',
        enabled: true,
        signalName: 'CLOCK_50',
        width: 1,
        polarity: 'active-high',
        defaultHz: 30,
      },
      {
        id: 'sw-1',
        type: 'SWITCH',
        label: 'Slide Switches',
        enabled: true,
        signalName: 'SW',
        width: 10,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        initialValue: '0',
      },
      {
        id: 'key-1',
        type: 'KEY',
        label: 'Push Buttons',
        enabled: true,
        signalName: 'KEY',
        width: 4,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        behavior: 'momentary',
        initialPressed: [false, false, false, false],
      },
      {
        id: 'led-1',
        type: 'LED',
        label: 'Red Status LEDs',
        enabled: true,
        signalName: 'LEDR',
        width: 10,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        color: 'rose',
      },
      {
        id: 'hex-1',
        type: 'SEVEN_SEGMENT',
        label: 'HEX1',
        enabled: true,
        signalName: 'HEX1',
        width: 7,
        bitOrder: 'lsb-to-msb',
        polarity: 'active-low',
        segmentMap: { ...STANDARD_SEVEN_SEG_MAP, dp: null },
        showDecimalPoint: false,
        color: 'rose',
      },
      {
        id: 'hex-0',
        type: 'SEVEN_SEGMENT',
        label: 'HEX0',
        enabled: true,
        signalName: 'HEX0',
        width: 7,
        bitOrder: 'lsb-to-msb',
        polarity: 'active-low',
        segmentMap: { ...STANDARD_SEVEN_SEG_MAP, dp: null },
        showDecimalPoint: false,
        color: 'rose',
      },
      {
        id: 'matrix-1',
        type: 'MATRIX',
        label: '16×16 LED Matrix',
        enabled: true,
        row: {
          signalName: 'MATRIX_ROW',
          width: 16,
          bitOrder: '0-to-15',
          polarity: 'active-high',
        },
        col: {
          signalName: 'MATRIX_COL',
          width: 16,
          bitOrder: '15-to-0',
          polarity: 'active-high',
        },
        povEnabled: true,
        color: 'emerald',
        displayMode: 'live',
        pattern: createDefaultMatrixPattern(),
      },
    ],
  };
}

/**
 * Reusable factory that builds a board hardware configuration containing only the
 * standard board components whose signal(s) exist in `signalNames`.
 * Keeps multi-file examples and subset designs free of missing-signal errors.
 */
export function createBoardConfigForSignals(
  boardName: string,
  signalNames: readonly string[]
): HardwareConfigSchema {
  const allowed = new Set(signalNames);
  const full = createFullDemoHardwareConfig();
  return {
    schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
    boardName,
    components: full.components.filter((comp) => {
      if (comp.type === 'MATRIX') {
        return allowed.has(comp.row.signalName) && allowed.has(comp.col.signalName);
      }
      if (comp.type === 'LCD_CHARACTER') {
        return (
          allowed.has(comp.dataSignalName) &&
          allowed.has(comp.rsSignalName) &&
          allowed.has(comp.enSignalName)
        );
      }
      return allowed.has(comp.signalName);
    }),
  };
}

/**
 * Default hardware configuration for Preset 2 (`comb_alu`).
 */
export function createCombAluHardwareConfig(): HardwareConfigSchema {
  return {
    schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
    boardName: 'Custom FPGA Board — 4-Bit ALU',
    components: [
      {
        id: 'sw-alu',
        type: 'SWITCH',
        label: 'Operands A/B (SW)',
        enabled: true,
        signalName: 'SW',
        width: 8,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        initialValue: '0',
      },
      {
        id: 'key-alu',
        type: 'KEY',
        label: 'ALU Op Select (KEY)',
        enabled: true,
        signalName: 'KEY',
        width: 2,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        behavior: 'toggle',
        initialPressed: [false, false],
      },
      {
        id: 'led-alu',
        type: 'LED',
        label: 'ALU Result LEDs',
        enabled: true,
        signalName: 'LEDR',
        width: 8,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        color: 'rose',
      },
      {
        id: 'hex-alu',
        type: 'SEVEN_SEGMENT',
        label: 'HEX0',
        enabled: true,
        signalName: 'HEX0',
        width: 7,
        bitOrder: 'lsb-to-msb',
        polarity: 'active-low',
        segmentMap: { ...STANDARD_SEVEN_SEG_MAP, dp: null },
        showDecimalPoint: false,
        color: 'rose',
      },
    ],
  };
}

/**
 * Creates a new blank component configuration of the requested type,
 * optionally pre-selecting a matching port if one is available.
 */
export function createNewComponentConfig(
  type: HardwareComponentType,
  ports: PortDefinition[],
  existingCount: number
): HardwareComponentConfig {
  const id = `${type.toLowerCase()}-${Date.now().toString(36)}-${existingCount + 1}`;
  const inputPorts = ports.filter((p) => p.direction === 'input');
  const outputPorts = ports.filter((p) => p.direction === 'output');

  switch (type) {
    case 'CLOCK': {
      const p = inputPorts.find((x) => /clk|clock/i.test(x.name)) ?? inputPorts[0];
      return {
        id,
        type: 'CLOCK',
        label: `Clock ${existingCount + 1}`,
        enabled: true,
        signalName: p?.name ?? '',
        width: 1,
        polarity: 'active-high',
        defaultHz: 30,
      };
    }
    case 'SWITCH': {
      const p = inputPorts.find((x) => /sw|in|data/i.test(x.name)) ?? inputPorts[0];
      return {
        id,
        type: 'SWITCH',
        label: `Switch Group ${existingCount + 1}`,
        enabled: true,
        signalName: p?.name ?? '',
        width: p?.width ?? 8,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        initialValue: '0',
      };
    }
    case 'KEY': {
      const p = inputPorts.find((x) => /key|btn|rst|reset/i.test(x.name)) ?? inputPorts[0];
      const w = p?.width ?? 4;
      return {
        id,
        type: 'KEY',
        label: `KEY Buttons ${existingCount + 1}`,
        enabled: true,
        signalName: p?.name ?? '',
        width: w,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        behavior: 'momentary',
        initialPressed: Array(w).fill(false),
      };
    }
    case 'LED': {
      const p = outputPorts.find((x) => /led|out/i.test(x.name)) ?? outputPorts[0];
      return {
        id,
        type: 'LED',
        label: `LED Strip ${existingCount + 1}`,
        enabled: true,
        signalName: p?.name ?? '',
        width: p?.width ?? 8,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        color: 'rose',
      };
    }
    case 'SEVEN_SEGMENT': {
      const p = outputPorts.find((x) => /hex|seg|disp/i.test(x.name)) ?? outputPorts[0];
      return {
        id,
        type: 'SEVEN_SEGMENT',
        label: `7-Seg ${existingCount + 1}`,
        enabled: true,
        signalName: p?.name ?? '',
        width: p?.width ?? 7,
        bitOrder: 'lsb-to-msb',
        polarity: 'active-low',
        segmentMap: { ...STANDARD_SEVEN_SEG_MAP, dp: (p?.width ?? 7) >= 8 ? 7 : null },
        showDecimalPoint: (p?.width ?? 7) >= 8,
        color: 'rose',
      };
    }
    case 'MATRIX': {
      const rowPort = outputPorts.find((x) => /row/i.test(x.name));
      const colPort = outputPorts.find((x) => /col/i.test(x.name));
      return {
        id,
        type: 'MATRIX',
        label: `16×16 Matrix ${existingCount + 1}`,
        enabled: true,
        row: {
          signalName: rowPort?.name ?? '',
          width: rowPort?.width ?? 16,
          bitOrder: '0-to-15',
          polarity: 'active-high',
        },
        col: {
          signalName: colPort?.name ?? '',
          width: colPort?.width ?? 16,
          bitOrder: '15-to-0',
          polarity: 'active-high',
        },
        povEnabled: true,
        color: 'emerald',
        displayMode: rowPort && colPort ? 'live' : 'pattern',
        pattern: createDefaultMatrixPattern(),
      };
    }
    case 'LCD_CHARACTER': {
      const dataPort = outputPorts.find((x) => /lcd_data|data/i.test(x.name));
      const rsPort = outputPorts.find((x) => /lcd_rs|\brs\b/i.test(x.name));
      const rwPort = outputPorts.find((x) => /lcd_rw|\brw\b/i.test(x.name));
      const enPort = outputPorts.find((x) => /lcd_en|\ben\b/i.test(x.name));
      const rstPort = ports.find((x) => /lcd_rst|\brst\b/i.test(x.name));
      return {
        id,
        type: 'LCD_CHARACTER',
        label: `16×2 LCD ${existingCount + 1}`,
        enabled: true,
        dataSignalName: dataPort?.name ?? '',
        rsSignalName: rsPort?.name ?? '',
        rwSignalName: rwPort?.name ?? '',
        enSignalName: enPort?.name ?? '',
        rstSignalName: rstPort?.name ?? '',
        rstPolarity: 'active-high',
        backlight: 'green',
      };
    }
  }
}

/**
 * Default hardware configuration for Example 5 (`top_lcd_hello`).
 */
export function createLcdHelloWorldHardwareConfig(): HardwareConfigSchema {
  return {
    schemaVersion: HARDWARE_CONFIG_SCHEMA_VERSION,
    boardName: 'Multi-File Example — 16×2 LCD Hello World',
    components: [
      {
        id: 'clk-lcd',
        type: 'CLOCK',
        label: 'System Clock',
        enabled: true,
        signalName: 'CLOCK_50',
        width: 1,
        polarity: 'active-high',
        defaultHz: 100,
      },
      {
        id: 'key-lcd',
        type: 'KEY',
        label: 'Reset Button (rst)',
        enabled: true,
        signalName: 'rst',
        width: 1,
        bitOrder: 'msb-to-lsb',
        polarity: 'active-high',
        behavior: 'momentary',
        initialPressed: [false],
        bitLabels: ['RST'],
      },
      {
        id: 'lcd-1',
        type: 'LCD_CHARACTER',
        label: '16×2 Character LCD',
        enabled: true,
        dataSignalName: 'data',
        rsSignalName: 'rs',
        rwSignalName: 'rw',
        enSignalName: 'en',
        rstSignalName: 'rst',
        rstPolarity: 'active-high',
        backlight: 'green',
      },
    ],
  };
}
