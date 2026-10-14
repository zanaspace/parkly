import next from '@next/eslint-plugin-next';
import base from '@parkly/config/eslint';

export default [
  ...base,
  { ignores: ['.next/**', 'next-env.d.ts'] },
  {
    plugins: { '@next/next': next },
    rules: { ...next.configs.recommended.rules, ...next.configs['core-web-vitals'].rules },
  },
];
