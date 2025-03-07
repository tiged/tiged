#!/usr/bin/env -S node --import=tsx/esm

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import picocolors from 'picocolors';
import { glob } from 'tinyglobby';

const { bold, redBright, underline, greenBright } = picocolors;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cwd = path.join(__dirname, '..');

const CLIArguments = process.argv.slice(2);

const fileOrDirectoryPathsToRemove =
  CLIArguments.length === 0 ? ['dist'] : CLIArguments;

/**
 * Asynchronously removes a list of files or directories.
 *
 * By default, it removes the **`dist`** directory if no arguments are provided.
 *
 * @returns A {@linkcode Promise | promise} that resolves when all specified files or directories are deleted.
 *
 * @example
 * <caption>#### Removes the default **`dist`** directory when no arguments are passed</caption>
 *
 * ```bash
 * npx tsx scripts/remove.mts
 * ```
 *
 * @example
 * <caption>#### Removes specific directories</caption>
 *
 * ```bash
 * npx tsx scripts/remove.mts '.tmp' '.vscode'
 * ```
 *
 * @internal
 * @since 3.0.0
 */
const remove = async (): Promise<void> => {
  const pathsToRemove = await Promise.all(
    await glob(fileOrDirectoryPathsToRemove, {
      absolute: true,
      cwd,
      dot: true,
      expandDirectories: false,
      debug: true,
      ignore: ['node_modules/', '.git/'],
      onlyFiles: false,
    }),
  );

  if (pathsToRemove.length === 0) {
    console.error(
      redBright(
        `No matches were found for:\n${bold(underline(fileOrDirectoryPathsToRemove.join('\n')))}`,
      ),
    );
  } else {
    await Promise.all(
      pathsToRemove.map(pathToRemove => {
        console.log(
          redBright(`Removing ${bold(underline(greenBright(pathToRemove)))}`),
        );

        return fs.rm(pathToRemove, {
          force: true,
          recursive: true,
        });
      }),
    );
  }
};

void remove();
