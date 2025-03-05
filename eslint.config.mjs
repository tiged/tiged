import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tsEslint from 'typescript-eslint';

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
  onTestFinished: false,
};

export default tsEslint.config(
  // `ignores` must be first.
  {
    name: 'ignores',
    ignores: [
      '**/dist/',
      '**/.yalc/',
      '**/build/',
      '**/lib/',
      '**/temp/',
      '**/.temp/',
      '**/.tmp/',
      '**/.yarn/',
      '**/coverage/',
    ],
  },
  { name: 'javascript', ...eslint.configs.recommended },
  ...tsEslint.configs.recommended,
  ...tsEslint.configs.stylistic,
  { name: 'prettier-config', ...prettierConfig },
  {
    name: 'main',
    languageOptions: {
      globals: {
        ...vitestGlobals,
      },
      parser: tsEslint.parser,
      parserOptions: {
        projectService: {
          defaultProject: './tsconfig.json',
        },
        ecmaVersion: 'latest',
      },
    },
    rules: {
      'no-undef': [0],
      '@typescript-eslint/consistent-type-imports': [
        2,
        { fixStyle: 'separate-type-imports', disallowTypeAnnotations: true },
      ],
      '@typescript-eslint/consistent-type-exports': [2],
      '@typescript-eslint/no-unused-vars': [0],
      '@typescript-eslint/no-explicit-any': [0],
      '@typescript-eslint/no-empty-object-type': [
        2,
        { allowInterfaces: 'with-single-extends' },
      ],
      'sort-imports': [
        2,
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: true,
        },
      ],
    },
    linterOptions: { reportUnusedDisableDirectives: 2 },
  },
);
