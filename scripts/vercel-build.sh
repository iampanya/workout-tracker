#!/bin/sh
# Vercel runs `npm run vercel-build` instead of `build` when it exists.
# Production deploys apply pending Prisma migrations before building; preview deploys never touch
# the DB. Migrations must be backward-compatible (expand/contract): the previous deployment keeps
# serving traffic against the migrated DB until this build goes live, and a failed build after
# a successful migrate leaves the DB one step ahead of the code.
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  # prisma.config.ts falls back to DATABASE_URL (the pooled :6543 URL, which can't run migrations)
  # when DIRECT_URL is unset — fail loudly instead.
  if [ -z "$DIRECT_URL" ]; then
    echo "vercel-build: DIRECT_URL is not set for Production; refusing to migrate." >&2
    exit 1
  fi
  npx prisma migrate deploy
fi

npx next build
