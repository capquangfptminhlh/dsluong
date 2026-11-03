#!/usr/bin/env bash
set -Eeuo pipefail

# AutoTax VPS-native deployer. It polls origin/main from the VPS itself and uses
# the existing transactional deploy-vps.sh for install/rollback/health checks.
SOURCE_REPO="${AUTOTAX_SOURCE_REPO:-/opt/autotax-source}"
LIVE_DIR="${AUTOTAX_LIVE_DIR:-/var/www/autotax}"
BRANCH="${AUTOTAX_DEPLOY_BRANCH:-main}"
REMOTE="${AUTOTAX_DEPLOY_REMOTE:-origin}"
STATE_DIR="${AUTOTAX_AUTO_DEPLOY_STATE:-/var/lib/autotax-auto-deploy}"
LOCK_FILE="${AUTOTAX_AUTO_DEPLOY_LOCK:-/run/lock/autotax-auto-deploy.lock}"
LOG_PREFIX='[AUTOTAX AUTO DEPLOY]'

log(){ printf '%s %s\n' "$LOG_PREFIX" "$*"; }
fail(){ log "ERROR: $*"; exit 1; }
cleanup(){
  if [ -n "${WORKTREE:-}" ] && [ -d "${WORKTREE:-}" ]; then
    git -C "$SOURCE_REPO" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || rm -rf "$WORKTREE"
  fi
}
trap cleanup EXIT

mkdir -p "$STATE_DIR" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log 'Another deploy is already running; skip.'
  exit 0
fi

command -v git >/dev/null || fail 'git is required'
command -v node >/dev/null || fail 'node is required'
command -v npm >/dev/null || fail 'npm is required'
command -v tar >/dev/null || fail 'tar is required'
[ -d "$SOURCE_REPO/.git" ] || fail "Git checkout missing at $SOURCE_REPO"

log "Fetching ${REMOTE}/${BRANCH}"
# Authentication is intentionally delegated to the VPS git credential/deploy-key setup.
git -C "$SOURCE_REPO" fetch --prune "$REMOTE" "$BRANCH"
TARGET_SHA="$(git -C "$SOURCE_REPO" rev-parse "${REMOTE}/${BRANCH}")"
[ -n "$TARGET_SHA" ] || fail 'Could not resolve target SHA'

DEPLOYED_SHA=''
if [ -f "$LIVE_DIR/.deployed-sha" ]; then DEPLOYED_SHA="$(tr -d '\r\n ' < "$LIVE_DIR/.deployed-sha")"; fi
if [ "$TARGET_SHA" = "$DEPLOYED_SHA" ]; then
  log "Already deployed: $TARGET_SHA"
  exit 0
fi

log "New release detected: ${DEPLOYED_SHA:-none} -> $TARGET_SHA"
WORKTREE="$STATE_DIR/worktree-$TARGET_SHA"
rm -rf "$WORKTREE"
git -C "$SOURCE_REPO" worktree add --detach "$WORKTREE" "$TARGET_SHA" >/dev/null

test "$(git -C "$WORKTREE" rev-parse HEAD)" = "$TARGET_SHA" || fail 'Worktree SHA mismatch'

log 'Running editorial/K0 preflight'
(
  cd "$WORKTREE"
  node scripts/verify-editorial-release.mjs
)

log 'Validating backend syntax and production dependency lock'
(
  cd "$WORKTREE/backend"
  npm ci --omit=dev
  npm audit --omit=dev --audit-level=low
  node --check server.js
  node --check runtimeSchema.js
  node --check inventoryCompatibility.js
  node --check posIntegritySchema.js
  node --check sqliteCompat.js
  find routes middleware utils -type f -name '*.js' -print0 | xargs -0 -n1 node --check
)

log 'Building frontend'
(
  cd "$WORKTREE/frontend"
  npm ci
  npm audit --audit-level=low
  npm run lint
  npm run build

  ENTRY="$(find dist/assets -maxdepth 1 -type f -name 'index-*.js' | head -n 1)"
  [ -n "$ENTRY" ] || fail 'Frontend entry bundle not found'
  ENTRY_BYTES="$(stat -c%s "$ENTRY")"
  [ "$ENTRY_BYTES" -le 500000 ] || fail "Entry bundle budget exceeded: $ENTRY_BYTES"
  while IFS= read -r file; do
    BYTES="$(stat -c%s "$file")"
    [ "$BYTES" -le 550000 ] || fail "Chunk budget exceeded: $file ($BYTES)"
  done < <(find dist/assets -maxdepth 1 -type f -name '*.js' -print)
)

test -f "$WORKTREE/frontend/dist/index.html" || fail 'Frontend dist missing'
ARCHIVE="$STATE_DIR/autotax-release-$TARGET_SHA.tar.gz"
rm -f "$ARCHIVE"
log 'Creating release archive'
tar \
  --exclude='backend/node_modules' \
  --exclude='backend/*.db' --exclude='backend/*.db-wal' --exclude='backend/*.db-shm' --exclude='backend/*.sqlite' \
  --exclude='backend/backups' --exclude='backend/uploads' --exclude='backend/tmp-upload' --exclude='backend/.env' \
  -czf "$ARCHIVE" -C "$WORKTREE" backend frontend/dist scripts/deploy-vps.sh

log 'Installing release with transactional rollback protection'
AUTOTAX_LIVE_DIR="$LIVE_DIR" bash "$WORKTREE/scripts/deploy-vps.sh" "$TARGET_SHA" "$ARCHIVE"

# deploy-vps.sh writes both .deployed-sha and frontend/dist/release.json after health PASS.
ACTUAL_SHA="$(tr -d '\r\n ' < "$LIVE_DIR/.deployed-sha")"
[ "$ACTUAL_SHA" = "$TARGET_SHA" ] || fail "Post-deploy SHA mismatch: $ACTUAL_SHA"
node -e '
const fs=require("fs");
const p=process.argv[1], expected=process.argv[2];
const j=JSON.parse(fs.readFileSync(p,"utf8"));
if(j.sha!==expected||j.status!=="healthy") throw new Error(`release marker mismatch: ${JSON.stringify(j)}`);
' "$LIVE_DIR/frontend/dist/release.json" "$TARGET_SHA"

printf '%s\n' "$TARGET_SHA" > "$STATE_DIR/last-success-sha"
date -Is > "$STATE_DIR/last-success-at"
log "LIVE VERIFIED LOCALLY: $TARGET_SHA"
