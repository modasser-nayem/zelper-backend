#!/bin/sh
set -e

echo "🚀 Starting Zelper Backend Docker Entrypoint..."

# Run Prisma schema push on Docker database container startup
if [ -n "$DATABASE_URL" ]; then
  echo "📦 Syncing Prisma Database Schema to Docker Database..."
  npx prisma db push --skip-generate || echo "⚠️ Warning: Prisma db push skipped or failed."
fi

echo "🟢 Starting Node.js Production Server..."
exec "$@"
