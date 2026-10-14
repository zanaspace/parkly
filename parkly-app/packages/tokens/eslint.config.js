import base from '@parkly/config/eslint';

export default [
  ...base,
  { ignores: ['dist/**'] },
  { files: ['build.mjs'], languageOptions: { globals: { console: 'readonly' } } },
];
