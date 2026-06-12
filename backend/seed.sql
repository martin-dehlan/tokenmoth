-- Dev seed: one user + one API key for local testing.
-- Run after migrations:  psql "$DATABASE_URL" -f backend/seed.sql
insert into users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'dev@tokenmoth.dev')
on conflict (email) do nothing;

-- Keys are stored hashed (0013); the plaintext dev key is 'tm_user_123'.
insert into api_keys (key_hash, key_prefix, user_id, label)
values (
    encode(digest('tm_user_123', 'sha256'), 'hex'),
    left('tm_user_123', 11),
    '00000000-0000-0000-0000-000000000001',
    'local dev key'
)
on conflict (key_hash) do nothing;
