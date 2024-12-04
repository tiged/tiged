import * as path from 'node:path';
import type { Options } from 'tsup';
import { defineConfig } from 'tsup';

const tsupConfig = defineConfig((overrideOptions): Options[] => {
  const commonOptions = {
    clean: true,
    removeNodeProtocol: false,
    shims: true,
    sourcemap: true,
    splitting: false,
    target: ['esnext', 'node20'],
    tsconfig: path.resolve('tsconfig.build.json'),
    ...overrideOptions,
  } satisfies Options;

  return [
    {
      ...commonOptions,
      name: 'Modern ESM',
      entry: { index: 'src/index.ts' },
      format: ['esm'],
    },
    {
      ...commonOptions,
      name: 'CJS Development',
      entry: { index: 'src/index.ts' },
      format: ['cjs'],
    },
    {
      ...commonOptions,
      name: 'CLI Development',
      entry: { bin: 'src/bin.ts' },
      external: ['tiged'],
      format: ['cjs', 'esm'],
      minify: true,
    },
    {
      ...commonOptions,
      name: 'ESM Type Definitions',
      dts: { only: true },
      entry: { index: 'src/index.ts' },
      format: ['esm'],
    },
    {
      ...commonOptions,
      name: 'CJS Type Definitions',
      dts: { only: true },
      entry: { index: 'src/index.ts' },
      format: ['cjs'],
    },
  ];
});

export default tsupConfig;
