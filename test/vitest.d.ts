import 'vitest';

declare module 'vitest' {
  interface Matchers<T = any> {
    /**
     * Asserts that a directory (relative to the project root) contains exactly
     * the given files and directories with the expected contents.
     *
     * - Keys are file/directory paths relative to the target directory.
     * - **`string`** values are matched against the trimmed, LF-normalized file
     *   contents.
     * - **`null`** values indicate the entry is a directory.
     *
     * The matcher first verifies that the received path is a valid directory,
     * then checks that the set of entries matches exactly (no extra, no
     * missing), and finally compares each file's contents.
     *
     * @param files - A record mapping relative paths to expected contents (`string` for files, `null` for directories).
     * @returns A {@linkcode Promise | promise} that resolves with the matcher result.
     *
     * @example
     * <caption>#### Assert directory contents match expected files</caption>
     *
     * ```ts
     * await expect('tmp/output').toMatchFiles({
     *   'file.txt': 'hello from github!',
     *   subdir: null,
     *   'subdir/nested.txt': 'nested content',
     * });
     * ```
     *
     * @internal
     * @since 3.0.0
     */
    toMatchFiles: (files: Record<string, string | null>) => Promise<T>;
  }
}
