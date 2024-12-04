import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    alias: process.env.TEST_DIST
      ? {
          tiged: new URL('node_modules/tiged', import.meta.url).pathname,
        }
      : undefined,
    watch: false,
    setupFiles: ['./test/vitest.setup.ts'],
    globals: true,
  },
  define: { 'import.meta.vitest': 'undefined' },
});
