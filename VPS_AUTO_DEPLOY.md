# AutoTax VPS-native auto deploy

This is the production fallback/replacement path when GitHub Actions is unavailable because of billing or platform issues.

## What it does

Every 60 seconds the VPS:

1. `git fetch origin main`
2. compares `origin/main` with `/var/www/autotax/.deployed-sha`
3. creates a clean detached worktree for the exact new SHA
4. runs `scripts/verify-editorial-release.mjs`
5. audits/checks backend dependencies and syntax
6. runs frontend `npm ci`, audit, lint and production build
7. enforces JS bundle budgets
8. packages backend + `frontend/dist`
9. installs through the existing transactional `scripts/deploy-vps.sh`
10. preserves runtime DB/uploads/.env, restarts PM2, performs health checks and rolls back on failure
11. writes `.deployed-sha` and `frontend/dist/release.json` only after a healthy deployment

This means blog HTML, sitemap, UI, mobile assets and backend source from the same `main` SHA are released together.

## One-time installation on VPS

Prerequisites: the VPS must already have `git`, Node.js/npm, PM2, systemd and an authenticated checkout of this private repository whose `git fetch origin main` works without interactive input. Use an SSH deploy key or another VPS-side Git credential. Do not commit credentials to the repository.

From the existing AutoTax checkout on the VPS:

```bash
git fetch origin main
git reset --hard origin/main
sudo bash scripts/install-auto-deploy-vps.sh "$(pwd)"
```

The installer moves the checkout to `/opt/autotax-source` by default, installs the service/timer, enables it and runs the first deployment immediately.

If the checkout is already at `/opt/autotax-source`:

```bash
cd /opt/autotax-source
git fetch origin main
git reset --hard origin/main
sudo bash scripts/install-auto-deploy-vps.sh /opt/autotax-source
```

## Verify

```bash
systemctl status autotax-auto-deploy.service --no-pager
systemctl list-timers autotax-auto-deploy.timer --no-pager
journalctl -u autotax-auto-deploy.service -n 200 --no-pager
cat /var/www/autotax/.deployed-sha
cat /var/www/autotax/frontend/dist/release.json
```

The deployed SHA must equal the current `origin/main` SHA and `release.json` must contain `"status":"healthy"`.

## Manual immediate deploy

The timer normally polls every minute. To deploy immediately:

```bash
sudo systemctl start autotax-auto-deploy.service
journalctl -u autotax-auto-deploy.service -f
```

## Configuration

`/etc/autotax-auto-deploy.env` controls:

- `AUTOTAX_SOURCE_REPO` (default `/opt/autotax-source`)
- `AUTOTAX_LIVE_DIR` (default `/var/www/autotax`)
- `AUTOTAX_DEPLOY_BRANCH` (default `main`)
- `AUTOTAX_DEPLOY_REMOTE` (default `origin`)
- state and lock paths

Never put GitHub credentials in the repository. Configure private-repo authentication at the OS/git level on the VPS.
