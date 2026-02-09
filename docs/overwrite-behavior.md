# Overwrite / skip / merge behavior (experiments)

Answer: tiged does **not** merge or skip individual existing files.

- If the destination directory is **non-empty**, it **fails**.
- With `--force`, it **deletes the destination directory contents** and then clones.

All examples below use the normal `tiged` executable.

Tip: run these in a throwaway folder (everything under `./tiged-overwrite-demo` will be created/removed).

## 1) Empty destination: succeeds

```bash
rm -rf ./tiged-overwrite-demo

tiged tiged/tiged-test-repo ./tiged-overwrite-demo/empty -v
ls -la ./tiged-overwrite-demo/empty | head
```

Observed:

- Succeeds and creates files like `file.txt` and `subdir/…`.

## 2) Non-empty destination, no `--force`: fails (no merge)

```bash
mkdir -p ./tiged-overwrite-demo/nonempty
echo "keepme" > ./tiged-overwrite-demo/nonempty/existing.txt

tiged tiged/tiged-test-repo ./tiged-overwrite-demo/nonempty -v
echo "exit=$?"
ls -la ./tiged-overwrite-demo/nonempty
```

Observed:

- Fails with `destination directory is not empty…`
- `existing.txt` is still present (nothing merged/overwritten).

## 3) Non-empty destination with `--force`: wipes then clones

```bash
tiged tiged/tiged-test-repo ./tiged-overwrite-demo/nonempty -fv

test -e ./tiged-overwrite-demo/nonempty/existing.txt \
  && echo "existing.txt still present" \
  || echo "existing.txt removed"
```

Observed:

- Succeeds.
- Old files are removed (directory is cleared), then repo is cloned.

## 4) Single-file clone: same behavior

```bash
mkdir -p ./tiged-overwrite-demo/single
echo "old" > ./tiged-overwrite-demo/single/file.txt

# without --force: fails
tiged tiged/tiged-test-repo/subdir/file.txt ./tiged-overwrite-demo/single -v
echo "exit=$?"

# with --force: succeeds (replaces by wiping destination)
tiged tiged/tiged-test-repo/subdir/file.txt ./tiged-overwrite-demo/single -fv
cat ./tiged-overwrite-demo/single/file.txt
```

Observed:

- Without `--force`: fails with `destination directory is not empty…`
- With `--force`: succeeds; `file.txt` becomes:

```text
hello from a subdirectory!
```
