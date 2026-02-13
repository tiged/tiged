#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import picocolors from 'picocolors';
import type { TigedOptions } from 'tiged';
import { createTiged } from 'tiged';
import { glob } from 'tinyglobby';
import { parseCliArgs } from './cli-parser.js';
import { accessLogsFileName } from './constants.js';
import { promptAutocomplete, promptInput, promptToggle } from './prompt.js';
import {
  base,
  damerauLevenshteinSimilarity,
  pathExists,
  tryRequire,
} from './utils.js';

const { bold, cyanBright, magentaBright, red, underline } = picocolors;

type TigedOptionsStringKeys = keyof {
  [key in keyof Required<TigedOptions> as [
    NonNullable<TigedOptions[key]>,
  ] extends [string]
    ? key
    : never]: TigedOptions[key];
};

type TigedOptionsBooleanKeys = keyof {
  [key in keyof Required<TigedOptions> as [boolean] extends [
    NonNullable<TigedOptions[key]>,
  ]
    ? key
    : never]: TigedOptions[key];
};

const CLIArguments = parseCliArgs<TigedOptions & { help?: string }>(
  process.argv.slice(2),
  {
    alias: {
      D: ['disable-cache', 'disableCache'],
      d: ['sub-directory', 'subDirectory'],
      f: 'force',
      h: 'help',
      m: 'mode',
      o: ['offline-mode', 'offlineMode'],
      p: 'proxy',
      s: 'subgroup',
      v: 'verbose',
    },

    boolean: [
      'disableCache',
      'force',
      'offlineMode',
      'subgroup',
      'verbose',
    ] as const satisfies TigedOptionsBooleanKeys[],

    string: [
      'mode',
      'proxy',
      'subDirectory',
    ] as const satisfies TigedOptionsStringKeys[],
  },
);

const [src = '', destArg] = CLIArguments!._;

/**
 * Runs the cloning process from the specified source
 * to the destination directory.
 *
 * @param src - The source repository to clone from.
 * @param dest - The destination directory where the repository will be cloned to.
 * @param tigedOptions - Additional options for the cloning process.
 * @returns A {@linkcode Promise | promise} that resolves when the cloning process is complete.
 */
async function run(
  src: string,
  dest: string | undefined,
  tigedOptions: TigedOptions,
): Promise<void> {
  const tiged = createTiged(src, tigedOptions);

  const resolvedDest = dest ?? tiged.repo.name;

  tiged.on('info', event => {
    console.error(
      cyanBright(`> ${event.message?.replace('options.', '--') ?? ''}`),
    );
  });

  tiged.on('warn', event => {
    console.error(
      magentaBright(`! ${event.message?.replace('options.', '--') ?? ''}`),
    );
  });

  try {
    await tiged.clone(resolvedDest);
  } catch (error) {
    if (error instanceof Error) {
      console.error(red(`! ${error.message.replace('options.', '--')}`));

      process.exit(1);
    }
  }
}

/**
 * The main function of the application.
 * It handles the logic for displaying help,
 * interactive mode, and running the application.
 *
 * @returns A {@linkcode Promise | promise} that resolves when the main function completes.
 */
async function main(): Promise<void> {
  if (CLIArguments?.help) {
    const help = (
      await fs.readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '..',
          'help.md',
        ),
        { encoding: 'utf-8' },
      )
    )
      .replaceAll(
        /^(\s*)#+ (.+)/gm,
        (
          _headerWithLeadingWhiteSpaces,
          leadingWhiteSpaces: string,
          header: string,
        ) => leadingWhiteSpaces + bold(header),
      )
      .replaceAll(/_([^_]+)_/g, (_tigedTitleInItalics, tigedTitle: 'tiged') =>
        underline(tigedTitle),
      )
      .replaceAll(/`([^`]+)`/g, (_inlineCode, inlineCodeContent: string) =>
        cyanBright(inlineCodeContent),
      ); //` syntax highlighter fix

    process.stdout.write(`\n${help}\n`);
  } else if (!src) {
    // interactive mode

    const accessLookup = /* @__PURE__ */ new Map<string, number>();

    const hasCacheDir = await pathExists(base);

    await fs.mkdir(base, { recursive: true });

    const accessJsonFiles = hasCacheDir
      ? await glob(`**/${accessLogsFileName}`, {
          cwd: base,
        })
      : [];

    await Promise.all(
      accessJsonFiles.map(file => {
        const [host = 'github', user = '', repo = ''] = file.split(path.sep);

        const logs: Partial<Record<string, string>> =
          tryRequire(path.join(base, file)) || {};

        Object.entries(logs).forEach(([ref, timestamp]) => {
          const id = `${host}:${user}/${repo}#${ref}`;
          accessLookup.set(
            id,
            timestamp ? new Date(timestamp).getTime() : new Date().getTime(),
          );
        });
      }),
    );

    const getChoice = (file: string) => {
      const [host = 'github', user = '', repo = ''] = file.split(path.sep);

      const cacheLogs: Partial<Record<string, string>> =
        tryRequire(path.join(base, file)) || {};

      return Object.entries(cacheLogs).map(([ref, hash = '']) => ({
        message: `${host}:${user}/${repo}#${ref}`,
        name: hash,
        value: `${host}:${user}/${repo}#${ref}`,
      }));
    };

    const choices = (
      await Promise.all(
        (hasCacheDir ? await glob(`**/map.json`, { cwd: base }) : []).map(
          getChoice,
        ),
      )
    )
      .reduce(
        (accumulator, currentValue) => accumulator.concat(currentValue),
        [],
      )
      .sort((a, b) => {
        const aTime = accessLookup.get(a.value) ?? 0;
        const bTime = accessLookup.get(b.value) ?? 0;

        return bTime - aTime;
      });

    const srcAnswer = await promptAutocomplete({
      message: 'Repo to clone?',
      suggest(input: string, suggestChoices) {
        const query = input.trim();
        if (!query) return suggestChoices;
        const queryLower = query.toLowerCase();
        return suggestChoices.filter(({ value }) => {
          const valueLower = value.toLowerCase();
          if (valueLower.includes(queryLower)) return true;
          return damerauLevenshteinSimilarity(queryLower, valueLower) >= 0.5;
        });
      },
      choices,
    });

    const destAnswer = await promptInput({
      message: 'Destination directory?',
      initial: '.',
    });

    const cacheAnswer = await promptToggle({
      message: 'Use cached version?',
    });

    const options = {
      src: srcAnswer,
      dest: destAnswer,
      cache: cacheAnswer,
    };

    const empty =
      !(await pathExists(options.dest)) ||
      (await fs.readdir(options.dest, { encoding: 'utf-8' })).length === 0;

    if (!empty) {
      const force = await promptToggle({
        message: 'Overwrite existing files?',
      });

      if (!force) {
        console.error(magentaBright(`! Directory not empty — aborting`));

        return;
      }
    }

    const { dest, src, ...tigedOptions } = options;

    await run(src, dest, {
      ...tigedOptions,
      force: true,
    });
  } else {
    await run(src.toString(), destArg?.toString(), CLIArguments ?? {});
  }
}

void main();
