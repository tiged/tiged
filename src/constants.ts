import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import type { TigedOptions, ValidModes } from './types.js';

/**
 * Returns the home directory path of the current user if available,
 * otherwise returns the system's temporary directory path.
 *
 * @returns The path to the home directory or the temporary directory.
 *
 * @internal
 * @since 3.0.0
 */
const getHomeOrTmpDirectoryPath = () => homedir() || tmpdir();

/**
 * The path to the home or temporary directory.
 *
 * @internal
 * @since 3.0.0
 */
export const homeOrTmpDirectoryPath =
  /* @__PURE__ */ getHomeOrTmpDirectoryPath();

/**
 * The name of the directory used for temporary storage.
 *
 * @internal
 * @since 3.0.0
 */
export const stashDirectoryName = 'tmp';

/**
 * The name of the configuration file used by the Tiged tool.
 * This file contains settings and options for the tool.
 *
 * @internal
 * @since 3.0.0
 */
export const tigedConfigFileName = 'degit.json';

/**
 * The absolute path to the cache directory used by **`tiged`**.
 *
 * @internal
 * @since 3.0.0
 */
export const legacyCacheDirectoryPath = /* @__PURE__ */ path.join(
  homeOrTmpDirectoryPath,
  '.tiged',
);

/**
 * A set of valid modes of operation for **`tiged`**.
 *
 * This set includes the following modes:
 * - **`'tar'`**: Represents the **`tar`** mode.
 * - **`'git'`**: Represents the **`git`** mode.
 *
 * @internal
 * @since 3.0.0
 */
export const validModes = /* @__PURE__ */ new Set([
  'tar',
  'git',
] as const satisfies readonly ValidModes[]) satisfies ReadonlySet<ValidModes>;

/**
 * The name of the file where access logs are stored.
 * This file is expected to be in JSON format.
 *
 * @internal
 * @since 3.0.0
 */
export const accessLogsFileName = 'access.json';

/**
 * Default options used by **`tiged`**.
 *
 * @internal
 * @since 3.0.0
 */
export const tigedDefaultOptions = {
  disableCache: false,
  force: false,
  mode: 'tar',
  offlineMode: false,
  proxy: process.env.https_proxy || process.env.HTTPS_PROXY,
  subDirectory: undefined,
  subgroup: false,
  verbose: false,
} as const satisfies TigedOptions;

/**
 * A constant object that maps supported git hosting
 * service names to their respective domain suffixes.
 *
 * @internal
 * @since 3.0.0
 */
export const supportedHosts = {
  bitbucket: { name: 'BitBucket', topLevelDomain: '.org' },
  codeberg: { name: 'Codeberg', topLevelDomain: '.org' },
  'git.sr': { name: 'SourceHut', topLevelDomain: '.ht' },
  github: { name: 'GitHub', topLevelDomain: '.com' },
  gitlab: { name: 'GitLab', topLevelDomain: '.com' },
  huggingface: { name: 'Hugging Face', topLevelDomain: '.co' },
} as const;

export const supportedHostNames = [
  'github',
  'gitlab',
  'bitbucket',
  'git.sr',
  'huggingface',
  'codeberg',
] as const satisfies readonly (keyof typeof supportedHosts)[];

export type SupportedHostNames = (typeof supportedHostNames)[number];
