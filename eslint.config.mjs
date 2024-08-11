import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import fs from 'node:fs/promises';
import tsEslint from 'typescript-eslint';

const gitIgnoreFiles = (await fs.readFile('.gitignore', 'utf-8'))
	.trim()
	.split('\n');

/**
 * An object representing the globals provided by Vitest for use in testing.
 */
export const vitestGlobals = {
	suite: false,
	test: false,
	describe: false,
	it: false,
	expectTypeOf: false,
	assertType: false,
	expect: false,
	assert: false,
	vitest: false,
	vi: false,
	beforeAll: false,
	afterAll: false,
	beforeEach: false,
	afterEach: false,
	onTestFailed: false,
	onTestFinished: false
};

export default tsEslint.config(
	// `ignores` must be first.
	{ ignores: ['dist/', '.*', ...gitIgnoreFiles] },
	eslint.configs.recommended,
	...tsEslint.configs.recommended,
	...tsEslint.configs.stylistic,
	prettierConfig,
	{
		languageOptions: {
			globals: {
				...vitestGlobals
			},
			parser: tsEslint.parser,
			parserOptions: {
				project: true,
				ecmaVersion: 'latest'
			}
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': [
				2,
				{ fixStyle: 'separate-type-imports', disallowTypeAnnotations: false }
			],
			'@typescript-eslint/consistent-type-exports': [2],
			'@typescript-eslint/no-unused-vars': [0],
			'@typescript-eslint/no-explicit-any': [0],
			'@typescript-eslint/no-empty-interface': [
				2,
				{ allowSingleExtends: true }
			],
			'@typescript-eslint/no-unsafe-argument': [0],
			'@typescript-eslint/ban-types': [2],
			'@typescript-eslint/no-namespace': [
				2,
				{ allowDeclarations: true, allowDefinitionFiles: true }
			],
			'@typescript-eslint/ban-ts-comment': [0],
			'sort-imports': [
				2,
				{
					ignoreCase: false,
					ignoreDeclarationSort: true,
					ignoreMemberSort: false,
					memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
					allowSeparatedGroups: true
				}
			]
		},
		plugins: { '@typescript-eslint': tsEslint.plugin },
		linterOptions: { reportUnusedDisableDirectives: 2 }
	}
);
