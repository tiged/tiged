/**
 * @import { type GenerateTask } from 'lint-staged';
 */

/**
 * Generates a lint-staged configuration based on the given staged files.
 *
 * @param stagedFileNames - An array of file paths of staged files.
 * @returns An array of commands to be executed by `lint-staged`.
 *
 * @type {GenerateTask}
 */
const lintStagedConfig = (stagedFileNames = []) => {
  if (stagedFileNames.length === 0) {
    return [];
  }

  const quotedFileNames = stagedFileNames
    .map(stagedFileName => `'${stagedFileName}'`)
    .join(' ');

  return [
    `prettier --ignore-unknown --write ${quotedFileNames}`,
    `eslint --fix --no-warn-ignored ${quotedFileNames}`,
  ];
};

export default lintStagedConfig;
