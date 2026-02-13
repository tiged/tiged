/**
 * Represents the valid modes for a file.
 * Possible values are:
 *
 * - **`'tar'`**: Downloads the repository as a tarball.
 * - **`'git'`**: Clones the repository using Git.
 *
 * @public
 * @since 3.0.0
 */
export type ValidModes = 'tar' | 'git';

/**
 * Represents the options for a specific operation.
 *
 * @public
 * @since 3.0.0
 */
export type TigedOptions = {
  /**
   * Disables the use of cache for operations,
   * ensuring data is always fetched anew.
   *
   * **CLI-Equivalent**: **`-D`**, **`--disable-cache`**, **`--disableCache`**
   *
   * @default false
   */
  disableCache?: boolean;

  /**
   * Forces the operation to proceed, despite non-empty destination directory
   * potentially overwriting existing files.
   *
   * **CLI-Equivalent**: **`-f`**, **`--force`**
   *
   * @default false
   */
  force?: boolean;

  /**
   * Specifies the mode of operation,
   * which determines how the repository is cloned.
   *
   * Possible values are:
   *
   * - **`'tar'`**: Downloads the repository as a tarball.
   * - **`'git'`**: Clones the repository using Git.
   *
   * **CLI-Equivalent**: **`-m`**, **`--mode`**, **`--mode=git`**
   *
   * @default 'tar'
   */
  mode?: ValidModes;

  /**
   * Enables offline mode, where operations rely on cached data.
   *
   * **CLI-Equivalent**: **`-o`**, **`--offline-mode`**, **`--offlineMode`**
   *
   * @default false
   */
  offlineMode?: boolean;

  /**
   * Specifies the proxy server to be used for network requests.
   *
   * **CLI-Equivalent**: **`-p`**, **`--proxy`**
   *
   * @default process.env.https_proxy || process.env.HTTPS_PROXY
   */
  proxy?: string | undefined;

  /**
   * Specifies a sub-directory within the repository to clone and extract.
   *
   * If this property is set, the cloning process will focus only on the
   * specified sub-directory of the repository rather than the
   * entire repository. The contents of the specified sub-directory
   * will be extracted to the target destination directory.
   * This can be useful for working with monorepos or
   * repositories where only a portion of the content is needed.
   *
   * If not specified, the entire repository will be cloned.
   *
   * **CLI-Equivalent**: **`-d`**, **`--sub-directory`**, **`--subDirectory`**
   *
   * @default undefined
   */
  subDirectory?: string | undefined;

  /**
   * Specifies whether to get a repository
   * that has a subgroup (**GitLab** only).
   *
   * **CLI-Equivalent**: **`-s`**, **`--subgroup`**
   *
   * @default false
   */
  subgroup?: boolean;

  /**
   * Enables verbose output for more detailed logging information.
   *
   * **CLI-Equivalent**: **`-v`**, **`--verbose`**
   *
   * @default false
   */
  verbose?: boolean;
};

/**
 * Represents a repository.
 *
 * @public
 * @since 3.0.0
 */
export type Repo = {
  /**
   * The name of the repository (e.g., `tiged-test-repo`, `degit-test-repo`).
   */
  name: string;

  /**
   * The reference to a specific branch, commit, or tag in the repository
   * (e.g., `HEAD`, `b09755bc4cca3d3b398fbe5e411daeae79869581`).
   *
   * @default 'HEAD'
   */
  ref: string;

  /**
   * The hosting service or site for the repository (e.g., `github`, `gitlab`).
   *
   * @default 'github'
   */
  site: string;

  /**
   * The SSH URL to access the repository for Git
   * operations (e.g., `git@github.com:tiged/tiged-test`, `git@github.com:tiged/tiged-test-repo`).
   */
  ssh: string;

  /**
   * Optional. A specific subdirectory within the repository to work with,
   * if applicable (e.g., `/subdir`, `/test-repo`).
   */
  subDirectory: string;

  /**
   * Optional. Indicates whether the repository belongs to a subgroup,
   * if supported by the hosting service (**GitLab only**).
   *
   * @default false
   */
  subgroup?: boolean;

  /**
   * The URL to access the repository via HTTP or HTTPS
   * (e.g., `https://github.com/tiged/tiged-test`, `https://github.com/tiged/tiged-test-repo`).
   */
  url: string;

  /**
   * The username or organization under which the repository is located
   * (e.g., `tiged`, `nake89`).
   */
  user: string;
};

/**
 * Represents the possible information codes.
 *
 * @public
 * @since 3.0.0
 */
export type InfoCode =
  | 'DEST_IS_EMPTY'
  | 'DEST_NOT_EMPTY'
  | 'DOWNLOADING'
  | 'EXTRACTING'
  | 'FILE_EXISTS'
  | 'FOUND_MATCH'
  | 'HUGGING_FACE'
  | 'NO_CACHE'
  | 'PROXY'
  | 'REMOVED'
  | 'SUCCESS'
  | 'USING_CACHE';

/**
 * Represents information about a specific entity.
 *
 * @public
 * @since 3.0.0
 */
export type Info = {
  /**
   * The code associated with the entity.
   */
  readonly code: InfoCode;

  /**
   * The destination of the entity.
   */
  readonly dest?: string;

  /**
   * The message associated with the entity.
   */
  readonly message?: string;

  /**
   * The repository associated with the entity.
   */
  readonly repo?: Repo;
};

/**
 * Represents an action.
 *
 * @public
 * @since 3.0.0
 */
type Action = {
  /**
   * The type of action.
   */
  action: string;

  /**
   * Specifies whether to use caching.
   *
   * @default true
   */
  cache?: boolean;

  /**
   * Whether to output extra information during the operation.
   *
   * @default false
   */
  verbose?: boolean;
};

/**
 * Represents a Tiged action for cloning.
 *
 * @public
 * @since 3.0.0
 */
export type TigedAction = Action & {
  /**
   * The type of action, which is always `'clone'`.
   */
  action: 'clone';

  /**
   * The source path to clone from.
   */
  src: string;
};

/**
 * Represents a `remove` action.
 *
 * @public
 * @since 3.0.0
 */
export type RemoveAction = Action & {
  /**
   * The type of action, which is always `'remove'`.
   */
  action: 'remove';

  /**
   * An array of file paths to be removed.
   */
  files: string[];
};

/**
 * Represents the possible error codes for the **`Tiged`** utility.
 *
 * @internal
 * @since 3.0.0
 */
type TigedErrorCode =
  | 'BAD_REF'
  | 'BAD_SRC'
  | 'BAD_TAR_PATH'
  | 'CACHE_MISS'
  | 'COULD_NOT_DOWNLOAD'
  | 'COULD_NOT_FETCH'
  | 'DEST_NOT_EMPTY'
  | 'ENOENT'
  | 'FILE_DOES_NOT_EXIST'
  | 'MISSING_GIT'
  | 'MISSING_REF'
  | 'NO_FILES'
  | 'UNSUPPORTED_HOST';

/**
 * Represents the options for a **`Tiged`** error.
 *
 * @internal
 * @since 3.0.0
 */
export type TigedErrorOptions = ErrorOptions & {
  /**
   * The error code associated with the error.
   */
  code: TigedErrorCode;

  /**
   * The original error that caused this error.
   */
  original?: Error | undefined;

  /**
   * The reference (e.g., branch, tag, commit) that was being targeted.
   */
  ref?: string | undefined;

  /**
   * The URL associated with the error.
   */
  url?: string | undefined;
};

/**
 * @internal
 */
export type DamerauLevenshteinResult = {
  steps: number;
  relative: number;
  similarity: number;
};
