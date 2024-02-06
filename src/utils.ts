import {
	copy,
	unlink,
	lstat,
	mkdir,
	readdir,
	createWriteStream
} from 'fs-extra';
import path from 'path';
import { homedir, tmpdir } from 'os';

// eslint-disable-next-line
import https from 'https';
import child_process from 'child_process';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { rimraf } from 'rimraf';
import { RequestOptions } from 'http';

const tmpDirName = 'tmp';

const degitConfigName = 'degit.json';

const homeOrTmp = homedir() || tmpdir();

interface DegitErrorOptions {
				code?: string,
        ref?:string
				url?:string,
				original?: unknown
}
class DegitError extends Error {
	constructor(message: string, opts:DegitErrorOptions) {
		super(message);
		Object.assign(this, opts);
	}
}

interface TryRequireOptions {
  clearCache?: boolean
}

function tryRequire(file:string, opts:TryRequireOptions) {
	try {
		if (opts && opts.clearCache === true) {
			delete require.cache[require.resolve(file)];
		}
		return require(file);
	} catch (err) {
		return null;
	}
}

interface Exec {
	stdout: string;
	stderr: string;
}

function exec(command: string, size = 500): Promise<Exec> {
	//@ts-expect-error
	return new Promise((fulfil, reject) => {
		child_process.exec(
			command,
			{ maxBuffer: 1024 * size },
			(err, stdout, stderr) => {
				if (err) {
					reject(err);
					return;
				}

				fulfil({ stdout, stderr });
			}
		);
	}).catch(err => {
		if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
			return exec(command, size * 2);
		}
		return Promise.reject(err);
	});
}

function fetch(url: string, dest: string, proxy: string|undefined) {
	return new Promise((fulfil, reject) => {
		const parsedUrl = new URL(url);
		const options: RequestOptions = {
			hostname: parsedUrl.hostname,
			port: parsedUrl.port,
			path: parsedUrl.pathname,
			headers: {
				Connection: 'close'
			}
		};
		if (proxy) {
			options.agent = new HttpsProxyAgent(proxy);
		}

		https
			.get(options, response => {
				const code = response.statusCode;
				if (code) {
					if (code >= 400) {
						reject({ code, message: response.statusMessage });
					} else if (code >= 300) {
						fetch(response.headers.location as string, dest, proxy).then(
							fulfil,
							reject
						);
					} else {
						response
							.pipe(createWriteStream(dest))
							.on('finish', () => fulfil(true))
							.on('error', reject);
					}
				} else {
					reject();
				}
			})
			.on('error', reject);
	});
}

// TODO Use the actuall error types. Could not find. Quick and dirty.
interface rimrafError {
	errno: number;
	syscall: string;
	code: string;
}


// https://stackoverflow.com/questions/51523509/in-typescript-how-do-you-make-a-distinction-between-node-and-vanilla-javascript
const isNodeError = (error: Error | unknown): error is NodeJS.ErrnoException =>
	error instanceof Error;

async function stashFiles(dir: string, dest: string) {
	const tmpDir = path.join(dir, tmpDirName);
	try {
		await rimraf(tmpDir);
	} catch (e) {
		if (isNodeError(e)) {
			if (e.errno !== -2 && e.syscall !== 'rmdir' && e.code !== 'ENOENT') {
				throw e;
			}
		}
	}
	await mkdir(tmpDir);
	const files = await readdir(dest);
	for (const file of files) {
		const filePath = path.join(dest, file);
		const targetPath = path.join(tmpDir, file);
		const isDir = (await lstat(filePath)).isDirectory();
		if (isDir) {
			await copy(filePath, targetPath);
			await rimraf(filePath);
		} else {
			await copy(filePath, targetPath);
			await unlink(filePath);
		}
	}
}

async function unstashFiles(dir:string, dest:string) {
	const tmpDir = path.join(dir, tmpDirName);
	const files = await readdir(tmpDir);
	for (const filename of files) {
		const tmpFile = path.join(tmpDir, filename);
		const targetPath = path.join(dest, filename);
		const isDir = (await lstat(tmpFile)).isDirectory();
		if (isDir) {
			await copy(tmpFile, targetPath);
			await rimraf(tmpFile);
		} else {
			if (filename !== 'degit.json') {
				await copy(tmpFile, targetPath);
			}
			await unlink(tmpFile);
		}
	}
	await rimraf(tmpDir);
}

const base = path.join(homeOrTmp, '.degit');

export {
	rimraf,
	degitConfigName,
	DegitError,
	tryRequire,
	fetch,
	exec,
	stashFiles,
	unstashFiles,
	base
};
