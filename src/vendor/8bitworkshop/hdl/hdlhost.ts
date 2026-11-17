// @ts-nocheck
// Minimal replacement for 8bitworkshop src/common/hdl/hdlhost.ts
// (the original depends on the IDE waveform UI, which this project doesn't use).
export interface HDLHost {
  showSettleCount(evals: number | null): void;
}

let host: HDLHost | null = null;

export function setHDLHost(h: HDLHost | null) {
  host = h;
}

export function getHDLHost(): HDLHost | null {
  return host;
}
