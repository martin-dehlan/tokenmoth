-- Dev seed: one user + one API key for local testing.
-- Run after migrations:  psql "$DATABASE_URL" -f backend/seed.sql
insert into users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'dev@tokenrat.dev')
on conflict (email) do nothing;

insert into api_keys (key, user_id, label)
values ('tf_user_123', '00000000-0000-0000-0000-000000000001', 'local dev key')
on conflict (key) do nothing;
