import { bold, cyan, magenta, red } from 'colorette';
import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { rimraf } from 'rimraf';
import { extract } from 'tar';
import {
  TigedError,
  base,
  exec,
  fetch,
  isDirectory,
  pathExists,
  stashFiles,
  tigedConfigName,
  tryRequire,
  unstashFiles,
} from './utils';

const validModes = new Set<ValidModes>(['tar', 'git']);

/**
 * Represents the valid modes for a file.
 * The modes can be either `'tar'` or `'git'`.
 */
type ValidModes = 'tar' | 'git';

/**
 * Represents the options for a specific operation.
 */
export interface Options {
  /**
   * Specifies whether to use caching.
   *
   * @default false
   */
  cache?: boolean;

  /**
   * Forces the operation to proceed, despite non-empty destination directory
   * potentially overwriting existing files.
   *
   * @default false
   */
  force?: boolean;

  /**
   * Specifies the mode for the operation.
   *
   * @default undefined
   */
  mode?: ValidModes;

  /**
   * Specifies whether to enable verbose logging.
   *
   * @default false
   */
  verbose?: boolean;

  /**
   * Specifies whether to enable offline mode.
   *
   * @default false
   */
  'offline-mode'?: boolean;

  /**
   * Specifies whether to enable offline mode.
   *
   * @default false
   */
  offlineMode?: boolean;

  /**
   * Specifies whether to disable caching.
   *
   * @default false
   */
  'disable-cache'?: boolean;

  /**
   * Specifies whether to disable caching.
   *
   * @default false
   */
  disableCache?: boolean;

  /**
   * Specifies whether to use subgrouping.
   *
   * @default false
   */
  subgroup?: boolean;

  /**
   * Specifies the sub-directory for the operation.
   *
   * @default undefined
   */
  'sub-directory'?: string;
}

// TODO: We might not need this one.
/**
 * Represents the possible information codes.
 */
type InfoCode =
  | 'SUCCESS'
  | 'FILE_DOES_NOT_EXIST'
  | 'REMOVED'
  | 'DEST_NOT_EMPTY'
  | 'DEST_IS_EMPTY'
  | 'USING_CACHE'
  | 'FOUND_MATCH'
  | 'FILE_EXISTS'
  | 'PROXY'
  | 'DOWNLOADING'
  | 'EXTRACTING';

/**
 * Represents information about a specific entity.
 */
interface Info {
  /**
   * The code associated with the entity.
   */
  readonly code?: string;

  /**
   * The message associated with the entity.
   */
  readonly message?: string;

  /**
   * The repository associated with the entity.
   */
  readonly repo?: Repo;

  /**
   * The destination of the entity.
   */
  readonly dest?: string;
}

/**
 * Represents an action.
 */
interface Action {
  /**
   * The type of action.
   */
  action: string;

  /**
   * The cache option.
   */
  cache?: boolean | undefined;

  /**
   * The verbose option.
   */
  verbose?: boolean | undefined;
}

/**
 * Represents a Tiged action for cloning.
 */
interface TigedAction extends Action {
  /**
   * The type of action, which is always `'clone'`.
   */
  action: 'clone';

  /**
   * The source path to clone from.
   */
  src: string;
}

/**
 * Represents a remove action.
 */
interface RemoveAction extends Action {
  /**
   * The type of action, which is always `'remove'`.
   */
  action: 'remove';

  /**
   * An array of file paths to be removed.
   */
  files: string[];
}

/**
 * Creates a new instance of the {@linkcode Tiged} class with
 * the specified source and options.
 *
 * @param src - The source path to clone from.
 * @param opts - The optional configuration options.
 * @returns A new instance of the {@linkcode Tiged} class.
 */
export function tiged(src: string, opts?: Options) {
  return new Tiged(src, opts);
}

/**
 * The {@linkcode Tiged} class is an event emitter
 * that represents the Tiged tool.
 * It is designed for cloning repositories with specific options,
 * handling caching, proxy settings, and more.
 *
 * @extends EventEmitter
 */
class Tiged extends EventEmitter {
  /**
   * Enables offline mode, where operations rely on cached data.
   */
  declare public offlineMode?: boolean;

  /**
   * Disables the use of cache for operations,
   * ensuring data is always fetched anew.
   */
  declare public noCache?: boolean;

  /**
   * Enables caching of data for future operations.
   * @deprecated Will be removed in v3.X
   */
  declare public cache?: boolean;

  /**
   * Forces the operation to proceed, despite non-empty destination directory
   * potentially overwriting existing files.
   */
  declare public force?: boolean;

  /**
   * Enables verbose output for more detailed logging information.
   */
  declare public verbose?: boolean;

  /**
   * Specifies the proxy server to be used for network requests.
   */
  declare public proxy?: string;

  /**
   * Indicates if the repository is a subgroup, affecting repository parsing.
   */
  declare public subgroup?: boolean;

  /**
   * Specifies a subdirectory within the repository to focus on.
   */
  declare public subdir?: string;

  /**
   * Holds the parsed repository information.
   */
  declare public repo: Repo;

  /**
   * Indicates the mode of operation,
   * which determines how the repository is cloned.
   * Valid modes are `'tar'` and `'git'`.
   */
  declare public mode: ValidModes;

  /**
   * Flags whether stash operations have been performed to avoid duplication.
   */
  declare public _hasStashed: boolean;

  /**
   * Defines actions for directives such as
   * cloning and removing files or directories.
   */
  declare public directiveActions: {
    clone: (dir: string, dest: string, action: TigedAction) => Promise<void>;
    remove: (dir: string, dest: string, action: RemoveAction) => Promise<void>;
  };

  declare public on: (
    event: 'info' | 'warn',
    callback: (info: Info) => void,
  ) => this;

  /**
   * Constructs a new {@linkcode Tiged} instance
   * with the specified source and options.
   *
   * @param src - The source repository string.
   * @param opts - Optional parameters to customize the behavior.
   */
  constructor(
    public src: string,
    opts: Options = {},
  ) {
    super();
    if (opts['offline-mode']) this.offlineMode = opts['offline-mode'];
    if (opts.offlineMode) this.offlineMode = opts.offlineMode;
    if (opts['disable-cache']) this.noCache = opts['disable-cache'];
    if (opts.disableCache) this.noCache = opts.disableCache;
    // Left cache for backward compatibility. Deprecated. Remove in next major version.
    this.cache = opts.cache;
    this.force = opts.force;
    this.verbose = opts.verbose;
    this.proxy = this._getHttpsProxy(); // TODO allow setting via --proxy
    this.subgroup = opts.subgroup;
    this.subdir = opts['sub-directory'];

    this.repo = parse(src);
    if (this.subgroup) {
      this.repo.subgroup = true;
      this.repo.name = this.repo.subdir?.slice(1) ?? '';
      this.repo.url += this.repo.subdir;
      this.repo.ssh = `${this.repo.ssh + this.repo.subdir}.git`;
      this.repo.subdir = null;
      if (this.subdir) {
        this.repo.subdir = this.subdir.startsWith('/')
          ? this.subdir
          : `/${this.subdir}`;
      }
    }
    this.mode = opts.mode || this.repo.mode;

    if (!validModes.has(this.mode)) {
      throw new Error(`Valid modes are ${Array.from(validModes).join(', ')}`);
    }

    this._hasStashed = false;

    this.directiveActions = {
      clone: async (dir, dest, action) => {
        if (this._hasStashed === false) {
          await stashFiles(dir, dest);
          this._hasStashed = true;
        }
        const opts = Object.assign(
          { force: true },
          { cache: action.cache, verbose: action.verbose },
        );
        const t = tiged(action.src, opts);

        t.on('info', event => {
          console.error(cyan(`> ${event.message?.replace('options.', '--')}`));
        });

        t.on('warn', event => {
          console.error(
            magenta(`! ${event.message?.replace('options.', '--')}`),
          );
        });

        try {
          await t.clone(dest);
        } catch (err) {
          if (err instanceof Error) {
            console.error(red(`! ${err.message}`));
            process.exit(1);
          }
        }
      },
      remove: this.remove.bind(this),
    };
  }

  // Return the HTTPS proxy address. Try to get the value by environment
  // variable `https_proxy` or `HTTPS_PROXY`.
  //
  // TODO allow setting via --proxy
  /**
   * Retrieves the HTTPS proxy from the environment variables.
   *
   * @returns The HTTPS proxy value, or `undefined` if not found.
   */
  public _getHttpsProxy() {
    const result = process.env.https_proxy;
    if (!result) {
      return process.env.HTTPS_PROXY;
    }
    return result;
  }

  /**
   * Retrieves the directives from the specified destination.
   *
   * @param dest - The destination path.
   * @returns An array of {@linkcode TigedAction} directives, or `false` if no directives are found.
   */
  public async _getDirectives(dest: string) {
    const directivesPath = path.resolve(dest, tigedConfigName);
    const directives: TigedAction[] | false =
      tryRequire(directivesPath, { clearCache: true }) || false;
    if (directives) {
      await fs.unlink(directivesPath);
    }

    return directives;
  }

  /**
   * Clones the repository to the specified destination.
   *
   * @param dest - The destination directory where the repository will be cloned.
   */
  public async clone(dest: string) {
    try {
      execSync('git --version', { stdio: 'ignore' });
    } catch (e) {
      throw new TigedError(
        'could not find git. Make the directory of your git executable is found in your PATH environment variable.',
        {
          code: 'MISSING_GIT',
        },
      );
    }

    await this._checkDirIsEmpty(dest);
    const { repo } = this;
    const dir = path.join(base, repo.site, repo.user, repo.name);

    if (this.mode === 'tar') {
      await this._cloneWithTar(dir, dest);
    } else {
      await this._cloneWithGit(dir, dest);
    }

    this._info({
      code: 'SUCCESS',
      message: `cloned ${bold(`${repo.user}/${repo.name}`)}#${bold(repo.ref)}${
        dest !== '.' ? ` to ${dest}` : ''
      }`,
      repo,
      dest,
    });
    const directives = await this._getDirectives(dest);
    if (directives) {
      for (const d of directives) {
        // TODO, can this be a loop with an index to pass for better error messages?
        await this.directiveActions[d.action](dir, dest, d);
      }
      if (this._hasStashed === true) {
        await unstashFiles(dir, dest);
      }
    }
  }

  /**
   * Removes files or directories from a specified destination
   * based on the provided action.
   *
   * @param _dir - The directory path.
   * @param dest - The destination path.
   * @param action - The action object containing the files to be removed.
   */
  public async remove(_dir: string, dest: string, action: RemoveAction) {
    let { files } = action;
    if (!Array.isArray(files)) {
      files = [files];
    }

    const removedFiles: string[] = [];

    for (const file of files) {
      const filePath = path.resolve(dest, file);
      if (await pathExists(filePath)) {
        const isDir = await isDirectory(filePath);
        if (isDir) {
          await rimraf(filePath);
          removedFiles.push(`${file}/`);
        } else {
          await fs.unlink(filePath);
          removedFiles.push(file);
        }
      } else {
        this._warn({
          code: 'FILE_DOES_NOT_EXIST',
          message: `action wants to remove ${bold(file)} but it does not exist`,
        });
      }
    }

    if (removedFiles.length > 0) {
      this._info({
        code: 'REMOVED',
        message: `removed: ${bold(removedFiles.map(d => bold(d)).join(', '))}`,
      });
    }
  }

  /**
   * Checks if a directory is empty.
   *
   * @param dir - The directory path to check.
   */
  public async _checkDirIsEmpty(dir: string) {
    try {
      const files = await fs.readdir(dir);
      if (files.length > 0) {
        if (this.force) {
          this._info({
            code: 'DEST_NOT_EMPTY',
            message: `destination directory is not empty. Using options.force, continuing`,
          });

          await rimraf(dir);
        } else {
          throw new TigedError(
            `destination directory is not empty, aborting. Use options.force to override`,
            {
              code: 'DEST_NOT_EMPTY',
            },
          );
        }
      } else {
        this._verbose({
          code: 'DEST_IS_EMPTY',
          message: `destination directory is empty`,
        });
      }
    } catch (err) {
      if (err instanceof TigedError && err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * Emits an `'info'` event with the provided information.
   *
   * @param info - The information to be emitted.
   */
  public _info(info: Info) {
    this.emit('info', info);
  }

  /**
   * Emits a `'warn'` event with the provided info.
   *
   * @param info - The information to be emitted.
   */
  public _warn(info: Info) {
    this.emit('warn', info);
  }

  /**
   * Logs the provided {@linkcode info} object
   * if the {@linkcode verbose} flag is set to `true`.
   *
   * @param info - The information to be logged.
   */
  public _verbose(info: Info) {
    if (this.verbose) this._info(info);
  }

  /**
   * Retrieves the hash for a given repository.
   *
   * @param repo - The repository object.
   * @param cached - The cached records.
   * @returns The hash value.
   */
  public async _getHash(repo: Repo, cached: Record<string, string>) {
    try {
      const refs = await fetchRefs(repo);

      if (refs == null) {
        return;
      }

      if (repo.ref === 'HEAD') {
        return refs?.find(ref => ref.type === 'HEAD')?.hash ?? '';
      }

      return this._selectRef(refs, repo.ref);
    } catch (err) {
      if (err instanceof TigedError && 'code' in err && 'message' in err) {
        this._warn(err);

        if (err.original != null) {
          this._verbose(err.original);
        }
      }

      return;
    }
  }

  /**
   * Retrieves the commit hash from the cache for the given repository.
   *
   * @param repo - The repository object.
   * @param cached - The cached commit hashes.
   * @returns The commit hash if found in the cache; otherwise, `undefined`.
   */
  public _getHashFromCache(repo: Repo, cached: Record<string, string>) {
    if (!(repo.ref in cached)) {
      return;
    }

    const hash = cached[repo.ref];

    this._info({
      code: 'USING_CACHE',
      message: `using cached commit hash ${hash}`,
    });

    return hash;
  }

  /**
   * Selects a commit hash from an array of references
   * based on a given selector.
   *
   * @param refs - An array of references containing type, name, and hash.
   * @param selector - The selector used to match the desired reference.
   * @returns The commit hash that matches the selector, or `null` if no match is found.
   */
  public _selectRef(
    refs: { type: string; name?: string; hash: string }[],
    selector: string,
  ) {
    for (const ref of refs) {
      if (ref.name === selector) {
        this._verbose({
          code: 'FOUND_MATCH',
          message: `found matching commit hash: ${ref.hash}`,
        });
        return ref.hash;
      }
    }

    if (selector.length < 8) return null;

    for (const ref of refs) {
      if (ref.hash.startsWith(selector)) return ref.hash;
    }

    return;
  }

  /**
   * Clones the repository specified by {@linkcode repo}
   * into the {@linkcode dest} directory using a tarball.
   *
   * @param dir - The directory where the repository is cloned.
   * @param dest - The destination directory where the repository will be extracted.
   * @throws A {@linkcode TigedError} If the commit hash for the repository reference cannot be found.
   * @throws A {@linkcode TigedError} If the tarball cannot be downloaded.
   * @returns A promise that resolves when the cloning and extraction process is complete.
   */
  public async _cloneWithTar(dir: string, dest: string) {
    const { repo } = this;

    const cached: Record<string, string> =
      tryRequire(path.join(dir, 'map.json')) || {};
    const hash =
      this.offlineMode || this.cache
        ? this._getHashFromCache(repo, cached)
        : await this._getHash(repo, cached);

    const subdir = repo.subdir ? `${repo.name}-${hash}${repo.subdir}` : null;

    if (!hash) {
      // TODO 'did you mean...?'
      throw new TigedError(`could not find commit hash for ${repo.ref}`, {
        code: 'MISSING_REF',
        ref: repo.ref,
      });
    }

    const file = `${dir}/${hash}.tar.gz`;
    const url =
      repo.site === 'gitlab'
        ? `${repo.url}/-/archive/${hash}/${repo.name}-${hash}.tar.gz`
        : repo.site === 'bitbucket'
          ? `${repo.url}/get/${hash}.tar.gz`
          : `${repo.url}/archive/${hash}.tar.gz`;

    try {
      if (!this.offlineMode || !this.cache) {
        try {
          if (this.noCache) {
            this._verbose({
              code: 'NO_CACHE',
              message: `Not using cache. noCache set to true.`,
            });
            throw "don't use cache";
          }
          await fs.stat(file);
          this._verbose({
            code: 'FILE_EXISTS',
            message: `${file} already exists locally`,
          });
        } catch (err) {
          // Not getting file from cache. Either because there is no cached tar or because option no cache is set to true.
          await fs.mkdir(path.dirname(file), { recursive: true });

          if (this.proxy) {
            this._verbose({
              code: 'PROXY',
              message: `using proxy ${this.proxy}`,
            });
          }

          this._verbose({
            code: 'DOWNLOADING',
            message: `downloading ${url} to ${file}`,
          });

          await fetch(url, file, this.proxy);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        throw new TigedError(`could not download ${url}`, {
          code: 'COULD_NOT_DOWNLOAD',
          url,
          original: err,
        });
      }
    }

    if (!this.noCache) await updateCache(dir, repo, hash, cached);

    this._verbose({
      code: 'EXTRACTING',
      message: `extracting ${
        subdir ? `${repo.subdir} from ` : ''
      }${file} to ${dest}`,
    });

    await fs.mkdir(dest, { recursive: true });
    const extractedFiles = untar(file, dest, subdir);
    if (extractedFiles.length === 0) {
      const noFilesErrorMessage: string = subdir
        ? 'No files to extract. Make sure you typed in the subdirectory name correctly.'
        : 'No files to extract. The tar file seems to be empty';
      throw new TigedError(noFilesErrorMessage, {
        code: 'NO_FILES',
      });
    }
    if (this.noCache) {
      await rimraf(file);
    }
  }

  /**
   * Clones the repository using Git.
   *
   * @param _dir - The source directory.
   * @param dest - The destination directory.
   */
  public async _cloneWithGit(_dir: string, dest: string) {
    let gitPath = /https:\/\//.test(this.repo.src)
      ? this.repo.url
      : this.repo.ssh;
    gitPath = this.repo.site === 'huggingface' ? this.repo.url : gitPath;
    const isWin = process.platform === 'win32';
    if (this.repo.subdir) {
      await fs.mkdir(path.join(dest, '.tiged'), { recursive: true });
      const tempDir = path.join(dest, '.tiged');
      if (isWin) {
        await exec(
          `cd ${tempDir} && git init && git remote add origin ${gitPath} && git fetch --depth 1 origin ${this.repo.ref} && git checkout FETCH_HEAD`,
        );
      } else if (this.repo.ref && this.repo.ref !== 'HEAD' && !isWin) {
        await exec(
          `cd ${tempDir}; git init; git remote add origin ${gitPath}; git fetch --depth 1 origin ${this.repo.ref}; git checkout FETCH_HEAD`,
        );
      } else {
        await exec(`git clone --depth 1 ${gitPath} ${tempDir}`);
      }
      const files = await fs.readdir(`${tempDir}${this.repo.subdir}`, {
        recursive: true,
      });
      await Promise.all(
        files.map(async file => {
          return fs.rename(
            `${tempDir}${this.repo.subdir}/${file}`,
            `${dest}/${file}`,
          );
        }),
      );
      await rimraf(tempDir);
    } else {
      if (isWin) {
        await fs.mkdir(dest, { recursive: true });
        await exec(
          `cd ${dest} && git init && git remote add origin ${gitPath} && git fetch --depth 1 origin ${this.repo.ref} && git checkout FETCH_HEAD`,
        );
      } else if (this.repo.ref && this.repo.ref !== 'HEAD' && !isWin) {
        await fs.mkdir(dest, { recursive: true });
        await exec(
          `cd ${dest}; git init; git remote add origin ${gitPath}; git fetch --depth 1 origin ${this.repo.ref}; git checkout FETCH_HEAD`,
        );
      } else {
        await exec(`git clone --depth 1 ${gitPath} ${dest}`);
      }
      await rimraf(path.resolve(dest, '.git'));
    }
  }
}

const supported: Record<string, string> = {
  github: '.com',
  gitlab: '.com',
  bitbucket: '.com',
  'git.sr.ht': '.ht',
  huggingface: '.co',
  codeberg: '.org',
};

/**
 * Represents a repository.
 */
export interface Repo {
  /**
   * The hosting service or site for the repository.
   */
  site: string;

  /**
   * The username or organization under which the repository is located.
   */
  user: string;

  /**
   * The name of the repository.
   */
  name: string;

  /**
   * The reference to a specific branch, commit, or tag in the repository.
   */
  ref: string;

  /**
   * The URL to access the repository via HTTP or HTTPS.
   */
  url: string;

  /**
   * The SSH URL to access the repository for Git operations.
   */
  ssh: string;

  /**
   * Optional. A specific subdirectory within the repository to work with,
   * if applicable. Can be `null` if not used.
   */
  subdir?: string | null;

  /**
   * The mode of operation or interaction with the repository.
   * Valid modes are `'tar'` and `'git'`.
   */
  mode: ValidModes;

  /**
   * The source URL or path for cloning the repository.
   */
  src: string;

  /**
   * Optional. Indicates whether the repository belongs to a subgroup,
   * if supported by the hosting service.
   */
  subgroup?: boolean;
}

/**
 * Parses the source URL and returns a {@linkcode Repo} object
 * containing the parsed information.
 *
 * @param src - The source URL to parse.
 * @returns A {@linkcode Repo} object containing the parsed information.
 * @throws A {@linkcode TigedError} If the source URL cannot be parsed.
 */
function parse(src: string): Repo {
  const match =
    /^(?:(?:https:\/\/)?([^:/]+\.[^:/]+)\/|git@([^:/]+)[:/]|([^/]+):)?([^/\s]+)\/([^/\s#]+)(?:((?:\/[^/\s#]+)+))?(?:\/)?(?:#(.+))?/.exec(
      src,
    );
  if (!match) {
    throw new TigedError(`could not parse ${src}`, {
      code: 'BAD_SRC',
    });
  }

  const site = match[1] || match[2] || match[3] || 'github.com';
  const tldMatch = /\.([a-z]{2,})$/.exec(site);
  const tld = tldMatch ? tldMatch[0] : null;
  const siteName = tld ? site.replace(new RegExp(`${tld}$`), '') : site;

  const user = match[4];
  const name = match[5].replace(/\.git$/, '');
  const subdir = match[6];
  const ref = match[7] || 'HEAD';

  const domain = `${siteName}${
    tld || supported[siteName] || supported[site] || ''
  }`;

  const url = `https://${domain}/${user}/${name}`;
  const ssh = `git@${domain}:${user}/${name}`;

  const mode =
    siteName === 'huggingface'
      ? 'git'
      : supported[siteName] || supported[site]
        ? 'tar'
        : 'git';

  return { site: siteName, user, name, ref, url, ssh, subdir, mode, src };
}

/**
 * Extracts the contents of a tar file to a specified destination.
 *
 * @param file - The path to the tar file.
 * @param dest - The destination directory where the contents will be extracted.
 * @param subdir - Optional subdirectory within the tar file to extract. Defaults to null.
 * @returns A list of extracted files.
 */
function untar(file: string, dest: string, subdir: Repo['subdir'] = null) {
  const extractedFiles: string[] = [];
  extract(
    {
      file,
      strip: subdir ? subdir.split('/').length : 1,
      C: dest,
      sync: true,
      onReadEntry: entry => {
        extractedFiles.push(entry.path);
      },
    },
    subdir ? [subdir] : [],
  );
  return extractedFiles;
}

/**
 * Fetches the references (branches, tags, etc.) from a remote Git repository.
 *
 * @param repo - The repository object containing the URL of the remote repository.
 * @returns An array of objects representing the fetched references, each containing the type, name, and hash.
 * @throws A {@linkcode TigedError} If there is an error fetching the remote repository.
 */
async function fetchRefs(repo: Repo) {
  try {
    const { stdout } = await exec(`git ls-remote ${repo.url}`);

    return stdout
      .split('\n')
      .filter(Boolean)
      .map(row => {
        const [hash, ref] = row.split('\t');

        if (ref === 'HEAD') {
          return {
            type: 'HEAD',
            hash,
          };
        }

        const match = /refs\/(\w+)\/(.+)/.exec(ref);
        if (!match)
          throw new TigedError(`could not parse ${ref}`, {
            code: 'BAD_REF',
          });

        return {
          type:
            match[1] === 'heads'
              ? 'branch'
              : match[1] === 'refs'
                ? 'ref'
                : match[1],
          name: match[2],
          hash,
        };
      });
  } catch (error) {
    if (error instanceof Error) {
      throw new TigedError(`could not fetch remote ${repo.url}`, {
        code: 'COULD_NOT_FETCH',
        url: repo.url,
        original: error,
      });
    }

    return;
  }
}

/**
 * Updates the cache with the given repository information.
 *
 * @param dir - The directory path where the cache is located.
 * @param repo - The repository object containing the reference and other details.
 * @param hash - The hash value of the repository.
 * @param cached - The cached records.
 * @returns A Promise that resolves when the cache is updated.
 */
async function updateCache(
  dir: string,
  repo: Repo,
  hash: string,
  cached: Record<string, string>,
) {
  // update access logs
  const logs: Record<string, string> =
    tryRequire(path.join(dir, 'access.json')) || {};
  logs[repo.ref] = new Date().toISOString();
  await fs.writeFile(
    path.join(dir, 'access.json'),
    JSON.stringify(logs, null, '  '),
  );

  if (cached[repo.ref] === hash) return;

  const oldHash = cached[repo.ref];
  if (oldHash) {
    let used = false;
    for (const key in cached) {
      if (cached[key] === hash) {
        used = true;
        break;
      }
    }

    if (!used) {
      // we no longer need this tar file
      try {
        await fs.unlink(path.join(dir, `${oldHash}.tar.gz`));
      } catch (err) {
        // ignore
      }
    }
  }

  cached[repo.ref] = hash;
  await fs.writeFile(
    path.join(dir, 'map.json'),
    JSON.stringify(cached, null, '  '),
  );
}
