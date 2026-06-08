-- Link our domain user to a Supabase auth user (portability anchor, #20).
-- Nullable so the bootstrap/local user keeps working without Supabase.
alter table users add column if not exists supabase_user_id uuid unique;
