// @ts-nocheck
// Subset of 8bitworkshop src/common/emu.ts (GPL-3.0) needed by hdlruntime.ts
import { SourceLocation } from './workertypes';

export class EmuHalt extends Error {
  $loc: SourceLocation;
  pc?: number;
  squelchError = true;
  normal: boolean;
  constructor(msg: string, loc?: SourceLocation, normal = false) {
    super(msg);
    this.$loc = loc;
    this.normal = normal;
    Object.setPrototypeOf(this, EmuHalt.prototype);
  }
}
