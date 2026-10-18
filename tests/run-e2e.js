import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'film-collection-e2e-'));
const databasePath = path.join(temporaryDirectory, 'e2e.db');
const databaseUrl = `file:${databasePath.replaceAll('\\', '/')}`;
const prismaCli = path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js');
const schemaPath = path.join(projectRoot, 'prisma', 'schema.prisma');

try {
  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--schema', schemaPath, '--skip-generate'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  execFileSync(process.execPath, [
    '--test',
    '--test-concurrency=1',
    path.join(projectRoot, 'tests', 'mobile-intake.integration.test.js'),
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      OCR_SAMPLE_DIR: process.env.OCR_SAMPLE_DIR || path.join(os.homedir(), 'Pictures'),
    },
    stdio: 'inherit',
  });
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
