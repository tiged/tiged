import path from 'node:path';
import type { Options } from 'tsup';
import { defineConfig } from 'tsup';

export default defineConfig(options => {
	const commonOptions: Options = {
		clean: true,
		format: ['cjs', 'esm'],
		tsconfig: path.resolve('tsconfig.build.json'),
		sourcemap: true,
		...options
	};

	return [
		{
			...commonOptions,
			dts: true,
			entry: ['src/index.ts'],
			// https://github.com/egoist/tsup/issues/572
			esbuildOptions(options, context) {
				options.footer =
					context.format === 'cjs'
						? {
								js: 'module.exports = module.exports.default;'
							}
						: {};
			}
		},
		{ ...commonOptions, entry: ['src/bin.ts'] }
	];
});
