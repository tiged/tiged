import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import glob from 'tiny-glob';

const isDir = async (filePath: string) => {
	try {
		const stat = await fs.lstat(filePath);
		return stat.isDirectory();
	} catch (err) {
		return false;
	}
};

expect.extend({
	async toMatchFiles(
		received: string,
		expected: Record<string, string | null>
	) {
		const { isNot, equals } = this;

		if (!(await isDir(received))) {
			return {
				pass: false,
				actual: received,
				message: () => `${received} is${isNot ? '' : ' not'} a valid directory!`
			};
		}

		const receivedFileNames = (
			await glob('**', { cwd: path.join(received) })
		).sort();
		const expectedFiles = Object.fromEntries(
			Object.entries(expected)
				.map(([fileName, value]) => [path.join(fileName), value] as const)
				.sort()
		);

		const expectedFileNames = Object.keys(expectedFiles);

		if (!equals(expectedFileNames, receivedFileNames, undefined, true)) {
			return {
				pass: false,
				expected: expectedFileNames,
				actual: receivedFileNames,
				message: () =>
					`directory ${received} does${isNot ? '' : ' not'} contain the expected files`
			};
		}

		const receivedFiles = Object.fromEntries(
			await Promise.all(
				receivedFileNames.map(async file => {
					const filePath = path.resolve(received, file);
					if (await isDir(filePath)) {
						return [file, null] as const;
					}
					return [
						file.trim(),
						(await fs.readFile(filePath, 'utf-8')).trim().replace('\r\n', '\n')
					] as const;
				})
			)
		);

		return {
			pass: equals(receivedFiles, expectedFiles, undefined, true),
			actual: receivedFiles,
			expected: expectedFiles,
			message: () =>
				`directory ${received} does${isNot ? '' : ' not'} contain expected files`
		};
	}
});
