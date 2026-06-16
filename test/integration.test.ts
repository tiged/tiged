import { expect } from 'vitest';
import { getOutputDirectoryPath, runTigedCLI } from './test-utils.js';

const mode = 'tar' as const;

it('tiged/tiged-test-repo', async ({ expect }) => {
  const outputDirectory = getOutputDirectoryPath('tiged/tiged-test-repo');

  await expect(
    runTigedCLI(['--mode', mode, 'tiged/tiged-test-repo', outputDirectory]),
  ).resolves.not.toThrowError();

  await expect(outputDirectory).toMatchFiles({
    'file.txt': 'hello from github!',
    subdir: null,
    'subdir/file.txt': 'hello from a subdirectory!',
  });
});

const shouldSkipPrivateRepoTests = process.env.PRIVATE_REPO_TEST !== 'true';

describe('cli error handling', () => {
  it('fails when --use-token is used without GH_TOKEN or GITHUB_TOKEN set', async ({ expect }) => {
    await expect(
      runTigedCLI(['--mode', mode, '--use-token', 'tiged/private-test', '.tmp/test']),
    ).rejects.toThrowError(/The --use-token flag requires the GH_TOKEN or GITHUB_TOKEN environment variable to be set/);
  });
});

describe.skipIf(shouldSkipPrivateRepoTests)('private repos', () => {
  const testCases = [
    'tiged/private-test',
    'github:tiged/private-test',
    'https://github.com/tiged/private-test.git',
  ] as const;

  it.for(testCases)('%s', async (src, { expect }) => {
    const outputDirectory = getOutputDirectoryPath(src);

    await expect(
      runTigedCLI(['--mode', mode, '--use-token', src, outputDirectory]),
    ).resolves.not.toThrowError();

    await expect(outputDirectory).toMatchFiles({
      'README.md': '# private-test',
    });
  });
});
