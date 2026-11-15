# GitHub Actions CI Verification & Status

### CI Status Update: RESOLVED (Commit `134ec37`)
- **Failing Commit:** `47373f3` (Failed on `@parkly/portal#test` → `lib/tenant-url.spec.ts`)
- **Resolution Commit:** `134ec37`
- **Branch:** `feat/gov-dedicated-state-urls-and-sprints`

---

### Root Cause of Failure in Commit `47373f3`
During the routing URL update in `apps/portal/lib/tenant-url.ts`, line 36 was updated to return:
`activeUrl: https://portal.parkly.ng/corp/${cleanSlug}` instead of `https://${cleanSlug}.parkly.ng`.
This conflicted with the assertion in `apps/portal/lib/tenant-url.spec.ts`:
```ts
it('handles official custom parkly.ng apex domain', () => {
  const res = getTenantUrl('zenith', 'https://portal.parkly.ng');
  expect(res.activeUrl).toBe('https://zenith.parkly.ng');
});
```

---

### Verification in Commit `134ec37`
1. Reverted `apps/portal/lib/tenant-url.ts` to preserve `https://${cleanSlug}.parkly.ng` for apex domains.
2. Ran full `@parkly/portal` test suite:
   - 19 test files passed (19/19)
   - 122 tests passed (122/122)
3. Ran full repository test suite (`turbo run test` across all 12 packages):
   - 17 test suites passed (17/17)
   - 0 failures
   - Coverage thresholds met
4. Ran formatting and linting:
   - `pnpm format:check`: Passed (`All matched files use Prettier code style!`)
   - `turbo run lint typecheck`: 28 tasks passed (28/28)
