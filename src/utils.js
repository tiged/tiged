const fs = require('fs');
const path = require('path');
const {homedir, tmpdir} = require('os');

// eslint-disable-next-line unicorn/prevent-abbreviations
const https = require('https');
const child_process = require('child_process');
const URL = require('url');
const Agent = require('https-proxy-agent');
const { copydirSync } = require('sander');
const rimraf = require("rimraf")

const tmpDirName = 'tmp';
const rimrafSync = dir => rimraf.sync(dir);

const degitConfigName = 'degit.json';

const homeOrTmp = homedir() || tmpdir();

class DegitError extends Error {
	constructor(message, opts) {
		super(message);
		Object.assign(this, opts);
	}
}

function tryRequire(file, opts) {
	try {
		if (opts && opts.clearCache === true) {
			delete require.cache[require.resolve(file)];
		}
		return require(file);
	} catch (err) {
		return null;
	}
}

function exec(command) {
	return new Promise((fulfil, reject) => {
		child_process.exec(command, (err, stdout, stderr) => {
			if (err) {
				reject(err);
				return;
			}

			fulfil({ stdout, stderr });
		});
	});
}

function mkdirp(dir) {
	const parent = path.dirname(dir);
	if (parent === dir) return;

	mkdirp(parent);

	try {
		fs.mkdirSync(dir);
	} catch (err) {
		if (err.code !== 'EEXIST') throw err;
	}
}

function fetch(url, dest, proxy) {
	return new Promise((fulfil, reject) => {
		let options = url;

		if (proxy) {
			const parsedUrl = URL.parse(url);
			options = {
				hostname: parsedUrl.host,
				path: parsedUrl.path,
				agent: new Agent(proxy)
			};
		}

		https
			.get(options, response => {
				const code = response.statusCode;
				if (code >= 400) {
					reject({ code, message: response.statusMessage });
				} else if (code >= 300) {
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

function stashFiles(dir, dest) {
	const tmpDir = path.join(dir, tmpDirName);
  try {
	  rimrafSync(tmpDir);
  } catch (e) {
    if (e.errno !== -2 && e.syscall !== "rmdir" && e.code !== "ENOENT") {
      throw e;
    }
  }
	mkdirp(tmpDir);
	fs.readdirSync(dest).forEach(file => {
		const filePath = path.join(dest, file);
		const targetPath = path.join(tmpDir, file);
		const isDir = fs.lstatSync(filePath).isDirectory();
		if (isDir) {
			copydirSync(filePath).to(targetPath);
			rimrafSync(filePath);
		} else {
			fs.copyFileSync(filePath, targetPath);
			fs.unlinkSync(filePath);
		}
	});
}

function unstashFiles(dir, dest) {
	const tmpDir = path.join(dir, tmpDirName);
	fs.readdirSync(tmpDir).forEach(filename => {
		const tmpFile = path.join(tmpDir, filename);
		const targetPath = path.join(dest, filename);
		const isDir = fs.lstatSync(tmpFile).isDirectory();
		if (isDir) {
			copydirSync(tmpFile).to(targetPath);
			rimrafSync(tmpFile);
		} else {
			if (filename !== 'degit.json') {
				fs.copyFileSync(tmpFile, targetPath);
			}
			fs.unlinkSync(tmpFile);
		}
	});
	rimrafSync(tmpDir);
}

const base = path.join(homeOrTmp, '.degit');

module.exports = {
	rimrafSync,
	degitConfigName,
	DegitError,
	tryRequire,
	mkdirp,
	fetch,
	exec,
	stashFiles,
	unstashFiles,
	base,
}