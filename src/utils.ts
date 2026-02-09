import { HttpsProxyAgent } from 'https-proxy-agent';
import * as child_process from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import { createRequire } from 'node:module';
import type { constants } from 'node:os';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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

  // Some hosts (e.g. SourceHut) respond differently to the legacy https client.
  // Use Node's built-in fetch (undici) for those hosts when no proxy is configured.
  const hostname = new URL(url).hostname;
  const useBuiltInFetch = !proxy && hostname === 'git.sr.ht';

  if (useBuiltInFetch) {
    const response = await globalThis.fetch(url, {
      redirect: 'follow',
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
    return;
  }

  // Default/proxy path: https + https-proxy-agent.
  await new Promise<void>((fulfil, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: {
        Connection: 'close',
      },
      agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
    };

    https
      .get(options, response => {
        const code = response.statusCode;
        if (code == null) {
          return reject(new Error('No status code'));
        }

        if (code >= 400) {
          const err = new Error(
            `Request failed with status ${code} ${response.statusMessage ?? ''}`,
          ) as Error & { status?: number; url?: string };
          err.status = code;
          err.url = url;
          return reject(err);
        }

        if (code >= 300) {
          const location = response.headers.location;
          if (location == null) {
            return reject(new Error('No location header'));
          }
          const nextUrl = new URL(location, parsedUrl).toString();
          response.resume();
          fetch(nextUrl, dest, proxy).then(fulfil, reject);
          return;
        }

        response
          .pipe(createWriteStream(dest))
          .on('finish', () => fulfil())
          .on('error', reject);
      })
      .on('error', reject);
  });
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
