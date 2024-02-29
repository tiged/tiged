import { bold, cyan, magenta, red } from 'colorette';
import fs from 'fs-extra';
import EventEmitter from 'node:events';
import path from 'node:path';
import { rimraf } from 'rimraf';
import tar from 'tar';
import {
	DegitError,
	base,
	degitConfigName,
	exec,
	fetch,
	stashFiles,
	tryRequire,
	unstashFiles
} from './utils';

const validModes = new Set<ValidModes>(['tar', 'git']);

type ValidModes = 'tar' | 'git';

export interface Options {
	/**
	 * @default false
	 */
	cache?: boolean;
	/**
	 * @default false
	 */
	force?: boolean;
	/**
	 * @default undefined
	 */
	mode?: ValidModes;
	/**
	 * @default false
	 */
	verbose?: boolean;
	/**
	 * @default false
	 */
	'offline-mode'?: boolean;
	/**
	 * @default false
	 */
	offlineMode?: boolean;
	/**
	 * @default false
	 */
	'disable-cache'?: boolean;
	/**
	 * @default false
	 */
	disableCache?: boolean;
	/**
	 * @default false
	 */
	subgroup?: boolean;
	/**
	 * @default undefined
	 */
	'sub-directory'?: string;
}

// TODO: We might not need this one.
type InfoCode =
	| 'SUCCESS'
	| 'FILE_DOES_NOT_EXIST'
	| 'REMOVED'
	| 'DEST_NOT_EMPTY'
	| 'DEST_IS_EMPTY'
	| 'USING_CACHE'
	| 'FOUND_MATCH'
	| 'FILE_EXISTS'
	| 'PROXY'
	| 'DOWNLOADING'
	| 'EXTRACTING';

interface Info {
	readonly code?: string;
	readonly message?: string;
	readonly repo?: Repo;
	readonly dest?: string;
}

interface Action {
	action: string;
	cache?: boolean | undefined;
	verbose?: boolean | undefined;
}

interface DegitAction extends Action {
	action: 'clone';
	src: string;
}

interface RemoveAction extends Action {
	action: 'remove';
	files: string[];
}

function degit(src: string, opts?: Options) {
	return new Degit(src, opts);
}

class Degit extends EventEmitter {
	public declare offlineMode?: boolean;
	public declare noCache?: boolean;
	public declare cache?: boolean;
	public declare force?: boolean;
	public declare verbose?: boolean;
	public declare proxy?: string;
	public declare subgroup?: boolean;
	public declare subdir?: string;
	public declare repo: Repo;
	public declare mode: ValidModes;
	public declare _hasStashed: boolean;
	public declare directiveActions: {
		clone: (dir: string, dest: string, action: DegitAction) => Promise<void>;
		remove: (dir: string, dest: string, action: RemoveAction) => Promise<void>;
	};
	constructor(
		public src: string,
		public opts: Options = {}
	) {
		super();
		this.src = src;
		if (opts['offline-mode']) this.offlineMode = opts['offline-mode'];
		if (opts['offlineMode']) this.offlineMode = opts['offlineMode'];
		if (opts['disable-cache']) this.noCache = opts['disable-cache'];
		if (opts.disableCache) this.noCache = opts.disableCache;
		// Left cache for backward compatibility. Deprecated. Remove in next major version.
		this.cache = opts.cache;
		this.force = opts.force;
		this.verbose = opts.verbose;
		this.proxy = this._getHttpsProxy(); // TODO allow setting via --proxy
		this.subgroup = opts.subgroup;
		this.subdir = opts['sub-directory'];

		this.repo = parse(src);
		if (this.subgroup) {
			this.repo.subgroup = true;
			this.repo.name = this.repo.subdir?.slice(1) ?? '';
			this.repo.url += this.repo.subdir;
			this.repo.ssh = `${this.repo.ssh + this.repo.subdir}.git`;
			this.repo.subdir = null;
			if (this.subdir) {
				this.repo.subdir = this.subdir.startsWith('/')
					? this.subdir
					: `/${this.subdir}`;
			}
		}
		this.mode = opts.mode || this.repo.mode;

		if (!validModes.has(this.mode)) {
			throw new Error(`Valid modes are ${Array.from(validModes).join(', ')}`);
		}

		this._hasStashed = false;

		this.directiveActions = {
			clone: async (dir, dest, action) => {
				if (this._hasStashed === false) {
					await stashFiles(dir, dest);
					this._hasStashed = true;
				}
				const opts = Object.assign(
					{ force: true },
					{ cache: action.cache, verbose: action.verbose }
				);
				const d = degit(action.src, opts);

				d.on('info', event => {
					console.error(cyan(`> ${event.message.replace('options.', '--')}`));
				});

				d.on('warn', event => {
					console.error(
						magenta(`! ${event.message.replace('options.', '--')}`)
					);
				});

				try {
					await d.clone(dest);
				} catch (err) {
					if (err instanceof Error) {
						console.error(red(`! ${err.message}`));
						process.exit(1);
					}
				}
			},
			remove: this.remove.bind(this)
		};
	}

	// Return the HTTPS proxy address. Try to get the value by environment
	// variable `https_proxy` or `HTTPS_PROXY`.
	//
	// TODO allow setting via --proxy
	_getHttpsProxy() {
		const result = process.env.https_proxy;
		if (!result) {
			return process.env.HTTPS_PROXY;
		}
		return result;
	}

	async _getDirectives(dest: string) {
		const directivesPath = path.resolve(dest, degitConfigName);
		const directives =
			(tryRequire(directivesPath, { clearCache: true }) as DegitAction[]) ||
			false;
		if (directives) {
			await fs.unlink(directivesPath);
		}

		return directives;
	}

	async clone(dest: string) {
		await this._checkDirIsEmpty(dest);
		const { repo } = this;
		const dir = path.join(base, repo.site, repo.user, repo.name);

		if (this.mode === 'tar') {
			await this._cloneWithTar(dir, dest);
		} else {
			await this._cloneWithGit(dir, dest);
		}

		this._info({
			code: 'SUCCESS',
			message: `cloned ${bold(`${repo.user}/${repo.name}`)}#${bold(repo.ref)}${
				dest !== '.' ? ` to ${dest}` : ''
			}`,
			repo,
			dest
		});
		const directives = await this._getDirectives(dest);
		if (directives) {
			for (const d of directives) {
				// TODO, can this be a loop with an index to pass for better error messages?
				await this.directiveActions[d.action](dir, dest, d);
			}
			if (this._hasStashed === true) {
				await unstashFiles(dir, dest);
			}
		}
	}

	async remove(_dir: string, dest: string, action: RemoveAction) {
		let { files } = action;
		if (!Array.isArray(files)) {
			files = [files];
		}
		const removedFiles = [];
		for (const file of files) {
			const filePath = path.resolve(dest, file);
			if (await fs.pathExists(filePath)) {
				const isDir = (await fs.lstat(filePath)).isDirectory();
				if (isDir) {
					await rimraf(filePath);
					removedFiles.push(`${file}/`);
				} else {
					await fs.unlink(filePath);
					removedFiles.push(file);
				}
			} else {
				this._warn({
					code: 'FILE_DOES_NOT_EXIST',
					message: `action wants to remove ${bold(file)} but it does not exist`
				});
			}
		}

		if (removedFiles.length > 0) {
			this._info({
				code: 'REMOVED',
				message: `removed: ${bold(removedFiles.map(d => bold(d)).join(', '))}`
			});
		}
	}

	async _checkDirIsEmpty(dir: string) {
		try {
			const files = await fs.readdir(dir);
			if (files.length > 0) {
				if (this.force) {
					this._info({
						code: 'DEST_NOT_EMPTY',
						message: `destination directory is not empty. Using options.force, continuing`
					});

					await rimraf(dir);
				} else {
					throw new DegitError(
						`destination directory is not empty, aborting. Use options.force to override`,
						{
							code: 'DEST_NOT_EMPTY'
						}
					);
				}
			} else {
				this._verbose({
					code: 'DEST_IS_EMPTY',
					message: `destination directory is empty`
				});
			}
		} catch (err) {
			if (err instanceof DegitError && err.code !== 'ENOENT') throw err;
		}
	}

	_info(info: Info) {
		this.emit('info', info);
	}

	_warn(info: Info) {
		this.emit('warn', info);
	}

	_verbose(info: Info) {
		if (this.verbose) this._info(info);
	}

	async _getHash(repo: Repo, cached: Record<string, string>) {
		try {
			const refs = await fetchRefs(repo);
			if (refs == null) {
				return;
			}
			if (repo.ref === 'HEAD') {
				return refs?.find(ref => ref.type === 'HEAD')?.hash ?? '';
			}

			return this._selectRef(refs, repo.ref);
		} catch (err) {
			if (err instanceof DegitError && 'code' in err && 'message' in err) {
				this._warn(err);
				if (err.original != null) {
					this._verbose(err.original);
				}
			}

			return this._getHashFromCache(repo, cached);
		}
	}

	_getHashFromCache(repo: Repo, cached: Record<string, string>) {
		if (repo.ref in cached) {
			const hash = cached[repo.ref];
			this._info({
				code: 'USING_CACHE',
				message: `using cached commit hash ${hash}`
			});
			return hash;
		}
	}

	_selectRef(
		refs: { type: string; name?: string; hash: string }[],
		selector: string
	) {
		for (const ref of refs) {
			if (ref.name === selector) {
				this._verbose({
					code: 'FOUND_MATCH',
					message: `found matching commit hash: ${ref.hash}`
				});
				return ref.hash;
			}
		}

		if (selector.length < 8) return null;

		for (const ref of refs) {
			if (ref.hash.startsWith(selector)) return ref.hash;
		}
	}

	async _cloneWithTar(dir: string, dest: string) {
		const { repo } = this;

		const cached =
			(tryRequire(path.join(dir, 'map.json')) as Record<string, string>) || {};
		const hash =
			this.offlineMode || this.cache
				? this._getHashFromCache(repo, cached)
				: await this._getHash(repo, cached);

		const subdir = repo.subdir ? `${repo.name}-${hash}${repo.subdir}` : null;

		if (!hash) {
			// TODO 'did you mean...?'
			throw new DegitError(`could not find commit hash for ${repo.ref}`, {
				code: 'MISSING_REF',
				ref: repo.ref
			});
		}

		const file = `${dir}/${hash}.tar.gz`;
		const url =
			repo.site === 'gitlab'
				? `${repo.url}/-/archive/${hash}/${repo.name}-${hash}.tar.gz`
				: repo.site === 'bitbucket'
					? `${repo.url}/get/${hash}.tar.gz`
					: `${repo.url}/archive/${hash}.tar.gz`;

		try {
			if (!this.offlineMode || !this.cache) {
				try {
					if (this.noCache) {
						this._verbose({
							code: 'NO_CACHE',
							message: `Not using cache. noCache set to true.`
						});
						throw "don't use cache";
					}
					await fs.stat(file);
					this._verbose({
						code: 'FILE_EXISTS',
						message: `${file} already exists locally`
					});
				} catch (err) {
					// Not getting file from cache. Either because there is no cached tar or because option no cache is set to true.
					await fs.mkdir(path.dirname(file), { recursive: true });

					if (this.proxy) {
						this._verbose({
							code: 'PROXY',
							message: `using proxy ${this.proxy}`
						});
					}

					this._verbose({
						code: 'DOWNLOADING',
						message: `downloading ${url} to ${file}`
					});

					await fetch(url, file, this.proxy);
				}
			}
		} catch (err) {
			if (err instanceof Error) {
				throw new DegitError(`could not download ${url}`, {
					code: 'COULD_NOT_DOWNLOAD',
					url,
					original: err
				});
			}
		}

		if (!this.noCache) await updateCache(dir, repo, hash, cached);

		this._verbose({
			code: 'EXTRACTING',
			message: `extracting ${
				subdir ? `${repo.subdir} from ` : ''
			}${file} to ${dest}`
		});

		await fs.mkdir(dest, { recursive: true });
		await untar(file, dest, subdir);
	}

	async _cloneWithGit(_dir: string, dest: string) {
		let gitPath = /https:\/\//.test(this.repo.src)
			? this.repo.url
			: this.repo.ssh;
		gitPath = this.repo.site === 'huggingface' ? this.repo.url : gitPath;
		const isWin = process.platform === 'win32';
		if (this.repo.subdir) {
			await fs.mkdir(path.join(dest, '.tiged'), { recursive: true });
			const tempDir = path.join(dest, '.tiged');
			if (this.repo.ref && this.repo.ref !== 'HEAD' && !isWin) {
				await exec(
					`cd ${tempDir}; git init; git remote add origin ${gitPath}; git fetch --depth 1 origin ${this.repo.ref}; git checkout FETCH_HEAD`
				);
			} else {
				await exec(`git clone --depth 1 ${gitPath} ${tempDir}`);
			}
			const files = await fs.readdir(`${tempDir}${this.repo.subdir}`);
			await Promise.all(
				files.map(async file => {
					return fs.rename(
						`${tempDir}${this.repo.subdir}/${file}`,
						`${dest}/${file}`
					);
				})
			);
			await rimraf(tempDir);
		} else {
			if (this.repo.ref && this.repo.ref !== 'HEAD' && !isWin) {
				await fs.mkdir(dest, { recursive: true });
				await exec(
					`cd ${dest}; git init; git remote add origin ${gitPath}; git fetch --depth 1 origin ${this.repo.ref}; git checkout FETCH_HEAD`
				);
			} else {
				await exec(`git clone --depth 1 ${gitPath} ${dest}`);
			}
			await rimraf(path.resolve(dest, '.git'));
		}
	}
}

const supported: Record<string, string> = {
	github: '.com',
	gitlab: '.com',
	bitbucket: '.com',
	'git.sr.ht': '.ht',
	huggingface: '.co'
};

export interface Repo {
	site: string;
	user: string;
	name: string;
	ref: string;
	url: string;
	ssh: string;
	subdir?: string | null;
	mode: ValidModes;
	src: string;
	subgroup?: boolean;
}

function parse(src: string): Repo {
	const match =
		/^(?:(?:https:\/\/)?([^:/]+\.[^:/]+)\/|git@([^:/]+)[:/]|([^/]+):)?([^/\s]+)\/([^/\s#]+)(?:((?:\/[^/\s#]+)+))?(?:\/)?(?:#(.+))?/.exec(
			src
		);
	if (!match) {
		throw new DegitError(`could not parse ${src}`, {
			code: 'BAD_SRC'
		});
	}

	const site = match[1] || match[2] || match[3] || 'github.com';
	const tldMatch = /\.([a-z]{2,})$/.exec(site);
	const tld = tldMatch ? tldMatch[0] : null;
	const siteName = tld ? site.replace(new RegExp(`${tld}$`), '') : site;

	const user = match[4];
	const name = match[5].replace(/\.git$/, '');
	const subdir = match[6];
	const ref = match[7] || 'HEAD';

	const domain = `${siteName}${
		tld || supported[siteName] || supported[site] || ''
	}`;

	const url = `https://${domain}/${user}/${name}`;
	const ssh = `git@${domain}:${user}/${name}`;

	const mode =
		siteName === 'huggingface'
			? 'git'
			: supported[siteName] || supported[site]
				? 'tar'
				: 'git';

	return { site: siteName, user, name, ref, url, ssh, subdir, mode, src };
}

async function untar(
	file: string,
	dest: string,
	subdir: Repo['subdir'] = null
) {
	return tar.extract(
		{
			file,
			strip: subdir ? subdir.split('/').length : 1,
			C: dest
		},
		subdir ? [subdir] : []
	);
}

async function fetchRefs(repo: Repo) {
	try {
		const { stdout } = await exec(`git ls-remote ${repo.url}`);

		return stdout
			.split('\n')
			.filter(Boolean)
			.map(row => {
				const [hash, ref] = row.split('\t');

				if (ref === 'HEAD') {
					return {
						type: 'HEAD',
						hash
					};
				}

				const match = /refs\/(\w+)\/(.+)/.exec(ref);
				if (!match)
					throw new DegitError(`could not parse ${ref}`, {
						code: 'BAD_REF'
					});

				return {
					type:
						match[1] === 'heads'
							? 'branch'
							: match[1] === 'refs'
								? 'ref'
								: match[1],
					name: match[2],
					hash
				};
			});
	} catch (error) {
		if (error instanceof Error) {
			throw new DegitError(`could not fetch remote ${repo.url}`, {
				code: 'COULD_NOT_FETCH',
				url: repo.url,
				original: error
			});
		}
	}
}

async function updateCache(
	dir: string,
	repo: Repo,
	hash: string,
	cached: Record<string, string>
) {
	// update access logs
	const logs =
		(tryRequire(path.join(dir, 'access.json')) as Record<string, string>) || {};
	logs[repo.ref] = new Date().toISOString();
	await fs.writeFile(
		path.join(dir, 'access.json'),
		JSON.stringify(logs, null, '  ')
	);

	if (cached[repo.ref] === hash) return;

	const oldHash = cached[repo.ref];
	if (oldHash) {
		let used = false;
		for (const key in cached) {
			if (cached[key] === hash) {
				used = true;
				break;
			}
		}

		if (!used) {
			// we no longer need this tar file
			try {
				await fs.unlink(path.join(dir, `${oldHash}.tar.gz`));
			} catch (err) {
				// ignore
			}
		}
	}

	cached[repo.ref] = hash;
	await fs.writeFile(
		path.join(dir, 'map.json'),
		JSON.stringify(cached, null, '  ')
	);
}

export default degit;
