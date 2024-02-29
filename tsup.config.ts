import type { Options } from 'tsup';
import { defineConfig } from 'tsup';

export default defineConfig(options => {
	const commonOptions: Options = {
		clean: true,
		format: ['cjs', 'esm'],
		tsconfig: 'tsconfig.build.json',
		...options
	};

	return [
		{ ...commonOptions, dts: true, entry: ['src/index.ts'] },
		{ ...commonOptions, entry: ['src/bin.ts'] }
	];
});
