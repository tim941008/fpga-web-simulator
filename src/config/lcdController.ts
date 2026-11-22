import { LcdCharacterComponentConfig } from '../types/hardwareConfig';

export const LCD_ROWS = 2;
export const LCD_COLS = 16;
export const LCD_DDRAM_LINE_LEN = 40;
export const LCD_DDRAM_SIZE = LCD_ROWS * LCD_DDRAM_LINE_LEN; // 80 bytes

export interface LcdSignalSample {
  data: number; // 8-bit unsigned (0..255)
  rs: 0 | 1;
  rw: 0 | 1;
  en: 0 | 1;
  rst: 0 | 1;
}

export interface LcdState {
  ddram: number[];
  cursorAddr: number; // 0..79 (0..39 = row 0, 40..79 = row 1)
  displayShift: number; // 0..39
  increment: boolean;
  shiftOnWrite: boolean;
  displayOn: boolean;
  cursorVisible: boolean;
  cursorBlink: boolean;
  prevEn: 0 | 1;
  writeCount: number;
  lastCommand: number | null;
}

export function createInitialLcdState(): LcdState {
  return {
    ddram: new Array<number>(LCD_DDRAM_SIZE).fill(0x20),
    cursorAddr: 0,
    displayShift: 0,
    increment: true,
    shiftOnWrite: false,
    displayOn: true,
    cursorVisible: false,
    cursorBlink: false,
    prevEn: 0,
    writeCount: 0,
    lastCommand: null,
  };
}

function advanceCursor(addr: number, delta: 1 | -1): number {
  if (delta === 1) {
    if (addr === 39) return 40;
    if (addr >= 79) return 0;
    return addr + 1;
  }
  if (addr === 0) return 79;
  if (addr === 40) return 39;
  return addr - 1;
}

/**
 * Applies a single latched HD44780 command or data write (mutates `state` in place for hot-loop speed).
 */
export function applyLcdWrite(state: LcdState, rs: 0 | 1, rawByte: number): void {
  const byte = rawByte & 0xff;
  state.writeCount += 1;

  if (rs === 1) {
    state.ddram[state.cursorAddr] = byte;
    state.cursorAddr = advanceCursor(state.cursorAddr, state.increment ? 1 : -1);
    if (state.shiftOnWrite) {
      state.displayShift =
        (state.displayShift + (state.increment ? 1 : LCD_DDRAM_LINE_LEN - 1)) %
        LCD_DDRAM_LINE_LEN;
    }
    return;
  }

  // Command decode (RS = 0)
  state.lastCommand = byte;
  if (byte === 0x01) {
    // Clear Display
    state.ddram.fill(0x20);
    state.cursorAddr = 0;
    state.displayShift = 0;
    state.increment = true;
  } else if ((byte & 0xfe) === 0x02) {
    // Return Home (0x02 / 0x03)
    state.cursorAddr = 0;
    state.displayShift = 0;
  } else if ((byte & 0xfc) === 0x04) {
    // Entry Mode Set (0x04..0x07)
    state.increment = (byte & 0x02) !== 0;
    state.shiftOnWrite = (byte & 0x01) !== 0;
  } else if ((byte & 0xf8) === 0x08) {
    // Display On/Off Control (0x08..0x0F)
    state.displayOn = (byte & 0x04) !== 0;
    state.cursorVisible = (byte & 0x02) !== 0;
    state.cursorBlink = (byte & 0x01) !== 0;
  } else if ((byte & 0xf0) === 0x10) {
    // Cursor or Display Shift (0x10..0x1F)
    const shiftDisplay = (byte & 0x08) !== 0;
    const shiftRight = (byte & 0x04) !== 0;
    if (shiftDisplay) {
      state.displayShift =
        (state.displayShift + (shiftRight ? LCD_DDRAM_LINE_LEN - 1 : 1)) %
        LCD_DDRAM_LINE_LEN;
    } else {
      state.cursorAddr = advanceCursor(state.cursorAddr, shiftRight ? 1 : -1);
    }
  } else if ((byte & 0x80) !== 0) {
    // Set DDRAM Address (0x80..0xFF)
    const addr = byte & 0x7f;
    if (addr < LCD_DDRAM_LINE_LEN) {
      state.cursorAddr = addr;
    } else if (addr >= 0x40 && addr < 0x40 + LCD_DDRAM_LINE_LEN) {
      state.cursorAddr = LCD_DDRAM_LINE_LEN + (addr - 0x40);
    }
  }
}

/**
 * Steps the HD44780 LCD state from a sampled HDL signal snapshot.
 * Resets synchronously when `sample.rst === 1`; latches writes on `en` falling edge (1 -> 0).
 */
export function stepLcdState(state: LcdState, sample: LcdSignalSample): void {
  if (sample.rst === 1) {
    state.ddram.fill(0x20);
    state.cursorAddr = 0;
    state.displayShift = 0;
    state.increment = true;
    state.shiftOnWrite = false;
    state.displayOn = true;
    state.cursorVisible = false;
    state.cursorBlink = false;
    state.prevEn = sample.en;
    state.writeCount = 0;
    state.lastCommand = null;
    return;
  }

  const fallingEdge = state.prevEn === 1 && sample.en === 0;
  state.prevEn = sample.en;

  if (fallingEdge && sample.rw === 0) {
    applyLcdWrite(state, sample.rs, sample.data);
  }
}

/**
 * Reads the configured LCD signals from a signal snapshot (or `readSignal` callback)
 * and builds an `LcdSignalSample`.
 */
export function extractLcdSample(
  config: LcdCharacterComponentConfig,
  read: (signalName: string) => bigint
): LcdSignalSample {
  const data = Number(read(config.dataSignalName) & 0xffn);
  const rs: 0 | 1 = (read(config.rsSignalName) & 1n) !== 0n ? 1 : 0;
  const rw: 0 | 1 =
    config.rwSignalName && (read(config.rwSignalName) & 1n) !== 0n ? 1 : 0;
  const en: 0 | 1 = (read(config.enSignalName) & 1n) !== 0n ? 1 : 0;
  let rst: 0 | 1 = 0;
  if (config.rstSignalName) {
    const rawRst = (read(config.rstSignalName) & 1n) !== 0n;
    rst = (config.rstPolarity === 'active-low' ? !rawRst : rawRst) ? 1 : 0;
  }
  return { data, rs, rw, en, rst };
}

export function cloneLcdState(state: LcdState): LcdState {
  return {
    ...state,
    ddram: state.ddram.slice(),
  };
}

export function decodeLcdChar(code: number): string {
  const c = code & 0xff;
  if (c >= 0x20 && c <= 0x7d) return String.fromCharCode(c);
  if (c === 0x7e) return '→';
  if (c === 0x7f) return '←';
  if (c === 0xdf) return '°';
  if (c < 0x20) return ' ';
  return ' ';
}

export interface LcdDisplayView {
  lines: [string[], string[]];
  cursor: { row: 0 | 1; col: number } | null;
}

export function getLcdDisplayView(state: LcdState): LcdDisplayView {
  if (!state.displayOn) {
    return {
      lines: [new Array(LCD_COLS).fill(' '), new Array(LCD_COLS).fill(' ')],
      cursor: null,
    };
  }

  const row0: string[] = [];
  const row1: string[] = [];
  for (let col = 0; col < LCD_COLS; col++) {
    const offset = (state.displayShift + col) % LCD_DDRAM_LINE_LEN;
    row0.push(decodeLcdChar(state.ddram[offset]));
    row1.push(decodeLcdChar(state.ddram[LCD_DDRAM_LINE_LEN + offset]));
  }

  let cursor: { row: 0 | 1; col: number } | null = null;
  if (state.cursorVisible) {
    const row: 0 | 1 = state.cursorAddr < LCD_DDRAM_LINE_LEN ? 0 : 1;
    const lineAddr =
      row === 0 ? state.cursorAddr : state.cursorAddr - LCD_DDRAM_LINE_LEN;
    const visCol =
      (lineAddr - state.displayShift + LCD_DDRAM_LINE_LEN) % LCD_DDRAM_LINE_LEN;
    if (visCol >= 0 && visCol < LCD_COLS) {
      cursor = { row, col: visCol };
    }
  }

  return { lines: [row0, row1], cursor };
}
