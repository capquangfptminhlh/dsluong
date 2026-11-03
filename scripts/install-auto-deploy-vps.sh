#!/usr/bin/env bash
set -Eeuo pipefail

# One-time installer. Run as root ON THE VPS from an existing AutoTax git checkout.
REPO="${1:-$(pwd)}"
LIVE_DIR="${AUTOTAX_LIVE_DIR:-/var/www/autotax}"
SOURCE_REPO="${AUTOTAX_SOURCE_REPO:-/opt/autotax-source}"

log(){ printf '[AUTOTAX AUTO DEPLOY INSTALL] %s\n' "$*"; }
fail(){ log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || fail 'Run as root (sudo)'
[ -d "$REPO/.git" ] || fail "Not a git checkout: $REPO"
command -v git >/dev/null || fail 'git missing'
command -v systemctl >/dev/null || fail 'systemd missing'
command -v flock >/dev/null || fail 'flock missing'

mkdir -p "$(dirname "$SOURCE_REPO")"
if [ "$REPO" != "$SOURCE_REPO" ]; then
  if [ -e "$SOURCE_REPO" ]; then
    fail "$SOURCE_REPO already exists. Set AUTOTAX_SOURCE_REPO to the existing checkout or remove the stale path."
  fi
  log "Moving source checkout to $SOURCE_REPO"
  mv "$REPO" "$SOURCE_REPO"
fi

# Verify the VPS itself can authenticate to the private repo before installing a timer.
log 'Verifying origin/main access from VPS'
git -C "$SOURCE_REPO" remote get-url origin >/dev/null
git -C "$SOURCE_REPO" fetch origin main

install -m 0755 "$SOURCE_REPO/scripts/auto-deploy-vps.sh" /usr/local/bin/autotax-auto-deploy
install -m 0644 "$SOURCE_REPO/deploy/systemd/autotax-auto-deploy.service" /etc/systemd/system/autotax-auto-deploy.service
install -m 0644 "$SOURCE_REPO/deploy/systemd/autotax-auto-deploy.timer" /etc/systemd/system/autotax-auto-deploy.timer

cat > /etc/autotax-auto-deploy.env <<EOF
AUTOTAX_SOURCE_REPO=$SOURCE_REPO
AUTOTAX_LIVE_DIR=$LIVE_DIR
AUTOTAX_DEPLOY_BRANCH=main
AUTOTAX_DEPLOY_REMOTE=origin
AUTOTAX_AUTO_DEPLOY_STATE=/var/lib/autotax-auto-deploy
AUTOTAX_AUTO_DEPLOY_LOCK=/run/lock/autotax-auto-deploy.lock
EOF
chmod 0600 /etc/autotax-auto-deploy.env

mkdir -p /var/lib/autotax-auto-deploy "$LIVE_DIR"
systemctl daemon-reload
systemctl enable --now autotax-auto-deploy.timer

log 'Starting first deploy immediately'
systemctl start autotax-auto-deploy.service

log 'Installer completed.'
log 'Status: systemctl status autotax-auto-deploy.service --no-pager'
log 'Timer:  systemctl list-timers autotax-auto-deploy.timer --no-pager'
log 'Logs:   journalctl -u autotax-auto-deploy.service -n 200 --no-pager'
