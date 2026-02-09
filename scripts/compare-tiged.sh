#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Compare published tiged vs local tiged output.

USAGE:
  scripts/compare-tiged.sh [options]

OPTIONS:
  --src <owner/repo>        Repo to clone (default: facebook/react)
  --ref <ref>              Git ref to clone (default: HEAD)
  --dest <dir>             Destination dir name inside each run (default: repo name)
  --published <pkg@ver>    npx spec for published tiged (default: tiged@latest)
  --local <mode>           How to run local tiged: dist|tsx (default: dist)
  --tmp <dir>              Reuse a temp dir (default: auto mktemp)
  --skip-sha               Skip sha256 comparison (faster)
  --keep                   Do not delete temp dir on exit
  -h, --help               Show this help

EXAMPLES:
  scripts/compare-tiged.sh
  scripts/compare-tiged.sh --src facebook/react --ref 2dd9b7c... --skip-sha
  scripts/compare-tiged.sh --local tsx

NOTES:
  - This script pins both runs to the same commit hash (via git ls-remote) unless --ref is already a full 40-char hash.
  - For large repos, sha256 diffing can be expensive. Use --skip-sha when iterating.
USAGE
}

repo_src="facebook/react"
repo_ref="HEAD"
dest_name=""
published_spec="tiged@latest"
local_mode="dist"
tmp_root=""
skip_sha="0"
keep_tmp="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src) repo_src="$2"; shift 2;;
    --ref) repo_ref="$2"; shift 2;;
    --dest) dest_name="$2"; shift 2;;
    --published) published_spec="$2"; shift 2;;
    --local) local_mode="$2"; shift 2;;
    --tmp) tmp_root="$2"; shift 2;;
    --skip-sha) skip_sha="1"; shift 1;;
    --keep) keep_tmp="1"; shift 1;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2;;
  esac
done

case "$local_mode" in
  dist|tsx) ;;
  *) echo "--local must be 'dist' or 'tsx'" >&2; exit 2;;
esac

if [[ -z "$dest_name" ]]; then
  # dest defaults to repo name
  dest_name="${repo_src##*/}"
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 127
  }
}

need_cmd git
need_cmd node
need_cmd npx
need_cmd find
need_cmd sort
need_cmd diff
need_cmd sha256sum
need_cmd wc
need_cmd du

# Resolve to a full commit hash so both runs use the exact same tarball.
full_hash=""
if [[ "$repo_ref" =~ ^[0-9a-f]{40}$ ]]; then
  full_hash="$repo_ref"
else
  full_hash="$(git ls-remote "https://github.com/${repo_src}" "$repo_ref" | awk '{print $1}' | head -n 1)"
fi

if [[ -z "$full_hash" ]]; then
  echo "Could not resolve ref '$repo_ref' for $repo_src" >&2
  exit 1
fi

pinned_src="${repo_src}#${full_hash}"

if [[ -z "$tmp_root" ]]; then
  tmp_root="$(mktemp -d /tmp/tiged-compare.XXXXXX)"
fi

mkdir -p "$tmp_root/published" "$tmp_root/local"

cleanup() {
  if [[ "$keep_tmp" == "1" ]]; then
    echo "Keeping temp dir: $tmp_root" >&2
  else
    rm -rf "$tmp_root" || true
  fi
}
trap cleanup EXIT

log_published="$tmp_root/published.log"
log_local="$tmp_root/local.log"

run_published() {
  echo "--- published: npx $published_spec $pinned_src ---"
  pushd "$tmp_root/published" >/dev/null
  # -D disable-cache; -f force overwrite
  /usr/bin/time -p npx --yes "$published_spec" "$pinned_src" "$dest_name" -D -f >"$log_published" 2>&1
  popd >/dev/null
}

run_local() {
  echo "--- local ($local_mode): $pinned_src ---"
  pushd "$tmp_root/local" >/dev/null

  if [[ "$local_mode" == "dist" ]]; then
    if [[ ! -f "${PWD}/.dist-built" ]]; then
      # Best-effort: ensure local dist exists.
      if [[ ! -f "/home/kevinkiv/projects/tiged-new/dist/bin.js" ]]; then
        echo "dist/bin.js not found; run 'npm run build' first (or use --local tsx)." >&2
        exit 1
      fi
      : >"${PWD}/.dist-built"
    fi

    /usr/bin/time -p node /home/kevinkiv/projects/tiged-new/dist/bin.js "$pinned_src" "$dest_name" -D -f >"$log_local" 2>&1
  else
    /usr/bin/time -p node --import=tsx /home/kevinkiv/projects/tiged-new/src/bin.ts "$pinned_src" "$dest_name" -D -f >"$log_local" 2>&1
  fi

  popd >/dev/null
}

compare_outputs() {
  local pub_dir="$tmp_root/published/$dest_name"
  local loc_dir="$tmp_root/local/$dest_name"

  if [[ ! -d "$pub_dir" ]]; then
    echo "Published output dir missing: $pub_dir" >&2
    exit 1
  fi
  if [[ ! -d "$loc_dir" ]]; then
    echo "Local output dir missing: $loc_dir" >&2
    exit 1
  fi

  ( cd "$pub_dir" && find . -print | sort ) >"$tmp_root/published-files.txt"
  ( cd "$loc_dir" && find . -print | sort ) >"$tmp_root/local-files.txt"

  diff -u "$tmp_root/published-files.txt" "$tmp_root/local-files.txt" >"$tmp_root/tree.diff" || true

  echo "--- summary ---"
  echo "repo:          $repo_src"
  echo "commit:        $full_hash"
  echo "published:     $published_spec"
  echo "local:         $local_mode"
  echo "tmp:           $tmp_root"
  echo "pub file count: $(wc -l <"$tmp_root/published-files.txt")"
  echo "loc file count: $(wc -l <"$tmp_root/local-files.txt")"
  echo "pub bytes:      $(du -sb "$pub_dir" | awk '{print $1}')"
  echo "loc bytes:      $(du -sb "$loc_dir" | awk '{print $1}')"

  if [[ -s "$tmp_root/tree.diff" ]]; then
    echo "tree.diff:     DIFFER"
  else
    echo "tree.diff:     OK"
  fi

  if [[ "$skip_sha" == "1" ]]; then
    echo "sha.diff:      (skipped)"
    return 0
  fi

  ( cd "$pub_dir" && find . -type f -print0 | sort -z | xargs -0 sha256sum ) >"$tmp_root/published-sha256.txt"
  ( cd "$loc_dir" && find . -type f -print0 | sort -z | xargs -0 sha256sum ) >"$tmp_root/local-sha256.txt"

  diff -u "$tmp_root/published-sha256.txt" "$tmp_root/local-sha256.txt" >"$tmp_root/sha.diff" || true

  if [[ -s "$tmp_root/sha.diff" ]]; then
    echo "sha.diff:      DIFFER"
  else
    echo "sha.diff:      OK"
  fi
}

run_published
run_local
compare_outputs

echo ""
echo "Logs:"
echo "- $log_published"
echo "- $log_local"
echo ""
echo "Diff artifacts:"
echo "- $tmp_root/tree.diff"
if [[ "$skip_sha" != "1" ]]; then
  echo "- $tmp_root/sha.diff"
fi
