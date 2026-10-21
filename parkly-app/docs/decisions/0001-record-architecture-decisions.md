# 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Product lead, engineering lead
- **Related:** doc 00 §3, AGENTS.md §9

## Context

Parkly is built in sprints, partly by coding agents that start with no memory of earlier decisions. Without written records, agents re-debate settled choices or quietly contradict them (for example by adding a second ORM or storing balances). Doc 00 holds the current canonical decisions but not the reasoning or history behind them.

## Decision

We record every significant architecture, provider, data-model, security or process decision as an ADR in `docs/decisions/`.

- Files are named `NNNN-short-kebab-title.md`, numbered sequentially, and never renumbered.
- Each ADR follows the template below.
- ADRs are immutable once Accepted. To change a decision, write a new ADR that supersedes the old one, and set the old one's status to `Superseded by NNNN`.
- If an ADR changes anything in doc 00 §3, update doc 00 in the same PR.
- An ADR is required for: new or replaced runtime dependencies of significance, external providers, data-model patterns, security controls, infra topology, and deviations from any doc in `docs/`.

## Consequences

- Agents and engineers can follow why the system looks the way it does.
- This adds a small amount of writing overhead per decision.
- Doc 00 stays short, and the history lives here.

## Planned ADRs (Sprint 0)

| No. | Title |
|---|---|
| 0002 | Supabase + Vercel as the MVP platform (Hono API, Drizzle, Supabase Auth/Storage, `pg_cron` + `pgmq`) — Accepted, written |
| 0003 | Monorepo with pnpm + Turborepo — Accepted |
| 0004 | Paystack split payments; no stored balances; Flutterwave fallback — Accepted, pending counsel |
| 0005 | Attendant app as offline-first PWA — Accepted |
| 0006 | Slot-row inventory with `SELECT FOR UPDATE` in `fn_hold_booking` — Proposed |
| 0007 | Offline QR: per-lot Ed25519 signed tokens + manifest sync |
| 0008 | Transactional outbox + `pgmq` for async side effects |
| 0009 | Capacity-count model (no numbered bays) for MVP |
| 0010 | Idempotency-key storage and replay semantics |
| 0011 | Feature flags in DB (no vendor) |
| 0012 | Data residency: Supabase Ireland region, NDPA transfer basis (pending counsel) |
| 0013 | Malware scanning for uploaded documents — Proposed, written (vendor to choose) |

The authoritative list with status is doc 01 §16.

---

## Template

```markdown
# NNNN — <Decision title>

- **Status:** Proposed | Accepted | Superseded by NNNN | Deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** <roles>
- **Related:** <doc sections, FR IDs, other ADRs>

## Context
<The problem, forces and constraints. Facts, not opinions.>

## Options considered
1. <Option A>: pros / cons
2. <Option B>: pros / cons

## Decision
<What we chose, stated plainly.>

## Consequences
<What becomes easier, what becomes harder, follow-up work, docs to update.>
```
