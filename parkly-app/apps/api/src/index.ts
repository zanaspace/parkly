// Vercel entry: Vercel's Hono preset looks for an entrypoint that imports `hono`
// and serves its default export as a Function.
import { Hono } from 'hono';
import './instrumentation.js';
import { bootstrap } from './bootstrap.js';

const { app } = bootstrap();

// OpenAPIHono extends Hono; fail the cold start loudly if that ever changes.
if (!(app instanceof Hono)) throw new Error('bootstrap() did not return a Hono app');

export default app;
