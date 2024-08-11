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
		shims: true,
		...options
	};

	return [
		{
			...commonOptions,
			dts: true,
			format: ['esm'],
			entry: ['src/index.ts']
		},
		{
			...commonOptions,
			format: ['cjs'],
			dts: { footer: 'export = degit' },
			entry: ['src/index.ts'],
			// https://github.com/egoist/tsup/issues/572
			footer: {
				js: `if (module.exports.default) {
  Object.assign(module.exports.default, module.exports);
  module.exports = module.exports.default;
  delete module.exports.default;
}`
			}
		},
		{
			...commonOptions,
			entry: ['src/bin.ts'],
			external: ['tiged'],
			treeshake: 'smallest',
			minify: true
		}
	];
});

// https://github.com/egoist/tsup/issues/700
process.on('beforeExit', async code => {
	if (code === 0) {
		const filePath = path.resolve('dist/index.d.ts');
		try {
			await fs.access(filePath);
			const file = await fs.readFile(filePath, 'utf-8');
			const lines = file.split('\n');
			const newContent = lines
				.filter(line => !line.startsWith('export {'))
				.join('\n');
			await fs.writeFile(filePath, newContent);
			process.exit(0);
		} catch (err) {
			console.error(err);
			process.exit(1);
		}
	}
});
