# tiged changelog

## 3.0.0

- Remove `fs-extra` ([#110](https://github.com/tiged/tiged/pull/110))

- Fix husky and lint-staged ([#112](https://github.com/tiged/tiged/pull/112))

- Fix typo ([#111](https://github.com/tiged/tiged/pull/111))

- Migrate to `"moduleResolution": "Bundler"` ([#109](https://github.com/tiged/tiged/pull/109))

- Fix CI tests ([#108](https://github.com/tiged/tiged/pull/108))

- Remove unused dependencies ([#106](https://github.com/tiged/tiged/pull/106))

- Migrate to `typescript-eslint` v8 ([#105](https://github.com/tiged/tiged/pull/105))

- Rename degit references to tiged ([#102](https://github.com/tiged/tiged/pull/102))

- Breaking changes:

  - Change default export to a named export ([#101](https://github.com/tiged/tiged/pull/101))

- Migrate codebase to TypeScript ([#89](https://github.com/tiged/tiged/pull/89)):
  - Replace mocha with Vitest as it has better ESM and TypeScript support.
  - Use `tsup` to output both CJS and ESM entry points.
  - Replace rollup and other rollup related dev dependencies with tsup.
  - Migrate ESLint to use the new flat config.
  - Add JSDocs to everything to make sure the entirety of both the runtime code and types are well documented.
- Added Codeberg support ([#94](https://github.com/tiged/tiged/issues/94))
- Fixed misleading error message when git is missing. ([#91](https://github.com/tiged/tiged/issues/91))
- Fix: Throw error if subdirectory doesn't exist ([#35](https://github.com/tiged/tiged/issues/35))

## 2.12.7

- Support HTTPS_PROXY ([#86](https://github.com/tiged/tiged/issues/86))

## 2.12.6

- Fix "Delayed exit after successful clone ([#84](https://github.com/tiged/tiged/pull/84))

## 2.12.5

- Fix "Url parsing mangles domain name" ([#70](https://github.com/tiged/tiged/issues/70)
- Testing against tiged repos instead of degit ([#53](https://github.com/tiged/tiged/issues/53))

## 2.12.4

- Fixed stdout maxBuffer length exceeded error ([#64](https://github.com/tiged/tiged/pull/69))

## 2.12.3

- Added huggingface.co support ([#59](https://github.com/tiged/tiged/59))
- Updated help.md to include `--disable-cache` option and hugging face support.

## 2.12.2

- Fixed previous version's buggy implementation. Previous version deprecated.

## 2.12.1

> npm bugged out when publishing. Version 2.12.0 is the same as 2.12.1

- Added option to not use cache. ([#36](https://github.com/tiged/tiged/36))

## 2.11.4

- Fix https mode not working with git mode, which was unfortunately introduced with previous fix. ([#49](https://github.com/tiged/tiged/issues/49))

## 2.11.3

- Fix ssh mode not working with git mode. ([#49](https://github.com/tiged/tiged/issues/49))

## 2.11.2

- full async + cjs (no build need) ([#41](https://github.com/tiged/tiged/pull/41))
- Fix bug introduced in previous version, which basically broke git mode for Windows. ([#42](https://github.com/tiged/tiged/pull/42))

## 2.11.1

- Add ability to use old hashes with --mode=git. ([#34](https://github.com/tiged/tiged/pull/34))

## 2.11.0

- Subgroups now work (GitLab). ([#24](https://github.com/tiged/tiged/pull/24))

## 2.10.4

- Subdir now works with --mode=git

## 2.10.3

- GitLab changed tar.gz url. Now works again.

## 2.10.2

- Add support for privately hosted git repositories ([#10](https://github.com/tiged/tiged/pull/10))

## 2.10.1

- Reverted previous fix due to uncaught bug during testing.

## 2.10.0

- Add support for privately hosted git repositories ([#6](https://github.com/tiged/tiged/pull/6))

## 2.9.5

- Using rimraf for older node version support. E.g. Node 10 should now work again in all uses. ([#3](https://github.com/tiged/tiged/pull/3))

## 2.9.4

- Speed up git mode by doing a shallow clone ([#171](https://github.com/Rich-Harris/degit/pull/171))

## 2.9.3

- degit --help did not work. It would throw error. Now it reads the help.md like it should. ([#179](https://github.com/Rich-Harris/degit/pull/179))

## 2.9.2

- Fixed shebang. It was broken by pointing bin in package.json straight to dist/bin.js. Now pointing again to ./bin.js

## 2.9.1

- Fixed build so that #191 from previous change log actually is in the build.

## 2.9.0

- "main" and other default branches work, not just master ([#243](https://github.com/Rich-Harris/degit/pull/243))
- Use rimrafSync instead of rm -rf in --mode=git ([#191](https://github.com/Rich-Harris/degit/pull/191))
- Updated dependencies
- Forked to tiged, community driven fork of degit

## 2.8.3

- Stop bundling dependencies

- Update all dependencies

## 2.8.2

- Replace `chalk` with `colorette`

## 2.8.1

- Fix package (https://github.com/fregante/degitto/commit/f6e1617582af34173a210c5904e1d6c6148769b0)

## 2.8.0

- Sort by recency in interactive mode

## 2.7.0

- Bundle for a faster install

## 2.6.0

- Add an interactive mode ([#4](https://github.com/Rich-Harris/degit/issues/4))

## 2.5.0

- Add `--mode=git` for cloning private repos ([#29](https://github.com/Rich-Harris/degit/pull/29))

## 2.4.0

- Clone subdirectories from repos (`user/repo/subdir`)

## 2.3.0

- Support HTTPS proxying where `https_proxy` env var is supplied ([#26](https://github.com/Rich-Harris/degit/issues/26))

## 2.2.2

- Improve CLI error logging ([#49](https://github.com/Rich-Harris/degit/pull/49))

## 2.2.1

- Update `help.md` for Sourcehut support

## 2.2.0

- Sourcehut support ([#85](https://github.com/Rich-Harris/degit/pull/85))

## 2.1.4

- Fix actions ([#65](https://github.com/Rich-Harris/degit/pull/65))
- Improve CLI error logging ([#46](https://github.com/Rich-Harris/degit/pull/46))

## 2.1.3

- Install `sander` ([#34](https://github.com/Rich-Harris/degit/issues/34))

## 2.1.2

- Remove `console.log`

## 2.1.1

- Oops, managed to publish 2.1.0 without building

## 2.1.0

- Add actions ([#28](https://github.com/Rich-Harris/degit/pull/28))

## 2.0.2

- Allow flags like `-v` before argument ([#25](https://github.com/Rich-Harris/degit/issues/25))

## 2.0.1

- Update node-tar for Node 9 compatibility

## 2.0.0

- Expose API for use in Node scripts ([#23](https://github.com/Rich-Harris/degit/issues/23))

## 1.2.2

- Fix `files` in package.json

## 1.2.1

- Add `engines` field ([#17](https://github.com/Rich-Harris/degit/issues/17))

## 1.2.0

- Windows support ([#1](https://github.com/Rich-Harris/degit/issues/1))
- Offline support and `--cache` flag ([#8](https://github.com/Rich-Harris/degit/issues/8))
- `degit --help` ([#5](https://github.com/Rich-Harris/degit/issues/5))
- `--verbose` flag

## 1.1.0

- Use HTTPS, not SSH ([#11](https://github.com/Rich-Harris/degit/issues/11))

## 1.0.0

- First release
