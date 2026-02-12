import * as path from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

const vitestConfig = defineConfig({
  define: {
    'import.meta.vitest': 'undefined',
  },

  plugins: [
    tsconfigPaths({
      configNames: ['tsconfig.json'],
      projects: [path.join(import.meta.dirname, 'tsconfig.json')],
      root: import.meta.dirname,
    }),
  ],

  root: import.meta.dirname,

  test: {
    alias: process.env.TEST_DIST
      ? [
          {
            find: packageJson.name,
            replacement: path.join(
              import.meta.dirname,
              'node_modules',
              'tiged',
            ),
          },
        ]
      : [],

    chaiConfig: {
      truncateThreshold: 1000,
    },

    dir: path.join(import.meta.dirname, 'test'),
    globals: true,
    include: ['**/*.test.?(c|m)ts?(x)'],
    name: packageJson.name,

    reporters: process.env.GITHUB_ACTIONS
      ? [['default', { summary: false }], ['github-actions']]
      : [['default']],

    root: import.meta.dirname,
    setupFiles: ['./test/vitest.setup.ts'],

    testTimeout: process.env.CI ? 30_000 : 10_000,

    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, 'tsconfig.json'),
    },

    watch: false,
  },
});

export default vitestConfig;
