import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { rimraf } from 'rimraf';
import glob from 'tiny-glob/sync';
import degit from '../src/index';

const exec = promisify(child_process.exec);
const degitPath = path.resolve('dist/bin.mjs');

const timeout = 30_000;

describe.sequential(degit, { timeout }, () => {
	beforeAll(async () => {
		await exec('npm run build');
	});

	beforeEach(async () => {
		await rimraf('.tmp');
	});

	afterEach(async () => {
		await rimraf('.tmp');
	});

	function compare<T extends Record<string, any>>(dir: string, files: T) {
		const expected = glob('**', { cwd: path.join(dir) });
		const normalizedPaths = Object.fromEntries(
			Object.entries(files).map(
				([fileName, value]) => [path.join(fileName), value] as const
			)
		);
		expect(Object.keys(normalizedPaths).sort()).toStrictEqual(expected.sort());

		expected.forEach(async file => {
			const filePath = path.join(`${dir}/${file}`);
			if (!(await fs.lstat(filePath)).isDirectory()) {
				expect(path.join(normalizedPaths[file]).trim()).toBe(
					(await read(filePath)).trim()
				);
			}
		});
	}

	describe('github', () => {
		it.each([
			'tiged/tiged-test-repo-compose',
			'tiged/tiged-test-repo',
			'github:tiged/tiged-test-repo',
			'git@github.com:tiged/tiged-test-repo',
			'https://github.com/tiged/tiged-test-repo.git'
		])('%s', async src => {
			await exec(`node ${degitPath} ${src} .tmp/test-repo -v`);
			compare(`.tmp/test-repo`, {
				'file.txt': 'hello from github!',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe('gitlab', () => {
		it.each([
			'gitlab:nake89/tiged-test-repo',
			'git@gitlab.com:nake89/tiged-test-repo',
			'https://gitlab.com/nake89/tiged-test-repo.git'
		])('%s', async src => {
			await exec(`node ${degitPath} ${src} .tmp/test-repo -v`);
			compare(`.tmp/test-repo`, {
				'file.txt': 'hello from gitlab!'
			});
		});
	});

	describe('gitlab subgroup', () => {
		it.each([
			'https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo'
		])('%s', async src => {
			await exec(`node ${degitPath} --subgroup ${src} .tmp/test-repo -v`);
			compare(`.tmp/test-repo`, {
				'main.tf': 'Subgroup test',
				subdir1: null,
				'subdir1/subdir2': null,
				'subdir1/subdir2/file.txt': "I'm a file."
			});
		});
	});

	describe('gitlab subgroup with subdir', () => {
		it.each([
			'https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo'
		])('%s', async src => {
			await exec(
				`node ${degitPath} --subgroup ${src} --sub-directory subdir1 .tmp/test-repo -v`
			);
			compare(`.tmp/test-repo`, {
				subdir2: null,
				'subdir2/file.txt': "I'm a file."
			});
		});

		it.each([
			'https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo'
		])('%s', async src => {
			await exec(
				`node ${degitPath} --subgroup ${src} --sub-directory subdir1/subdir2 .tmp/test-repo -v`
			);
			compare(`.tmp/test-repo`, {
				'file.txt': "I'm a file."
			});
		});
	});

	describe('bitbucket', () => {
		it.each([
			'bitbucket:nake89/tiged-test-repo',
			'git@bitbucket.org:nake89/tiged-test-repo',
			'https://bitbucket.org/nake89/tiged-test-repo.git'
		])('%s', async src => {
			await exec(`node ${degitPath} ${src} .tmp/test-repo -v`);
			compare(`.tmp/test-repo`, {
				'file.txt': 'hello from bitbucket'
			});
		});
	});

	describe('Sourcehut', () => {
		it.each([
			'git.sr.ht/~satotake/degit-test-repo',
			'https://git.sr.ht/~satotake/degit-test-repo',
			'git@git.sr.ht:~satotake/degit-test-repo'
		])('%s', async src => {
			await exec(`node ${degitPath} ${src} .tmp/test-repo -v`);
			compare(`.tmp/test-repo`, {
				'file.txt': 'hello from sourcehut!'
			});
		});
	});

	describe('Hugging Face', () => {
		it.each([
			'huggingface:severo/degit-test-repo',
			'git@huggingface.co:severo/degit-test-repo',
			'https://huggingface.co/severo/degit-test-repo.git'
		])('%s', async src => {
			await exec(`node ${degitPath} ${src} .tmp/test-repo -v`);
			compare(`.tmp/test-repo`, {
				'file.txt': 'hello from Hugging Face',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe('Subdirectories', () => {
		it.each([
			'tiged/tiged-test-repo/subdir',
			'github:tiged/tiged-test-repo/subdir',
			'git@github.com:tiged/tiged-test-repo/subdir',
			'https://github.com/tiged/tiged-test-repo.git/subdir'
		])('%s', async src => {
			await exec(`node ${degitPath} ${src} .tmp/test-repo -v`);
			compare(`.tmp/test-repo`, {
				'file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe('non-empty directories', () => {
		it('fails without --force', async () => {
			await fs.mkdir(path.join('.tmp/test-repo'), { recursive: true });
			await exec(`echo "not empty" > .tmp/test-repo/file.txt`);
			await expect(() =>
				exec(`node ${degitPath} tiged/tiged-test-repo .tmp/test-repo -v`)
			).rejects.toThrowError(/destination directory is not empty/);
		});

		it('succeeds with --force', async () => {
			await exec(`node ${degitPath} tiged/tiged-test-repo .tmp/test-repo -fv`);
		});
	});

	describe('command line arguments', () => {
		it('allows flags wherever', async () => {
			await exec(`node ${degitPath} -v tiged/tiged-test-repo .tmp/test-repo`);
			compare(`.tmp/test-repo`, {
				'file.txt': 'hello from github!',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe('api', () => {
		it('is usable from node scripts', async () => {
			await degit('tiged/tiged-test-repo', { force: true }).clone(
				'.tmp/test-repo'
			);

			compare(`.tmp/test-repo`, {
				'file.txt': 'hello from github!',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe('actions', () => {
		it('removes specified file', async () => {
			await exec(
				`node ${degitPath} -v tiged/tiged-test-repo-remove-only .tmp/test-repo`
			);
			compare(`.tmp/test-repo`, {});
		});

		it('clones repo and removes specified file', async () => {
			await exec(
				`node ${degitPath} -v tiged/tiged-test-repo-remove .tmp/test-repo`
			);
			compare(`.tmp/test-repo`, {
				'other.txt': 'hello from github!',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});

		it('removes and adds nested files', async () => {
			await exec(
				`node ${degitPath} -v tiged/tiged-test-repo-nested-actions .tmp/test-repo`
			);
			compare(`.tmp/test-repo`, {
				dir: null,
				folder: null,
				subdir: null,
				'folder/file.txt': 'hello from clobber file!',
				'folder/other.txt': 'hello from other file!',
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe('git mode old hash', () => {
		it('is able to clone correctly using git mode with old hash', async () => {
			await exec(
				`node ${degitPath} --mode=git https://github.com/tiged/tiged-test.git#525e8fef2c6b5e261511adc55f410d83ca5d8256 .tmp/test-repo`
			);
			compare(`.tmp/test-repo`, {
				subdir: false,
				'README.md': 'tiged is awesome',
				'subdir/file': 'Hello, buddy!'
			});
		});
		it('is able to clone subdir correctly using git mode with old hash', async () => {
			await exec(
				`node ${degitPath} --mode=git https://github.com/tiged/tiged-test.git/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581 .tmp/test-repo`
			);
			compare(`.tmp/test-repo`, {
				file: 'Hello, buddy!'
			});
		});
	});

	describe.skip('git mode', () => {
		it('is able to clone correctly using git mode', async () => {
			await rimraf('.tmp');
			await exec(
				`node ${degitPath} --mode=git https://github.com/Rich-Harris/degit-test-repo-private.git .tmp/test-repo`
			);
			compare('.tmp/test-repo', {
				'file.txt': 'hello from a private repo!'
			});
		});
	});
});

async function read(file: string) {
	return await fs.readFile(file, 'utf-8');
}
