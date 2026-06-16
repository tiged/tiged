# Agent guidelines

## About tiged

tiged is a project scaffolding tool that downloads git repositories as tarballs (without cloning the full history), making it much faster than `git clone`. It supports GitHub, GitLab, and others, with features like caching, offline mode, branch/tag/commit specification, subdirectory extraction, and private repo support.

## Commits (required)

All commits MUST follow **Conventional Commits**.

Format:

- `type(scope): summary`
- Optional body for context
- Use `!` or a `BREAKING CHANGE:` footer for breaking changes

Allowed `type` (typical): `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`.

Examples:

- `fix(tar): handle PAX path correctly`
- `docs: document overwrite behavior`
- `feat(cli)!: change default output directory`

## Checks (required)

Before running git push, ALWAYS run:

- `npm run lint`
- `npm run format`
- `npm run test-types`

Run `npm run format` even after creating/modifying Markdown files.

If you need to auto-fix issues:

- `npm run lint:fix`
- `npm run format`

## Project Files

```
.
├── .env
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.mjs
├── prettier.config.mjs
├── lint-staged.config.mjs
├── vitest.config.mts
├── tsup.config.ts
├── README.md
├── help.md
│
├── src/
│   ├── index.ts
│   ├── tiged.ts
│   ├── bin.ts
│   ├── cli-parser.ts
│   ├── tar.ts
│   ├── types.ts
│   ├── utils.ts
│   ├── constants.ts
│   └── prompt.ts
│
├── test/
│   ├── index.test.ts
│   ├── cache-offline.test.ts
│   ├── app-dirs.test.ts
│   ├── cli-parser.test.ts
│   ├── credentials.test.ts
│   ├── vitos.setup.ts
│   ├── vitest-global.setup.ts
│   └── test-utils.ts
│
├── dist/
│   ├── index.js
│   └── bin.js
```
