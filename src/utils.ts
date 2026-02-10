import * as child_process from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { constants } from 'node:os';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import xdg from '@folder/xdg';

const tmpDirName = 'tmp';

export const tigedConfigName = 'degit.json';

const getHomeOrTmp = () => homedir() || tmpdir();

const homeOrTmp = /* @__PURE__ */ getHomeOrTmp();

/**
 * Represents the possible error codes for the Tiged utility.
 */
export type TigedErrorCode =
  | 'DEST_NOT_EMPTY'
  | 'MISSING_REF'
  | 'MISSING_GIT'
  | 'COULD_NOT_DOWNLOAD'
  | 'CACHE_MISS'
  | 'BAD_TAR_PATH'
  | 'BAD_SRC'
  | 'UNSUPPORTED_HOST'
  | 'BAD_REF'
  | 'COULD_NOT_FETCH'
  | 'NO_FILES'
  | keyof typeof constants.errno;

/**
 * Represents the options for a Tiged error.
 */
interface TigedErrorOptions extends ErrorOptions {
  /**
   * The error code associated with the error.
   */
  code?: TigedErrorCode;

  /**
   * The original error that caused this error.
   */
  original?: Error;

  /**
   * The reference (e.g., branch, tag, commit) that was being targeted.
   */
  ref?: string;

  /**
   * The URL associated with the error.
   */
  url?: string;
}

/**
 * Represents an error that occurs during the tiged process.
 *
 * @extends Error
 */
export class TigedError extends Error {
  /**
   * The error code associated with the error.
   */
  declare public code?: TigedErrorOptions['code'];

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

  /**
   * Creates a new instance of {@linkcode TigedError}.
   *
   * @param message - The error message.
   * @param opts - Additional options for the error.
   */
  constructor(message?: string, opts?: TigedErrorOptions) {
    super(message);
    Object.assign(this, opts);
  }
}

/**
 * Tries to require a module and returns the result.
 * If the module cannot be required, it returns `null`.
 *
 * @param file - The path to the module file.
 * @param opts - Optional options for requiring the module.
 * @param opts.clearCache - If `true`, clears the module cache before requiring the module.
 * @returns The required module or `null` if it cannot be required.
 */
export function tryRequire(
  file: string,
  opts?: {
    /**
     * If `true`, clears the module cache before requiring the module.
     */
    clearCache?: true | undefined;
  },
) {
  const require = createRequire(import.meta.url);
  try {
    if (opts && opts.clearCache === true) {
      delete require.cache[require.resolve(file)];
    }
    return require(file);
  } catch (err) {
    return null;
  }
}

/**
 * Executes a command and returns the `stdout` and `stderr` as strings.
 *
 * @param command - The command to execute.
 * @param size - The maximum buffer size in kilobytes (default: 500KB).
 * @returns A promise that resolves to an object containing the `stdout` and `stderr` strings.
 */
export async function exec(
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
      return exec(command, size * 2);
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
 * @param dest - The destination path to save the fetched resource.
 * @param proxy - Optional. The URL of the proxy server to use for the request.
 * @returns A promise that resolves when the resource is successfully fetched and saved, or rejects with an error.
 */
export async function fetch(url: string, dest: string, proxy?: string) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  try {
    const response = await undiciFetch(url, {
      redirect: 'follow',
      dispatcher,
    });

    if (!response.ok) {
      const err = new Error(
        `Request failed with status ${response.status} ${response.statusText}`,
      ) as Error & { status?: number; url?: string };
      err.status = response.status;
      err.url = url;
      throw err;
    }

    if (response.body == null) {
      const err = new Error('No response body') as Error & {
        status?: number;
        url?: string;
      };
      err.status = response.status;
      err.url = url;
      throw err;
    }

    await pipeline(
      Readable.fromWeb(response.body as any),
      createWriteStream(dest),
    );
  } finally {
    await dispatcher?.close();
  }
}

/**
 * Stashes files from a directory to a temporary directory.
 *
 * @param dir - The source directory containing the files to be stashed.
 * @param dest - The destination directory where the stashed files will be stored.
 * @returns A promise that resolves when the stashing process is complete.
 */
export async function stashFiles(dir: string, dest: string) {
  const tmpDir = path.join(dir, tmpDirName);
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch (e) {
    if (
      !(e instanceof Error && 'errno' in e && 'syscall' in e && 'code' in e)
    ) {
      return;
    }
    if (e.errno !== -2 && e.syscall !== 'rmdir' && e.code !== 'ENOENT') {
      throw e;
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
 * Unstashes files from a temporary directory to a destination directory.
 *
 * @param dir - The directory where the temporary directory is located.
 * @param dest - The destination directory where the files will be unstashed.
 */
export async function unstashFiles(dir: string, dest: string) {
  const tmpDir = path.join(dir, tmpDirName);
  const files = await fs.readdir(tmpDir, { recursive: true });
  for (const filename of files) {
    const tmpFile = path.join(tmpDir, filename);
    const targetPath = path.join(dest, filename);
    const isDir = await isDirectory(tmpFile);
    if (isDir) {
      await fs.cp(tmpFile, targetPath, { recursive: true });
    } else {
      if (filename !== tigedConfigName) {
        await fs.cp(tmpFile, targetPath);
      }
      await fs.unlink(tmpFile);
    }
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
}

/**
 * Asynchronously checks if a given file path exists.
 *
 * @param filePath - The path to the file or directory to check.
 * @returns A promise that resolves to `true` if the path exists, otherwise `false`.
 *
 * @example
 * <caption>#### Check if a file exists</caption>
 *
 * ```ts
 * const exists = await pathExists('/path/to/file');
 * console.log(exists); // true or false
 * ```
 */
export const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Asynchronously checks if a given file path is a directory.
 *
 * @param filePath - The path to the file or directory to check.
 * @returns A promise that resolves to `true` if the path is a directory, otherwise `false`.
 *
 * @example
 * <caption>#### Check if a path is a directory</caption>
 *
 * ```ts
 * const isDir = await isDirectory('/path/to/directory');
 * console.log(isDir); // true or false
 * ```
 */
export const isDirectory = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await fs.lstat(filePath);
    return stats.isDirectory();
  } catch (err) {
    return false;
  }
};

const legacyCacheDir = /* @__PURE__ */ path.join(homeOrTmp, '.tiged');

const xdgCacheDir = (() => {
  try {
    return xdg({ subdir: 'tiged' }).cache;
  } catch {
    return null;
  }
})();

export const base =
  process.env.XDG_CACHE_HOME && xdgCacheDir ? xdgCacheDir : legacyCacheDir;

interface DamerauLevenshteinResult {
  steps: number;
  relative: number;
  similarity: number;
}

const getIndex = (rowWidth: number, x: number, y: number) =>
  (y + 1) * rowWidth + (x + 1);

const initializeDPMatrix = (a: string, b: string) => {
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
) => {
  if (a.length + b.length === 0 || maxLength === 0) return 0;

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

export const damerauLevenshteinSimilarity = (str1: string, str2: string) =>
  damerauLevenshtein(str1, str2).similarity;
