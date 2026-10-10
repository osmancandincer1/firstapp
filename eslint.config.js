// @ts-check
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

/** Scope a list of flat configs to a set of files. */
const scoped = (configs, files) => configs.map((c) => ({ ...c, files }));

module.exports = defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.expo/**',
    '**/.next/**',
    '**/dist/**',
    '**/coverage/**',
    'apps/mobile/android/**',
    'apps/mobile/ios/**',
    'apps/web/next-env.d.ts',
    'supabase/functions/**',
  ]),
  ...scoped(expoConfig, ['apps/mobile/**/*.{js,ts,tsx}', 'packages/**/*.{js,ts}']),
  {
    files: ['apps/mobile/**/*.{js,ts,tsx}', 'packages/**/*.{js,ts}'],
    settings: {
      'import/resolver': {
        typescript: { project: ['apps/mobile/tsconfig.json', 'packages/*/tsconfig.json'] },
      },
    },
    // i18next and similar libraries expose methods on their default export by design.
    rules: { 'import/no-named-as-default-member': 'off' },
  },
  {
    files: ['apps/web/**/*.{js,ts,tsx}'],
    extends: [
      require('eslint-config-next/core-web-vitals'),
      require('eslint-config-next/typescript'),
    ],
    settings: { next: { rootDir: 'apps/web/' } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/jest.setup.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['*.js', 'scripts/**/*.{js,mjs}', '**/jest.config.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  prettier,
]);
