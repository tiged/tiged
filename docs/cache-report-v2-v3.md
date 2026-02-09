# Tiged caching report (v2) + proposal for v3

Date: 2026-02-09  
Scope: how tiged caches repo downloads today (v2), what’s confusing/buggy, and a sensible v3 direction.

## Executive summary

- **Today (v2), caching is mostly a tarball cache** under `~/.degit/…` keyed by commit hash, with a small JSON index (`map.json`) and access log (`access.json`).
- **The CLI/API flags are confusing because they mix three concerns**:
  1. whether to reuse existing cached data,
  2. whether to write new cache entries,
  3. whether to allow any network access (offline).
- **`--offline-mode` does not reliably prevent network access** due to a logic bug in the tar clone path.
- **`updateCache()` has a bug that can delete the wrong tarball**, which can make cache behavior feel flaky.
- **`--mode=git` does not cache at all**; only tar mode uses the `~/.degit` cache.

For v3, the most sensible update is to **separate “cache read”, “cache write”, and “offline/no-network”** in both the CLI and JS API, and make the behavior consistent across modes.

---

## What is cached in v2 (data model)

All caching happens under:

- `base = ~/.degit` (see `src/utils.ts`)
- Per repo directory: `~/.degit/<site>/<user>/<name>/`

### Files created

For tar mode (`--mode=tar`, the default for supported hosts):

- `~/.degit/<site>/<user>/<name>/<hash>.tar.gz`
  - The tarball for the exact commit hash.
- `~/.degit/<site>/<user>/<name>/map.json`
  - JSON object mapping `ref -> hash`.
  - Example keys: `"HEAD"`, `"main"`, `"v1.2.3"`.
- `~/.degit/<site>/<user>/<name>/access.json`
  - JSON object mapping `ref -> ISO timestamp`.
  - Used by interactive mode to sort choices.

### Cache lookup keys

- Tarball cache is **keyed by commit hash** (filename).
- The ref mapping (`map.json`) is keyed by **the user-supplied ref string** (`repo.ref`).

This distinction matters:

- Online runs can resolve `ref -> hash` via `git ls-remote`, and then use the tarball cache if present.
- Offline runs cannot resolve `ref -> hash` unless it’s already in `map.json`.

---

## How caching works today (v2 behavior)

### Default behavior (no flags)

In tar mode:

1. Resolve the desired **commit hash** by running `git ls-remote` against `repo.url`.
2. Look for `~/.degit/<…>/<hash>.tar.gz`.
   - If it exists, reuse it.
   - Otherwise, download the tarball.
3. Update cache metadata:
   - Write/refresh `access.json`.
   - Update `map.json` so that `repo.ref` points to the resolved hash.

So: **cache is “on” by default**.

### `--disable-cache` / `disableCache` (aka `noCache` internally)

In tar mode:

- Forces a fresh download even if `<hash>.tar.gz` already exists.
- Skips writing `map.json`/`access.json`.
- Deletes the downloaded tarball after extraction.

So this is effectively: **don’t read cache + don’t write cache**.

Note: the current implementation uses a thrown string (`"don't use cache"`) to bypass `fs.stat()`; it works but is brittle.

### `--offline-mode` / `offlineMode`

Intended (per help text):

- **No network**. Only use local cached data.

Actual v2 behavior:

- Hash resolution _does_ switch to `map.json` when offline mode is enabled.
- But the tarball download path has logic that can still attempt a network download unless a second flag (`--cache`) is also set.

Net result:

- Users can observe **offline mode still hitting the network**, which violates expectations.

### `--cache` (deprecated)

Help text says `--cache` is the same as offline mode and will be removed in v3.

Actual v2 behavior:

- `--cache` causes tiged to use `map.json` for hash resolution.
- But unlike true offline mode, it may still download the tarball if the tarball file is missing.

This makes `--cache` behave like:

- “Use cached _ref → hash_, but still allow network for the tarball.”

That’s not a common or intuitive mode, and it’s not what the help text implies.

### `--mode=git`

- Uses `git clone`/`git fetch` with `--depth 1` into the destination (and a temp `.tiged` folder when extracting a subdir).
- Removes the destination’s `.git` folder at the end.
- **Does not read or write the `~/.degit` cache at all.**

---

## Where v2 feels broken or surprising

### 1) Offline mode still hits the network

The tar download step is guarded by a condition that depends on both `offlineMode` and `cache`, so `--offline-mode` alone does not reliably prevent downloads.

This is likely the biggest “cache doesn’t work sensibly” issue, because users expect offline mode to be strict.

### 2) Offline mode can’t use a cached tarball by hash unless it’s in `map.json`

If a user runs:

- `tiged user/repo#<fullHash> --offline-mode`

…and `<fullHash>.tar.gz` exists, v2 can still fail because it tries to find `<fullHash>` inside `map.json` (as a `ref`).

A sensible offline implementation should allow:

- if ref is a full hash, treat it as the hash (no map lookup needed).

### 3) `updateCache()` can delete the wrong tarball

When `map.json` changes, v2 attempts to delete the _old_ tarball if it’s unused.

However, the “is this tarball still used?” check compares cached values to the **new** hash rather than the **old** hash. That can cause it to delete a tarball that’s still needed.

Impact:

- Cache appears unreliable.
- Offline workflows become flaky (tarball missing unexpectedly).

### 4) Flag naming conflates multiple behaviors

In practice, users want to independently control:

- **cache read**: reuse an existing tarball if present
- **cache write**: save tarballs/metadata for future runs
- **network**: allowed vs disallowed

In v2:

- `--disable-cache` is close to “read=false, write=false”, but not named that way.
- `--offline-mode` intends “network=false” but doesn’t enforce it.
- `--cache` is deprecated and behaves oddly.

### 5) Potential cache corruption on partial downloads

The README mentions `zlib: unexpected end of file` and suggests disabling cache or deleting `~/.degit`.

That symptom often points to:

- interrupted download, leaving a truncated `.tar.gz` that later gets reused.

A robust cache should download to a temp file and rename atomically, and optionally validate the archive.

---

## Use cases people actually need

### A. Default “fast scaffold” (online)

- Goal: latest template quickly.
- Wants: reuse tarball if commit already downloaded.
- Default behavior should remain fast and simple.

### B. Pin exact version (deterministic)

- Goal: reproducible output.
- Typical inputs: `#v1.2.3` or `#<hash>`.
- Wants: strict behavior; ideally avoids network if already cached.

### C. True offline reuse

- Goal: run without network (plane/train, secure network, outage).
- Needs:
  - `--offline` meaning “never hit network”.
  - Works when ref is a full hash.
  - Works for branches/tags _only if_ they were resolved before and recorded.

### D. CI environments

Common CI wants split cleanly:

1. **Read cache but don’t write**
   - Goal: speed up builds without polluting cache.
   - Example: shared runner cache is provided externally.

2. **Write cache but ignore existing** (“refresh”)
   - Goal: avoid corrupted/stale tarballs but still repopulate.

3. **No cache at all**
   - Goal: hermetic runs with no cross-job state.

### E. Debugging / recovering from corruption

- Goal: bypass an existing broken tarball once.
- Needs: a “don’t read cache” option that still writes a fresh good tarball.

### F. Privacy / compliance

- Goal: don’t leave template sources on disk.
- Needs:
  - “don’t write cache”
  - optionally “cache dir” set to project-local temp.

### G. Private repos (`--mode=git`)

- Goal: clone private templates reliably.
- Caching may be undesirable by default (private code saved globally), but some teams may want an explicit opt-in.

---

## Proposal for v3: make caching explicit and consistent

### Core model (three knobs)

Define these independent behaviors:

1. **Network**
   - `network: true|false`
2. **Cache read** (reuse local tarball / local metadata)
   - `cache.read: true|false`
3. **Cache write** (save tarball / update metadata)
   - `cache.write: true|false`

Then define common “modes” as presets.

### CLI proposal

Replace ambiguous/legacy flags with explicit ones:

- `--offline`
  - No network access.
  - Implies `cache.read=true`.
  - Implies `cache.write=false` (optional, but safer; offline shouldn’t mutate cache).

- `--no-cache`
  - Equivalent to `--no-cache-read --no-cache-write`.

- `--no-cache-read`
  - Never reuse an existing tarball.
  - Still allowed to write a fresh tarball (unless `--no-cache-write`).

- `--no-cache-write`
  - Don’t write/modify `map.json`, `access.json`, or tarballs.
  - Still allowed to read existing tarballs.

Optional but high-value:

- `--cache-dir <path>` (and/or `TIGED_CACHE_DIR`)
  - Use a project-local cache or a CI-provided cache.

### JS API proposal (breaking change)

Deprecate/remove:

- `cache?: boolean` (currently deprecated already)
- `disableCache?: boolean`

Add:

```ts
interface OptionsV3 {
  cache?: {
    read?: boolean;
    write?: boolean;
    dir?: string;
  };
  offline?: boolean;
  // existing: force, verbose, mode, subgroup, sub-directory …
}
```

Migration mapping:

- v2 `disableCache: true` → v3 `cache: { read: false, write: false }`
- v2 `offlineMode: true` → v3 `offline: true`
- v2 `cache: true` (deprecated) → v3 `offline: true` (or warn + map to offline)

### Behavioral details (tar mode)

- Default (no flags):
  - `offline=false, cache.read=true, cache.write=true`.
  - Always resolve refs via network when allowed.
  - Use tarball cache by hash if already present.

- Offline:
  - If ref is a 40-char hash: use `<hash>.tar.gz` if present.
  - If ref is a branch/tag/HEAD: require `map.json[ref]`.
  - Never download.

- No-cache-read:
  - Still resolve hash normally.
  - Always download tarball (and ideally replace/overwrite existing cached tarball atomically).

- No-cache-write:
  - Still allowed to download (online) and use local tarballs.
  - But do not update `map.json`/`access.json` or create new tarballs.

### Fixes that should ship with v3

- **Fix offline/network gating** so offline truly means no network.
- **Fix `updateCache()` deletion logic** (check whether `oldHash` is still referenced).
- **Atomic downloads**: download to `file.tmp`, then rename to `file`.
- Optional: verify gzip/tar integrity before accepting a cached tarball.
- Replace thrown strings with typed errors.

---

## Should `_cloneWithGit` cache?

Recommendation: **not by default**.

Reasons:

- Git mode is primarily for private repos and unsupported hosts.
- Caching git repositories implies storing full template sources on disk, which may surprise users and has security/compliance implications.
- Correct git caching (mirrors, updates, authentication, concurrency, Windows/macOS/Linux parity) is significantly more complex than tarball caching.

If demand is strong, consider an explicit opt-in in v3.x (or v4):

- `--git-cache=mirror` storing a bare mirror under the cache dir.
- Online: `git fetch` into the mirror.
- Offline: clone from mirror.

But keep this separate from tar cache so the simple case stays simple.

---

## Concrete next steps

1. Fix v2 bugs (even if semantics change in v3):
   - offline mode network gating
   - `updateCache()` old tarball deletion check
   - offline “ref is hash” shortcut

2. In v2, deprecate confusing knobs more loudly:
   - warn when using `--cache` / `opts.cache`

3. Implement v3 cache API/flags with a migration note in README/help.
