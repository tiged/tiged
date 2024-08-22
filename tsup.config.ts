import path from 'node:path';
import type { Options } from 'tsup';
import { defineConfig } from 'tsup';

export default defineConfig(options => {
	const commonOptions: Options = {
		clean: true,
		format: ['cjs', 'esm'],
		tsconfig: path.resolve('tsconfig.build.json'),
		sourcemap: true,
		shims: true,
		splitting: false,
		removeNodeProtocol: false,
		...options
	};

	return [
		{
			...commonOptions,
			name: 'Modern ESM',
			dts: true,
			format: ['esm'],
			entry: ['src/index.ts']
		},
		{
			...commonOptions,
			name: 'CJS Development',
			format: ['cjs'],
			dts: true,
			entry: ['src/index.ts']
		},
		{
			...commonOptions,
			name: 'CLI Development',
			entry: ['src/bin.ts'],
			external: ['tiged'],
			treeshake: 'smallest',
			minify: true
		}
	];
});
