#!/usr/bin/env bash
# Roda os testes de integração contra o banco descartável apihub_test (mesmo
# servidor do DATABASE_URL), nunca contra o banco real.
set -euo pipefail
cd "$(dirname "$0")/.."
source ~/.nvm/nvm.sh
set -a; source .env; set +a

TEST_URL=$(node scripts/_setup-test-db.mjs | grep '^TEST_DATABASE_URL=' | cut -d= -f2-)
echo "[integration] migrando apihub_test..."
DATABASE_URL="$TEST_URL" npx drizzle-kit migrate 2>&1 | tail -2
echo "[integration] rodando testes..."
DATABASE_URL="$TEST_URL" npm run test:integration
