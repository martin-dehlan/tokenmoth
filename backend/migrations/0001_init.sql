-- tokenmoth initial schema
create extension if not exists "uuid-ossp";

create table if not exists users (
    id          uuid primary key default uuid_generate_v4(),
    email       text unique not null,
    created_at  timestamptz not null default now()
);

-- API keys are the ingestion credential (sent as Bearer token, never in query string).
create table if not exists api_keys (
    key         text primary key,                    -- e.g. tm_user_123
    user_id     uuid not null references users(id) on delete cascade,
    label       text,
    created_at  timestamptz not null default now(),
    revoked_at  timestamptz
);

-- One row per Claude Code session. Optimized for fast append + per-repo rollups.
create table if not exists token_logs (
    id                          bigserial primary key,
    user_id                     uuid not null references users(id) on delete cascade,
    session_id                  text not null,
    repo                        text not null,        -- clean git repo name
    project_path                text not null,
    input_tokens                bigint not null default 0,
    output_tokens               bigint not null default 0,
    cache_read_input_tokens     bigint not null default 0,
    cache_creation_input_tokens bigint not null default 0,
    model                       text,
    ended_at                    timestamptz not null default now(),
    created_at                  timestamptz not null default now(),
    -- idempotency: a re-fired SessionEnd upserts instead of double-counting.
    unique (session_id)
);

-- Index by user + repo for the dashboard's per-repo "fuse box" rollups.
create index if not exists idx_token_logs_user_repo on token_logs (user_id, repo);
create index if not exists idx_token_logs_ended_at  on token_logs (ended_at desc);
