-- Repo grouping / manual mapping (#224).
--
-- A repo is identified by its git toplevel basename, so one logical project that
-- lives under different directory names (tokenmoth, token-moth, a worktree, a
-- clone on a second machine) is tracked as separate repos and its usage is split
-- across dashboard rows. This table maps a raw detected `repo` to a display
-- `group_name`. Raw token_logs.repo is NEVER mutated — grouping is applied purely
-- at query time via coalesce(group_name, repo), so provenance and re-ingest /
-- backfill stay intact, and deleting an alias row restores the original split.

create table repo_aliases (
    user_id    uuid        not null references users(id) on delete cascade,
    repo       text        not null,   -- raw detected basename (the source name)
    group_name text        not null,   -- canonical display name
    created_at timestamptz not null default now(),
    primary key (user_id, repo)         -- one source repo → at most one group
);

-- Reverse lookup: all members of a group for one user (used to fold the rollups).
create index idx_repo_aliases_group on repo_aliases (user_id, group_name);
