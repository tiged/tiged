#!/usr/bin/env -vS node --import=tsx/esm

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import picocolors from 'picocolors';
import { format, resolveConfig } from 'prettier';
import type TSConfigJson from '../tsconfig.json';

const { greenBright, bold, underline, blueBright, redBright } = picocolors;

type TSConfig = typeof TSConfigJson;

type CompilerOptions = TSConfig['compilerOptions'];

type TSConfigWithoutTigedPaths = Omit<TSConfig, 'compilerOptions'> & {
  compilerOptions: Omit<CompilerOptions, 'paths'> & {
    paths: Omit<CompilerOptions['paths'], 'tiged'>;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tsConfigPath = path.join(__dirname, '..', 'tsconfig.json');

const CLIArguments = process.argv.slice(2);

const [functionToExecute = 'erase'] = CLIArguments;

const prettierConfigPath = path.join(__dirname, '..', 'prettier.config.mjs');

const pathsWithTiged = {
  tiged: ['./src/index.ts'],
};

/**
 * Asynchronously reads the TypeScript configuration file and
 * adds the `tiged` property into its
 * {@linkcode CompilerOptions.paths | compilerOptions.paths}.
 *
 * @returns A {@linkcode Promise | promise} that resolves to the updated TypeScript configuration.
 *
 * @internal
 * @since 3.0.0
 */
const addTSConfigPaths = async (): Promise<TSConfig> => {
  const tsConfig = await fs.readFile(tsConfigPath, {
    encoding: 'utf-8',
  });

  const tsConfigJson: TSConfig = JSON.parse(tsConfig, (key, value) =>
    key === 'paths' ? { ...value, ...pathsWithTiged } : value,
  );

  console.log(
    greenBright(
      `compilerOptions.paths were added to ${blueBright(bold(underline(tsConfigPath)))}`,
    ),
  );

  return tsConfigJson;
};

/**
 * Asynchronously reads the TypeScript configuration file and
 * removes the `tiged` property from
 * {@linkcode CompilerOptions.paths | compilerOptions.paths}.
 *
 * @returns A {@linkcode Promise | promise} that resolves to the updated TypeScript configuration.
 *
 * @internal
 * @since 3.0.0
 */
const eraseTSConfigPaths = async (): Promise<TSConfigWithoutTigedPaths> => {
  const tsConfig = await fs.readFile(tsConfigPath, {
    encoding: 'utf-8',
  });

  const tsConfigJson: TSConfig = JSON.parse(tsConfig, (key, value) =>
    key === 'tiged' ? undefined : value,
  );

  console.log(
    greenBright(
      `compilerOptions.paths were removed from ${blueBright(bold(underline(tsConfigPath)))}`,
    ),
  );

  return tsConfigJson;
};

const functions = {
  add: addTSConfigPaths,
  erase: eraseTSConfigPaths,
} as const;

/**
 * Updates the TypeScript configuration file by adding or erasing
 * {@linkcode CompilerOptions.paths | compilerOptions.paths},
 * formats the updated configuration using Prettier,
 * and writes it back to the file.
 *
 * @returns A {@linkcode Promise | promise} that resolves when the update is complete.
 *
 * @internal
 * @since 3.0.0
 */
const updateTSConfig = async (): Promise<void> => {
  if (!(functionToExecute === 'add' || functionToExecute === 'erase')) {
    console.error(
      redBright(
        `Invalid function name. Valid function names are:\n${bold(underline(Object.keys(functions).join('\n')))}`,
      ),
    );

    return;
  }

  const newTSConfigJson = await functions[functionToExecute]();

  const prettierConfig =
    (await resolveConfig(tsConfigPath, {
      config: prettierConfigPath,
    })) ?? {};

  await fs.writeFile(
    tsConfigPath,
    await format(JSON.stringify(newTSConfigJson, null, 2), {
      ...prettierConfig,
      filepath: tsConfigPath,
    }),
    { encoding: 'utf-8' },
  );
};

void updateTSConfig();
