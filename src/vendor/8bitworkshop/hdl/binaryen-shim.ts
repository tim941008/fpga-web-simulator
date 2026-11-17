// @ts-nocheck
// binaryen@101 is a CommonJS module (`module.exports = binaryen`).
// Re-export it as an ES default so the vendored hdlwasm.ts works under Vite.
import binaryenModule from 'binaryen';

const binaryen: any = (binaryenModule as any).default ?? binaryenModule;

/** Resolves once binaryen's internal WASM is ready (no-op on sync builds). */
export async function binaryenReady(): Promise<void> {
  if (binaryen && binaryen.ready && typeof binaryen.ready.then === 'function') {
    await binaryen.ready;
  }
}

export default binaryen;
