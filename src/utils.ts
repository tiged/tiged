import * as child_process from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Dispatcher } from 'undici';
import { ProxyAgent, request } from 'undici';
import type { SupportedHostNames } from './constants.js';
import {
  accessLogsFileName,
  homeOrTmpDirectoryPath,
  stashDirectoryName,
  supportedHostNames,
  tigedConfigFileName,
} from './constants.js';
import type {
  DamerauLevenshteinResult,
  Repo,
  TigedErrorOptions,
} from './types.js';

export type AppDirs = {
  data: string;
  config: string;
  cache: string;
};

export type ResolveAppDirsOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
};

export const resolveAppDirs = (
  appName: string,
  options: ResolveAppDirsOptions = {},
): AppDirs => {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homeOrTmpDirectoryPath;
  const platformPath = platform === 'win32' ? path.win32 : path.posix;

  if (platform === 'darwin') {
    const library = platformPath.join(home, 'Library');
    return {
      data: platformPath.join(library, 'Application Support', appName),
      config: platformPath.join(library, 'Preferences', appName),
      cache: platformPath.join(library, 'Caches', appName),
    };
  }

  if (platform === 'win32') {
    const localAppData =
      env.LOCALAPPDATA ?? platformPath.join(home, 'AppData', 'Local');
    const roamingAppData =
      env.APPDATA ?? platformPath.join(home, 'AppData', 'Roaming');

    return {
      data: platformPath.join(localAppData, appName, 'Data'),
      config: platformPath.join(roamingAppData, appName, 'Config'),
      cache: platformPath.join(localAppData, appName, 'Cache'),
    };
  }

  const dataHome =
    env.XDG_DATA_HOME ?? platformPath.join(home, '.local', 'share');
  const configHome = env.XDG_CONFIG_HOME ?? platformPath.join(home, '.config');
  const cacheHome = env.XDG_CACHE_HOME ?? platformPath.join(home, '.cache');

  return {
    data: platformPath.join(dataHome, appName),
    config: platformPath.join(configHome, appName),
    cache: platformPath.join(cacheHome, appName),
  };
};

/**
 * Represents an error that occurs during the tiged process.
 *
 * @extends Error
 *
 * @internal
 * @since 3.0.0
 */
export class TigedError extends Error implements Error, TigedErrorOptions {
  /**
   * The error code associated with the error.
   */
  declare public code: TigedErrorOptions['code'];

  /**
   * The original error that caused this error.
   */
  declare public original?: TigedErrorOptions['original'];

  /**
   * The reference (e.g., branch, tag, commit) that was being targeted.
   */
  declare public ref?: TigedErrorOptions['ref'];

  /**
   * The URL associated with the error.
   */
  declare public url?: TigedErrorOptions['url'];

  public override readonly name = 'TigedError';

  /**
   * Creates a new instance of {@linkcode TigedError}.
   *
   * @param message - The error message.
   * @param tigedErrorOptions - Additional options for the error.
   */
  public constructor(message: string, tigedErrorOptions: TigedErrorOptions) {
    super(message);

    Object.assign(this, tigedErrorOptions);
  }
}

/**
 * Tries to require a module and returns the result.
 * If the module cannot be required, it returns `null`.
 *
 * @param filePath - The path to the module file.
 * @param options - Optional options for requiring the module.
 * @param options.clearCache - If `true`, clears the module cache before requiring the module.
 * @returns The required module or `null` if it cannot be required.
 *
 * @internal
 */
export function tryRequire(
  filePath: string,
  options?: {
    /**
     * If `true`, clears the module cache before requiring the module.
     */
    clearCache?: true | undefined;
  },
): unknown {
  const require = createRequire(import.meta.url);

  try {
    if (options && options.clearCache === true) {
      delete require.cache[require.resolve(filePath)];
    }

    return require(filePath);
  } catch (error) {
    return null;
  }
}

/**
 * Executes a command and returns the `stdout` and `stderr` as strings.
 *
 * @param command - The command to execute.
 * @param size - The maximum buffer size in kilobytes (default: 500KB).
 * @returns A {@linkcode Promise | promise} that resolves to an object containing the `stdout` and `stderr` strings.
 *
 * @internal
 */
export async function executeCommand(
  command: string,
  size = 500,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise<{ stdout: string; stderr: string }>((fulfil, reject) => {
    child_process.exec(
      command,
      { maxBuffer: 1024 * size },
      (err, stdout, stderr) => {
        if (err) {
          reject(err);
          return;
        }

        fulfil({ stdout, stderr });
      },
    );
  }).catch(err => {
    if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return executeCommand(command, size * 2);
    }
    return Promise.reject(err);
  });
}

/**
 * Fetches a resource from the specified URL
 * and saves it to the destination path.
 * Optionally, a proxy URL can be provided to make the
 * request through a proxy server.
 *
 * @param url - The URL of the resource to fetch.
 * @param tarballFilePath - The destination path to save the fetched resource.
 * @param proxy - Optional. The URL of the proxy server to use for the request.
 * @returns A {@linkcode Promise | promise} that resolves when the resource is successfully fetched and saved, or rejects with an error.
 *
 * @internal
 */
export async function downloadTarball(
  url: string,
  tarballFilePath: string,
  proxy?: string,
): Promise<void> {
  await fs.mkdir(path.dirname(tarballFilePath), { recursive: true });
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  try {
    const maxRedirects = 10;
    const requestHeaders = {
      accept: '*/*',
      'user-agent': 'tiged',
    };

    const resolveLocation = (location: string | string[] | undefined) => {
      if (!location) {
        return null;
      }
      const value = Array.isArray(location) ? location[0] : location;
      if (!value) {
        return null;
      }
      return value;
    };

    const requestWithRedirects = async (
      currentUrl: string,
      redirects: number,
    ): Promise<
      Pick<Dispatcher.ResponseData, 'body' | 'statusCode' | 'statusText'>
    > => {
      if (redirects > maxRedirects) {
        throw new Error('Too many redirects');
      }

      const { statusCode, statusText, headers, body } = await request(
        currentUrl,
        {
          dispatcher,
          headers: requestHeaders,
        },
      );

      if (statusCode >= 300 && statusCode < 400) {
        const location = resolveLocation(headers.location);
        if (!location) {
          body?.resume?.();
          throw new Error('No location header');
        }
        const nextUrl = new URL(location, currentUrl).toString();
        body?.resume?.();
        return requestWithRedirects(nextUrl, redirects + 1);
      }

      return { statusCode, statusText, body };
    };

    const { statusCode, statusText, body } = await requestWithRedirects(url, 0);

    if (statusCode >= 400) {
      body?.resume?.();
      const err = new Error(
        `Request failed with status ${statusCode} ${statusText ?? ''}`,
      ) as Error & { status?: number; url?: string };
      err.status = statusCode;
      err.url = url;
      throw err;
    }

    if (body == null) {
      const err = new Error('No response body') as Error & {
        status?: number;
        url?: string;
      };
      err.status = statusCode;
      err.url = url;
      throw err;
    }

    await pipeline(body, createWriteStream(tarballFilePath));
  } finally {
    await dispatcher?.close();
  }
}

/**
 * Stashes files from a directory to a temporary directory.
 *
 * @param dir - The source directory containing the files to be stashed.
 * @param dest - The destination directory where the stashed files will be stored.
 * @returns A {@linkcode Promise | promise} that resolves when the stashing process is complete.
 *
 * @internal
 */
export async function stashFiles(dir: string, dest: string) {
  const tmpDir = path.join(dir, stashDirectoryName);

  try {
    await fs.rm(tmpDir, { force: true, recursive: true });
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        'errno' in error &&
        'syscall' in error &&
        'code' in error
      )
    ) {
      return;
    }
    if (
      error.errno !== -2 &&
      error.syscall !== 'rmdir' &&
      error.code !== 'ENOENT'
    ) {
      throw error;
    }
  }

  await fs.mkdir(tmpDir);

  const files = await fs.readdir(dest, { recursive: true });
  for (const file of files) {
    const filePath = path.join(dest, file);

    const targetPath = path.join(tmpDir, file);

    const isDir = await isDirectory(filePath);

    if (isDir) {
      await fs.cp(filePath, targetPath, { recursive: true });
    } else {
      await fs.cp(filePath, targetPath);

      await fs.unlink(filePath);
    }
  }
}

/**
 * Un-stashes files from a temporary directory to a destination directory.
 *
 * @param dir - The directory where the temporary directory is located.
 * @param dest - The destination directory where the files will be unstashed.
 * @returns A {@linkcode Promise | promise} that resolves when the un-stashing process is complete.
 *
 * @internal
 */
export async function unStashFiles(dir: string, dest: string) {
  const tmpDir = path.join(dir, stashDirectoryName);

  const files = await fs.readdir(tmpDir, { recursive: true });
  for (const filename of files) {
    const tmpFile = path.join(tmpDir, filename);

    const targetPath = path.join(dest, filename);

    const isDir = await isDirectory(tmpFile);

    if (isDir) {
      await fs.cp(tmpFile, targetPath, { recursive: true });
    } else {
      if (filename !== tigedConfigFileName) {
        await fs.cp(tmpFile, targetPath);
      }

      await fs.unlink(tmpFile);
    }
  }

  await fs.rm(tmpDir, { force: true, recursive: true });
}

/**
 * Asynchronously checks if a given file path exists.
 *
 * @param filePath - The path to the file or directory to check.
 * @returns A {@linkcode Promise | promise} that resolves to `true` if the path exists, otherwise `false`.
 *
 * @example
 * <caption>#### Check if a file exists</caption>
 *
 * ```ts
 * const exists = await pathExists('/path/to/file');
 * console.log(exists); // true or false
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Asynchronously checks if a given file path is a directory.
 *
 * @param filePath - The path to the file or directory to check.
 * @returns A {@linkcode Promise | promise} that resolves to `true` if the path is a directory, otherwise `false`.
 *
 * @example
 * <caption>#### Check if a path is a directory</caption>
 *
 * ```ts
 * const isDir = await isDirectory('/path/to/directory');
 * console.log(isDir); // true or false
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const isDirectory = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await fs.lstat(filePath);

    return stats.isDirectory();
  } catch (error) {
    return false;
  }
};

const appDirs = /* @__PURE__ */ resolveAppDirs('tiged');

export const base = appDirs.cache;

const getIndex = (rowWidth: number, x: number, y: number) =>
  (y + 1) * rowWidth + (x + 1);

const initializeDPMatrix = (
  a: string,
  b: string,
): { rowWidth: number; d: Uint32Array } => {
  const maxDistance = a.length + b.length;
  const rowWidth = a.length + 2;
  const colWidth = b.length + 2;
  const d = new Uint32Array(rowWidth * colWidth);
  d[getIndex(rowWidth, -1, -1)] = maxDistance;
  for (let i = 0; i <= a.length; i++) {
    d[getIndex(rowWidth, i, -1)] = maxDistance;
    d[getIndex(rowWidth, i, 0)] = i;
  }
  for (let i = 0; i <= b.length; i++) {
    d[getIndex(rowWidth, -1, i)] = maxDistance;
    d[getIndex(rowWidth, 0, i)] = i;
  }
  return { rowWidth, d };
};

const calculateStringDistance = (
  a: string,
  b: string,
  maxLength = Math.max(a.length, b.length),
): number => {
  if (a.length + b.length === 0 || maxLength === 0) {
    return 0;
  }

  const aTrimmed = a.length > maxLength ? a.substring(0, maxLength) : a;
  const bTrimmed = b.length > maxLength ? b.substring(0, maxLength) : b;
  const { rowWidth, d } = initializeDPMatrix(aTrimmed, bTrimmed);
  const da = new Uint32Array(0x10000);
  da.fill(0);
  const getD = (index: number) => d[index] ?? 0;

  for (let i = 1; i <= aTrimmed.length; i++) {
    let db = 0;
    for (let j = 1; j <= bTrimmed.length; j++) {
      const k = da[bTrimmed.charCodeAt(j - 1)] ?? 0;
      const l = db;
      let cost = 1;
      if (aTrimmed.charCodeAt(i - 1) === bTrimmed.charCodeAt(j - 1)) {
        cost = 0;
        db = j;
      }
      d[getIndex(rowWidth, i, j)] = Math.min(
        getD(getIndex(rowWidth, i - 1, j - 1)) + cost,
        getD(getIndex(rowWidth, i, j - 1)) + 1,
        getD(getIndex(rowWidth, i - 1, j)) + 1,
        getD(getIndex(rowWidth, k - 1, l - 1)) + (i - k - 1) + (j - l - 1) + 1,
      );
      da[aTrimmed.charCodeAt(i - 1)] = i;
    }
  }

  return getD(getIndex(rowWidth, aTrimmed.length, bTrimmed.length));
};

export const damerauLevenshtein = (
  str1: string,
  str2: string,
): DamerauLevenshteinResult => {
  const steps = calculateStringDistance(str1, str2);
  const length = Math.max(str1.length, str2.length);
  const relative = length === 0 ? 0 : steps / length;
  const similarity = 1 - relative;
  return { steps, relative, similarity };
};

export const damerauLevenshteinSimilarity = (
  str1: string,
  str2: string,
): number => damerauLevenshtein(str1, str2).similarity;

/**
 * Ensures that the Git executable is available
 * on the system by checking its version.
 *
 * @throws A {@linkcode TigedError} If the Git executable is not found or cannot be executed.
 *
 * @example
 * <caption>#### Throws an error if Git is not installed</caption>
 *
 * ```ts
 * await ensureGitExists();
 * // Throws an error if Git is not installed or not in the PATH.
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const ensureGitExists = async (): Promise<void> => {
  try {
    await executeCommand('git --version');
  } catch (error) {
    throw new TigedError(
      'could not find git. Make sure the directory of your git executable is found in your PATH environment variable.',
      {
        code: 'MISSING_GIT',
        original: error instanceof Error ? error : undefined,
      },
    );
  }
};

const supported: Record<string, string> = {
  github: '.com',
  gitlab: '.com',
  bitbucket: '.com',
  'git.sr.ht': '.ht',
  huggingface: '.co',
  codeberg: '.org',
};

/**
 * Checks if the given host name is supported.
 *
 * @param hostName - The host name to check.
 * @returns A `boolean` indicating whether the host name is supported.
 *
 * @internal
 * @since 3.0.0
 */
export const isHostNameSupported = (
  hostName: string,
): hostName is SupportedHostNames =>
  supportedHostNames.includes(hostName as never);

/**
 * Parses the source URL and returns a {@linkcode Repo} object
 * containing the parsed information.
 *
 * #### Note: This function was previously known as **`parse`**.
 *
 * @param src - The source URL to parse.
 * @returns A {@linkcode Repo} object containing the parsed information.
 * @throws A {@linkcode TigedError} If the source URL cannot be parsed.
 *
 * @internal
 * @since 3.0.0
 */
export function extractRepositoryInfo(
  src: string,
  subgroup: boolean,
  subDirectory: string,
): Repo {
  const match =
    /^(?:(?:https:\/\/)?([^:/]+\.[^:/]+)\/|git@([^:/]+)[:/]|([^/]+):)?([^/\s]+)\/([^/\s#]+)(?:((?:\/[^/\s#]+)+))?(?:\/)?(?:#(.+))?/.exec(
      src,
    );

  if (!match) {
    throw new TigedError(`could not parse ${src}`, {
      code: 'BAD_SRC',
      url: src,
    });
  }

  const site = match[1] ?? match[2] ?? match[3] ?? 'github.com';
  const topLevelDomainMatch = /\.([a-z]{2,})$/.exec(site);
  const topLevelDomain = topLevelDomainMatch ? topLevelDomainMatch[0] : null;
  const siteName = topLevelDomain
    ? site.replace(new RegExp(`${topLevelDomain}$`), '')
    : site;

  const user = match[4] ?? '';
  const name = match[5]?.replace(/\.git$/, '') ?? '';
  const repoSubDirectory = match[6];
  const ref = match[7] ?? 'HEAD';

  const domain = `${siteName}${
    topLevelDomain || supported[siteName] || supported[site] || ''
  }`;

  const url = `https://${domain}/${user}/${name}`;
  const ssh = `git@${domain}:${user}/${name}`;

  return {
    site: siteName,
    user,
    name,
    ref,
    url,
    ssh,
    subDirectory: repoSubDirectory ?? subDirectory,
  };
}

/**
 * Fetches the references (branches, tags, etc.) from a remote Git repository.
 *
 * @param repo - The repository object containing the URL of the remote repository.
 * @returns An array of objects representing the fetched references, each containing the type, name, and hash.
 * @throws A {@linkcode TigedError} If there is an error fetching the remote repository.
 *
 * @internal
 */
export async function fetchRefs(repo: Repo): Promise<
  {
    hash: string;
    name: string;
    type: string;
  }[]
> {
  try {
    const { stdout } = await executeCommand(
      `git ls-remote ${repo.url} ${repo.ref}`,
    );

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(row => {
        const [hash = '', ref = ''] = row.split('\t');

        if (ref === 'HEAD') {
          return {
            hash,
            name: hash,
            type: ref,
          };
        }

        const match = /refs\/(\w+)\/(.+)/.exec(ref);

        if (!match)
          throw new TigedError(`could not parse ${ref}`, {
            code: 'BAD_REF',
            ref,
            url: repo.url,
          });

        const type =
          match[1] === 'heads'
            ? 'branch'
            : match[1] === 'refs'
              ? 'ref'
              : (match[1] ?? '');

        const name = match[2] ?? '';

        return { hash, name, type };
      });
  } catch (error) {
    throw new TigedError(`could not fetch remote ${repo.url}`, {
      code: 'COULD_NOT_FETCH',
      original: error instanceof Error ? error : undefined,
      ref: repo.ref,
      url: repo.url,
    });
  }
}

/**
 * Updates the cache with the given repository information.
 *
 * @param repositoryCacheDirectoryPath - The directory path where the cache is located.
 * @param repo - The repository object containing the reference and other details.
 * @param hash - The hash value of the repository.
 * @param cached - The cached records.
 * @returns A {@linkcode Promise | promise} that resolves when the cache is updated.
 *
 * @internal
 */
export async function updateCache(
  repositoryCacheDirectoryPath: string,
  repo: Repo,
  hash: string,
  cached: Partial<Record<string, string>>,
): Promise<void> {
  const accessLogsFilePath = path.join(
    repositoryCacheDirectoryPath,
    accessLogsFileName,
  );

  // update access logs
  const accessLogs: Partial<Record<string, string>> =
    tryRequire(accessLogsFilePath) || {};

  accessLogs[repo.ref] = new Date().toISOString();

  await fs.writeFile(accessLogsFilePath, JSON.stringify(accessLogs, null, 2), {
    encoding: 'utf-8',
  });

  if (cached[repo.ref] === hash) {
    return;
  }

  const oldHash = cached[repo.ref];

  if (oldHash) {
    let usedElsewhere = false;

    for (const key in cached) {
      if (key === repo.ref) {
        continue;
      }

      if (cached[key] === oldHash) {
        usedElsewhere = true;

        break;
      }
    }

    if (!usedElsewhere) {
      // we no longer need this tar file

      try {
        await fs.unlink(
          path.join(repositoryCacheDirectoryPath, `${oldHash}.tar.gz`),
        );
      } catch (error) {
        // ignore
      }
    }
  }

  cached[repo.ref] = hash;

  await fs.writeFile(
    path.join(repositoryCacheDirectoryPath, 'map.json'),
    JSON.stringify(cached, null, 2),
    { encoding: 'utf-8' },
  );
}

/**
 * Retrieves the old hash of a given repository reference.
 *
 * @param repo - The repository object containing the URL and reference.
 * @returns A {@linkcode Promise | promise} that resolves to the old hash string of the repository reference.
 *
 * @remarks
 * This function initializes a temporary Git repository,
 * fetches the specified reference, retrieves the commit hash,
 * and then cleans up the temporary directory.
 *
 * @example
 *
 * ```ts
 * const repo = { url: 'https://github.com/user/repo.git', ref: 'main' };
 * const oldHash = await getOldHash(repo);
 * console.log(oldHash); // Outputs the commit hash of the 'main' branch
 * ```
 *
 * @internal
 * @since 3.0.0
 */
export const getOldHash = async (repo: Repo): Promise<string> => {
  await fs.mkdir(base, { recursive: true });

  const temporaryDirectory = await fs.mkdtemp(`${path.join(base)}${path.sep}`, {
    encoding: 'utf-8',
  });

  const ref = repo.ref.includes('#')
    ? repo.ref.split('#').reverse().join(' ')
    : repo.ref;

  await executeCommand('git init');

  await executeCommand(`git fetch --depth 1 ${repo.url} ${ref}`);

  const { stdout } = await executeCommand('git rev-list FETCH_HEAD');

  await fs.rm(temporaryDirectory, { force: true, recursive: true });

  return stdout.trim().split('\n')[0] ?? '';
};

/**
 * Ensures that the provided sub-directory path has a leading slash (`/`).
 * If the sub-directory already starts with a slash, it is returned unchanged.
 * Otherwise, a leading slash is added to the sub-directory.
 *
 * @param subDirectory - The sub-directory path to normalize with a leading slash.
 * @returns The sub-directory path guaranteed to have a leading slash.
 *
 * @example
 * <caption>#### Adds a leading slash if missing</caption>
 *
 * ```ts
 * addLeadingSlashIfMissing('subdir'); // Returns '/subdir'
 * ```
 *
 * @example
 * <caption>#### Returns unchanged if the leading slash is already present</caption>
 *
 * ```ts
 * addLeadingSlashIfMissing('/subdir'); // Returns '/subdir'
 * ```
 *
 * @internal
 * @since 3.0.0
 */
export const addLeadingSlashIfMissing = (
  subDirectory: string | undefined,
): string => {
  if (!subDirectory) {
    return '';
  }

  return subDirectory.startsWith('/') ? subDirectory : `/${subDirectory}`;
};
