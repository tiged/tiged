import { builtinModules } from 'node:module';
import type { InlineConfig, Rolldown, UserConfig } from 'tsdown';
import { defineConfig } from 'tsdown';
import packageJson from './package.json' with { type: 'json' };

/**
 * @internal
 */
const RE_DTS = /\.d\.([cm]?)ts$/;

/**
 * A {@linkcode Rolldown.Plugin | Rolldown plugin} to remove generated CommonJS
 * (`.cjs`) JavaScript outputs from DTS-only builds. When generating type
 * definition builds we may still emit stray `.cjs` files; this plugin deletes
 * those entries from the generated bundle to ensure only declaration artifacts
 * remain.
 *
 * @returns A {@linkcode Rolldown.Plugin | Rolldown plugin} that prunes `.cjs` files from the bundle.
 * @internal
 */
const removeCJSOutputsFromDTSBuilds = (): Rolldown.Plugin => ({
  generateBundle: {
    handler(outputOptions, bundle, isWrite) {
      if (outputOptions.format === 'cjs' && isWrite) {
        Object.values(bundle).forEach(outputChunk => {
          if (
            outputChunk.type === 'chunk' &&
            outputChunk.isEntry &&
            !RE_DTS.test(outputChunk.fileName)
          ) {
            delete bundle[outputChunk.fileName];
            delete bundle[`${outputChunk.fileName}.map`];
          }
        });
      }
    },
  },
  name: `${packageJson.name}:remove-cjs-outputs-from-dts-builds`,
});

/**
 * @internal
 */
const external = [
  ...Object.keys({
    ...packageJson.dependencies,
  }),
  ...builtinModules,
  /^node:/,
];

const tsdownConfig = defineConfig(cliOptions => {
  const commonOptions = {
    checks: {
      circularDependency: true,
    },
    cjsDefault: false,
    clean: false,
    cwd: import.meta.dirname,
    deps: {
      dts: {
        neverBundle: external,
      },
      neverBundle: external,
      onlyBundle: [],
    },
    devtools: {
      clean: true,
      enabled: true,
    },
    dts: false,
    entry: {
      index: 'src/index.ts',
    },
    failOnWarn: true,
    fixedExtension: false,
    format: ['cjs', 'esm'],
    hash: false,
    inputOptions(options) {
      return {
        ...options,
        experimental: {
          ...options.experimental,
          lazyBarrel: true,
          nativeMagicString: true,
        },
        transform: {
          ...options.transform,
          typescript: {
            ...options.transform?.typescript,
            optimizeConstEnums: true,
            optimizeEnums: true,
          },
        },
      } as const satisfies Rolldown.InputOptions;
    },
    minify: false,
    name: packageJson.name,
    nodeProtocol: true,
    outDir: 'dist',
    outputOptions(options, format, context) {
      return {
        ...options,
        codeSplitting: false,
        comments: {
          annotation: true,
          jsdoc: false,
          legal: true,
        },
        ...(format === 'cjs' && !context.cjsDts
          ? {
              externalLiveBindings: false,
            }
          : {}),
        strict: true,
      } as const satisfies Rolldown.OutputOptions;
    },
    platform: 'node',
    root: 'src',
    shims: true,
    sourcemap: true,
    target: ['esnext'],
    treeshake: {
      moduleSideEffects: false,
    },
    tsconfig: 'tsconfig.build.json',
    ...cliOptions,
  } as const satisfies InlineConfig;

  return [
    {
      ...commonOptions,
      name: packageJson.name,
    },
    {
      ...commonOptions,
      deps: {
        ...commonOptions.deps,
        neverBundle: [...external, packageJson.name],
      },
      entry: {
        bin: 'src/bin.ts',
      },
      name: `${packageJson.name} CLI`,
      minify: true,
    },
    {
      ...commonOptions,
      dts: {
        build: false,
        cjsDefault: false,
        cjsReexport: false,
        cwd: commonOptions.cwd,
        dtsInput: false,
        eager: false,
        emitDtsOnly: true,
        emitJs: false,
        enabled: true,
        incremental: false,
        newContext: false,
        oxc: false,
        parallel: false,
        resolver: 'tsc',
        sideEffects: false,
        sourcemap: true,
        tsconfig: commonOptions.tsconfig,
        tsgo: false,
        tsMacro: false,
        vue: false,
      },
      name: `${packageJson.name}-Type-Definitions`,
      plugins: [removeCJSOutputsFromDTSBuilds()],
    },
  ] as const satisfies UserConfig[];
});

export default tsdownConfig;
