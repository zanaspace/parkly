## What and why

Refs: FR-___ / NFR-___ (doc 19) · Sprint S__ (doc 20)

## Test evidence

- [ ] Tests written first (red → green); `pnpm test` passes
- [ ] Integration/e2e added where the story is user-facing

## Security checklist (AGENTS.md §8)

- [ ] New endpoints: authN + policy check, RBAC matrix + cross-tenant tests
- [ ] Input validated with Zod; output serialised through a schema
- [ ] Idempotency and race conditions handled where required
- [ ] No secrets in code; new secrets in Vercel env (Sensitive) / Supabase Vault
- [ ] New tables: RLS enabled + `apiAccess()` policy; new SQL functions: pinned `search_path`, restricted `execute`
- [ ] New PII listed in doc 06; log redaction updated
- [ ] Privileged actions write `audit_logs`

## Migration notes

<!-- New migrations, expand/contract steps, backfills. "None" if none. -->

## Screenshots (UI)
