import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/tar.js', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    untarToDir: vi.fn(async () => {
      // Keep these unit tests focused on credential control flow.
      // The tarball files created in this suite are not real archives.
      return Promise.resolve(['README.md']);
    }),
  };
});

import * as utils from '../src/utils.js';
import { createTiged } from '../src/index.js';

const mkTmpDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiged-cred-test-'));
  return dir;
};

describe('credential support (unit)', () => {
  let dir: string;
  let dest: string;

  beforeEach(async () => {
    dir = await mkTmpDir();
    dest = await mkTmpDir();

    // Mock downloadTarball to prevent actual network requests.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    vi.spyOn(utils, 'downloadTarball').mockImplementation(async () => {});

    // Default exec mock: fail fast if we accidentally try to hit git.
    vi.spyOn(utils, 'executeCommand').mockImplementation(() => {
      throw new Error('git exec should not be called in this test');
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(dest, { recursive: true, force: true });
  });

  describe('getGitHubToken', () => {
    it('returns GH_TOKEN when set', () => {
      process.env.GH_TOKEN = 'ghp_test-token';
      delete process.env.GITHUB_TOKEN;

      const token = utils.getGitHubToken();

      expect(token).toBe('ghp_test-token');
    });

    it('returns GITHUB_TOKEN when GH_TOKEN is not set', () => {
      delete process.env.GH_TOKEN;
      process.env.GITHUB_TOKEN = 'github-test-token';

      const token = utils.getGitHubToken();

      expect(token).toBe('github-test-token');
    });

    it('prefers GH_TOKEN over GITHUB_TOKEN', () => {
      process.env.GH_TOKEN = 'ghp-preferred';
      process.env.GITHUB_TOKEN = 'github-not-prefered';

      const token = utils.getGitHubToken();

      expect(token).toBe('ghp-preferred');
    });

    it('returns undefined when no token env vars are set', () => {
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const token = utils.getGitHubToken();

      expect(token).toBeUndefined();
    });
  });

  describe('cloneWithTar with GitHub credentials', () => {
    it('passes token to downloadTarball when site is github and GH_TOKEN is set', async () => {
      process.env.GH_TOKEN = 'ghp_secret-token';

      const fetchRefsSpy = vi.spyOn(utils, 'fetchRefs').mockResolvedValueOnce([
        {
          hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          name: 'main',
          type: 'branch',
        },
      ]);

      // Do NOT create the tar file so fs.stat fails and triggers download.
      const emitter = createTiged('tiged/test-repo#main', {
        force: true,
        verbose: false,
      });

      await emitter.cloneWithTar(dir, dest);

      expect(utils.downloadTarball).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        undefined,
        { token: 'ghp_secret-token' },
      );

      fetchRefsSpy.mockRestore();
    });

    it('passes GITHUB_TOKEN to downloadTarball when GH_TOKEN is not set', async () => {
      delete process.env.GH_TOKEN;
      process.env.GITHUB_TOKEN = 'github_token_value';

      const fetchRefsSpy = vi.spyOn(utils, 'fetchRefs').mockResolvedValueOnce([
        {
          hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          name: 'main',
          type: 'branch',
        },
      ]);

      // Do NOT create the tar file so fs.stat fails and triggers download.
      const emitter = createTiged('tiged/test-repo#main', {
        force: true,
        verbose: false,
      });

      await emitter.cloneWithTar(dir, dest);

      expect(utils.downloadTarball).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        undefined,
        { token: 'github_token_value' },
      );

      fetchRefsSpy.mockRestore();
    });

    it('passes undefined token when site is not github', async () => {
      process.env.GH_TOKEN = 'ghp_should-not-be-used';

      const fetchRefsSpy = vi.spyOn(utils, 'fetchRefs').mockResolvedValueOnce([
        {
          hash: 'cccccccccccccccccccccccccccccccccccccccccc',
          name: 'main',
          type: 'branch',
        },
      ]);

      // Do NOT create the tar file so fs.stat fails and triggers download.
      // GitLab repo - should not pass token even when GH_TOKEN is set.
      const emitter = createTiged('gitlab.com/gitlab-org/gitolite#main', {
        force: true,
        verbose: false,
      });

      await emitter.cloneWithTar(dir, dest);

      expect(utils.downloadTarball).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        undefined,
        { token: undefined },
      );

      fetchRefsSpy.mockRestore();
    });

    it('passes undefined token when no env vars are set for github', async () => {
      delete process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const fetchRefsSpy = vi.spyOn(utils, 'fetchRefs').mockResolvedValueOnce([
        {
          hash: 'dddddddddddddddddddddddddddddddddddddddddd',
          name: 'main',
          type: 'branch',
        },
      ]);

      // Do NOT create the tar file so fs.stat fails and triggers download.
      const emitter = createTiged('tiged/test-repo#main', {
        force: true,
        verbose: false,
      });

      await emitter.cloneWithTar(dir, dest);

      expect(utils.downloadTarball).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        undefined,
        { token: undefined },
      );

      fetchRefsSpy.mockRestore();
    });
  });
});
