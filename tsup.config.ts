import fs from 'node:fs/promises';
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
								js: `if (module.exports.default) {
                  Object.assign(module.exports.default, module.exports);
                  module.exports = module.exports.default;
                  delete module.exports.default;
                }`
							}
						: {};
			}
		},
		{ ...commonOptions, entry: ['src/bin.ts'] }
	];
});

// https://github.com/egoist/tsup/issues/700
process.on('beforeExit', async code => {
	if (code === 0) {
		const filePath = path.resolve('dist/index.d.ts');
		try {
			await fs.access(filePath);
			await fs.appendFile(filePath, `export = degit`, 'utf-8');
			process.exit(0);
		} catch (err) {
			console.error(err);
			process.exit(1);
		}
	}
});
