#!/usr/bin/env bash
set -Eeuo pipefail

SHA="${1:?Missing release SHA}"
ARCHIVE="${2:?Missing release archive}"
LIVE_DIR="${AUTOTAX_LIVE_DIR:-/var/www/autotax}"
PM2_NAME="${AUTOTAX_PM2_NAME:-autotax-backend}"
HEALTH_URL="${AUTOTAX_HEALTH_URL:-http://127.0.0.1:3001/api/health}"
DEPLOY_ROOT="$LIVE_DIR/.deploy"
RUN_TOKEN="${SHA}-$(date +%s%N)-$$"
RELEASE_DIR="$DEPLOY_ROOT/$RUN_TOKEN"
BACKUP_ROOT="$LIVE_DIR/.deploy-backups"
BACKUP_DIR="$BACKUP_ROOT/$RUN_TOKEN"
OLD_NODE_MODULES="$BACKUP_DIR/node_modules.previous"
ARTICLE_PATH="$LIVE_DIR/frontend/dist/blog/muc-ton-kho-toi-thieu-diem-dat-hang-lai/index.html"
ARTICLE_CANONICAL='https://autotaxpos.com/blog/muc-ton-kho-toi-thieu-diem-dat-hang-lai/'

log() { printf '[AUTOTAX DEPLOY] %s\n' "$*"; }
fail() { log "ERROR: $*"; exit 1; }

[ -f "$ARCHIVE" ] || fail "Release archive not found: $ARCHIVE"
command -v node >/dev/null 2>&1 || fail "Node.js is not installed"
command -v npm >/dev/null 2>&1 || fail "npm is not installed"
command -v pm2 >/dev/null 2>&1 || fail "PM2 is not installed"
command -v curl >/dev/null 2>&1 || fail "curl is not installed"

mkdir -p "$RELEASE_DIR" "$BACKUP_DIR" "$LIVE_DIR/backend" "$LIVE_DIR/frontend"
tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"

[ -f "$RELEASE_DIR/backend/server.js" ] || fail "backend/server.js missing in release"
[ -f "$RELEASE_DIR/backend/package.json" ] || fail "backend/package.json missing in release"
[ -f "$RELEASE_DIR/backend/package-lock.json" ] || fail "backend/package-lock.json missing in release"
[ -f "$RELEASE_DIR/frontend/dist/index.html" ] || fail "frontend/dist/index.html missing in release"

check_sqlite_driver() {
  node - <<'NODE'
const Database = require('better-sqlite3');
const db = new Database(':memory:');
const row = db.prepare('SELECT 1 AS ok').get();
if (!row || row.ok !== 1) throw new Error('better-sqlite3 self-check returned unexpected result');
db.close();
console.log('better-sqlite3 v13 N-API binding OK');
NODE
}

log "Preparing backend dependencies before touching the live app"
(
  cd "$RELEASE_DIR/backend"
  npm ci --omit=dev
  npm audit --omit=dev --audit-level=low
  node -e "const p=require('better-sqlite3/package.json'); if(p.version!=='13.0.1') throw new Error('Unexpected better-sqlite3 '+p.version); console.log('better-sqlite3', p.version)"
  if npm ls prebuild-install --all >/tmp/autotax-prebuild-tree.txt 2>&1; then
    cat /tmp/autotax-prebuild-tree.txt
    fail "Deprecated prebuild-install returned to production dependencies"
  fi
  check_sqlite_driver || fail "better-sqlite3 v13 N-API binary is incompatible with this VPS"
)

log "Backing up current application source"
if [ -d "$LIVE_DIR/backend" ] || [ -d "$LIVE_DIR/frontend/dist" ]; then
  tar \
    --exclude='backend/node_modules' \
    --exclude='backend/*.db' \
    --exclude='backend/*.db-wal' \
    --exclude='backend/*.db-shm' \
    --exclude='backend/*.sqlite' \
    --exclude='backend/backups' \
    --exclude='backend/uploads' \
    --exclude='backend/tmp-upload' \
    --exclude='backend/.env' \
    -czf "$BACKUP_DIR/app-source.tar.gz" \
    -C "$LIVE_DIR" backend frontend 2>/dev/null || true
fi

log "Stopping backend for a consistent SQLite snapshot"
pm2 stop "$PM2_NAME" >/dev/null 2>&1 || true

for f in "$LIVE_DIR"/backend/*.db "$LIVE_DIR"/backend/*.db-wal "$LIVE_DIR"/backend/*.db-shm "$LIVE_DIR"/backend/*.sqlite; do
  if [ -f "$f" ]; then
    cp -a "$f" "$BACKUP_DIR/"
  fi
done

rm -rf "$OLD_NODE_MODULES"
if [ -d "$LIVE_DIR/backend/node_modules" ]; then
  mv "$LIVE_DIR/backend/node_modules" "$OLD_NODE_MODULES"
fi

pm2_diagnostics() {
  log "PM2 status before rollback"
  pm2 describe "$PM2_NAME" 2>&1 || true
  log "Recent backend logs before rollback"
  pm2 logs "$PM2_NAME" --lines 120 --nostream 2>&1 || true
}

wait_for_health() {
  local attempts="${1:-20}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 5 "$HEALTH_URL" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  log "Health check failed; rolling application source and dependencies back"
  pm2 stop "$PM2_NAME" >/dev/null 2>&1 || true
  rm -rf "$LIVE_DIR/backend/node_modules"
  if [ -d "$OLD_NODE_MODULES" ]; then
    mv "$OLD_NODE_MODULES" "$LIVE_DIR/backend/node_modules"
  fi
  if [ -f "$BACKUP_DIR/app-source.tar.gz" ]; then
    find "$LIVE_DIR/backend" -mindepth 1 -maxdepth 1 \
      ! -name 'node_modules' ! -name 'backups' ! -name 'uploads' ! -name 'tmp-upload' ! -name '.env' \
      ! -name '*.db' ! -name '*.db-wal' ! -name '*.db-shm' ! -name '*.sqlite' \
      -exec rm -rf {} +
    rm -rf "$LIVE_DIR/frontend/dist"
    tar -xzf "$BACKUP_DIR/app-source.tar.gz" -C "$LIVE_DIR"
  fi
  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_NAME" >/dev/null
    if wait_for_health 15; then
      log "Rollback health check passed"
    else
      log "CRITICAL: rollback completed but the restored application is still unhealthy"
      pm2_diagnostics
    fi
  else
    log "PM2 process $PM2_NAME does not exist; manual recovery required"
  fi
  pm2 save >/dev/null 2>&1 || true
  exit 1
}

verify_live_release() {
  local release_file="$LIVE_DIR/frontend/dist/release.json"
  local h1_count

  [ -f "$release_file" ] || fail "Live release marker missing after deployment"
  RELEASE_FILE="$release_file" EXPECTED_SHA="$SHA" node - <<'NODE'
const fs = require('fs');
const marker = JSON.parse(fs.readFileSync(process.env.RELEASE_FILE, 'utf8'));
if (marker.sha !== process.env.EXPECTED_SHA || marker.status !== 'healthy') {
  throw new Error(`Unexpected live release marker: ${JSON.stringify(marker)}`);
}
NODE

  [ -f "$ARTICLE_PATH" ] || fail "Published article missing from live frontend"
  grep -Fq "<link rel=\"canonical\" href=\"${ARTICLE_CANONICAL}\"" "$ARTICLE_PATH" \
    || fail "Published article canonical mismatch"
  h1_count="$(grep -Eoi '<h1([[:space:]]|>)' "$ARTICLE_PATH" | wc -l | tr -d ' ')"
  [ "$h1_count" = '1' ] || fail "Published article must contain exactly one H1; found $h1_count"

  [ -f "$LIVE_DIR/frontend/dist/index.html" ] || fail "Live frontend index missing"
  find "$LIVE_DIR/frontend/dist/assets" -maxdepth 1 -type f -name 'POS-*.js' -print -quit | grep -q . \
    || fail "POS production bundle missing"
  log "Live release files verified for exact SHA: $SHA"
}

log "Installing release into live directory"
find "$LIVE_DIR/backend" -mindepth 1 -maxdepth 1 \
  ! -name 'node_modules' ! -name 'backups' ! -name 'uploads' ! -name 'tmp-upload' ! -name '.env' \
  ! -name '*.db' ! -name '*.db-wal' ! -name '*.db-shm' ! -name '*.sqlite' \
  -exec rm -rf {} +

mv "$RELEASE_DIR/backend/node_modules" "$LIVE_DIR/backend/node_modules"
cp -a "$RELEASE_DIR/backend/." "$LIVE_DIR/backend/"
rm -rf "$LIVE_DIR/frontend/dist"
mkdir -p "$LIVE_DIR/frontend"
cp -a "$RELEASE_DIR/frontend/dist" "$LIVE_DIR/frontend/dist"

log "Restarting PM2 process"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" >/dev/null
else
  rollback
fi
pm2 save >/dev/null 2>&1 || true

log "Waiting for health check: $HEALTH_URL"
if ! wait_for_health 20; then
  pm2_diagnostics
  rollback
fi

log "Deployment healthy"
printf '%s\n' "$SHA" > "$LIVE_DIR/.deployed-sha"
printf '{"sha":"%s","status":"healthy"}\n' "$SHA" > "$LIVE_DIR/frontend/dist/release.json"
# deploy-agent.service runs with UMask=0077. These two files are non-secret
# deployment markers and must be readable by the Nginx worker and the
# non-root self-hosted verification runner. Without this chmod Nginx returns 403.
chmod 0644 "$LIVE_DIR/.deployed-sha" "$LIVE_DIR/frontend/dist/release.json"
verify_live_release

rm -rf "$OLD_NODE_MODULES"
if [ -d "$BACKUP_ROOT" ]; then
  ls -1dt "$BACKUP_ROOT"/* 2>/dev/null | tail -n +6 | xargs -r rm -rf
fi
rm -rf "$RELEASE_DIR"
if [ -d "$DEPLOY_ROOT" ]; then
  find "$DEPLOY_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +1 -exec rm -rf {} + 2>/dev/null || true
fi
rm -f "$ARCHIVE"
log "DONE: $SHA"
