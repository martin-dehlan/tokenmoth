-- Audit: API keys were stored in plaintext. Move to sha256(key) storage:
-- the server only ever needs an equality lookup, never the raw secret.
create extension if not exists pgcrypto;

alter table api_keys add column if not exists key_hash text;
alter table api_keys add column if not exists key_prefix text;

-- Backfill existing plaintext rows (prefix = "tm_" + first 8 chars, for the UI mask).
update api_keys
   set key_hash   = encode(digest(key, 'sha256'), 'hex'),
       key_prefix = left(key, 11)
 where key_hash is null;

alter table api_keys alter column key_hash set not null;
alter table api_keys alter column key_prefix set not null;

create unique index if not exists idx_api_keys_key_hash on api_keys (key_hash);

-- Promote `id` (added in 0002 with unique index idx_api_keys_id) to primary key,
-- replacing the plaintext `key` PK from 0001, then drop the secret column.
alter table api_keys drop constraint api_keys_pkey;
alter table api_keys add constraint api_keys_pkey primary key using index idx_api_keys_id;
alter table api_keys drop column key;
