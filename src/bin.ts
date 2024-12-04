#!/usr/bin/env node

import { bold, cyan, magenta, red, underline } from 'colorette';
import * as enquirer from 'enquirer';
import fuzzysearch from 'fuzzysearch';
import mri from 'mri';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Options } from 'tiged';
import { tiged } from 'tiged';
import glob from 'tiny-glob/sync.js';
import { base, pathExists, tryRequire } from './utils';

const args = mri<Options & { help?: string }>(process.argv.slice(2), {
  alias: {
    f: 'force',
    c: 'cache',
    o: 'offline-mode',
    D: 'disable-cache',
    v: 'verbose',
    m: 'mode',
    s: 'subgroup',
    d: 'sub-directory',
  },
  boolean: [
    'force',
    'cache',
    'offline-mode',
    'disable-cache',
    'verbose',
    'subgroup',
  ],
});
const [src, dest = '.'] = args._;

/**
 * The main function of the application.
 * It handles the logic for displaying help,
 * interactive mode, and running the application.
 *
 * @returns A promise that resolves when the main function completes.
 */
async function main() {
  if (args.help) {
    const help = (
      await fs.readFile(path.join(__dirname, '..', 'help.md'), 'utf-8')
    )
      .replace(/^(\s*)#+ (.+)/gm, (m, s, _) => s + bold(_))
      .replace(/_([^_]+)_/g, (m, _) => underline(_))
      .replace(/`([^`]+)`/g, (m, _) => cyan(_)); //` syntax highlighter fix

    process.stdout.write(`\n${help}\n`);
  } else if (!src) {
    // interactive mode

    const accessLookup = new Map<string, number>();

    const accessJsonFiles = glob(`**/access.json`, { cwd: base });

    await Promise.all(
      accessJsonFiles.map(async file => {
        const [host, user, repo] = file.split(path.sep);

        const json = await fs.readFile(`${base}/${file}`, 'utf-8');
        const logs: Record<string, string> = JSON.parse(json);

        Object.entries(logs).forEach(([ref, timestamp]) => {
          const id = `${host}:${user}/${repo}#${ref}`;
          accessLookup.set(id, new Date(timestamp).getTime());
        });
      }),
    );

    const getChoice = (file: string) => {
      const [host, user, repo] = file.split(path.sep);

      const cacheLogs: Record<string, string> = tryRequire(`${base}/${file}`);

      return Object.entries(cacheLogs).map(([ref, hash]) => ({
        name: hash,
        message: `${host}:${user}/${repo}#${ref}`,
        value: `${host}:${user}/${repo}#${ref}`,
      }));
    };

    const choices = glob(`**/map.json`, { cwd: base })
      .map(getChoice)
      .reduce(
        (accumulator, currentValue) => accumulator.concat(currentValue),
        [],
      )
      .sort((a, b) => {
        const aTime = accessLookup.get(a.value) || 0;
        const bTime = accessLookup.get(b.value) || 0;

        return bTime - aTime;
      });

    const options = await enquirer.prompt<
      { dest: string; src: string } & Options
    >([
      // FIXME: `suggest` is not in the type definition
      {
        type: 'autocomplete',
        name: 'src',
        message: 'Repo to clone?',
        suggest: (input: string, choices: { value: string }[]) =>
          choices.filter(({ value }) => fuzzysearch(input, value)),
        choices,
      } as any,
      {
        type: 'input',
        name: 'dest',
        message: 'Destination directory?',
        initial: '.',
      },
      {
        type: 'toggle',
        name: 'cache',
        message: 'Use cached version?',
      },
    ]);

    const empty =
      !(await pathExists(options.dest)) ||
      (await fs.readdir(options.dest)).length === 0;

    if (!empty) {
      const { force } = await enquirer.prompt<Options>([
        {
          type: 'toggle',
          name: 'force',
          message: 'Overwrite existing files?',
        },
      ]);

      if (!force) {
        console.error(magenta(`! Directory not empty — aborting`));
        return;
      }
    }

    await run(options.src, options.dest, {
      force: true,
      cache: options.cache,
    });
  } else {
    await run(src, dest, args);
  }
}

/**
 * Runs the cloning process from the specified source
 * to the destination directory.
 *
 * @param src - The source repository to clone from.
 * @param dest - The destination directory where the repository will be cloned to.
 * @param args - Additional options for the cloning process.
 */
async function run(src: string, dest: string, args: Options) {
  const t = tiged(src, args);

  t.on('info', event => {
    console.error(cyan(`> ${event.message?.replace('options.', '--')}`));
  });

  t.on('warn', event => {
    console.error(magenta(`! ${event.message?.replace('options.', '--')}`));
  });

  try {
    await t.clone(dest);
  } catch (err) {
    if (err instanceof Error) {
      console.error(red(`! ${err.message.replace('options.', '--')}`));
      process.exit(1);
    }
  }
}

main();
