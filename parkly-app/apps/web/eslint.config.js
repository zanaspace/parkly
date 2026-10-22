import next from '@next/eslint-plugin-next';
import base from '@parkly/config/eslint';

export default [
  ...base,
  // public/maplibre holds MapLibre's own worker, copied from node_modules.
  { ignores: ['.next/**', 'next-env.d.ts', 'public/maplibre/**'] },
  {
    plugins: { '@next/next': next },
    rules: { ...next.configs.recommended.rules, ...next.configs['core-web-vitals'].rules },
  },
];
