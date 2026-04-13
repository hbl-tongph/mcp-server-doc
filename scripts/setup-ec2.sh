#!/usr/bin/env bash
# =============================================================
# setup-ec2.sh — Cài đặt lần đầu trên EC2 (Amazon Linux 2023 / Ubuntu)
# Chạy 1 lần với: bash setup-ec2.sh
# =============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ec2-user/mcp-doc}"
LOG_DIR="/var/log/mcp-doc"
NODE_VERSION="22"

echo "=== 1. Install Node.js ${NODE_VERSION} via nvm ==="
if ! command -v node &>/dev/null; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VERSION"
  nvm alias default "$NODE_VERSION"
  nvm use default
else
  echo "Node already installed: $(node -v)"
fi

echo "=== 2. Install PM2 ==="
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
  pm2 startup | tail -1 | bash   # enable systemd autostart
else
  echo "PM2 already installed: $(pm2 -v)"
fi

echo "=== 3. Create app & log directories ==="
mkdir -p "$APP_DIR"
sudo mkdir -p "$LOG_DIR"
sudo chown "$(whoami)" "$LOG_DIR"

echo "=== 4. Create .env ==="
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
PORT=3000
AUTH_TOKEN=$(openssl rand -hex 32)
DB_PATH=$APP_DIR/db.sqlite
EOF
  echo "Created .env with random AUTH_TOKEN at $ENV_FILE"
  echo ""
  echo "  !! Lưu AUTH_TOKEN này vào GitHub Secret EC2_AUTH_TOKEN !!"
  cat "$ENV_FILE"
else
  echo ".env already exists, skipping."
fi

echo ""
echo "=== Setup complete ==="
echo "  App dir : $APP_DIR"
echo "  Log dir : $LOG_DIR"
echo ""
echo "Tiếp theo:"
echo "  1. Thêm các GitHub Secrets (xem README)"
echo "  2. Push code lên main để trigger deploy"
