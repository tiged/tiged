import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/tar.js', () => {
  return {
    untarToDir: vi.fn(async () => {
      // Keep these unit tests focused on cache/offline control flow.
      // The tarball files created in this suite are not real archives.
      return ['README.md'];
    }),
  };
});

import { tiged } from '../src/index.js';
import * as utils from '../src/utils.js';

const mkTmpDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiged-cache-test-'));
  return dir;
};

const touch = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, 'not a real tarball');
};

describe('cache + offline behavior (unit)', () => {
  let dir: string;
  let dest: string;

  beforeEach(async () => {
    dir = await mkTmpDir();
    dest = await mkTmpDir();

    vi.spyOn(utils, 'fetch').mockImplementation(async () => {
      throw new Error('network fetch should not be called in this test');
    });

    // Default exec mock: fail fast if we accidentally try to hit git.
    vi.spyOn(utils, 'exec').mockImplementation(async () => {
      throw new Error('git exec should not be called in this test');
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(dest, { recursive: true, force: true });
  });

  it('offline mode without cached ref mapping fails with MISSING_REF (and never downloads)', async () => {
    const emitter: any = tiged('tiged/tiged-test-repo', {
      offlineMode: true,
      force: true,
    });

    await expect(emitter._cloneWithTar(dir, dest)).rejects.toMatchObject({
      code: 'MISSING_REF',
    });

    expect(utils.fetch).not.toHaveBeenCalled();
  });

  it('offline mode never downloads; throws CACHE_MISS when tarball is missing', async () => {
    const hash = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    await fs.writeFile(
      path.join(dir, 'map.json'),
      JSON.stringify({ HEAD: hash }, null, '  '),
    );

    const emitter: any = tiged('tiged/tiged-test-repo', {
      offlineMode: true,
      force: true,
    });

    await expect(emitter._cloneWithTar(dir, dest)).rejects.toMatchObject({
      code: 'CACHE_MISS',
    });

    expect(utils.fetch).not.toHaveBeenCalled();
  });

  it('offline mode accepts a full 40-char commit hash without map.json', async () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    const tarPath = path.join(dir, `${hash}.tar.gz`);
    await touch(tarPath);

    const emitter: any = tiged(`tiged/tiged-test-repo#${hash}`, {
      offlineMode: true,
      force: true,
    });

    await expect(emitter._cloneWithTar(dir, dest)).resolves.toBeUndefined();
    expect(utils.fetch).not.toHaveBeenCalled();
  });

  it('updateCache does not delete old tarball when still referenced by another ref', async () => {
    const oldHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const newHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    await fs.writeFile(
      path.join(dir, 'map.json'),
      JSON.stringify({ main: oldHash, dev: oldHash }, null, '  '),
    );

    await touch(path.join(dir, `${oldHash}.tar.gz`));
    await touch(path.join(dir, `${newHash}.tar.gz`));

    vi.mocked(utils.exec).mockResolvedValue({
      stdout: `${newHash}\trefs/heads/main\n`,
      stderr: '',
    });

    const emitter: any = tiged('tiged/tiged-test-repo#main', {
      force: true,
      verbose: false,
    });

    await expect(emitter._cloneWithTar(dir, dest)).resolves.toBeUndefined();

    // Old tarball should remain because dev still points to it.
    await expect(
      fs.stat(path.join(dir, `${oldHash}.tar.gz`)),
    ).resolves.toBeTypeOf('object');
  });

  it('updateCache deletes old tarball when no refs reference it anymore', async () => {
    const oldHash = 'cccccccccccccccccccccccccccccccccccccccc';
    const newHash = 'dddddddddddddddddddddddddddddddddddddddd';

    await fs.writeFile(
      path.join(dir, 'map.json'),
      JSON.stringify({ main: oldHash }, null, '  '),
    );

    await touch(path.join(dir, `${oldHash}.tar.gz`));
    await touch(path.join(dir, `${newHash}.tar.gz`));

    vi.mocked(utils.exec).mockResolvedValue({
      stdout: `${newHash}\trefs/heads/main\n`,
      stderr: '',
    });

    const emitter: any = tiged('tiged/tiged-test-repo#main', {
      force: true,
      verbose: false,
    });

    await expect(emitter._cloneWithTar(dir, dest)).resolves.toBeUndefined();

    await expect(
      fs.stat(path.join(dir, `${oldHash}.tar.gz`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
