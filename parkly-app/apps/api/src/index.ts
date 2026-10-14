// Vercel entry: Vercel detects the default-exported Hono app and serves it as a Function.
import './instrumentation.js';
import { bootstrap } from './bootstrap.js';

const { app } = bootstrap();

export default app;
