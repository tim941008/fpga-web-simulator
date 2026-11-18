export type BoardComponentId =
  | 'CLOCK'
  | 'KEY'
  | 'SW'
  | 'LEDR'
  | 'LEDG'
  | 'HEX0'
  | 'HEX1'
  | 'HEX2'
  | 'HEX3'
  | 'HEX4'
  | 'HEX5'
  | 'MATRIX_ROW'
  | 'MATRIX_COL';

export type ComponentCategory =
  | 'CLOCK'
  | 'KEY'
  | 'SW'
  | 'LEDR'
  | 'LEDG'
  | 'HEX'
  | 'MATRIX_ROW'
  | 'MATRIX_COL';

export interface BoardComponentSpec {
  id: BoardComponentId;
  category: ComponentCategory;
  direction: 'input' | 'output';
  nominalWidth: number;
  minWidth: number;
  maxWidth: number;
  /** Exact width required (e.g. CLOCK must be 1-bit) */
  strictExactWidth?: boolean;
  /** Minimum width strictly required (e.g. HEX requires >= 7 bits) */
  strictMinWidth?: boolean;
}

export interface PortDefinition {
  name: string;
  direction: 'input' | 'output' | 'inout';
  msb: number;
  lsb: number;
  width: number;
  isReg?: boolean;
}

export type IoAssignmentStatus = 'configured' | 'unassigned' | 'conflict' | 'invalid';

export type ValidationIssueCode =
  | 'DIRECTION_MISMATCH'
  | 'DIRECTION_CHANGED'
  | 'CLOCK_WIDTH_INVALID'
  | 'HEX_WIDTH_TOO_SMALL'
  | 'WIDTH_EXCEEDS_64'
  | 'DUPLICATE_COMPONENT'
  | 'WIDTH_EXCEEDS_COMPONENT'
  | 'HEX_DP_UNUSED'
  | 'MATRIX_WIDTH_MISMATCH';

export interface ValidationIssue {
  code: ValidationIssueCode;
  severity: 'error' | 'warning';
  portName: string;
  componentId: BoardComponentId;
  portWidth: number;
  componentWidth: number;
  portDirection: 'input' | 'output' | 'inout';
  componentDirection: 'input' | 'output';
  prevDirection?: 'input' | 'output' | 'inout';
  prevWidth?: number;
  conflictingPorts?: string[];
}

export interface PortIoAssignment {
  componentId: BoardComponentId;
  configuredDirection: 'input' | 'output' | 'inout';
  configuredWidth: number;
}

export interface PortValidationResult {
  port: PortDefinition;
  componentId: BoardComponentId | null;
  status: IoAssignmentStatus;
  issues: ValidationIssue[];
  signatureChanged?: boolean;
}

export interface IoResourceWarning {
  code: 'MATRIX_MISSING_COL' | 'MATRIX_MISSING_ROW';
}

export interface IoValidationSummary {
  results: PortValidationResult[];
  byPort: Record<string, PortValidationResult>;
  configuredCount: number;
  unassignedCount: number;
  conflictCount: number;
  invalidCount: number;
  warningCount: number;
  resourceWarnings: IoResourceWarning[];
}

export interface BoardControlGroup {
  componentId: BoardComponentId;
  category: ComponentCategory;
  baseName: string; // Mapped Verilog port name
  width: number; // Verilog port width
  maxWidth: number; // Physical board component width capacity
  msb: number;
  lsb: number;
  direction: 'input' | 'output' | 'inout';
  hasWidthWarning: boolean;
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
