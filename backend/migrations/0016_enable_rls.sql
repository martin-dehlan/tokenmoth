-- Defense in depth: enable Row Level Security on every app table.
--
-- The API is the only client of these tables and connects as their owner (the
-- role that runs these migrations). Owners bypass RLS unless FORCE is set, so
-- the API is unaffected. Supabase's Data API (PostgREST), however, talks to the
-- database as `anon` / `authenticated`; with RLS on and no policies defined,
-- those roles see no rows and can write none, even if a grant slips in through
-- Supabase's default privileges on the public schema.
--
-- New tables must enable RLS in their own migration.

alter table users        enable row level security;
alter table api_keys     enable row level security;
alter table token_logs   enable row level security;
alter table repo_aliases enable row level security;
