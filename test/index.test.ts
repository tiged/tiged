import child_process from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { rimraf } from 'rimraf';
import { tiged } from 'tiged';

const exec = promisify(child_process.exec);
const tigedPath = process.env.CI
	? 'tiged -D'
	: `node --import=tsx ${path.resolve('src/bin.ts')} -D`;

const timeout = 30_000;

const convertSpecialCharsToHyphens = (str: string) =>
	str.replace(/[^a-zA-Z0-9]+/g, '-');

describe(tiged, { timeout }, () => {
	beforeAll(async () => {
		await rimraf('.tmp');
	});

	afterAll(async () => {
		await rimraf('.tmp');
	});

	describe.sequential('github', () => {
		it.each([
			'tiged/tiged-test-repo-compose',
			'tiged/tiged-test-repo',
			'github:tiged/tiged-test-repo',
			'git@github.com:tiged/tiged-test-repo',
			'https://github.com/tiged/tiged-test-repo.git'
		])('%s', async src => {
			const sanitizedPath = convertSpecialCharsToHyphens(src);
			await exec(`${tigedPath} ${src} .tmp/test-repo-${sanitizedPath} -v`);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'file.txt': 'hello from github!',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe.sequential('gitlab', () => {
		it.each([
			'gitlab:nake89/tiged-test-repo',
			'git@gitlab.com:nake89/tiged-test-repo',
			'https://gitlab.com/nake89/tiged-test-repo.git'
		])('%s', async src => {
			const sanitizedPath = convertSpecialCharsToHyphens(src);
			await exec(`${tigedPath} ${src} .tmp/test-repo-${sanitizedPath} -v`);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'file.txt': 'hello from gitlab!'
			});
		});
	});

	describe('gitlab subgroup', () => {
		it('https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo', async ({
			task,
			expect
		}) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} --subgroup ${task.name} .tmp/test-repo-${sanitizedPath} -v`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'main.tf': 'Subgroup test',
				subdir1: null,
				'subdir1/subdir2': null,
				'subdir1/subdir2/file.txt': "I'm a file."
			});
		});
	});

	describe('gitlab subgroup with subdir', () => {
		it('https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo', async ({
			task,
			expect
		}) => {
			const sanitizedPath = `${convertSpecialCharsToHyphens(task.name)}-0`;
			await exec(
				`${tigedPath} --subgroup ${task.name} --sub-directory subdir1 .tmp/test-repo-${sanitizedPath} -v`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				subdir2: null,
				'subdir2/file.txt': "I'm a file."
			});
		});

		it('https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo', async ({
			task,
			expect
		}) => {
			const sanitizedPath = `${convertSpecialCharsToHyphens(task.name)}-1`;
			await exec(
				`${tigedPath} --subgroup ${task.name} --sub-directory subdir1/subdir2 .tmp/test-repo-${sanitizedPath} -v`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
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
			const sanitizedPath = convertSpecialCharsToHyphens(src);
			await exec(`${tigedPath} ${src} .tmp/test-repo-${sanitizedPath} -v`);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'file.txt': 'hello from bitbucket'
			});
		});
	});

	describe.sequential('Sourcehut', () => {
		it.each([
			'git.sr.ht/~satotake/degit-test-repo',
			'https://git.sr.ht/~satotake/degit-test-repo',
			'git@git.sr.ht:~satotake/degit-test-repo'
		])('%s', async src => {
			const sanitizedPath = convertSpecialCharsToHyphens(src);
			await exec(`${tigedPath} ${src} .tmp/test-repo-${sanitizedPath} -v`);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'file.txt': 'hello from sourcehut!'
			});
		});
	});

	describe.sequential('Codeberg', () => {
		it.each([
			'codeberg:joaopalmeiro/tiged-test-repo',
			'https://codeberg.org/joaopalmeiro/tiged-test-repo',
			'git@codeberg.org:joaopalmeiro/tiged-test-repo'
		])('%s', async src => {
			const sanitizedPath = convertSpecialCharsToHyphens(src);
			await exec(`${tigedPath} ${src} .tmp/test-repo-${sanitizedPath} -v`);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'file.txt': 'hello from codeberg!'
			});
		});
	});

	describe('Hugging Face', () => {
		it.each([
			'huggingface:severo/degit-test-repo',
			'git@huggingface.co:severo/degit-test-repo',
			'https://huggingface.co/severo/degit-test-repo.git'
		])('%s', async src => {
			const sanitizedPath = convertSpecialCharsToHyphens(src);
			await exec(`${tigedPath} ${src} .tmp/test-repo-${sanitizedPath} -v`);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
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
			const sanitizedPath = convertSpecialCharsToHyphens(src);
			await exec(`${tigedPath} ${src} .tmp/test-repo-${sanitizedPath} -v`);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'file.txt': `hello from a subdirectory!`
			});
		});
	});

	describe('Non-existant subdirectory', () => {
		it('throws error', async ({ task, expect }) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await expect(() =>
				exec(
					`${tigedPath} -v tiged/tiged-test-repo/non-existant-dir .tmp/test-repo-${sanitizedPath}`
				)
			).rejects.toThrowError(/No files to extract/);
		});
	});

	describe.sequential('non-empty directories', () => {
		let sanitizedPath: string;
		it('fails without --force', async ({ task, expect }) => {
			sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await fs.mkdir(path.join(`.tmp/test-repo-${sanitizedPath}`), {
				recursive: true
			});
			await exec(`echo "not empty" > .tmp/test-repo-${sanitizedPath}/file.txt`);
			await expect(() =>
				exec(
					`${tigedPath} tiged/tiged-test-repo .tmp/test-repo-${sanitizedPath} -v`
				)
			).rejects.toThrowError(/destination directory is not empty/);
		});

		it('succeeds with --force', async ({ expect }) => {
			await expect(
				exec(
					`${tigedPath} tiged/tiged-test-repo .tmp/test-repo-${sanitizedPath} -fv`
				)
			).resolves.not.toThrow();
		});
	});

	describe('command line arguments', () => {
		it('allows flags wherever', async ({ task, expect }) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} -v tiged/tiged-test-repo .tmp/test-repo-${sanitizedPath}`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'file.txt': 'hello from github!',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe('api', () => {
		it('is usable from node scripts', async ({ task, expect }) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await tiged('tiged/tiged-test-repo', {
				force: true,
				disableCache: true,
				verbose: true
			}).clone(`.tmp/test-repo-${sanitizedPath}`);

			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'file.txt': 'hello from github!',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});
	});

	describe.concurrent('actions', () => {
		it('removes specified file', async ({ task, expect }) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} -v tiged/tiged-test-repo-remove-only .tmp/test-repo-${sanitizedPath}`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({});
		});

		it('clones repo and removes specified file', async ({ task, expect }) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} -v tiged/tiged-test-repo-remove .tmp/test-repo-${sanitizedPath}`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				'other.txt': 'hello from github!',
				subdir: null,
				'subdir/file.txt': 'hello from a subdirectory!'
			});
		});

		it('removes and adds nested files', async ({ task, expect }) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} -v tiged/tiged-test-repo-nested-actions .tmp/test-repo-${sanitizedPath}`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
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
		it('is able to clone correctly using git mode with old hash', async ({
			task,
			expect
		}) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} --mode=git https://github.com/tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256 .tmp/test-repo-${sanitizedPath}`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				subdir: null,
				'README.md': `# tiged-test\nFor testing`,
				'subdir/file': 'Hello, champ!'
			});
		});
		it('is able to clone subdir correctly using git mode with old hash', async ({
			task,
			expect
		}) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} --mode=git https://github.com/tiged/tiged-test.git/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581 .tmp/test-repo-${sanitizedPath}`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				file: 'Hello, champ!'
			});
		});
	});

	describe('git mode', () => {
		it('is able to clone correctly using git mode', async ({
			task,
			expect
		}) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} --mode=git https://github.com/tiged/tiged-test.git .tmp/test-repo-${sanitizedPath}`
			);
			await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
				subdir: null,
				'README.md': `tiged is awesome`,
				'subdir/file': 'Hello, buddy!'
			});
			await expect(`.tmp/test-repo-${sanitizedPath}`).not.toMatchFiles({
				subdir: null,
				'README.md': `# tiged-test\nFor testing`,
				'subdir/file': 'Hello, champ!'
			});
		});
	});

	describe('tiged specific file command', () => {
		it('successfully gets specific file', async ({ task, expect }) => {
			const sanitizedPath = convertSpecialCharsToHyphens(task.name);
			await exec(
				`${tigedPath} tiged/tiged/help.md -vx .tmp/test-repo-${sanitizedPath}`
			);
			const content = await fs.readFile(
				path.join(`.tmp/test-repo-${sanitizedPath}`),
				'utf-8'
			);
			const regex = /argument can be any of the following/;
			expect(content).toMatch(regex);
		});
	});
});
