-- READ-ONLY structural fingerprint of the `public` schema (columns, indexes, FK &
-- CHECK constraints). Deterministic, sorted output — run against two databases and
-- `diff` the results to prove their table structure is identical.
--
--   psql "$LOCAL_DIRECT_URL" -AtqXf scripts/schema-fingerprint.sql > /tmp/local.txt
--   psql "$PROD_DIRECT_URL"  -AtqXf scripts/schema-fingerprint.sql > /tmp/prod.txt
--   diff /tmp/local.txt /tmp/prod.txt   # empty diff = structurally identical
--
-- `_prisma_migrations` is excluded so this is comparable BEFORE `migrate resolve`.
-- Supabase-only extras (RLS policies, referral_count(), the 2-arg import_backup)
-- are intentionally NOT fingerprinted — they don't affect Prisma's table tracking,
-- so a clean diff here means it is safe to baseline prod.

\echo '## COLUMNS'
select table_name || '.' || column_name || ' | ' || data_type ||
       ' | null=' || is_nullable || ' | default=' || coalesce(column_default, '-')
from information_schema.columns
where table_schema = 'public' and table_name <> '_prisma_migrations'
order by 1;

\echo '## INDEXES'
select indexname || ' | ' || indexdef
from pg_indexes
where schemaname = 'public' and tablename <> '_prisma_migrations'
order by 1;

\echo '## FK CONSTRAINTS'
select conrelid::regclass::text || '.' || conname || ' -> ' ||
       confrelid::regclass::text || ' ' || pg_get_constraintdef(oid)
from pg_constraint
where contype = 'f' and connamespace = 'public'::regnamespace
order by 1;

\echo '## CHECK CONSTRAINTS'
select conrelid::regclass::text || '.' || conname || ' | ' || pg_get_constraintdef(oid)
from pg_constraint
where contype = 'c' and connamespace = 'public'::regnamespace
order by 1;
