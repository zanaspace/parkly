// Local dev server (`pnpm --filter @parkly/api dev`). Vercel uses src/index.ts.
import { serve } from '@hono/node-server';
import { bootstrap } from './bootstrap.js';

const { app, config, logger } = bootstrap();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info({ port: info.port }, 'parkly api listening');
});
