The @sentry/hono SDK supports Hono 4+ across multiple runtimes. Select your runtime below to see the setup instructions.


Error Monitoring


Logs


Application Metrics


Tracing


Profiling




Install

Copy instructions
Install the @sentry/hono package and the @sentry/cloudflare peer dependency for Cloudflare Workers:
npm
yarn
pnpm

npm install @sentry/hono @sentry/cloudflare --save
Configure SDK

Copy DSN
Enable the nodejs_compat compatibility flag in your wrangler.jsonc. The SDK needs AsyncLocalStorage, which requires this flag:
jsonc
wrangler.jsonc

{
  "compatibility_flags": ["nodejs_compat"]
}
Add the sentry() middleware as early as possible in your Hono app. On Cloudflare, you pass your Sentry options directly to the middleware:
TypeScript
index.ts

import { Hono } from "hono";
import { sentry } from "@sentry/hono/cloudflare";

const app = new Hono();

app.use(
  sentry(app, {
    dsn: "https://b5f09550e77a1d06deeb4eb32d5bbc53@o4512463114600448.ingest.de.sentry.io/4512463133081680",
  }),
);

// Your routes here
app.get("/", (c) => {
  return c.text("Hello Hono!");
});

export default app;
To access environment variables from Worker Bindings (e.g. to store the DSN as a secret), pass a callback instead: sentry(app, (env) => (\{ dsn: env.SENTRY_DSN \})).
Upload Source Maps (Optional)

Control the Data You Send to Sentry (Optional)

Verify
Add a route that triggers an error to verify Sentry is working:

app.get("/debug-sentry", () => {
  throw new Error("My first Sentry error!");
});