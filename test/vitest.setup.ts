import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'tinyglobby';
import { isDirectory } from '../src/utils.js';

expect.extend({
  async toMatchFiles(
    received: string,
    expected: Record<string, string | null>,
  ) {
    const { isNot, equals } = this;

    const receivedDirectoryPath = path.join(
      import.meta.dirname,
      '..',
      received,
    );

    if (!(await isDirectory(receivedDirectoryPath))) {
      return {
        pass: false,
        actual: received,
        message: () =>
          `${received} is${isNot ? '' : ' not'} a valid directory!`,
      };
    }

    const receivedFileNames = (
      await glob(['**'], {
        cwd: receivedDirectoryPath,
        dot: true,
        onlyFiles: false,
      })
    )
      .map(receivedFileName => path.join(receivedFileName.replace(/\/$/, '')))
      .sort();

    const expectedFiles = Object.fromEntries(
      Object.entries(expected)
        .map(
          ([fileName, fileContent]) =>
            [path.join(fileName), fileContent] as const,
        )
        .sort(),
    );

    const expectedFileNames = Object.keys(expectedFiles);

    if (!equals(expectedFileNames, receivedFileNames, undefined, true)) {
      return {
        pass: false,
        expected: expectedFileNames,
        actual: receivedFileNames,
        message: () =>
          `directory ${received} does${isNot ? '' : ' not'} contain the expected files`,
      };
    }

    const receivedFiles = Object.fromEntries(
      await Promise.all(
        receivedFileNames.map(async receivedFileName => {
          const receivedFilePath = path.join(
            receivedDirectoryPath,
            receivedFileName,
          );

          if (await isDirectory(receivedFilePath)) {
            return [receivedFileName, null] as const;
          }

          return [
            receivedFileName,
            (
              await fs.readFile(receivedFilePath, {
                encoding: 'utf-8',
              })
            )
              .trim()
              .replaceAll('\r', ''),
          ] as const;
        }),
      ),
    );

    return {
      pass: equals(receivedFiles, expectedFiles, undefined, true),
      actual: receivedFiles,
      expected: expectedFiles,
      message: () =>
        `directory ${received} does${isNot ? '' : ' not'} contain expected files`,
    };
  },
});
