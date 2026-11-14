# Disaster Recovery Runbook (DR-001)

> **Document:** DR Runbook & Tabletop Procedure  
> **Reference:** PRD §7 (`NFR-AVAIL-002`), Doc 01 §11 (DR Architecture), Doc 06 §7 (Post-restore Erasure Replay)  
> **Service Level Targets:** RPO ≤ 15 minutes · RTO ≤ 4 hours · Zero NDPA erasure regressions  
> **Last Verified:** Sprint 10 Drill (14 Nov 2026)

---

## 1. Objectives & Scope

This runbook defines the emergency response for catastrophic data loss, database corruption, or regional cloud outage affecting the primary database on Supabase (`parkly-prod`).

### Targets
* **Recovery Point Objective (RPO):** Maximum data loss window ≤ 15 minutes.
* **Recovery Time Objective (RTO):** Total time from incident declaration to traffic resumption ≤ 4 hours.
* **Privacy Invariant:** Any data subject erased prior to the restore timestamp MUST be re-erased immediately via `scripts/reapply-erasures.ts` before public traffic resumes.

---

## 2. Emergency Contacts & Roles

| Role | Contact | Primary Responsibility |
| :--- | :--- | :--- |
| **Incident Commander (IC)** | Lead Engineer / On-call | Coordinates restore, approves failover decision |
| **Database Lead** | Infrastructure Engineer | Executes PITR or off-platform dump restore |
| **App Lead** | Backend / Full-stack Eng | Configures Vercel env vars & points Preview/Prod |
| **Compliance Officer / DPO** | Legal / DPO | Verifies `erasure_log` replay before traffic open |

---

## 3. Disaster Recovery Scenarios

### Scenario A: Supabase Platform Intact (Point-In-Time Restore — Fast Path)
*Estimated RTO: 30–45 minutes | RPO: 0–5 minutes*

1. **Declare Incident:** Freeze incoming API mutations by deploying maintenance mode or setting rate limit to 0 on Vercel WAF.
2. **Access Supabase Dashboard:**
   * Navigate to `parkly-prod` -> **Database** -> **Backups** -> **Point in Time (PITR)**.
3. **Select Timestamp:**
   * Choose the point in time immediately preceding the corruption or incident (e.g. `YYYY-MM-DD HH:MM:00 UTC`).
4. **Trigger PITR Clone:**
   * Supabase restores the database to a new project or current instance.
5. **Reapply Erasures (CRITICAL):**
   * Run the post-restore erasure script:
     ```bash
     cd parkly-app
     DATABASE_URL="<restored-db-connection-string>" pnpm tsx scripts/reapply-erasures.ts
     ```
   * Confirm output shows all records in `erasure_log` have been scrubbed.
6. **Health Check & Verification:**
   * Run `pnpm test:integration` against the restored database.
   * Run `curl -fsS https://<api-domain>/health/ready` to verify connectivity.
7. **Switch Vercel Connection:**
   * Update `DATABASE_URL` in Vercel production environment variables.
   * Redeploy API project.

---

### Scenario B: Complete Supabase Platform Outage (Off-Platform Cold Restore)
*Estimated RTO: 90–120 minutes | RPO: ≤ 24 hours (nightly backup)*

1. **Retrieve Encrypted Off-Platform Backup:**
   * Backups are stored in the dedicated S3/R2 bucket configured in `.github/workflows/nightly-backup.yml`.
   * Download the latest nightly backup archive:
     ```bash
     aws s3 cp s3://$BACKUP_S3_BUCKET/db/latest.sql.gz.age ./backup.sql.gz.age
     ```
2. **Decrypt using `age` Key:**
   * Decrypt using the private key stored in the secure password manager / break-glass vault:
     ```bash
     age --decrypt -i age-private-key.txt backup.sql.gz.age | gzip -d > restore.sql
     ```
3. **Provision Target PostgreSQL Instance:**
   * Spin up a new PostgreSQL 17 instance on backup provider (AWS RDS, Neon, or secondary Supabase region in Frankfurt/London).
4. **Apply Schema & Data:**
   ```bash
   psql "$TARGET_DATABASE_URL" < restore.sql
   ```
5. **Reapply Erasures (MANDATORY):**
   ```bash
   DATABASE_URL="$TARGET_DATABASE_URL" pnpm tsx scripts/reapply-erasures.ts
   ```
6. **Point Vercel Preview / Production:**
   * Update Vercel environment variables with the new database host.
   * Run smoke tests via Vercel Preview before routing production domain.
7. **Post-Mortem & Log Update:**
   * Document RPO and RTO achieved, issues encountered, and publish post-mortem to the team within 48 hours.
