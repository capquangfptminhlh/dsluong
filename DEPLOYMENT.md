# AutoTax production deployment

Production source of truth is the `main` branch.

Workflow: `.github/workflows/deploy-vps.yml`

Deployment flow:

1. Secret/runtime-file gate.
2. Backend dependency + syntax validation.
3. Frontend production build.
4. Release archive creation.
5. SSH/SCP upload to VPS.
6. Application/code backup and SQLite snapshot while PM2 is stopped.
7. Install release into `/var/www/autotax` while preserving runtime databases, backups, uploads and `.env`.
8. Restart `autotax-backend` via PM2.
9. Require `http://127.0.0.1:3001/api/health` to return `{"status":"ok"}`.
10. Roll back application source automatically if the health gate fails.

Repository secrets supported by the workflow:

- `VPS_SSH_KEY` (preferred) or `VPS_PASSWORD`.
- Optional overrides: `VPS_HOST`, `VPS_PORT`, `VPS_USER`.

Default legacy target when optional overrides are absent: `/var/www/autotax`, PM2 process `autotax-backend`, API port `3001`.

Tax/database migrations are intentionally not executed automatically by this deployment workflow. Schema changes must use reviewed, versioned migrations with their own safety gate.
