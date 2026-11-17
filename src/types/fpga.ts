export type ComponentCategory =
  | 'CLOCK'
  | 'KEY'
  | 'SW'
  | 'LED'
  | 'HEX'
  | 'MATRIX_ROW'
  | 'MATRIX_COL'
  | 'MATRIX_PIXEL'
  | 'GPIO';

export interface PinAssignment {
  signalName: string;       // Raw signal identifier in QSF, e.g. "SW[0]" or "HEX0[6]"
  baseName: string;         // Base vector name, e.g. "SW", "HEX0", "KEY"
  bitIndex: number | null;  // Bit index if bus, e.g. 0..15, or null for scalar
  pinLocation: string;      // Physical FPGA pin, e.g. "PIN_AB12"
  ioStandard?: string;      // e.g. "3.3-V LVTTL"
  category: ComponentCategory;
  direction: 'input' | 'output' | 'inout';
  hasConflict?: boolean;    // True when multiple signals share the same physical pin
}

export interface PortDefinition {
  name: string;
  direction: 'input' | 'output' | 'inout';
  msb: number;
  lsb: number;
  width: number;
  isReg?: boolean;
}

export interface ParsedDesign {
  topModule: string;
  ports: PortDefinition[];
  internalSignals: PortDefinition[];
  pinAssignments: PinAssignment[];
  deviceFamily?: string;
  partNumber?: string;
}

export interface BoardControlGroup {
  category: ComponentCategory;
  baseName: string;
  width: number;
  msb: number;
  lsb: number;
  direction: 'input' | 'output' | 'inout';
  pins: Record<number, string>; // bitIndex -> PIN_XXXX
}

export interface SignalHistoryEntry {
  cycle: number;
  halfCycle: number; // 0 = posedge, 1 = negedge
  values: Record<string, bigint>;
}

export interface SimulationState {
  running: boolean;
  clockHz: number;
  cycleCount: number;
  clockLevel: 0 | 1;
  backendMode: 'verilator-wasm' | 'verilator-inbrowser-rtl';
  wasmLoaded: boolean;
  signals: Record<string, bigint>;
  history: SignalHistoryEntry[];
}
