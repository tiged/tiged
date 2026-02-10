# Agent guidelines

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

Before pushing, ALWAYS run:

- `npm run lint`
- `npm run format`

Run `npm run format` even after creating/modifying Markdown files.
