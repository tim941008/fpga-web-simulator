export interface PortDefinition {
  name: string;
  direction: 'input' | 'output' | 'inout';
  msb: number;
  lsb: number;
  width: number;
  isReg?: boolean;
}

export interface SignalHistoryEntry {
  cycle: number;
  halfCycle: number; // 0 = negedge / settled, 1 = posedge
  values: Record<string, bigint>;
}
