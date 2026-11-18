import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'fpga-io-tests-'));
const outfile = join(tempDir, 'ioConfig.test.mjs');

try {
  await build({
    entryPoints: [resolve('tests/io_config/ioConfig.test.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
  });

  execFileSync(process.execPath, [outfile], { stdio: 'inherit' });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
