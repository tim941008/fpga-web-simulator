import { MatrixBitOrder, MatrixComponentConfig, SignalPolarity } from '../types/hardwareConfig';
import { isRawBitActive } from './hardwareMapping';

export const MATRIX_SIZE = 16;

/**
 * Default 16x16 LED Matrix UI Preview / Template Pattern.
 *
 * IMPORTANT: This pattern is strictly a UI preview / default template and is NEVER
 * injected into or used to overwrite user Verilog simulation signals.
 */
export const DEFAULT_MATRIX_PATTERN: readonly number[] = Object.freeze([
  0b1111111111111111, // board[0]
  0b1111111111111111, // board[1]
  0b1000000100000011, // board[2]
  0b1000000000000001, // board[3]
  0b1000000000000001, // board[4]
  0b1000000000000001, // board[5]
  0b1000000000000001, // board[6]
  0b1000000000000001, // board[7]
  0b1000000000000001, // board[8]
  0b1000000000000001, // board[9]
  0b1000000000000001, // board[10]
  0b1000000000000001, // board[11]
  0b1000000000000001, // board[12]
  0b1000000010000001, // board[13]
  0b1111111111111111, // board[14]
  0b1111111111111111, // board[15]
]);

export function createDefaultMatrixPattern(): number[] {
  return [...DEFAULT_MATRIX_PATTERN];
}

export function createEmptyMatrixBuffer(size: number = MATRIX_SIZE): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

/**
 * Maps a display row coordinate (0 = top row, width - 1 = bottom row)
 * to the corresponding Verilog ROW signal bit index.
 *
 * - '15-to-0': Bit 15 -> top row (displayRow 0), Bit 0 -> bottom row (displayRow 15)
 * - '0-to-15': Bit 0  -> top row (displayRow 0), Bit 15 -> bottom row (displayRow 15)
 */
export function mapMatrixRowToBit(
  displayRow: number,
  bitOrder: MatrixBitOrder,
  width: number = MATRIX_SIZE
): number {
  const safeWidth = Math.max(1, Math.min(MATRIX_SIZE, Math.floor(width)));
  if (displayRow < 0 || displayRow >= safeWidth) {
    throw new RangeError(`displayRow ${displayRow} out of range [0, ${safeWidth - 1}]`);
  }
  return bitOrder === '15-to-0' ? safeWidth - 1 - displayRow : displayRow;
}

/**
 * Maps a display column coordinate (0 = leftmost col, width - 1 = rightmost col)
 * to the corresponding Verilog COLUMN signal bit index.
 *
 * - '15-to-0': Bit 15 -> leftmost col (displayCol 0), Bit 0 -> rightmost col (displayCol 15)
 * - '0-to-15': Bit 0  -> leftmost col (displayCol 0), Bit 15 -> rightmost col (displayCol 15)
 */
export function mapMatrixColToBit(
  displayCol: number,
  bitOrder: MatrixBitOrder,
  width: number = MATRIX_SIZE
): number {
  const safeWidth = Math.max(1, Math.min(MATRIX_SIZE, Math.floor(width)));
  if (displayCol < 0 || displayCol >= safeWidth) {
    throw new RangeError(`displayCol ${displayCol} out of range [0, ${safeWidth - 1}]`);
  }
  return bitOrder === '15-to-0' ? safeWidth - 1 - displayCol : displayCol;
}

/**
 * Evaluates whether a single (displayRow, displayCol) pixel is active given
 * raw Verilog ROW and COLUMN signal values and independent axis configs.
 * Pure function — never modifies underlying Verilog signal values.
 */
export function evaluateMatrixPixel(
  displayRow: number,
  displayCol: number,
  rowSignalValue: bigint,
  colSignalValue: bigint,
  rowConfig: { bitOrder: MatrixBitOrder; polarity: SignalPolarity; width: number },
  colConfig: { bitOrder: MatrixBitOrder; polarity: SignalPolarity; width: number }
): { rowActive: boolean; colActive: boolean; pixelOn: boolean; rowBit: number; colBit: number } {
  const rowBit = mapMatrixRowToBit(displayRow, rowConfig.bitOrder, rowConfig.width);
  const colBit = mapMatrixColToBit(displayCol, colConfig.bitOrder, colConfig.width);
  const rowActive = isRawBitActive(rowSignalValue, rowBit, rowConfig.polarity);
  const colActive = isRawBitActive(colSignalValue, colBit, colConfig.polarity);
  return {
    rowActive,
    colActive,
    pixelOn: rowActive && colActive,
    rowBit,
    colBit,
  };
}

export const DEFAULT_POV_HALF_LIFE_MS = 120;

/**
 * Computes an exponential time-based POV decay factor for elapsed time `dtMs`.
 * Keeps matrix persistence visually consistent regardless of simulation frequency (BUG-14).
 */
export function computePovDecayFactor(
  dtMs: number,
  halfLifeMs: number = DEFAULT_POV_HALF_LIFE_MS
): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 1;
  if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) return 0;
  return Math.pow(0.5, dtMs / halfLifeMs);
}

/**
 * Samples live Verilog ROW/COL signals into a 16x16 intensity buffer in place.
 * Does not mutate `signals`.
 * When `dtMs` is supplied, POV decay uses exponential time-based decay; when omitted,
 * falls back to the legacy per-step factor (0.96) for deterministic single-step sampling.
 */
export function sampleLiveMatrixIntoBuffer(
  buffer: number[][],
  rowSignalValue: bigint,
  colSignalValue: bigint,
  config: MatrixComponentConfig,
  dtMs?: number
): void {
  const rowWidth = Math.max(1, Math.min(MATRIX_SIZE, config.row.width));
  const colWidth = Math.max(1, Math.min(MATRIX_SIZE, config.col.width));
  const inactiveRowDecay = dtMs === undefined ? 0.96 : computePovDecayFactor(dtMs);
  const inactiveColDecay = dtMs === undefined ? 0.5 : computePovDecayFactor(dtMs, DEFAULT_POV_HALF_LIFE_MS / 2);

  for (let r = 0; r < MATRIX_SIZE; r++) {
    if (r >= rowWidth) {
      for (let c = 0; c < MATRIX_SIZE; c++) buffer[r][c] = 0;
      continue;
    }

    const rowBit = mapMatrixRowToBit(r, config.row.bitOrder, rowWidth);
    const rowActive = isRawBitActive(rowSignalValue, rowBit, config.row.polarity);

    if (!rowActive) {
      if (!config.povEnabled) {
        for (let c = 0; c < MATRIX_SIZE; c++) buffer[r][c] = 0;
      } else {
        for (let c = 0; c < MATRIX_SIZE; c++) buffer[r][c] *= inactiveRowDecay;
      }
      continue;
    }

    for (let c = 0; c < MATRIX_SIZE; c++) {
      if (c >= colWidth) {
        buffer[r][c] = 0;
        continue;
      }
      const colBit = mapMatrixColToBit(c, config.col.bitOrder, colWidth);
      const colActive = isRawBitActive(colSignalValue, colBit, config.col.polarity);
      if (colActive) {
        buffer[r][c] = 1;
      } else {
        buffer[r][c] = config.povEnabled ? buffer[r][c] * inactiveColDecay : 0;
      }
    }
  }
}

/**
 * Renders a 16-row UI preview/default pattern into a 16x16 display intensity buffer,
 * respecting the Matrix component's independent Row/Column bit order and Column polarity.
 */
export function renderPatternToMatrixBuffer(
  pattern: readonly number[],
  config: Pick<MatrixComponentConfig, 'row' | 'col'>
): number[][] {
  const buf = createEmptyMatrixBuffer(MATRIX_SIZE);
  const rowWidth = Math.max(1, Math.min(MATRIX_SIZE, config.row.width));
  const colWidth = Math.max(1, Math.min(MATRIX_SIZE, config.col.width));

  for (let r = 0; r < rowWidth; r++) {
    const patternRowIdx = mapMatrixRowToBit(r, config.row.bitOrder, rowWidth);
    const rowWord = BigInt((pattern[patternRowIdx] ?? 0) & 0xffff);
    for (let c = 0; c < colWidth; c++) {
      const colBit = mapMatrixColToBit(c, config.col.bitOrder, colWidth);
      const on = isRawBitActive(rowWord, colBit, config.col.polarity);
      buf[r][c] = on ? 1 : 0;
    }
  }

  return buf;
}
