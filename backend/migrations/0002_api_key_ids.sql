-- Give API keys a stable opaque id so the management UI can revoke a key
-- without ever handling the secret value itself.
alter table api_keys add column if not exists id uuid not null default uuid_generate_v4();
create unique index if not exists idx_api_keys_id on api_keys (id);
