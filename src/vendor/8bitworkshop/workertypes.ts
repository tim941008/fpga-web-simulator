// Subset of 8bitworkshop src/common/workertypes.ts (GPL-3.0)
export interface SourceLocation {
  line: number;
  label?: string;
  path?: string;
  start?: number;
  end?: number;
  segment?: string;
  func?: string;
}
