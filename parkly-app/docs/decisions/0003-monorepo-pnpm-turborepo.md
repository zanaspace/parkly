# 0003 — Monorepo with pnpm + Turborepo

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Engineering lead
- **Related:** doc 00 §4, ADR 0002

## Context

Parkly has five apps (API, driver mobile, driver web, operator portal + attendant PWA, admin) that must share contracts, domain rules, design tokens and DB types. Drift between hand-copied types is a known source of payment and booking bugs.

## Options considered

1. **Polyrepo:** independent release cycles, but shared code needs publishing and versioning; types drift.
2. **pnpm workspaces + Turborepo (chosen):** one lockfile, strict dependency isolation, cached task graph, first-class on Vercel.
3. **Nx:** more features (generators, module boundaries), heavier config for a small team.

## Decision

- pnpm 10 workspaces (`apps/*`, `packages/*`), versions pinned exactly, `packageManager` set in the root `package.json`.
- Turborepo runs `build`, `lint`, `typecheck`, `test` with `^build` dependencies; packages build to `dist/` with `tsc`.
- pnpm's dependency install scripts are blocked except an allowlist (`onlyBuiltDependencies`) — supply-chain control (doc 05).
- Shared code: `@parkly/contracts`, `@parkly/domain`, `@parkly/db`, `@parkly/tokens`, `@parkly/ui`, `@parkly/ui-native`, `@parkly/config`.

## Consequences

- One PR can change a contract and every consumer together.
- CI installs once and caches; remote cache can be added via Vercel later.
- Packages must be built before apps typecheck against them (`turbo` handles order; locally run `pnpm build` once after install).
