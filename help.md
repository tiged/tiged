# _tiged_

Usage:

`tiged <src>[#ref] [<dest>] [options]`

Fetches the `src` repo, and extracts it to `dest` (or the current directory).

The `src` argument can be any of the following:

## GitHub repos

user/repo
github:user/repo
https://github.com/user/repo

## GitLab repos

gitlab:user/repo
https://gitlab.com/user/repo

## BitBucket repos

bitbucket:user/repo
https://bitbucket.org/user/repo

## Sourcehut repos

git.sr.ht/~user/repo
git@git.sr.ht:~user/repo
https://git.sr.ht/~user/repo

## Hugging Face repos

huggingface:user/repo
git@huggingface.co:user/repo
https://huggingface.co/user/repo

## Codeberg repos

codeberg:user/repo
git@codeberg.org:user/repo
https://codeberg.org/user/repo

You can append a #ref to any of the above:

## Branches

user/repo#dev

## Tags

user/repo#v1.2.3

## Commit hashes

user/repo#abcd1234

You can also specify a subdirectory or a single file by appending a path:

user/repo/subdir
user/repo/subdir/file.txt

The `dest` directory (or the current directory, if unspecified) must be empty
unless the `--force` option is used.

Options:

`--help`, `-h` Show this message
`--offline-mode`, `-o` Only use local cache (never downloads). Errors if missing.
`--cache`, `-c` Deprecated legacy cache behavior. Will be removed in v3.X
`--disable-cache`, `-D` Do not use cache. Always fetch data online.
`--force`, `-f` Overwrite existing destination directory (deletes its contents)
`--verbose`, `-v` Extra logging
`--subgroup`, `-s` Use if repo is in a subgroup (GitLab)
`--sub-directory`, `-d` Clone only a subdirectory of the repo
`--mode=`, `-m=` Force the mode by which tiged clones the repo
Valid options are `tar` or `git` (uses SSH)

See https://github.com/tiged/tiged for more information
