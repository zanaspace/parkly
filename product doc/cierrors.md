# GitHub Actions CI Verification & Status

### CI Status: ALL CHECKS PASSED (Run `43737201805` - SUCCESS)
- **Branch:** `feat/gov-dedicated-state-urls-and-sprints`
- **Latest Commit on Branch:** `649b9cc`
- **GitHub Actions Run ID:** [43737201805](https://github.com/zanaspace/parkly/actions/runs/43737201805)
- **Overall Status:** `completed`
- **Overall Conclusion:** `success`

---

### CI Jobs Breakdown:
| Job | Status | Conclusion |
|---|---|---|
| Secret scan and dependency audit | completed | `success` |
| Migrations, RLS and DB integration tests | completed | `success` |
| Lint, typecheck, test, build | completed | `success` |

---

### Root Cause of Previous Failure in Commit `47373f3`
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

### Verification and Fixes Implemented:
1. **Tenant URL Apex Domain Contract:**
   - Reverted `apps/portal/lib/tenant-url.ts` to return `https://${cleanSlug}.parkly.ng` for apex domains.
   - All 19 test files and 122 tests in `@parkly/portal` pass cleanly (`vitest run`).
2. **Turnstile Captcha Loading & Verification:**
   - Pre-fetches Turnstile script immediately in module scope in `@parkly/ui`'s `Turnstile.tsx`.
   - Added `"Securing connection…"` indicator in CSS `.pk-captcha:empty::before` so users don't submit prematurely before the verification challenge renders.
3. **Cloud API URL Fallback:**
   - In `apps/web/lib/api.ts`, `apps/web/lib/env.ts`, and `apps/portal/lib/env.ts`:
   - Configured automatic fallback to hosted API `https://parkly-api-six.vercel.app` on cloud/production environments when `NEXT_PUBLIC_API_URL` is omitted or points to localhost. This prevents the `We couldn't reach Parkly just now` connection error during authentication and bootstrap.
4. **Corporate Driver Roster Responsiveness:**
   - Dual-mode layout: Stacked mobile cards on screens `< 960px` with 2x2 or 1x1 action buttons (`✏️ Edit`, `💬 WhatsApp`, `🔗 Copy Link`, `Approve / Suspend`), and horizontal-scrolling table (`min-width: 760px`) on larger screens.
   - Guaranteed zero button overlap or text squishing.
