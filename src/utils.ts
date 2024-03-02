import fs from 'fs-extra';
import createHttpsProxyAgent from 'https-proxy-agent';
import child_process from 'node:child_process';
import https from 'node:https';
import type { constants } from 'node:os';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { rimraf } from 'rimraf';

const tmpDirName = 'tmp';

export const degitConfigName = 'degit.json';

const homeOrTmp = homedir() || tmpdir();

/**
 * Represents the possible error codes for the Degit utility.
 */
export type DegitErrorCode =
	| 'DEST_NOT_EMPTY'
	| 'MISSING_REF'
	| 'COULD_NOT_DOWNLOAD'
	| 'BAD_SRC'
	| 'UNSUPPORTED_HOST'
	| 'BAD_REF'
	| 'COULD_NOT_FETCH'
	| keyof typeof constants.errno;

/**
 * Represents the options for a Degit error.
 */
interface DegitErrorOptions extends ErrorOptions {
	/**
	 * The error code associated with the error.
	 */
	code?: DegitErrorCode;

	/**
	 * The original error that caused this error.
	 */
	original?: Error;

	/**
	 * The reference (e.g., branch, tag, commit) that was being degitted.
	 */
	ref?: string;

	/**
	 * The URL associated with the error.
	 */
	url?: string;
}

/**
 * Represents an error that occurs during the degit process.
 *
 * @extends Error
 */
export class DegitError extends Error {
	/**
	 * The error code associated with the error.
	 */
	public declare code?: DegitErrorOptions['code'];

	/**
	 * The original error that caused this error.
	 */
	public declare original?: DegitErrorOptions['original'];

	/**
	 * The reference (e.g., branch, tag, commit) that was being degitted.
	 */
	public declare ref?: DegitErrorOptions['ref'];

	/**
	 * The URL associated with the error.
	 */
	public declare url?: DegitErrorOptions['url'];

	/**
	 * Creates a new instance of DegitError.
	 *
	 * @param message - The error message.
	 * @param opts - Additional options for the error.
	 */
	constructor(message?: string, opts?: DegitErrorOptions) {
		super(message);
		Object.assign(this, opts);
	}
}

/**
 * Tries to require a module and returns the result.
 * If the module cannot be required, it returns `null`.
 *
 * @param file - The path to the module file.
 * @param opts - Optional options for requiring the module.
 * @param opts.clearCache - If `true`, clears the module cache before requiring the module.
 * @returns The required module or `null` if it cannot be required.
 */
export function tryRequire(
	file: string,
	opts?: {
		/**
		 * If `true`, clears the module cache before requiring the module.
		 */
		clearCache?: true | undefined;
	}
) {
	try {
		if (opts && opts.clearCache === true) {
			delete require.cache[require.resolve(file)];
		}
		return require(file);
	} catch (err) {
		return null;
	}
}

/**
 * Executes a command and returns the `stdout` and `stderr` as strings.
 *
 * @param command - The command to execute.
 * @param size - The maximum buffer size in kilobytes (default: 500KB).
 * @returns A promise that resolves to an object containing the `stdout` and `stderr` strings.
 */
export async function exec(
	command: string,
	size = 500
): Promise<{ stdout: string; stderr: string }> {
	return new Promise<{ stdout: string; stderr: string }>((fulfil, reject) => {
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

/**
 * Fetches a resource from the specified URL
 * and saves it to the destination path.
 * Optionally, a proxy URL can be provided to make the
 * request through a proxy server.
 *
 * @param url - The URL of the resource to fetch.
 * @param dest - The destination path to save the fetched resource.
 * @param proxy - Optional. The URL of the proxy server to use for the request.
 * @returns A promise that resolves when the resource is successfully fetched and saved, or rejects with an error.
 */
export async function fetch(url: string, dest: string, proxy?: string) {
	return new Promise<void>((fulfil, reject) => {
		const parsedUrl = new URL(url);
		const options: https.RequestOptions = {
			hostname: parsedUrl.hostname,
			port: parsedUrl.port,
			path: parsedUrl.pathname,
			headers: {
				Connection: 'close'
			}
		};
		if (proxy) {
			options.agent = createHttpsProxyAgent(proxy);
		}

		https
			.get(options, response => {
				const code = response.statusCode;
				if (code == null) {
					return reject(new Error('No status code'));
				}
				if (code >= 400) {
					reject({ code, message: response.statusMessage });
				} else if (code >= 300) {
					if (response.headers.location == null) {
						return reject(new Error('No location header'));
					}
					fetch(response.headers.location, dest, proxy).then(fulfil, reject);
				} else {
					response
						.pipe(fs.createWriteStream(dest))
						.on('finish', () => fulfil())
						.on('error', reject);
				}
			})
			.on('error', reject);
	});
}

/**
 * Stashes files from a directory to a temporary directory.
 *
 * @param dir - The source directory containing the files to be stashed.
 * @param dest - The destination directory where the stashed files will be stored.
 * @returns A promise that resolves when the stashing process is complete.
 */
export async function stashFiles(dir: string, dest: string) {
	const tmpDir = path.join(dir, tmpDirName);
	try {
		await rimraf(tmpDir);
	} catch (e) {
		if (
			!(e instanceof Error && 'errno' in e && 'syscall' in e && 'code' in e)
		) {
			return;
		}
		if (e.errno !== -2 && e.syscall !== 'rmdir' && e.code !== 'ENOENT') {
			throw e;
		}
	}
	await fs.mkdir(tmpDir);
	const files = await fs.readdir(dest);
	for (const file of files) {
		const filePath = path.join(dest, file);
		const targetPath = path.join(tmpDir, file);
		const isDir = (await fs.lstat(filePath)).isDirectory();
		if (isDir) {
			await fs.copy(filePath, targetPath);
			await rimraf(filePath);
		} else {
			await fs.copy(filePath, targetPath);
			await fs.unlink(filePath);
		}
	}
}

/**
 * Unstashes files from a temporary directory to a destination directory.
 *
 * @param dir - The directory where the temporary directory is located.
 * @param dest - The destination directory where the files will be unstashed.
 */
export async function unstashFiles(dir: string, dest: string) {
	const tmpDir = path.join(dir, tmpDirName);
	const files = await fs.readdir(tmpDir);
	for (const filename of files) {
		const tmpFile = path.join(tmpDir, filename);
		const targetPath = path.join(dest, filename);
		const isDir = (await fs.lstat(tmpFile)).isDirectory();
		if (isDir) {
			await fs.copy(tmpFile, targetPath);
			await rimraf(tmpFile);
		} else {
			if (filename !== 'degit.json') {
				await fs.copy(tmpFile, targetPath);
			}
			await fs.unlink(tmpFile);
		}
	}
	await rimraf(tmpDir);
}

export const base = path.join(homeOrTmp, '.degit');
