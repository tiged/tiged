# Notes: replace `tar` dependency (nanotar pivot)

## Why

Today we depend on the `tar` package for two things in tar mode:

- **Listing** tar entries to decide if `repo.subdir` points at a file vs a directory (`tar.list`)
- **Extracting** either the whole archive or a single subdir/file (`tar.extract`), using `strip` to remove the leading GitHub/GitLab “top folder” (`repo-<hash>/...`).

Goal: **remove the `tar` dependency** without changing CLI behavior.

We initially tried [`nanotar`](https://github.com/unjs/nanotar), but it produced incorrect paths for some real-world GitHub tarballs (notably `facebook/react`) due to how those archives encode long paths (PAX headers / ustar prefix). The symptom was a severe regression: many deep files were written to the repo root ("flattened").

Final approach: tiged now uses an internal tar.gz extractor in `src/tar.ts` that explicitly handles:

- gzip decompression
- tar header parsing (including ustar `prefix`)
- PAX extended headers (`typeflag 'x'`) for `path=` overrides
- GNU longname (`typeflag 'L'`)
- strip of the top-level `<repo>-<hash>/` folder
- single-file and subdir extraction modes
- zip-slip protection (rejects unsafe output paths)

## Current usage inventory

- Only used in one place: `untar()` in [src/index.ts](../src/index.ts)
  - `import { extract, list } from 'tar'`
  - `list({ file, onReadEntry }, [subdir])` to detect “subdir is a file”
  - `extract({ file, strip, C: dest, onReadEntry }, subdir ? [subdir] : [])`

## What nanotar provided (and why it didn't work here)

`nanotar` is an in-memory tar parser/creator. For our use case:

- `parseTarGzip(data, { metaOnly: true, filter })` can replace `tar.list`
- `parseTarGzip(data, { filter })` can replace `tar.extract` **but we must write files to disk ourselves**

Even though the API surface looked sufficient, real GitHub tarballs can include PAX headers that carry the true long `path`. In our comparison runs, nanotar returned basename-only names for some entries, which broke extraction.

## Implemented solution

### Internal extractor

The extractor lives in `src/tar.ts` and is called from `src/index.ts` via `untarToDir(file, dest, subdir)`.

### Path mapping + “strip” logic

We need to replicate what `tar.extract({ strip })` currently does:

- For full repo extraction: drop the leading top folder (`strip = 1`)
- For subdir extraction:
  - If subdir points at a directory, drop `1 + <subdir path segments>`
  - If subdir points at a file, drop `1 + (<subdir segments> - 1)`

With the internal extractor we compute output paths ourselves:

- Normalize `repo.subdir` by removing a leading `/`.
- Compute `archivePath` for each entry (`item.name`).
- Compute `relativePath` by:
  - removing the detected top-level prefix
  - if subdir filter is active, removing the subdir prefix

Important: harden against path traversal (tar “zip slip”):

- reject entries whose computed `relativePath` is empty
- reject paths with `..` segments or absolute paths
- ensure final output stays under `dest` (`path.resolve(dest, relativePath)` starts with `path.resolve(dest) + path.sep`)

### Preserve current semantics

- Keep the current “No files to extract” error behavior when the requested subdir/file does not exist.
- Keep single-file clone behavior (extract only that file into dest).
- Keep file permissions behavior _as close as practical_:
  - today `tar` may restore modes; with nanotar we can optionally apply `chmod` using `attrs.mode`.
  - if we skip mode restoration initially, document it as a behavior change and confirm it won’t break tests.

### Update dependencies

- Remove `tar` from `dependencies`
- No `nanotar` dependency (internal extractor instead)

### Tests

We already have integration coverage for:

- cloning full repos
- cloning subdirectories
- cloning a single file
- `--force` behavior

Existing integration tests cover full repo, subdir, and single-file extraction.

### Rollout plan

- Step A: land the internal extractor and remove third-party tar dependencies
- Step B: validate against large real repos by comparing output vs published tiged

## Risks / open questions

- **Memory usage**: current implementation gunzips into memory. Large tarballs will use more RAM than a streaming extractor.
  - Mitigation: the current behavior matches historical expectations, but a streaming implementation could be added later if needed.
- **Permissions/symlinks**: current `tar` may handle more filesystem features than we need.
  - Mitigation: confirm what our hosts produce (GitHub tarballs are mostly regular files/dirs). Document gaps if any.

## Acceptance criteria

- `npm test` passes (including single-file and subdir extraction tests)
- No `tar` dependency remains in `package.json`
- Behavior matches existing CLI semantics for tar mode (including errors)
- Published-vs-local comparison matches on a large repo (tree + sha)
