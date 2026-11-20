export type HardwareComponentType =
  | 'CLOCK'
  | 'KEY'
  | 'SWITCH'
  | 'LED'
  | 'SEVEN_SEGMENT'
  | 'MATRIX';

export type BitOrder = 'msb-to-lsb' | 'lsb-to-msb';
export type MatrixBitOrder = '15-to-0' | '0-to-15';
export type SignalPolarity = 'active-high' | 'active-low';
export type KeyBehavior = 'momentary' | 'toggle';
export type LedColorTheme = 'rose' | 'emerald' | 'amber' | 'cyan' | 'violet';

export interface SevenSegmentBitMap {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  dp: number | null;
}

export interface HardwareComponentBase {
  id: string;
  type: HardwareComponentType;
  label: string;
  enabled: boolean;
}

export interface ClockComponentConfig extends HardwareComponentBase {
  type: 'CLOCK';
  signalName: string;
  width: number;
  polarity: SignalPolarity;
  defaultHz: number;
}

export interface SwitchComponentConfig extends HardwareComponentBase {
  type: 'SWITCH';
  signalName: string;
  width: number;
  bitOrder: BitOrder;
  polarity: SignalPolarity;
  /** Logical initial value encoded as decimal or 0x-prefixed hex string. */
  initialValue: string;
  bitLabels?: string[];
}

export interface KeyComponentConfig extends HardwareComponentBase {
  type: 'KEY';
  signalName: string;
  width: number;
  bitOrder: BitOrder;
  polarity: SignalPolarity;
  behavior: KeyBehavior;
  /** Initial logical pressed state per key bit (index = bitIndex). */
  initialPressed: boolean[];
  bitLabels?: string[];
}

export interface LedComponentConfig extends HardwareComponentBase {
  type: 'LED';
  signalName: string;
  width: number;
  bitOrder: BitOrder;
  polarity: SignalPolarity;
  color: LedColorTheme;
  bitLabels?: string[];
}

export interface SevenSegmentComponentConfig extends HardwareComponentBase {
  type: 'SEVEN_SEGMENT';
  signalName: string;
  width: number;
  bitOrder: BitOrder;
  polarity: SignalPolarity;
  segmentMap: SevenSegmentBitMap;
  showDecimalPoint: boolean;
  color: LedColorTheme;
}

export interface MatrixAxisConfig {
  signalName: string;
  width: number;
  bitOrder: MatrixBitOrder;
  polarity: SignalPolarity;
}

export type MatrixDisplayMode = 'live' | 'pattern';

export interface MatrixComponentConfig extends HardwareComponentBase {
  type: 'MATRIX';
  row: MatrixAxisConfig;
  col: MatrixAxisConfig;
  povEnabled: boolean;
  color: LedColorTheme;
  /**
   * 'live' renders real-time Verilog simulation signals without ever overwriting them.
   * 'pattern' displays the editable UI preview/default pattern template.
   */
  displayMode: MatrixDisplayMode;
  /** 16 rows of 16-bit unsigned integer UI preview/default pattern values. */
  pattern: number[];
}

export type HardwareComponentConfig =
  | ClockComponentConfig
  | SwitchComponentConfig
  | KeyComponentConfig
  | LedComponentConfig
  | SevenSegmentComponentConfig
  | MatrixComponentConfig;

export const HARDWARE_CONFIG_SCHEMA_VERSION = 1;

export interface HardwareConfigSchema {
  schemaVersion: number;
  boardName: string;
  components: HardwareComponentConfig[];
}

export type ValidationIssueCode =
  | 'EMPTY_SIGNAL'
  | 'MISSING_SIGNAL'
  | 'WIDTH_MISMATCH'
  | 'DIRECTION_MISMATCH'
  | 'INVALID_SEGMENT_BIT'
  | 'DUPLICATE_INPUT_BINDING'
  | 'MULTIPLE_ACTIVE_CLOCKS'
  | 'MULTIPLE_ACTIVE_MATRICES';

export interface ComponentValidationIssue {
  componentId: string;
  componentLabel: string;
  field: string;
  severity: 'error' | 'warning';
  code: ValidationIssueCode;
  message: string;
}
