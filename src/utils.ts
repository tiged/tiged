import { HttpsProxyAgent } from 'https-proxy-agent';
import * as child_process from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import { createRequire } from 'node:module';
import type { constants } from 'node:os';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';

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
  return new Promise<void>((fulfil, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      headers: {
        Connection: 'close',
      },
    };
    if (proxy) {
      options.agent = new HttpsProxyAgent(proxy);
    }

    https
      .get(options, response => {
        const code = response.statusCode;
        if (code == null) {
          return reject(new Error('No status code'));
        }
        if (code >= 400) {
          reject({ code, message: response.statusMessage });
        } else if (code >= 300) {
          if (response.headers.location == null) {
            return reject(new Error('No location header'));
          }
          fetch(response.headers.location, dest, proxy).then(fulfil, reject);
        } else {
          response
            .pipe(createWriteStream(dest))
            .on('finish', () => fulfil())
            .on('error', reject);
        }
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

interface ParseOptions {
  boolean?: string[];
  alias?: Record<string, string | string[]>;
}

interface ParsedArgs {
  [key: string]: boolean | string | number | (string | number)[] | undefined;
  _: string[];
}

export function parseArgs<T extends ParseOptions>(
  args: string[],
  options: ParseOptions = {},
): ParsedArgs & T {
  const result: ParsedArgs = { _: [] };

  // Create normalized alias map with proper direction (alias -> key)
  const aliases: Record<string, string[]> = {};
  const reverseAliases: Record<string, string[]> = {};

  if (options.alias) {
    Object.entries(options.alias).forEach(([key, value]) => {
      const targetAliases = Array.isArray(value) ? value : [value];

      reverseAliases[key] = targetAliases;

      targetAliases.forEach(alias => {
        aliases[alias] = aliases[alias] || [];
        if (!aliases[alias].includes(key)) {
          aliases[alias].push(key);
        }
      });
    });
  }

  // Track boolean flags, including alias flags that map to boolean flags
  const booleanFlags = new Set(options.boolean || []);

  // Check if a key or any of its aliases are boolean
  const isBooleanFlag = (key: string): boolean => {
    if (booleanFlags.has(key)) return true;

    const keyAliases = aliases[key];
    if (keyAliases) {
      return keyAliases.some(alias => booleanFlags.has(alias));
    }

    return false;
  };

  // Apply a value to the result object and its aliases
  const setValue = (key: string, value: any) => {
    result[key] = value;

    // Also set on all aliased keys
    if (aliases[key]) {
      for (const targetKey of aliases[key]) {
        result[targetKey] = value;
      }
    }

    // Set on all aliases for this key
    if (reverseAliases[key]) {
      for (const alias of reverseAliases[key]) {
        result[alias] = value;
      }
    }
  };

  let i = 0;
  let stopParsing = false;

  while (i < args.length) {
    const arg = args[i];

    if (stopParsing) {
      // After -- all remaining args go into _
      result._.push(arg);
    } else if (arg === '--') {
      // Stop parsing flags after this
      stopParsing = true;
    } else if (arg.startsWith('--')) {
      // Long option
      if (arg.startsWith('--no-')) {
        // Negated flag (--no-something)
        const key = arg.slice(5); // Remove '--no-'
        setValue(key, false);
      } else {
        // Regular long option
        const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
        if (match) {
          const key = match[1];

          if (match[2] !== undefined) {
            // --key=value form
            if (isBooleanFlag(key)) {
              // Boolean flag still gets set to true
              setValue(key, true);
            } else {
              const value = match[2];

              // Convert numeric strings to numbers
              const numericValue = Number(value);
              const finalValue =
                !isNaN(numericValue) && value !== '' ? numericValue : value;

              if (result[key] !== undefined && !Array.isArray(result[key])) {
                setValue(key, [result[key], finalValue]);
              } else if (Array.isArray(result[key])) {
                (result[key] as (string | number)[]).push(finalValue);
                // Update aliases manually for arrays
                if (aliases[key]) {
                  aliases[key].forEach(alias => {
                    result[alias] = [...(result[key] as (string | number)[])];
                  });
                }
                if (reverseAliases[key]) {
                  reverseAliases[key].forEach(alias => {
                    result[alias] = [...(result[key] as (string | number)[])];
                  });
                }
              } else {
                setValue(key, finalValue);
              }
            }
          } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            // --key value form
            if (isBooleanFlag(key)) {
              // For boolean flags, don't consume the next argument
              setValue(key, true);
            } else {
              // Otherwise, consume the next argument as the value
              const value = args[i + 1];
              const numericValue = Number(value);
              const finalValue =
                !isNaN(numericValue) && value !== '' ? numericValue : value;
              setValue(key, finalValue);
              i++;
            }
          } else {
            // Flag without a value
            setValue(key, true);
          }
        }
      }
    } else if (arg.startsWith('-') && arg !== '-') {
      // Short options
      const flags = arg.slice(1).split('');

      let j = 0;
      while (j < flags.length) {
        const flag = flags[j];
        const isBoolean = isBooleanFlag(flag);

        if (
          !isBoolean &&
          j === flags.length - 1 &&
          i + 1 < args.length &&
          !args[i + 1].startsWith('-')
        ) {
          // Last flag in a group can take the next arg as its value (unless it's a boolean flag)
          const value = args[i + 1];
          const numericValue = Number(value);
          const finalValue =
            !isNaN(numericValue) && value !== '' ? numericValue : value;
          setValue(flag, finalValue);
          i++;
        } else {
          // All other flags are boolean
          setValue(flag, true);
        }

        j++;
      }
    } else {
      // Bare argument (not a flag or option)
      result._.push(arg);
    }

    i++;
  }

  return result;
}

export const base = /* @__PURE__ */ path.join(homeOrTmp, '.degit');
