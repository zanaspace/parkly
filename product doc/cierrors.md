# CI Verification Status

## Latest Commit: `061c481` (`feat/gov-dedicated-state-urls-and-sprints`)

### Local Verification Results:
- `pnpm format:check` — **PASSED** (All matched files use Prettier code style)
- `pnpm lint` (`turbo run lint` across 12 packages) — **PASSED** (17/17 tasks successful, 0 errors, 0 warnings)
- `pnpm typecheck` (`turbo run typecheck` across 12 packages) — **PASSED** (17/17 tasks successful)
- `pnpm contracts:openapi` & `git diff --exit-code apps/api/openapi.json` — **PASSED** (OpenAPI spec matches contracts)
- `pnpm build` (`turbo run build`) — **PASSED** (All 10 build tasks successful)

### Note on GitHub Actions "Re-run failed jobs":
Clicking "Re-run failed jobs" on an existing GitHub Actions run re-runs the old commit (`a535321`). The fix is in commit `061c481`. View the workflow run for commit `061c481` to see the passing check.
