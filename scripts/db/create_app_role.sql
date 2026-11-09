-- Run ONCE as an administrator (Supabase: SQL editor / `postgres` role), BEFORE the migrations.
--
-- The Belajar server must connect as this role. It deliberately has no SUPERUSER, no BYPASSRLS and
-- owns nothing, so the row-level-security policies in migrations/0001_baseline.sql always apply to
-- it. Never use Supabase's `postgres` or `service_role` for the server's data connection: both
-- bypass RLS.
--
-- Replace the password (generate one: `openssl rand -hex 32`), then put it in DATABASE_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'belajar_app') THEN
    CREATE ROLE belajar_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'CHANGE-ME';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO belajar_app;
