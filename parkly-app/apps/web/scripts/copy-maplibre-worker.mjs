// MapLibre 6 runs map parsing in a module worker loaded from its own file.
// Next does not serve files from node_modules, so copy the worker into public/
// on every dev start and build, keeping it in step with the installed version.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = join(
  dirname(require.resolve('maplibre-gl/package.json')),
  'dist',
  'maplibre-gl-worker.mjs',
);
const target = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'maplibre',
  'maplibre-gl-worker.mjs',
);
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
