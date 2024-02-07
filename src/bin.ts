import {readFileSync, existsSync, readdirSync} from 'fs';
import path from 'path';
import { bold, underline, cyan, magenta, red } from 'colorette';
import mri from 'mri';
import glob from 'tiny-glob/sync.js';
import fuzzysearch from 'fuzzysearch'
import {prompt} from 'enquirer';
import degit from './index';
import { tryRequire, base } from './utils';

const args = mri(process.argv.slice(2), {
	alias: {
		f: 'force',
    c: 'cache',
		o: 'offline-mode',
    D: 'disable-cache',
		v: 'verbose',
		m: 'mode',
    s: 'subgroup',
    d: 'sub-directory'
	},
	boolean: ['force', 'cache', 'offline-mode', 'disable-cache', 'verbose', 'subgroup']
});
const [src, dest = '.'] = args._;

interface Access {
  [key: string]: string;
}

async function main() {
	if (args.help) {
		const help = 
			readFileSync(path.join(__dirname, '..', 'help.md'), 'utf-8')
			.replace(/^(\s*)#+ (.+)/gm, (m, s, _) => s + bold(_))
			.replace(/_([^_]+)_/g, (m, _) => underline(_))
			.replace(/`([^`]+)`/g, (m, _) => cyan(_)); //` syntax highlighter fix

		process.stdout.write(`\n${help}\n`);
	} else if (!src) {
		// interactive mode

		const accessLookup = new Map();

		glob(`**/access.json`, { cwd: base }).forEach(file => {
			const [host, user, repo] = file.split(path.sep);

			const json = readFileSync(`${base}/${file}`, 'utf-8');
			const logs:Access = JSON.parse(json);

			Object.entries(logs).forEach(([ref, timestamp]) => {
				const id = `${host}:${user}/${repo}#${ref}`;
				accessLookup.set(id, new Date(timestamp).getTime());
			});
		});

		const getChoice = (file:string) => {
			const [host, user, repo] = file.split(path.sep);

			return Object.entries(tryRequire(`${base}/${file}`)).map(
				([ref, hash]) => ({
					name: hash,
					message: `${host}:${user}/${repo}#${ref}`,
					value: `${host}:${user}/${repo}#${ref}`
				})
			);
		};

		const choices = glob(`**/map.json`, { cwd: base })
			.map(getChoice)
			.reduce(
				(accumulator, currentValue) => accumulator.concat(currentValue),
				[]
			)
			.sort((a, b) => {
				const aTime = accessLookup.get(a.value) || 0;
				const bTime = accessLookup.get(b.value) || 0;

				return bTime - aTime;
			});

		const options = await prompt([
			{
				type: 'autocomplete',
				name: 'src',
				message: 'Repo to clone?',
				suggest: (input, choices) =>
					choices.filter(({ value }) => fuzzysearch(input, value)),
				choices
			},
			{
				type: 'input',
				name: 'dest',
				message: 'Destination directory?',
				initial: '.'
			},
			{
				type: 'toggle',
				name: 'cache',
				message: 'Use cached version?'
			}
		]);

		const empty =
			!existsSync(options.dest) || readdirSync(options.dest).length === 0;

		if (!empty) {
			const { force } = await prompt([
				{
					type: 'toggle',
					name: 'force',
					message: 'Overwrite existing files?'
				}
			]);

			if (!force) {
				console.error(magenta(`! Directory not empty — aborting`));
				return;
			}
		}

		await run(options.src, options.dest, {
			force: true,
			cache: options.cache
		});
	} else {
		await run(src, dest, args);
	}
}

async function run(src, dest, args) {
	const d = degit(src, args);

	d.on('info', event => {
		console.error(cyan(`> ${event.message.replace('options.', '--')}`));
	});

	d.on('warn', event => {
		console.error(magenta(`! ${event.message.replace('options.', '--')}`));
	});

	try {
		await d.clone(dest)

	}
	catch(err){
		console.error(red(`! ${err.message.replace('options.', '--')}`));
		process.exit(1);
	}
}

main();
