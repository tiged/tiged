import fs from 'node:fs/promises';
import path from 'node:path';
import glob from 'tiny-glob/sync';

expect.extend({
	toMatchFiles(received, expected: Record<string, any>) {
		const { isNot, equals } = this;

		const filesInDirectory = glob('**', { cwd: received });
		const normalizedPaths = Object.fromEntries(
			Object.entries(expected).map(
				([fileName, value]) => [path.join(fileName), value] as const
			)
		);

		if (equals(Object.keys(normalizedPaths).sort(), filesInDirectory.sort())) {
			return {
				pass: true,
				message: () => `${received} does${isNot ? '' : ' not'} match files`
			};
		}

		return {
			pass: filesInDirectory.every(async file => {
				const filePath = path.resolve(received, file);

				if (!(await fs.lstat(filePath)).isDirectory()) {
					return equals(
						path.join(normalizedPaths[file]).trim(),
						(await fs.readFile(filePath, 'utf-8')).trim().replace('\r\n', '\n')
					);
				}
			}),

			message: () => `${received} does${isNot ? '' : ' not'} match files`
		};
	}
});
