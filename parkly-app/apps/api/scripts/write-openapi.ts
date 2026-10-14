// `pnpm contracts:openapi` — writes apps/api/openapi.json; CI fails if it differs from the commit.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { testApp } from '../src/test-helpers.js';

const doc = testApp().getOpenAPI31Document({
  openapi: '3.1.0',
  info: { title: 'Parkly API', version: '0.1.0' },
});
const out = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
