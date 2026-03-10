import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppDirs } from '../src/utils.js';

describe(resolveAppDirs, () => {
  it('uses XDG directories on linux', () => {
    const env = {
      XDG_CACHE_HOME: '/xdg/cache',
      XDG_CONFIG_HOME: '/xdg/config',
      XDG_DATA_HOME: '/xdg/data',
    } as const satisfies NodeJS.ProcessEnv;

    const dirs = resolveAppDirs('tiged', {
      platform: 'linux',
      env,
      home: '/home/test',
    });

    expect(dirs).toEqual({
      cache: path.posix.join('/xdg/cache', 'tiged'),
      config: path.posix.join('/xdg/config', 'tiged'),
      data: path.posix.join('/xdg/data', 'tiged'),
    });
  });

  it('uses macOS library directories on darwin', () => {
    const dirs = resolveAppDirs('tiged', {
      platform: 'darwin',
      env: {},
      home: '/Users/tester',
    });

    expect(dirs).toEqual({
      cache: path.posix.join('/Users/tester', 'Library', 'Caches', 'tiged'),
      config: path.posix.join(
        '/Users/tester',
        'Library',
        'Preferences',
        'tiged',
      ),
      data: path.posix.join(
        '/Users/tester',
        'Library',
        'Application Support',
        'tiged',
      ),
    });
  });

  it('uses AppData directories on win32', () => {
    const env = {
      LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local',
      APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
    } as const satisfies NodeJS.ProcessEnv;

    const dirs = resolveAppDirs('tiged', {
      platform: 'win32',
      env,
      home: 'C:\\Users\\Tester',
    });

    expect(dirs).toEqual({
      cache: path.win32.join(
        'C:\\Users\\Tester\\AppData\\Local',
        'tiged',
        'Cache',
      ),
      config: path.win32.join(
        'C:\\Users\\Tester\\AppData\\Roaming',
        'tiged',
        'Config',
      ),
      data: path.win32.join(
        'C:\\Users\\Tester\\AppData\\Local',
        'tiged',
        'Data',
      ),
    });
  });
});
