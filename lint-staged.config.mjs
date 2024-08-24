/**
 * Generates a lint-staged configuration based on the given staged files.
 *
 * @param stagedFiles - An array of file paths of staged files.
 * @returns An array of commands to be executed by `lint-staged`.
 *
 * @type {import('lint-staged').Config}
 */
const lintStagedConfig = stagedFiles => {
	const quotedFileNames = stagedFiles
		.map(stagedFileName => `'${stagedFileName}'`)
		.join(' ');

	return [
		`prettier --ignore-unknown --write ${quotedFileNames}`,
		`eslint --fix --no-warn-ignored ${quotedFileNames}`
	];
};

export default lintStagedConfig;
