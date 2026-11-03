# AutoTax Final Commercial Release Audit

## Release definition

AutoTax may be marked **100/100 for the current commercial release checklist** only when all conditions below are true on the same release candidate tree:

1. No open P0/P1 commercial blocker is known.
2. The existing Full Quality Gate passes all backend, business, tax, browser, responsive and UI checks.
3. The Extended Commercial Release Gate passes all previously dormant and newly-added security/integrity checks.
4. The merge commit on `main` passes both gates again.
5. The VPS deployment succeeds through build, dependency audit, bundle budget, release archive, OIDC deployment and post-deploy health verification.
6. No release PR remains open after deployment.

This checklist is a release-quality verdict, not a claim that software can never contain a future defect.

## P0 findings resolved by this audit

### Full-system backup boundary

- Full SQLite backup/restore is platform-wide data.
- Normal tenant owners must never create, list, download, delete or restore the whole-system database.
- All full-system backup endpoints are superadmin-only.
- Mandatory regression: `smoke-backup-access-integrity.mjs`.

### Presence and server-wide tunnel boundary

- Presence identity comes only from the authenticated token, never client-supplied phone/name.
- Online presence is isolated by tenant.
- The Cloudflare Tunnel process is server-wide and therefore superadmin-only.
- Mandatory regression: `smoke-system-boundary-integrity.mjs`.

### JWT fail-closed configuration

- The backend must never sign tokens with a predictable fallback secret.
- Missing, weak or historical default JWT secrets prevent auth/server startup.
- Mandatory regression: `smoke-security-config.mjs`.

### Public superadmin escalation

- Public tenant registration always creates `owner`.
- No phone number, including the historical platform-admin phone, can mint superadmin authority through `/auth/register`.
- Superadmin provisioning is out-of-band only; existing superadmin DB roles remain valid on login.
- Mandatory regression: `smoke-public-admin-escalation.mjs`.

### Platform-only frontend surfaces

- Backup, Cloudflare tunnel controls and platform user administration are hidden/guarded for normal tenants in addition to backend authorization.
- Direct frontend navigation to platform-only routes redirects non-superadmins.
- Mandatory regression: `smoke-platform-ui-boundaries.mjs`.

## Extended commercial matrix

The Extended Commercial Release Gate also makes these existing integrity tests mandatory instead of leaving them as dormant scripts:

- commission tenant/order/idempotency integrity;
- staff write boundaries, HRM and shift controls;
- loyalty lifecycle;
- omnichannel, encrypted secret settings and promotion permissions;
- AI credential encryption and tenant isolation;
- deterministic business-date behavior;
- full-system backup authorization;
- system presence/platform boundary;
- frontend platform-only boundary;
- JWT configuration fail-closed behavior;
- public registration privilege-escalation prevention.

Each stateful smoke executes in its own isolated backend workspace, SQLite database and port to prevent cross-test contamination.

## Production acceptance

The final acceptance evidence belongs to the workflow runs for the exact release candidate and its resulting `main` merge commit. A release is not accepted based on an older SHA, a queued workflow, a partial PASS, or a successful build without successful deployment health verification.
