#!/usr/bin/env bash
set -Eeuo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/autotax-deploy-agent"
SERVICE_FILE="/etc/systemd/system/autotax-deploy-agent.service"
HOST_IP="${AUTOTAX_DEPLOY_HOST_IP:-YOUR_VPS_IP}"
PORT="${AUTOTAX_DEPLOY_PORT:-9443}"

command -v node >/dev/null 2>&1 || { echo 'Node.js is required'; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo 'OpenSSL is required'; exit 1; }

install -d -m 700 "$INSTALL_DIR"
install -m 700 "$SRC_DIR/deploy-agent.js" "$INSTALL_DIR/deploy-agent.js"

if [ ! -s "$INSTALL_DIR/key.pem" ] || [ ! -s "$INSTALL_DIR/cert.pem" ]; then
  rm -f "$INSTALL_DIR/key.pem" "$INSTALL_DIR/cert.pem"
  openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 3650 \
    -keyout "$INSTALL_DIR/key.pem" \
    -out "$INSTALL_DIR/cert.pem" \
    -subj "/CN=$HOST_IP" \
    -addext "subjectAltName=IP:$HOST_IP"
fi
chmod 600 "$INSTALL_DIR/key.pem" "$INSTALL_DIR/cert.pem"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=AutoTax GitHub OIDC Deploy Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/deploy-agent.js
Restart=always
RestartSec=3
UMask=0077
Environment=AUTOTAX_DEPLOY_PORT=$PORT
Environment=AUTOTAX_DEPLOY_CERT=$INSTALL_DIR/cert.pem
Environment=AUTOTAX_DEPLOY_KEY=$INSTALL_DIR/key.pem
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now autotax-deploy-agent.service
sleep 1
systemctl is-active --quiet autotax-deploy-agent.service

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw allow "$PORT/tcp" comment 'AutoTax GitHub OIDC deploy' >/dev/null || true
fi

curl -kfsS --max-time 5 "https://127.0.0.1:$PORT/health" | grep -q '"status":"ok"'
echo "AutoTax deploy agent installed on port $PORT"
