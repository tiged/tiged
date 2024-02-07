import {
  writeFile,
	readdir,
	rename,
	unlink,
	pathExists,
	lstat,
	mkdir,
	stat
} from 'fs-extra';
import path from 'path';
import tar from 'tar';
import { cyan, magenta, red, bold } from 'colorette';
import EventEmitter from 'events';
import {
	DegitError,
	DegitErrorOptions,
	exec,
	fetch,
	rimraf,
	tryRequire,
	stashFiles,
	unstashFiles,
	degitConfigName,
	base
} from './utils';

const validModes = new Set(['tar', 'git']);

interface DegitOptions {
	'offline-mode'?: boolean;
	offlineMode?: boolean;
	'disable-cache'?: boolean;
	disableCache?: boolean;
	cache?: boolean;
	force?: boolean;
	verbose?: boolean;
	proxy?: string;
	subgroup?: boolean;
	'sub-directory'?: string;
	mode?: string;
	src?: string;
}
export default function degit(src: string, opts: DegitOptions) {
	return new Degit(src, opts);
}

interface DirectiveActions {
	clone: CloneFunction;
	remove: RemoveFunction;
}

interface Directive extends DegitOptions {
	action: 'clone' | 'remove';
	files?: string[];
	// src?:string
}

interface CloneDirective extends Directive {
	action: 'clone';
	src: string;
}
interface RemoveDirective extends Directive {
	action: 'remove';
	files: string[];
}

interface CloneFunction {
	//clone: async (dir:string, dest:string, action:DegitOptions) => {
	(dir: string, dest: string, action: CloneDirective): void;
}
interface RemoveFunction {
	// (): void;
	(_dir: string, dest: string, action: RemoveDirective): void;
}

// Hacky error type... TODO do this in a better way. See where this type is used.
interface DirectiveActionsError {
	message: string;
}

interface FileSystemError {
	code: string;
}

interface Info {
	code: string;
	message: string;
	repo?: Repo;
	dest?: string;
}

interface Warning {
	code: string;
	message: string;
}

interface Cached {
  [key:string]:string
}

function isRef(ref: Ref | HeadRef): ref is Ref {
  return (ref as Ref).name !== undefined;
}

class Degit extends EventEmitter {
	src: string;
	offlineMode?: boolean;
	disableCache?: boolean;
	cache?: boolean;
	noCache?: boolean;
	force?: boolean;
	verbose?: boolean;
	proxy?: string;
	subgroup?: boolean;
	subdir?: string;
	mode: string;
	repo: Repo;
	_hasStashed: boolean;
	directiveActions: DirectiveActions;

	constructor(src: string, opts: DegitOptions = {}) {
		super();
		this.src = src;
		if (opts['offline-mode']) this.offlineMode = opts['offline-mode'];
		if (opts['offlineMode']) this.offlineMode = opts['offlineMode'];
		if (opts['disable-cache']) this.noCache = opts['disable-cache'];
		if (opts['disableCache']) this.noCache = opts['disableCache'];
		// Left cache for backward compatibility. Deprecated. Remove in next major version.
		this.cache = opts.cache;
		this.force = opts.force;
		this.verbose = opts.verbose;
		this.proxy = this._getHttpsProxy(); // TODO allow setting via --proxy
		this.subgroup = opts.subgroup;
		this.subdir = opts['sub-directory'];

		this.repo = parse(src);
		if (this.subgroup && this.repo.subdir) {
			this.repo.subgroup = true;
			this.repo.name = this.repo.subdir.slice(1);
			this.repo.url = this.repo.url + this.repo.subdir;
			this.repo.ssh = this.repo.ssh + this.repo.subdir + '.git';
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
			clone: async (dir: string, dest: string, action: CloneDirective) => {
				if (this._hasStashed === false) {
					await stashFiles(dir, dest);
					this._hasStashed = true;
				}
				const opts = Object.assign(
					{ force: true },
					{ cache: action.cache, verbose: action.verbose }
				);
				const d = degit(action.src as string, opts);

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
					// Hacky error typecasting... TODO do this in a better way
					console.error(red(`! ${(err as DirectiveActionsError).message}`));
					process.exit(1);
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
		let result = process.env.https_proxy;
		if (!result) {
			result = process.env.HTTPS_PROXY;
		}
		return result;
	}

	async _getDirectives(dest: string): Promise<Directive[]> {
		const directivesPath = path.resolve(dest, degitConfigName);
		const directives =
			tryRequire(directivesPath, { clearCache: true }) || false;
		if (directives) {
			await unlink(directivesPath);
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
			// TODO FIX "repo.ref as string". We should know that ref is assigned. Probably have to separate Repo interface into two different interfaces.
			message: `cloned ${bold(repo.user + '/' + repo.name)}#${bold(
				repo.ref as string
			)}${dest !== '.' ? ` to ${dest}` : ''}`,
			repo,
			dest
		});
		const directives = await this._getDirectives(dest);
		if (directives) {
			for (const d of directives) {
				// TODO, can this be a loop with an index to pass for better error messages?
				// @ts-ignore
				this.directiveActions[d.action](dir, dest, d);
			}
			if (this._hasStashed === true) {
				await unstashFiles(dir, dest);
			}
		}
	}

	async remove(_dir: string, dest: string, action: RemoveDirective) {
		let files = action.files;
		if (!Array.isArray(files)) {
			files = [files];
		}
		const removedFiles = [];
		for (const file of files) {
			const filePath = path.resolve(dest, file);
			if (await pathExists(filePath)) {
				const isDir = (await lstat(filePath)).isDirectory();
				if (isDir) {
					await rimraf(filePath);
					removedFiles.push(file + '/');
				} else {
					await unlink(filePath);
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
			const files = await readdir(dir);
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
			if ((err as FileSystemError).code !== 'ENOENT') throw err;
		}
	}

	_info(info: Info) {
		this.emit('info', info);
	}

	_warn(info: Warning) {
		this.emit('warn', info);
	}

	_verbose(info: Info) {
		if (this.verbose) this._info(info);
	}

	async _getHash(repo:RepoWithRef, cached:Cached) {
		try {
			const refs = await fetchRefs(repo);
			if (repo.ref === 'HEAD') {
				return refs.find(ref => ref.type === 'HEAD')?.hash;
			}

			return this._selectRef(refs, repo.ref);
		} catch (err) {
			this._warn(err as Warning);
      // TODO FIX this is horrible. Needs better error types.
			this._verbose((err as DegitErrorOptions).original as Info);

			return this._getHashFromCache(repo, cached);
		}
	}

	_getHashFromCache(repo: RepoWithRef, cached:Cached) {
		if (repo.ref in cached) {
			const hash = cached[repo.ref];
			this._info({
				code: 'USING_CACHE',
				message: `using cached commit hash ${hash}`
			});
			return hash;
		}
	}

	_selectRef(refs: (Ref|HeadRef)[], selector:string) {
		for (const ref of refs) {
			if (isRef(ref) && ref.name === selector) {
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

	async _cloneWithTar(dir:string, dest:string) {
		const { repo } = this;

		const cached = tryRequire(path.join(dir, 'map.json')) || {};
		const hash =
			this.offlineMode || this.cache
				? this._getHashFromCache(repo as RepoWithRef, cached)
				: await this._getHash(repo as RepoWithRef, cached);

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
					await stat(file);
					this._verbose({
						code: 'FILE_EXISTS',
						message: `${file} already exists locally`
					});
				} catch (err) {
					// Not getting file from cache. Either because there is no cached tar or because option no cache is set to true.
					await mkdir(path.dirname(file), { recursive: true });

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
			throw new DegitError(`could not download ${url}`, {
				code: 'COULD_NOT_DOWNLOAD',
				url,
				original: err
			});
		}

		if (!this.noCache) await updateCache(dir, repo as RepoWithRef, hash, cached);

		this._verbose({
			code: 'EXTRACTING',
			message: `extracting ${
				subdir ? repo.subdir + ' from ' : ''
			}${file} to ${dest}`
		});

		await mkdir(dest, { recursive: true });
		await untar(file, dest, subdir);
	}

	async _cloneWithGit(_dir:string, dest:string) {
		let gitPath = /https:\/\//.test(this.repo.src)
			? this.repo.url
			: this.repo.ssh;
		gitPath = this.repo.site === 'huggingface' ? this.repo.url : gitPath;
		const isWin = process.platform === 'win32';
		if (this.repo.subdir) {
			await mkdir(path.join(dest, '.tiged'), { recursive: true });
			const tempDir = path.join(dest, '.tiged');
			if (this.repo.ref && this.repo.ref !== 'HEAD' && !isWin) {
				await exec(
					`cd ${tempDir}; git init; git remote add origin ${gitPath}; git fetch --depth 1 origin ${this.repo.ref}; git checkout FETCH_HEAD`
				);
			} else {
				await exec(`git clone --depth 1 ${gitPath} ${tempDir}`);
			}
			const files = await readdir(`${tempDir}${this.repo.subdir}`);
			await Promise.all(
				files.map(async file => {
					return rename(
						`${tempDir}${this.repo.subdir}/${file}`,
						`${dest}/${file}`
					);
				})
			);
			await rimraf(tempDir);
		} else {
			if (this.repo.ref && this.repo.ref !== 'HEAD' && !isWin) {
				await mkdir(dest, { recursive: true });
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

const supported = {
	github: '.com',
	gitlab: '.com',
	bitbucket: '.com',
	'git.sr.ht': '.ht',
	huggingface: '.co'
};

interface Repo {
	site: string;
	user: string;
	name: string;
	url: string;
	ssh: string;
	subdir: string | null;
	subgroup?: boolean;
	mode: string;
	src: string;
	ref?: string;
}

interface RepoWithRef extends Repo {
	ref: string;
}

function parse(src: string): Repo {
	const match = /^(?:(?:https:\/\/)?([^:/]+\.[^:/]+)\/|git@([^:/]+)[:/]|([^/]+):)?([^/\s]+)\/([^/\s#]+)(?:((?:\/[^/\s#]+)+))?(?:\/)?(?:#(.+))?/.exec(
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
	const siteName = tld ? site.replace(new RegExp(tld + '$'), '') : site;

	const user = match[4];
	const name = match[5].replace(/\.git$/, '');
	const subdir = match[6];
	const ref = match[7] || 'HEAD';

	const domain = `${siteName}${
		tld || supported[siteName as keyof typeof supported] || supported[site as keyof typeof supported] || ''
	}`;

	const url = `https://${domain}/${user}/${name}`;
	const ssh = `git@${domain}:${user}/${name}`;

	const mode =
		siteName === 'huggingface'
			? 'git'
			: supported[siteName as keyof typeof supported] || supported[site as keyof typeof supported]
			? 'tar'
			: 'git';

	return { site: siteName, user, name, ref, url, ssh, subdir, mode, src };
}

async function untar(file:string, dest:string, subdir: string|null = null) {
	return tar.extract(
		{
			file,
			strip: subdir ? subdir.split('/').length : 1,
			C: dest
		},
		subdir ? [subdir] : []
	);
}

interface HeadRef {
  type: "HEAD"
  hash:string
}

interface Ref {
  type: "branch" | "ref"
  name: string
  hash:string
}

async function fetchRefs(repo:Repo): Promise<(Ref|HeadRef)[]> {
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
					} as HeadRef;
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
				} as Ref;
			});
	} catch (error) {
		throw new DegitError(`could not fetch remote ${repo.url}`, {
			code: 'COULD_NOT_FETCH',
			url: repo.url,
			original: error
		});
	}
}

async function updateCache(dir:string, repo: RepoWithRef, hash:string, cached:Cached) {
	// update access logs
	const logs = tryRequire(path.join(dir, 'access.json')) || {};
	logs[repo.ref] = new Date().toISOString();
	await writeFile(
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
				await unlink(path.join(dir, `${oldHash}.tar.gz`));
			} catch (err) {
				// ignore
			}
		}
	}

	cached[repo.ref] = hash;
	await writeFile(
		path.join(dir, 'map.json'),
		JSON.stringify(cached, null, '  ')
	);
}
