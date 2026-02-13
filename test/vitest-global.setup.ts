import * as fs from 'node:fs/promises';
import type { TestProject } from 'vitest/node';
import { fixturesDirectoryPath } from './test-utils.js';

export async function setup(project: TestProject): Promise<void> {
  await fs.rm(fixturesDirectoryPath, { force: true, recursive: true });

  await fs.mkdir(fixturesDirectoryPath, { recursive: true });
}

export async function teardown(): Promise<void> {
  if (process.env.KEEP_FIXTURES_DIR !== 'true') {
    await fs.rm(fixturesDirectoryPath, { force: true, recursive: true });
  }
}
