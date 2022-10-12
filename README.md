> This is a community driven fork of [degit](https://github.com/Rich-Harris/degit) because it isn't being maintained.
<div align="center">

# tiged — straightforward project scaffolding

![tiged-logo](https://user-images.githubusercontent.com/6876030/195346830-f1804e60-2842-436a-b013-a3b2095cea8e.png)
	
<sup>Stable diffusion (AI) generated logo</sup>

[![Build Status](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Ftiged%2Ftiged%2Fbadge%3Fref%3Dmain&style=flat)](https://actions-badge.atrox.dev/tiged/tiged/goto?ref=main)
[![Known Vulnerabilities](https://snyk.io/test/npm/degit/badge.svg)](https://snyk.io/test/npm/tiged)
[![install size](https://badgen.net/packagephobia/install/tiged)](https://packagephobia.now.sh/result?p=tiged)
[![npm package version](https://badgen.net/npm/v/tiged)](https://npm.im/tiged)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v1.4%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
</div>

**tiged** makes copies of git repositories. When you run `tiged some-user/some-repo` or (for backward compatibility) `degit some-user/some-repo`, it will find the latest commit on https://github.com/some-user/some-repo and download the associated tar file to `~/.degit/some-user/some-repo/commithash.tar.gz` if it doesn't already exist locally. (This is much quicker than using `git clone`, because you're not downloading the entire git history.)

## Installation

```bash
npm uninstall -g degit
npm install -g tiged
```

## Usage

### Basics

> You can use tiged or degit as the command. So no automated scripts break if you swap degit for tiged.

The simplest use of tiged is to download the main branch of a repo from GitHub to the current working directory:

```bash
tiged user/repo

# these commands are equivalent
tiged github:user/repo
tiged git@github.com:user/repo
tiged https://github.com/user/repo
```

Or you can download from GitLab and BitBucket:

```bash
# download from GitLab
tiged gitlab:user/repo
tiged git@gitlab.com:user/repo
tiged https://gitlab.com/user/repo

# download from BitBucket
tiged bitbucket:user/repo
tiged git@bitbucket.org:user/repo
tiged https://bitbucket.org/user/repo

# download from Sourcehut
tiged git.sr.ht/user/repo
tiged git@git.sr.ht:user/repo
tiged https://git.sr.ht/user/repo

# download from Hugging Face
tiged huggingface:user/repo
tiged git@huggingface.co:user/repo
tiged https://huggingface.co/user/repo
```

### Specify a tag, branch or commit

```bash
tiged user/repo#dev       # branch
tiged user/repo#v1.2.3    # release tag
tiged user/repo#1234abcd  # commit hash
```

### Create a new folder for the project

If the second argument is omitted, the repo will be cloned to the current directory.

```bash
tiged user/repo my-new-project
```

### Disable cache
Normally tiged caches tar.gz of the repo for future use. This is sometimes unwanted (e.g. scroll down for known bug)
```bash
tiged --disable-cache user/repo
```

### Specify a subdirectory

To clone a specific subdirectory instead of the entire repo, just add it to the argument:

```bash
tiged user/repo/subdirectory
```

### Subgroups (GitLab)

To get a GitLab repo that has a subgroup use the `--subgroup` option.

```bash
tiged --subgroup https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo my-dir
tiged -s https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo my-dir
```

To get a subdirectory of a repo inside a subgroup, use the `--sub-directory` option.

```bash
tiged --subgroup https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo --sub-directory subdir1 my-dir
```

### HTTPS proxying

If you have an `https_proxy` environment variable, Tiged will use it.

### Private repositories

Private repos can be cloned by specifying `--mode=git` (the default is `tar`). In this mode, Tiged will use `git` under the hood. It's much slower than fetching a tarball, which is why it's not the default.

Note: this clones over SSH, not HTTPS.

### See all options

```bash
tiged --help
```

## Wait, isn't this just `git clone --depth 1`?

A few salient differences:

- If you `git clone`, you get a `.git` folder that pertains to the project template, rather than your project. You can easily forget to re-init the repository, and end up confusing yourself
- Caching and offline support (if you already have a `.tar.gz` file for a specific commit, you don't need to fetch it again).
- Less to type (`tiged user/repo` instead of `git clone --depth 1 git@github.com:user/repo`)
- Composability via [actions](#actions)
- Future capabilities — [interactive mode](https://github.com/Rich-Harris/degit/issues/4), [friendly onboarding and postinstall scripts](https://github.com/Rich-Harris/degit/issues/6)

## JavaScript API

You can also use tiged inside a Node script:

```js
const tiged = require('tiged');

const emitter = tiged('user/repo', {
	disableCache: true,
	force: true,
	verbose: true
});

emitter.on('info', info => {
	console.log(info.message);
});

emitter.clone('path/to/dest').then(() => {
	console.log('done');
});
```

## Actions

You can manipulate repositories after they have been cloned with _actions_, specified in a `degit.json` file that lives at the top level of the working directory. Currently, there are two actions — `clone` and `remove`. Additional actions may be added in future.

### clone

```json
// degit.json
[
	{
		"action": "clone",
		"src": "user/another-repo"
	}
]
```

This will clone `user/another-repo`, preserving the contents of the existing working directory. This allows you to, say, add a new README.md or starter file to a repo that you do not control. The cloned repo can contain its own `degit.json` actions.

### remove

```json
// degit.json
[
	{
		"action": "remove",
		"files": ["LICENSE"]
	}
]
```

Remove a file at the specified path.

## Known bugs and workarounds

- `zlib: unexpected end of file`: this is solved by using option `--disable-cache` or clearing the cache folder (`rm -rf ~/.degit`); more details in [#45](https://github.com/tiged/tiged/issues/45)

### Why I forked degit?

- `degit` was last released over a year ago Feb 5, 2020, and Rich is not answering pull requests or issues there. He is probably very busy with Svelte and we love him for that._Rich has now (April 1, 2021) merged the main branch fix. Regardless currently this fork is still more fully featured and will continue to be developed._
- We want pull requests merged. E.g. like automatically working with `main` or other default branch (has been merged!).
- Update dependencies.
- Hopefully get multiple active maintainers.

### What has been fixed?

- Works with `main` or any default branch automatically. [#243](https://github.com/Rich-Harris/degit/pull/243)
- `--mode=git` with private repos now work on Windows [#191](https://github.com/Rich-Harris/degit/pull/191).
- `degit --help` now works. Previously it would crash instead of displaying help.md contents. [#179](https://github.com/Rich-Harris/degit/pull/179)
- `--mode=git` is now faster. [#171](https://github.com/Rich-Harris/degit/pull/171)
- Github Actions CI tests working. Added Github Actions badge and removed old CI badges.
- Added support for privately hosted git repositories ([#10](https://github.com/tiged/tiged/pull/10))
- GitLab works again. [#18](https://github.com/tiged/tiged/pull/18)
- Subdir works in `--mode=git` [#19](https://github.com/tiged/tiged/pull/19)
- Subgroups work in GitLab [#24](https://github.com/tiged/tiged/pull/24)
- Hashes work with git mode [#34](https://github.com/tiged/tiged/pull/34)
- Using full async + cjs (no build needed) [#41](https://github.com/tiged/tiged/pull/41)
- Option to not use cache [#36](https://github.com/tiged/tiged/issue/36)

#### It might be time to move on.
## See also

- [zel](https://github.com/vutran/zel) by [Vu Tran](https://twitter.com/tranvu)
- [gittar](https://github.com/lukeed/gittar) by [Luke Edwards](https://twitter.com/lukeed05)

## License

[MIT](LICENSE.md).
