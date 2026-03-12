import * as path from 'node:path';
import type { InlineConfig, Rolldown, UserConfig } from 'tsdown';
import { defineConfig } from 'tsdown';
import packageJson from './package.json' with { type: 'json' };

const tsdownConfig = defineConfig(cliOptions => {
  const commonOptions = {
    clean: false,
    cwd: import.meta.dirname,
    deps: {
      onlyBundle: [],
    },
    devtools: {
      clean: true,
      enabled: true,
    },
    dts: {
      build: false,
      cwd: import.meta.dirname,
      dtsInput: false,
      eager: false,
      emitDtsOnly: false,
      emitJs: false,
      enabled: true,
      incremental: false,
      oxc: false,
      resolver: 'tsc',
      sideEffects: false,
      sourcemap: true,
    },
    failOnWarn: true,
    fixedExtension: false,
    format: ['cjs', 'es'],
    hash: false,
    inputOptions(options) {
      return {
        ...options,
        experimental: {
          ...options.experimental,
          lazyBarrel: true,
          nativeMagicString: true,
        },
      } as const satisfies Rolldown.InputOptions;
    },
    minify: false,
    nodeProtocol: true,
    outDir: 'dist',
    outputOptions(options) {
      return {
        ...options,
        codeSplitting: false,
        comments: {
          annotation: true,
          jsdoc: false,
          legal: true,
        },
        strict: true,
      } as const satisfies Rolldown.OutputOptions;
    },
    platform: 'node',
    root: 'src',
    shims: true,
    sourcemap: true,
    treeshake: {
      moduleSideEffects: false,
    },
    target: ['esnext'],
    tsconfig: path.join(import.meta.dirname, 'tsconfig.build.json'),
    ...cliOptions,
  } as const satisfies InlineConfig;

  return [
    {
      ...commonOptions,
      name: packageJson.name,
      entry: {
        index: 'src/index.ts',
      },
    },
    {
      ...commonOptions,
      name: `${packageJson.name} CLI`,
      deps: {
        ...commonOptions.deps,
        neverBundle: [packageJson.name, /^node:/],
      },
      dts: {
        enabled: false,
      },
      entry: {
        bin: 'src/bin.ts',
      },
      minify: true,
    },
  ] as const satisfies UserConfig[];
});

export default tsdownConfig;
