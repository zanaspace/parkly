import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >;

/**
 * Vercel's Hono preset compiles src/index.ts itself. If the build command also
 * compiles the API (writes dist/), Vercel deploys those files without the ESM
 * package.json and the function crashes on its first `import`. So the build
 * command builds only the API's workspace dependencies — this keeps that list
 * in step with package.json.
 */
describe('vercel.json build command', () => {
  const vercel = read('vercel.json') as { buildCommand: string };
  const pkg = read('package.json') as { dependencies: Record<string, string> };

  it('builds exactly the workspace packages the API depends on', () => {
    const filtered = [...vercel.buildCommand.matchAll(/--filter=(\S+)/g)].map((m) => m[1]).sort();
    const workspaceDeps = Object.keys(pkg.dependencies)
      .filter((d) => d.startsWith('@parkly/'))
      .sort();
    expect(filtered).toEqual(workspaceDeps);
  });

  it('never builds the API itself', () => {
    expect(vercel.buildCommand).not.toMatch(/@parkly\/api/);
  });
});
