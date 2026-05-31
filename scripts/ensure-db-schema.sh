#!/usr/bin/env bash
# One-time / CI helper when the DB existed before Prisma Migrate was adopted.
# Applies idempotent column sync, then records the migration as applied.
set -euo pipefail
cd "$(dirname "$0")/.."

npx prisma db execute --file prisma/migrations/20260530120000_schema_sync/migration.sql
npx prisma migrate resolve --applied 20260530120000_schema_sync 2>/dev/null || true
npx prisma migrate deploy
